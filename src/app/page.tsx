export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/lib/db';
import { games, seasons, teams, standings } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  formatRecord,
  formatSeasonStatus,
  formatGameType,
} from '@/lib/utils/formatting';
import { ROUTES } from '@/lib/utils/constants';
import { LiveScore } from '@/components/game/live-score';
import { IntermissionCountdown } from '@/components/game/intermission-countdown';
import { KickoffCountdown } from '@/components/game/kickoff-countdown';
import { TeamLogo } from '@/components/team/team-logo';
import { ScoreTicker } from '@/components/game/score-ticker';
import { HomeAutoRefresh } from '@/components/home/home-auto-refresh';

// ============================================================
// Data fetching
// ============================================================

async function getHomePageData() {
  // Get the latest season
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const season = seasonRows[0] ?? null;
  if (!season) return null;

  // Get current week games
  const weekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, season.id), eq(games.week, season.currentWeek))
    );

  // Find broadcasting or next featured game
  const liveGame =
    weekGames.find((g) => g.status === 'broadcasting') ??
    weekGames.find((g) => g.status === 'simulating');

  const nextGame =
    weekGames.find((g) => g.isFeatured && g.status === 'scheduled') ??
    weekGames.find((g) => g.status === 'scheduled');

  // Hydrate team data for key games
  async function hydrateGame(game: typeof weekGames[number] | undefined) {
    if (!game) return null;
    const [homeRows, awayRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
      db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
    ]);
    return {
      ...game,
      homeTeam: homeRows[0] ?? null,
      awayTeam: awayRows[0] ?? null,
    };
  }

  const [hydratedLive, hydratedNext] = await Promise.all([
    hydrateGame(liveGame),
    hydrateGame(nextGame),
  ]);

  // Hydrate completed games for score ticker
  const completedGames = await Promise.all(
    weekGames
      .filter((g) => g.status === 'completed')
      .slice(0, 8)
      .map(hydrateGame)
  );

  // "Coming Up" — remaining scheduled games this week (excluding the featured next game)
  const upcomingScheduled = weekGames
    .filter((g) => g.status === 'scheduled' && g.id !== nextGame?.id)
    .sort((a, b) => {
      const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
      const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
      return aTime - bTime;
    })
    .slice(0, 12);

  const comingUpGames = await Promise.all(upcomingScheduled.map(hydrateGame));

  // Get ALL standings for division-grouped display
  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, season.id));

  // Hydrate standings teams
  const teamMap = new Map<string, typeof teams.$inferSelect>();
  const allTeamRows = await db.select().from(teams);
  for (const t of allTeamRows) {
    teamMap.set(t.id, t);
  }

  const hydratedStandings = standingRows.map((s) => ({
    ...s,
    team: teamMap.get(s.teamId) ?? null,
  }));

  // Week progress
  const completedCount = weekGames.filter(
    (g) => g.status === 'completed'
  ).length;
  const totalCount = weekGames.length;

  // Intermission detection: 15-min window after the most recent game completes
  const INTERMISSION_MS = 15 * 60 * 1000;
  const recentCompleted = weekGames
    .filter((g) => g.status === 'completed' && g.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

  let intermission: {
    completedGame: NonNullable<Awaited<ReturnType<typeof hydrateGame>>>;
    endsAt: string;
    nextGame: Awaited<ReturnType<typeof hydrateGame>>;
  } | null = null;

  if (recentCompleted?.completedAt && !liveGame) {
    const elapsed = Date.now() - recentCompleted.completedAt.getTime();
    if (elapsed < INTERMISSION_MS) {
      const hydratedCompleted = await hydrateGame(recentCompleted);

      // Look for next scheduled game in current week first
      let upcomingGame = weekGames.find((g) => g.status === 'scheduled');

      // If no scheduled games remain this week, look at next week
      if (!upcomingGame) {
        const nextWeekGames = await db
          .select()
          .from(games)
          .where(
            and(
              eq(games.seasonId, season.id),
              eq(games.week, season.currentWeek + 1)
            )
          );
        upcomingGame =
          nextWeekGames.find((g) => g.isFeatured) ?? nextWeekGames[0] ?? undefined;
      }

      const hydratedUpcoming = await hydrateGame(upcomingGame);
      if (hydratedCompleted) {
        intermission = {
          completedGame: hydratedCompleted,
          endsAt: new Date(
            recentCompleted.completedAt.getTime() + INTERMISSION_MS
          ).toISOString(),
          nextGame: hydratedUpcoming,
        };
      }
    }
  }

  // Inter-week break detection: all games done, waiting 30 min before next week
  const WEEK_BREAK_MS = 30 * 60 * 1000;
  const allWeekCompleted =
    weekGames.length > 0 && weekGames.every((g) => g.status === 'completed');

  let weekBreak: {
    endsAt: string;
    nextWeekGames: NonNullable<Awaited<ReturnType<typeof hydrateGame>>>[];
    currentWeek: number;
  } | null = null;

  if (allWeekCompleted && !liveGame && !intermission) {
    const lastGame = weekGames
      .filter((g) => g.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

    if (lastGame?.completedAt) {
      const elapsed = Date.now() - lastGame.completedAt.getTime();
      if (elapsed < WEEK_BREAK_MS) {
        // Fetch next week's games for preview
        const nextWeek = season.currentWeek + 1;
        const nextGames = await db
          .select()
          .from(games)
          .where(
            and(eq(games.seasonId, season.id), eq(games.week, nextWeek))
          );

        const hydratedNextGames = (
          await Promise.all(nextGames.slice(0, 6).map(hydrateGame))
        ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof hydrateGame>>>[];

        weekBreak = {
          endsAt: new Date(
            lastGame.completedAt.getTime() + WEEK_BREAK_MS
          ).toISOString(),
          nextWeekGames: hydratedNextGames,
          currentWeek: season.currentWeek,
        };
      }
    }
  }

  return {
    season,
    liveGame: hydratedLive,
    nextGame: hydratedNext,
    completedGames: completedGames.filter(Boolean),
    comingUpGames: comingUpGames.filter(Boolean),
    standings: hydratedStandings,
    weekProgress: { completed: completedCount, total: totalCount },
    isLive: !!liveGame,
    intermission,
    weekBreak,
  };
}

// ============================================================
// Helper: format time for Coming Up cards
// ============================================================

function formatKickoffTime(scheduledAt: Date): string {
  return scheduledAt.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================
// Page component
// ============================================================

export default async function HomePage() {
  const data = await getHomePageData();

  if (!data) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">🏈</div>
            <h1 className="text-3xl font-bold text-gold mb-4">
              GridIron Live
            </h1>
            <p className="text-text-secondary text-lg mb-8">
              The always-on NFL simulation is warming up. The first season is
              about to kick off.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface-elevated rounded-full border border-border">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
              </span>
              <span className="text-sm text-text-secondary">
                Generating Season 1...
              </span>
            </div>
          </div>
        </main>
      </>
    );
  }

  const {
    season, liveGame, nextGame, completedGames, comingUpGames, standings,
    weekProgress, isLive, intermission, weekBreak,
  } = data;

  // Group standings by conference and division
  const divisionStandings = groupByDivision(standings);

  return (
    <>
      <Header isLive={isLive} />
      <HomeAutoRefresh
        refreshAt={intermission?.endsAt ?? weekBreak?.endsAt ?? null}
        liveGameId={liveGame?.id ?? null}
        pageState={isLive ? 'live' : intermission ? 'intermission' : weekBreak ? 'week_break' : nextGame ? 'next_game' : 'week_complete'}
      />
      <main className="min-h-screen">
        {/* ---- Hero Section ---- */}
        <section className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-broadcast via-midnight to-midnight" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_60%)]" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12">
            {/* Season status bar */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-secondary tracking-wider uppercase">
                  Season {season.seasonNumber}
                </span>
                <span className="text-text-muted">/</span>
                <span className="text-sm font-medium text-gold">
                  {formatSeasonStatus(season.status, season.currentWeek)}
                </span>
              </div>
              {weekProgress.total > 0 && (
                <div className="hidden sm:flex items-center gap-3">
                  <span className="text-xs text-text-muted">
                    {weekProgress.completed}/{weekProgress.total} games
                  </span>
                  <Progress
                    value={weekProgress.completed}
                    max={weekProgress.total}
                    size="sm"
                    color="bg-gold"
                    className="w-24"
                  />
                </div>
              )}
            </div>

            {/* Main hero card */}
            {liveGame ? (
              <LiveGameHero game={liveGame} />
            ) : intermission ? (
              <IntermissionHero
                completedGame={intermission.completedGame}
                endsAt={intermission.endsAt}
                nextGame={intermission.nextGame}
              />
            ) : weekBreak ? (
              <WeekBreakHero
                weekBreak={weekBreak}
                season={season}
              />
            ) : nextGame ? (
              <NextGameHero game={nextGame} />
            ) : (
              <WeekCompleteHero season={season} />
            )}
          </div>
        </section>

        {/* ---- Quick Nav ---- */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-4 mb-6 relative z-10">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {isLive && liveGame && (
              <Link
                href={ROUTES.GAME(liveGame.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-live-red text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg shadow-live-red/20"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                </span>
                Watch Live
              </Link>
            )}
            <Link
              href={ROUTES.SCHEDULE}
              className="inline-flex items-center px-4 py-2 bg-surface-elevated text-text-secondary text-xs font-bold rounded-full whitespace-nowrap border border-border hover:border-border-bright transition-colors"
            >
              Schedule
            </Link>
            <Link
              href={ROUTES.SCHEDULE}
              className="inline-flex items-center px-4 py-2 bg-surface-elevated text-text-secondary text-xs font-bold rounded-full whitespace-nowrap border border-border hover:border-border-bright transition-colors"
            >
              Standings
            </Link>
            <Link
              href={ROUTES.LEADERBOARD}
              className="inline-flex items-center px-4 py-2 bg-surface-elevated text-text-secondary text-xs font-bold rounded-full whitespace-nowrap border border-border hover:border-border-bright transition-colors"
            >
              Predictions
            </Link>
          </div>
        </section>

        {/* ---- Score Ticker ---- */}
        {completedGames.length > 0 && (
          <ScoreTicker
            games={completedGames
              .filter(Boolean)
              .map((g) => ({
                id: g!.id,
                homeTeam: g!.homeTeam
                  ? {
                      abbreviation: g!.homeTeam.abbreviation,
                      name: g!.homeTeam.name,
                      primaryColor: g!.homeTeam.primaryColor,
                    }
                  : null,
                awayTeam: g!.awayTeam
                  ? {
                      abbreviation: g!.awayTeam.abbreviation,
                      name: g!.awayTeam.name,
                      primaryColor: g!.awayTeam.primaryColor,
                    }
                  : null,
                homeScore: g!.homeScore ?? 0,
                awayScore: g!.awayScore ?? 0,
              }))}
          />
        )}

        {/* ---- Coming Up ---- */}
        {comingUpGames.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary tracking-wide">
                Coming Up This Week
              </h2>
              <Link
                href={ROUTES.SCHEDULE}
                className="text-sm font-medium text-gold hover:text-gold-bright transition-colors"
              >
                Full Schedule &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {comingUpGames.map((g) => {
                if (!g) return null;
                const kickoffTime = g.scheduledAt
                  ? formatKickoffTime(new Date(g.scheduledAt))
                  : null;
                return (
                  <Link key={g.id} href={ROUTES.GAME(g.id)}>
                    <Card
                      variant="default"
                      padding="sm"
                      className="hover:border-gold/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <TeamLogo
                            abbreviation={g.awayTeam?.abbreviation ?? '???'}
                            teamName={g.awayTeam?.name ?? undefined}
                            size={24}
                            className="w-6 h-6 object-contain shrink-0"
                          />
                          <span className="text-xs font-bold">
                            {g.awayTeam?.abbreviation ?? '???'}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-medium">@</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold">
                            {g.homeTeam?.abbreviation ?? '???'}
                          </span>
                          <TeamLogo
                            abbreviation={g.homeTeam?.abbreviation ?? '???'}
                            teamName={g.homeTeam?.name ?? undefined}
                            size={24}
                            className="w-6 h-6 object-contain shrink-0"
                          />
                        </div>
                      </div>
                      {kickoffTime && (
                        <p className="text-[10px] text-text-muted text-center mt-1.5">
                          est. {kickoffTime}
                        </p>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ---- Division Standings ---- */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary tracking-wide">
              Standings
            </h2>
            <Link
              href={ROUTES.SCHEDULE}
              className="text-sm font-medium text-gold hover:text-gold-bright transition-colors"
            >
              Full Standings &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* AFC */}
            <div>
              <h3 className="text-sm font-bold text-text-secondary tracking-wider uppercase mb-4">
                AFC
              </h3>
              <div className="space-y-4">
                {['North', 'South', 'East', 'West'].map((div) => {
                  const divTeams = divisionStandings.AFC?.[div] ?? [];
                  if (divTeams.length === 0) return null;
                  return (
                    <DivisionBlock
                      key={`AFC-${div}`}
                      divisionName={`AFC ${div}`}
                      teams={divTeams}
                    />
                  );
                })}
              </div>
            </div>
            {/* NFC */}
            <div>
              <h3 className="text-sm font-bold text-text-secondary tracking-wider uppercase mb-4">
                NFC
              </h3>
              <div className="space-y-4">
                {['North', 'South', 'East', 'West'].map((div) => {
                  const divTeams = divisionStandings.NFC?.[div] ?? [];
                  if (divTeams.length === 0) return null;
                  return (
                    <DivisionBlock
                      key={`NFC-${div}`}
                      divisionName={`NFC ${div}`}
                      teams={divTeams}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ---- Season Progress ---- */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <Card variant="glass" padding="lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-text-secondary tracking-wider uppercase mb-1">
                  Season Progress
                </h3>
                <p className="text-xl font-bold text-text-primary">
                  Week {season.currentWeek}{' '}
                  <span className="text-text-muted font-normal">
                    of {season.totalWeeks}
                  </span>
                </p>
              </div>
              <div className="w-full sm:w-64">
                <Progress
                  value={season.currentWeek}
                  max={season.totalWeeks}
                  color="bg-gold"
                  showLabel
                  size="lg"
                />
              </div>
            </div>
            {season.status !== 'regular_season' && (
              <div className="mt-4 pt-4 border-t border-border">
                <Badge variant="gold" size="md">
                  {formatGameType(
                    season.status === 'offseason'
                      ? 'regular'
                      : (season.status as 'wild_card' | 'divisional' | 'conference_championship' | 'super_bowl')
                  )}
                </Badge>
              </div>
            )}
          </Card>
        </section>
      </main>
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

type StandingWithTeam = {
  teamId: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  streak: string | null;
  team: {
    id: string;
    name: string;
    abbreviation: string;
    city: string;
    mascot: string;
    conference: string;
    division: string;
    primaryColor: string;
    secondaryColor: string;
  } | null;
};

function groupByDivision(standings: StandingWithTeam[]) {
  const result: Record<string, Record<string, StandingWithTeam[]>> = {};

  for (const s of standings) {
    const conf = s.team?.conference ?? 'Unknown';
    const div = s.team?.division ?? 'Unknown';
    if (!result[conf]) result[conf] = {};
    if (!result[conf][div]) result[conf][div] = [];
    result[conf][div].push(s);
  }

  // Sort each division by wins desc
  for (const conf of Object.keys(result)) {
    for (const div of Object.keys(result[conf])) {
      result[conf][div].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
    }
  }

  return result;
}

// ============================================================
// Sub-components
// ============================================================

interface GameCardData {
  id: string;
  scheduledAt?: Date | null;
  homeTeam: {
    id: string;
    name: string;
    abbreviation: string;
    city: string;
    mascot: string;
    primaryColor: string;
    secondaryColor: string;
  } | null;
  awayTeam: {
    id: string;
    name: string;
    abbreviation: string;
    city: string;
    mascot: string;
    primaryColor: string;
    secondaryColor: string;
  } | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isFeatured: boolean | null;
  gameType: string;
}

function DivisionBlock({
  divisionName,
  teams,
}: {
  divisionName: string;
  teams: StandingWithTeam[];
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-surface-elevated border-b border-border">
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">
          {divisionName}
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {teams.map((s, idx) => (
          <Link
            key={s.teamId}
            href={ROUTES.TEAM(s.teamId)}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-elevated/50 transition-colors"
          >
            <TeamLogo
              abbreviation={s.team?.abbreviation ?? '???'}
              teamName={s.team?.name ?? undefined}
              size={24}
              className="w-6 h-6 object-contain shrink-0"
            />
            <span className={`text-xs font-bold flex-1 truncate ${idx === 0 ? 'text-gold' : 'text-text-primary'}`}>
              {s.team?.abbreviation ?? '???'}
            </span>
            <span className="text-xs font-mono font-bold tabular-nums text-text-secondary">
              {formatRecord(s.wins ?? 0, s.losses ?? 0, s.ties ?? 0)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LiveGameHero({ game }: { game: GameCardData }) {
  return (
    <Link href={ROUTES.GAME(game.id)} className="block group">
      <Card
        variant="elevated"
        padding="lg"
        className="relative overflow-hidden border-live-red/20 hover:border-live-red/40 transition-all"
      >
        {/* Live indicator */}
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="live" pulse>
            LIVE NOW
          </Badge>
          {game.isFeatured && (
            <Badge variant="gold" size="sm">
              Featured Game
            </Badge>
          )}
        </div>

        {/* Matchup display */}
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          {/* Away team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={game.awayTeam?.abbreviation ?? '???'}
                teamName={game.awayTeam?.name ?? undefined}
                size={80}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.awayTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.awayTeam?.mascot ?? ''}
            </p>
          </div>

          {/* Live score — streams in real-time from SSE */}
          <LiveScore gameId={game.id} />

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={game.homeTeam?.abbreviation ?? '???'}
                teamName={game.homeTeam?.name ?? undefined}
                size={80}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.homeTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.homeTeam?.mascot ?? ''}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center mt-8">
          <span className="inline-flex items-center gap-2 px-6 py-2.5 bg-live-red text-white font-bold text-sm rounded-full group-hover:bg-red-600 transition-colors shadow-lg shadow-live-red/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            WATCH LIVE
          </span>
        </div>
      </Card>
    </Link>
  );
}

function IntermissionHero({
  completedGame,
  endsAt,
  nextGame,
}: {
  completedGame: GameCardData;
  endsAt: string;
  nextGame: GameCardData | null;
}) {
  const homeWon =
    (completedGame.homeScore ?? 0) > (completedGame.awayScore ?? 0);
  const awayWon =
    (completedGame.awayScore ?? 0) > (completedGame.homeScore ?? 0);

  return (
    <div className="space-y-4">
      {/* Completed game final score */}
      <Card
        variant="elevated"
        padding="lg"
        className="relative overflow-hidden border-gold/20"
      >
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="final" size="md">
            FINAL
          </Badge>
          {completedGame.isFeatured && (
            <Badge variant="gold" size="sm">
              Featured Game
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-12">
          {/* Away team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={completedGame.awayTeam?.abbreviation ?? '???'}
                teamName={completedGame.awayTeam?.name ?? undefined}
                size={80}
                className={`w-full h-full object-contain drop-shadow-lg ${
                  !awayWon ? 'opacity-50' : ''
                }`}
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {completedGame.awayTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {completedGame.awayTeam?.mascot ?? ''}
            </p>
          </div>

          {/* Final score */}
          <div className="text-center">
            <div className="flex items-baseline gap-3 sm:gap-5">
              <span
                className={`font-mono text-4xl sm:text-6xl font-black tabular-nums ${
                  awayWon ? 'text-gold' : 'text-text-muted'
                }`}
              >
                {completedGame.awayScore ?? 0}
              </span>
              <span className="text-text-muted text-lg sm:text-2xl font-medium">
                -
              </span>
              <span
                className={`font-mono text-4xl sm:text-6xl font-black tabular-nums ${
                  homeWon ? 'text-gold' : 'text-text-muted'
                }`}
              >
                {completedGame.homeScore ?? 0}
              </span>
            </div>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={completedGame.homeTeam?.abbreviation ?? '???'}
                teamName={completedGame.homeTeam?.name ?? undefined}
                size={80}
                className={`w-full h-full object-contain drop-shadow-lg ${
                  !homeWon ? 'opacity-50' : ''
                }`}
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {completedGame.homeTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {completedGame.homeTeam?.mascot ?? ''}
            </p>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <Link href={ROUTES.GAME(completedGame.id)}>
            <span className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-border rounded-full">
              View Game Recap &rarr;
            </span>
          </Link>
        </div>
      </Card>

      {/* Countdown + next matchup preview */}
      <Card
        variant="glass"
        padding="lg"
        className="text-center"
      >
        <IntermissionCountdown endsAt={endsAt} />

        {nextGame && (
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-text-muted tracking-wider uppercase mb-4">
              Up Next
            </p>
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              <div className="flex items-center gap-2">
                <TeamLogo
                  abbreviation={nextGame.awayTeam?.abbreviation ?? '???'}
                  teamName={nextGame.awayTeam?.name ?? undefined}
                  size={36}
                  className="w-9 h-9 object-contain"
                />
                <span className="text-sm font-bold">
                  {nextGame.awayTeam?.abbreviation ?? '???'}
                </span>
              </div>
              <span className="text-text-muted text-sm font-medium">vs</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">
                  {nextGame.homeTeam?.abbreviation ?? '???'}
                </span>
                <TeamLogo
                  abbreviation={nextGame.homeTeam?.abbreviation ?? '???'}
                  teamName={nextGame.homeTeam?.name ?? undefined}
                  size={36}
                  className="w-9 h-9 object-contain"
                />
              </div>
            </div>

            <div className="flex justify-center mt-4">
              <Link href={ROUTES.GAME(nextGame.id)}>
                <span className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold text-midnight font-bold text-sm rounded-full hover:bg-gold-bright transition-colors shadow-lg shadow-gold/20">
                  MAKE YOUR PREDICTION
                </span>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function NextGameHero({ game }: { game: GameCardData }) {
  return (
    <Link href={ROUTES.GAME(game.id)} className="block group">
      <Card
        variant="elevated"
        padding="lg"
        className="relative overflow-hidden hover:border-gold/30 transition-all"
      >
        {/* Status bar */}
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="upcoming">Up Next</Badge>
          {game.isFeatured && (
            <Badge variant="gold" size="sm">
              Featured Game
            </Badge>
          )}
        </div>

        {/* Matchup display */}
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          {/* Away team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={game.awayTeam?.abbreviation ?? '???'}
                teamName={game.awayTeam?.name ?? undefined}
                size={80}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.awayTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.awayTeam?.mascot ?? ''}
            </p>
          </div>

          {/* VS + countdown */}
          <div className="text-center">
            <p className="text-3xl sm:text-5xl font-black text-text-muted">VS</p>
            {game.scheduledAt ? (
              <div className="mt-3">
                <KickoffCountdown scheduledAt={new Date(game.scheduledAt).toISOString()} />
              </div>
            ) : (
              <p className="text-xs text-text-muted mt-2 tracking-wider uppercase">
                Kickoff Soon
              </p>
            )}
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-2">
              <TeamLogo
                abbreviation={game.homeTeam?.abbreviation ?? '???'}
                teamName={game.homeTeam?.name ?? undefined}
                size={80}
                className="w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.homeTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.homeTeam?.mascot ?? ''}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center mt-8">
          <span className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold text-midnight font-bold text-sm rounded-full group-hover:bg-gold-bright transition-colors shadow-lg shadow-gold/20">
            MAKE YOUR PREDICTION
          </span>
        </div>
      </Card>
    </Link>
  );
}

function WeekBreakHero({
  weekBreak,
  season,
}: {
  weekBreak: {
    endsAt: string;
    nextWeekGames: GameCardData[];
    currentWeek: number;
  };
  season: { currentWeek: number; seasonNumber: number; status: string };
}) {
  return (
    <div className="space-y-4">
      {/* Countdown card */}
      <Card variant="elevated" padding="lg" className="text-center border-gold/20">
        <Badge variant="gold" size="md" className="mb-4">
          WEEK {weekBreak.currentWeek} COMPLETE
        </Badge>
        <p className="text-text-secondary text-sm mb-4">
          All games this week have wrapped up. Next week kicks off soon.
        </p>
        <IntermissionCountdown endsAt={weekBreak.endsAt} />
        <div className="mt-4">
          <Link
            href={ROUTES.SCHEDULE}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-border rounded-full"
          >
            View Results &amp; Standings &rarr;
          </Link>
        </div>
      </Card>

      {/* Next week preview */}
      {weekBreak.nextWeekGames.length > 0 && (
        <Card variant="glass" padding="lg">
          <p className="text-xs text-text-muted tracking-wider uppercase font-bold mb-4 text-center">
            Week {weekBreak.currentWeek + 1} Preview
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {weekBreak.nextWeekGames.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface/40 border border-border/30"
              >
                <div className="flex items-center gap-2">
                  <TeamLogo
                    abbreviation={g.awayTeam?.abbreviation ?? '???'}
                    teamName={g.awayTeam?.name ?? undefined}
                    size={24}
                    className="w-6 h-6 object-contain shrink-0"
                  />
                  <span className="text-xs font-bold">
                    {g.awayTeam?.abbreviation ?? '???'}
                  </span>
                </div>
                <span className="text-[10px] text-text-muted font-medium">@</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">
                    {g.homeTeam?.abbreviation ?? '???'}
                  </span>
                  <TeamLogo
                    abbreviation={g.homeTeam?.abbreviation ?? '???'}
                    teamName={g.homeTeam?.name ?? undefined}
                    size={24}
                    className="w-6 h-6 object-contain shrink-0"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function WeekCompleteHero({
  season,
}: {
  season: { currentWeek: number; seasonNumber: number; status: string };
}) {
  return (
    <Card variant="glass" padding="lg" className="text-center">
      <p className="text-text-muted text-sm tracking-wider uppercase mb-2">
        Week {season.currentWeek} Complete
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold mb-4">
        All games have been played
      </h2>
      <p className="text-text-secondary max-w-md mx-auto mb-6">
        The next week of action is coming soon.
      </p>
      <Link
        href={ROUTES.SCHEDULE}
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-surface-elevated text-text-primary font-bold text-sm rounded-full hover:bg-surface-hover transition-colors border border-border"
      >
        View Full Schedule &rarr;
      </Link>
    </Card>
  );
}
