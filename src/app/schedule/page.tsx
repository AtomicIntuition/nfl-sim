export const dynamic = 'force-dynamic';

import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { games, seasons, teams, standings } from '@/lib/db/schema';
import { eq, desc, and, asc } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { GameCard } from '@/components/schedule/game-card';
import { PlayoffBracketView } from '@/components/schedule/playoff-bracket';
import { formatSeasonStatus } from '@/lib/utils/formatting';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import type { ScheduledGame } from '@/lib/simulation/types';

export const metadata: Metadata = {
  title: 'Schedule & Standings',
  description:
    'Full season schedule, scores, and division standings for the current GridBlitz season.',
};

// ============================================================
// Data fetching
// ============================================================

interface SchedulePageProps {
  searchParams: Promise<{ week?: string }>;
}

async function getScheduleData(weekParam?: string) {
  try {
    // Find latest season
    const seasonRows = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);

    const season = seasonRows[0] ?? null;
    if (!season) return null;

    const targetWeek = weekParam ? parseInt(weekParam, 10) : season.currentWeek;

    // Get all teams for hydration
    const allTeams = await db.select().from(teams);
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));

    // Get games for the target week
    const weekGames = await db
      .select()
      .from(games)
      .where(
        and(eq(games.seasonId, season.id), eq(games.week, targetWeek))
      );

    const hydratedGames = weekGames.map((game) => ({
      ...game,
      homeTeam: teamMap.get(game.homeTeamId) ?? undefined,
      awayTeam: teamMap.get(game.awayTeamId) ?? undefined,
    }));

    // Sort: featured first, then by status (live > completed > scheduled)
    const statusOrder: Record<string, number> = {
      broadcasting: 0,
      simulating: 1,
      completed: 2,
      scheduled: 3,
    };

    hydratedGames.sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    });

    // Get all available weeks
    const allGames = await db
      .select({ week: games.week })
      .from(games)
      .where(eq(games.seasonId, season.id));

    const weeks = [...new Set(allGames.map((g) => g.week))].sort(
      (a, b) => a - b
    );

    // Check if any game is live
    const hasLive = weekGames.some(
      (g) => g.status === 'broadcasting' || g.status === 'simulating'
    );

    // Determine if we're in playoffs
    const isPlayoffs = [
      'wild_card',
      'divisional',
      'conference_championship',
      'super_bowl',
    ].includes(season.status);

    // Get the currently broadcasting game across ALL weeks (for "Now Playing")
    const liveGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.status, 'broadcasting')
        )
      )
      .limit(1);

    const liveGame = liveGames[0] ?? null;
    const liveGameHydrated = liveGame ? {
      ...liveGame,
      homeTeam: teamMap.get(liveGame.homeTeamId),
      awayTeam: teamMap.get(liveGame.awayTeamId),
    } : null;

    // Get the next scheduled game across ALL weeks (for "Up Next")
    const nextGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.status, 'scheduled')
        )
      )
      .orderBy(asc(games.scheduledAt))
      .limit(1);

    const nextGame = nextGames[0] ?? null;
    const nextGameHydrated = nextGame ? {
      ...nextGame,
      homeTeam: teamMap.get(nextGame.homeTeamId),
      awayTeam: teamMap.get(nextGame.awayTeamId),
    } : null;

    // Get total games and completed games for season progress
    const allSeasonGames = await db
      .select({ status: games.status, week: games.week })
      .from(games)
      .where(eq(games.seasonId, season.id));

    const totalGames = allSeasonGames.filter(g => g.week <= 18).length;
    const completedGames = allSeasonGames.filter(g => g.status === 'completed' && g.week <= 18).length;

    // Get top teams by wins for standings preview
    const standingRows = await db
      .select()
      .from(standings)
      .where(eq(standings.seasonId, season.id));

    const topTeams = standingRows
      .map(s => ({
        ...s,
        team: teamMap.get(s.teamId),
      }))
      .filter(s => s.team)
      .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))
      .slice(0, 4);

    // The next game's ID — used to show exact time (no "est." prefix) on GameCard
    const nextGameId = nextGame?.id ?? null;

    return {
      season,
      targetWeek,
      games: hydratedGames,
      weeks,
      hasLive,
      isPlayoffs,
      liveGame: liveGameHydrated,
      nextGame: nextGameHydrated,
      nextGameId,
      totalGames,
      completedGames,
      topTeams,
    };
  } catch (error) {
    console.error('Failed to fetch schedule data:', error);
    return null;
  }
}

// ============================================================
// Page component
// ============================================================

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const { week } = await searchParams;
  const data = await getScheduleData(week);

  if (!data) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">No Active Season</h1>
            <p className="text-text-secondary">
              The schedule will appear once a season begins.
            </p>
          </div>
        </main>
      </>
    );
  }

  const {
    season,
    targetWeek,
    games: weekGames,
    weeks,
    hasLive,
    isPlayoffs,
    liveGame,
    nextGame,
    nextGameId,
    totalGames,
    completedGames,
    topTeams,
  } = data;

  // Map hydrated games to ScheduledGame shape for the GameCard component
  const scheduledGames: ScheduledGame[] = weekGames.map((g) => ({
    id: g.id,
    week: g.week,
    gameType: g.gameType as ScheduledGame['gameType'],
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeTeam: g.homeTeam
      ? {
          id: g.homeTeam.id,
          name: g.homeTeam.name,
          abbreviation: g.homeTeam.abbreviation,
          city: g.homeTeam.city,
          mascot: g.homeTeam.mascot,
          conference: g.homeTeam.conference,
          division: g.homeTeam.division,
          primaryColor: g.homeTeam.primaryColor,
          secondaryColor: g.homeTeam.secondaryColor,
          offenseRating: g.homeTeam.offenseRating,
          defenseRating: g.homeTeam.defenseRating,
          specialTeamsRating: g.homeTeam.specialTeamsRating,
          playStyle: g.homeTeam.playStyle,
        }
      : undefined,
    awayTeam: g.awayTeam
      ? {
          id: g.awayTeam.id,
          name: g.awayTeam.name,
          abbreviation: g.awayTeam.abbreviation,
          city: g.awayTeam.city,
          mascot: g.awayTeam.mascot,
          conference: g.awayTeam.conference,
          division: g.awayTeam.division,
          primaryColor: g.awayTeam.primaryColor,
          secondaryColor: g.awayTeam.secondaryColor,
          offenseRating: g.awayTeam.offenseRating,
          defenseRating: g.awayTeam.defenseRating,
          specialTeamsRating: g.awayTeam.specialTeamsRating,
          playStyle: g.awayTeam.playStyle,
        }
      : undefined,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    status: g.status as ScheduledGame['status'],
    isFeatured: g.isFeatured ?? false,
    scheduledAt: g.scheduledAt,
    broadcastStartedAt: g.broadcastStartedAt,
    completedAt: g.completedAt,
  }));

  // Count stats for the week header
  const liveCount = scheduledGames.filter(
    (g) => g.status === 'broadcasting' || g.status === 'simulating'
  ).length;
  const finalCount = scheduledGames.filter(
    (g) => g.status === 'completed'
  ).length;
  const upcomingCount = scheduledGames.filter(
    (g) => g.status === 'scheduled'
  ).length;

  const seasonProgress = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0;

  return (
    <>
      <Header isLive={hasLive} />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* ─── Page Header with Season Progress ─── */}
        <div className="mb-6">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-gold uppercase tracking-[0.2em] mb-1">
                Season {season.seasonNumber}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
                {formatSeasonStatus(season.status, season.currentWeek)}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              {liveCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-live-red" />
                  </span>
                  <span className="font-bold text-live-red">{liveCount} Live</span>
                </span>
              )}
              {finalCount > 0 && (
                <span className="font-medium">{finalCount} Final</span>
              )}
              <span className="font-medium">
                {scheduledGames.length} Game{scheduledGames.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Season progress bar */}
          {season.status === 'regular_season' && totalGames > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold/60 to-gold rounded-full transition-all duration-500"
                  style={{ width: `${seasonProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-text-muted tabular-nums">
                {completedGames}/{totalGames} games
              </span>
            </div>
          )}
        </div>

        {/* ─── NOW PLAYING Hero ─── */}
        {liveGame && (
          <Link
            href={`/game/${liveGame.id}`}
            className="block mb-6 group"
          >
            <div className="relative rounded-2xl overflow-hidden border border-live-red/30 bg-gradient-to-r from-surface via-surface-elevated to-surface shadow-xl shadow-live-red/10">
              {/* Top live bar */}
              <div className="h-1 bg-gradient-to-r from-live-red via-red-400 to-live-red animate-pulse" />

              <div className="px-5 py-4 sm:px-8 sm:py-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-live-red" />
                  </span>
                  <span className="text-xs font-black text-live-red uppercase tracking-[0.2em]">
                    Now Playing
                  </span>
                  <span className="text-[10px] text-text-muted ml-2">
                    Week {liveGame.week}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  {/* Away team */}
                  <div className="flex items-center gap-3 flex-1">
                    <img
                      src={getTeamLogoUrl(liveGame.awayTeam?.abbreviation ?? '???')}
                      alt={liveGame.awayTeam?.name ?? 'Away'}
                      width={48}
                      height={48}
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
                    />
                    <div>
                      <div className="text-lg sm:text-xl font-black text-text-primary">
                        {liveGame.awayTeam?.abbreviation ?? 'TBD'}
                      </div>
                      <div className="text-xs text-text-muted hidden sm:block">
                        {liveGame.awayTeam?.city} {liveGame.awayTeam?.mascot}
                      </div>
                    </div>
                  </div>

                  {/* Score — hidden during broadcast to avoid spoilers (DB has final score, not current) */}
                  <div className="flex items-center gap-4 px-4">
                    <span className="text-2xl sm:text-3xl font-mono font-black text-text-muted tabular-nums">
                      &ndash;
                    </span>
                    <span className="text-sm font-bold text-text-muted">vs</span>
                    <span className="text-2xl sm:text-3xl font-mono font-black text-text-muted tabular-nums">
                      &ndash;
                    </span>
                  </div>

                  {/* Home team */}
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-black text-text-primary">
                        {liveGame.homeTeam?.abbreviation ?? 'TBD'}
                      </div>
                      <div className="text-xs text-text-muted hidden sm:block">
                        {liveGame.homeTeam?.city} {liveGame.homeTeam?.mascot}
                      </div>
                    </div>
                    <img
                      src={getTeamLogoUrl(liveGame.homeTeam?.abbreviation ?? '???')}
                      alt={liveGame.homeTeam?.name ?? 'Home'}
                      width={48}
                      height={48}
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
                    />
                  </div>
                </div>

                {/* Watch CTA */}
                <div className="mt-3 text-center">
                  <span className="text-xs font-bold text-live-red uppercase tracking-wider group-hover:underline">
                    Tap to watch live &rarr;
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* ─── UP NEXT Card ─── */}
        {!liveGame && nextGame && (
          <div className="mb-6 rounded-xl overflow-hidden border border-gold/20 bg-surface">
            <div className="px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                <span className="text-xs font-black text-gold uppercase tracking-[0.2em]">
                  Up Next
                </span>
                <span className="text-[10px] text-text-muted ml-2">
                  Week {nextGame.week}
                </span>
                {nextGame.scheduledAt && (
                  <span className="text-[10px] text-text-secondary ml-auto">
                    {formatRelativeTime(new Date(nextGame.scheduledAt))}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={getTeamLogoUrl(nextGame.awayTeam?.abbreviation ?? '???')}
                    alt=""
                    width={40}
                    height={40}
                    className="w-10 h-10 object-contain"
                  />
                  <span className="text-base font-bold text-text-primary">
                    {nextGame.awayTeam?.abbreviation ?? 'TBD'}
                  </span>
                </div>

                <span className="text-sm font-bold text-text-muted px-4">@</span>

                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-text-primary">
                    {nextGame.homeTeam?.abbreviation ?? 'TBD'}
                  </span>
                  <img
                    src={getTeamLogoUrl(nextGame.homeTeam?.abbreviation ?? '???')}
                    alt=""
                    width={40}
                    height={40}
                    className="w-10 h-10 object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Week Navigation ─── */}
        <ScheduleWeekNav
          weeks={weeks}
          targetWeek={targetWeek}
          currentWeek={season.currentWeek}
        />

        {/* ─── Games Grid ─── */}
        {scheduledGames.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <p className="text-text-secondary">
              No games scheduled for this week yet.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-10">
            {scheduledGames.map((game) => (
              <GameCard key={game.id} game={game} isNextGame={game.id === nextGameId} />
            ))}
          </div>
        )}

        {/* ─── Road to the Super Bowl ─── */}
        <RoadToSuperBowl
          isPlayoffs={isPlayoffs}
          seasonStatus={season.status}
          currentWeek={season.currentWeek}
        />
      </main>
    </>
  );
}

// ============================================================
// Road to the Super Bowl — always-visible bracket preview
// ============================================================

function RoadToSuperBowl({
  isPlayoffs,
  seasonStatus,
  currentWeek,
}: {
  isPlayoffs: boolean;
  seasonStatus: string;
  currentWeek: number;
}) {
  const rounds = ['Wild Card', 'Divisional', 'Conference Championship', 'Super Bowl'];
  const roundStatuses = {
    wild_card: 0,
    divisional: 1,
    conference_championship: 2,
    super_bowl: 3,
  };

  const activeRoundIndex = isPlayoffs
    ? roundStatuses[seasonStatus as keyof typeof roundStatuses] ?? -1
    : -1;

  return (
    <div className="mt-8 mb-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
        <h2 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
          Road to the Super Bowl
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* Playoff roadmap */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6">
        {rounds.map((round, i) => {
          const isActive = i === activeRoundIndex;
          const isCompleted = i < activeRoundIndex;
          const isFuture = activeRoundIndex === -1 || i > activeRoundIndex;
          const isSuperBowl = i === 3;

          return (
            <div key={round} className="flex items-center gap-2 sm:gap-4">
              <div className="text-center">
                <div
                  className={`
                    w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1
                    ${isSuperBowl && isActive
                      ? 'bg-gold text-midnight ring-2 ring-gold/50'
                      : isActive
                        ? 'bg-gold/20 text-gold ring-1 ring-gold/40'
                        : isCompleted
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-surface-elevated text-text-muted'
                    }
                    transition-all duration-300
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isSuperBowl ? (
                    <span className="text-xs font-black">SB</span>
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span
                  className={`
                    text-[9px] sm:text-[10px] font-bold uppercase tracking-wider
                    ${isActive ? 'text-gold' : isCompleted ? 'text-green-400/70' : 'text-text-muted'}
                  `}
                >
                  {round.split(' ').map(w => w[0]).join('')}
                </span>
              </div>

              {/* Connector line */}
              {i < rounds.length - 1 && (
                <div
                  className={`
                    w-6 sm:w-10 h-0.5 rounded-full
                    ${isCompleted ? 'bg-green-500/40' : 'bg-border'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Bracket preview */}
      {isPlayoffs ? (
        <PlayoffBracketView
          bracket={null}
          currentRound={seasonStatus}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface/50 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* AFC */}
            <div>
              <div className="text-center mb-3">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                  AFC
                </span>
              </div>
              <div className="space-y-2">
                {['#1 Seed — First Round Bye', '#2 vs #7', '#3 vs #6', '#4 vs #5'].map((matchup, i) => (
                  <div
                    key={matchup}
                    className={`
                      rounded-lg px-3 py-2 border text-center
                      ${i === 0
                        ? 'border-gold/20 bg-gold/5'
                        : 'border-border bg-surface-elevated/50'
                      }
                    `}
                  >
                    <span className={`text-xs font-bold ${i === 0 ? 'text-gold/70' : 'text-text-muted'}`}>
                      {matchup}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* NFC */}
            <div>
              <div className="text-center mb-3">
                <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
                  NFC
                </span>
              </div>
              <div className="space-y-2">
                {['#1 Seed — First Round Bye', '#2 vs #7', '#3 vs #6', '#4 vs #5'].map((matchup, i) => (
                  <div
                    key={matchup}
                    className={`
                      rounded-lg px-3 py-2 border text-center
                      ${i === 0
                        ? 'border-gold/20 bg-gold/5'
                        : 'border-border bg-surface-elevated/50'
                      }
                    `}
                  >
                    <span className={`text-xs font-bold ${i === 0 ? 'text-gold/70' : 'text-text-muted'}`}>
                      {matchup}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Super Bowl center piece */}
          <div className="mt-4 text-center">
            <div className="inline-block rounded-lg px-6 py-3 border border-gold/30 bg-gold/5">
              <div className="super-bowl-text text-xs font-black tracking-[0.2em] uppercase mb-0.5">
                Super Bowl
              </div>
              <div className="text-[10px] text-text-muted">
                AFC Champion vs NFC Champion
              </div>
            </div>
          </div>

          {seasonStatus === 'regular_season' && (
            <p className="text-center text-[10px] text-text-muted mt-3">
              {18 - currentWeek} week{18 - currentWeek !== 1 ? 's' : ''} until playoffs
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Enhanced week navigation
// ============================================================

function ScheduleWeekNav({
  weeks,
  targetWeek,
  currentWeek,
}: {
  weeks: number[];
  targetWeek: number;
  currentWeek: number;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-3 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
      {weeks.map((w) => {
        const isSelected = w === targetWeek;
        const isCurrent = w === currentWeek;
        const isPast = w < currentWeek;
        const label = w <= 18
          ? `Week ${w}`
          : w === 19
            ? 'Wild Card'
            : w === 20
              ? 'Divisional'
              : w === 21
                ? 'Conf. Champ'
                : 'Super Bowl';

        return (
          <Link
            key={w}
            href={`/schedule?week=${w}`}
            className={`
              flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200
              ${isSelected
                ? 'bg-gold text-midnight shadow-lg shadow-gold/20'
                : isCurrent
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : isPast
                    ? 'bg-surface text-text-muted hover:text-text-primary hover:bg-surface-elevated border border-border/50'
                    : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border'
              }
            `}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff < 0) return 'soon';
  if (diff < 60_000) return 'in < 1 min';
  if (diff < 3_600_000) return `in ${Math.ceil(diff / 60_000)} min`;
  if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)}h`;

  const dateStr = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return dateStr;
}
