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

  // Get top standings for quick snapshot
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

  const hydratedStandings = standingRows
    .map((s) => ({
      ...s,
      team: teamMap.get(s.teamId) ?? null,
    }))
    .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))
    .slice(0, 8);

  // Week progress
  const completedCount = weekGames.filter(
    (g) => g.status === 'completed'
  ).length;
  const totalCount = weekGames.length;

  return {
    season,
    liveGame: hydratedLive,
    nextGame: hydratedNext,
    completedGames: completedGames.filter(Boolean),
    standings: hydratedStandings,
    weekProgress: { completed: completedCount, total: totalCount },
    isLive: !!liveGame,
  };
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

  const { season, liveGame, nextGame, completedGames, standings, weekProgress, isLive } =
    data;

  return (
    <>
      <Header isLive={isLive} />
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
            ) : nextGame ? (
              <NextGameHero game={nextGame} />
            ) : (
              <WeekCompleteHero season={season} />
            )}
          </div>
        </section>

        {/* ---- Score Ticker ---- */}
        {completedGames.length > 0 && (
          <section className="border-y border-border bg-surface/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-text-muted tracking-wider uppercase">
                  Scores
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {completedGames.map(
                  (game) =>
                    game && (
                      <Link
                        key={game.id}
                        href={ROUTES.GAME(game.id)}
                        className="flex-shrink-0"
                      >
                        <Card
                          variant="bordered"
                          padding="sm"
                          className="min-w-[160px] hover:border-gold/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold" style={{ color: game.awayTeam?.primaryColor }}>
                                {game.awayTeam?.abbreviation ?? '???'}
                              </span>
                              <span className="font-mono text-sm font-black tabular-nums">
                                {game.awayScore ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold" style={{ color: game.homeTeam?.primaryColor }}>
                                {game.homeTeam?.abbreviation ?? '???'}
                              </span>
                              <span className="font-mono text-sm font-black tabular-nums">
                                {game.homeScore ?? 0}
                              </span>
                            </div>
                          </div>
                          <Badge variant="final" size="sm" className="mt-1.5">
                            Final
                          </Badge>
                        </Card>
                      </Link>
                    )
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---- Quick Standings ---- */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary tracking-wide">
              Top Teams
            </h2>
            <Link
              href={ROUTES.SCHEDULE}
              className="text-sm font-medium text-gold hover:text-gold-bright transition-colors"
            >
              Full Standings &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {standings.map((s, idx) => (
              <Link
                key={s.teamId}
                href={ROUTES.TEAM(s.teamId)}
              >
                <Card
                  variant="default"
                  padding="sm"
                  className="hover:border-border-bright transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-text-muted w-5">
                      {idx + 1}
                    </span>
                    <div
                      className="w-1.5 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.team?.primaryColor ?? '#666' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        {s.team?.city ?? 'Unknown'} {s.team?.mascot ?? ''}
                      </p>
                      <p className="text-xs text-text-muted">
                        {s.team?.conference ?? ''} {s.team?.division ?? ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono tabular-nums">
                        {formatRecord(s.wins ?? 0, s.losses ?? 0, s.ties ?? 0)}
                      </p>
                      {s.streak && s.streak !== 'W0' && (
                        <p
                          className={`text-[10px] font-bold ${
                            s.streak?.startsWith('W')
                              ? 'text-success'
                              : 'text-danger'
                          }`}
                        >
                          {s.streak}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
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
// Sub-components
// ============================================================

interface GameCardData {
  id: string;
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
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black mb-2"
              style={{
                backgroundColor: `${game.awayTeam?.primaryColor ?? '#666'}20`,
                color: game.awayTeam?.primaryColor ?? '#666',
              }}
            >
              {game.awayTeam?.abbreviation ?? '???'}
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.awayTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.awayTeam?.mascot ?? ''}
            </p>
          </div>

          {/* Score */}
          <div className="text-center">
            <div className="flex items-baseline gap-3 sm:gap-5">
              <span className="font-mono text-4xl sm:text-6xl font-black tabular-nums">
                {game.awayScore ?? 0}
              </span>
              <span className="text-text-muted text-lg sm:text-2xl font-medium">
                -
              </span>
              <span className="font-mono text-4xl sm:text-6xl font-black tabular-nums">
                {game.homeScore ?? 0}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-2 tracking-wider uppercase">
              In Progress
            </p>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black mb-2"
              style={{
                backgroundColor: `${game.homeTeam?.primaryColor ?? '#666'}20`,
                color: game.homeTeam?.primaryColor ?? '#666',
              }}
            >
              {game.homeTeam?.abbreviation ?? '???'}
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
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black mb-2"
              style={{
                backgroundColor: `${game.awayTeam?.primaryColor ?? '#666'}20`,
                color: game.awayTeam?.primaryColor ?? '#666',
              }}
            >
              {game.awayTeam?.abbreviation ?? '???'}
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              {game.awayTeam?.city ?? 'Unknown'}
            </p>
            <p className="text-sm sm:text-base font-bold">
              {game.awayTeam?.mascot ?? ''}
            </p>
          </div>

          {/* VS */}
          <div className="text-center">
            <p className="text-3xl sm:text-5xl font-black text-text-muted">VS</p>
            <p className="text-xs text-text-muted mt-2 tracking-wider uppercase">
              Kickoff Soon
            </p>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black mb-2"
              style={{
                backgroundColor: `${game.homeTeam?.primaryColor ?? '#666'}20`,
                color: game.homeTeam?.primaryColor ?? '#666',
              }}
            >
              {game.homeTeam?.abbreviation ?? '???'}
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
        Check the schedule for results and standings updates. The next week of
        action is coming soon.
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
