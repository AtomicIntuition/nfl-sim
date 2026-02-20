export const dynamic = 'force-dynamic';

import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { games, seasons, teams } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { GameCard } from '@/components/schedule/game-card';
import { PlayoffBracketView } from '@/components/schedule/playoff-bracket';
import { formatSeasonStatus } from '@/lib/utils/formatting';
import type { ScheduledGame } from '@/lib/simulation/types';

export const metadata: Metadata = {
  title: 'Schedule & Standings',
  description:
    'Full season schedule, scores, and division standings for the current GridIron Live season.',
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

    return {
      season,
      targetWeek,
      games: hydratedGames,
      weeks,
      hasLive,
      isPlayoffs,
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

  return (
    <>
      <Header isLive={hasLive} />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex items-end justify-between mb-6">
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

        {/* Week selector */}
        <ScheduleWeekNav weeks={weeks} targetWeek={targetWeek} />

        {/* Playoff bracket (shown when in playoffs) */}
        {isPlayoffs && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-text-primary mb-4 tracking-wide">
              Playoff Bracket
            </h2>
            <PlayoffBracketView
              bracket={null}
              currentRound={season.status}
            />
          </div>
        )}

        {/* Games grid */}
        {scheduledGames.length === 0 ? (
          <Card variant="default" padding="lg" className="text-center">
            <p className="text-text-secondary">
              No games scheduled for this week yet.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {scheduledGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

// ============================================================
// Server-rendered week navigation (replaces client WeekSelector
// for initial render; the client component can be used for
// interactive switching in a future enhancement)
// ============================================================

function ScheduleWeekNav({
  weeks,
  targetWeek,
}: {
  weeks: number[];
  targetWeek: number;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-3 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
      {weeks.map((w) => (
        <Link
          key={w}
          href={`/schedule?week=${w}`}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            w === targetWeek
              ? 'bg-gold text-midnight shadow-lg shadow-gold/20'
              : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border'
          }`}
        >
          {w <= 18
            ? `Week ${w}`
            : w === 19
              ? 'WC'
              : w === 20
                ? 'DIV'
                : w === 21
                  ? 'CC'
                  : 'SB'}
        </Link>
      ))}
    </div>
  );
}
