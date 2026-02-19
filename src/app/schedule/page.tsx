export const dynamic = 'force-dynamic';

import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { games, seasons, teams, standings } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StandingsTable } from '@/components/schedule/standings-table';
import { GameCard } from '@/components/schedule/game-card';
import { WeekSelector } from '@/components/schedule/week-selector';
import { PlayoffBracketView } from '@/components/schedule/playoff-bracket';
import {
  formatRecord,
  formatWinPct,
  formatSeasonStatus,
  formatGameType,
} from '@/lib/utils/formatting';
import { ROUTES } from '@/lib/utils/constants';
import type {
  DivisionStandings,
  TeamStanding,
  PlayoffBracket,
  ScheduledGame,
} from '@/lib/simulation/types';

export const metadata: Metadata = {
  title: 'Schedule & Standings',
  description:
    'Full season schedule, scores, and division standings for the current GridIron Live season.',
};

// ============================================================
// Data fetching
// ============================================================

interface SchedulePageProps {
  searchParams: Promise<{ week?: string; view?: string }>;
}

async function getScheduleData(weekParam?: string, viewParam?: string) {
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
    const view = viewParam === 'standings' ? 'standings' : 'schedule';

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

    // Get standings
    const standingRows = await db
      .select()
      .from(standings)
      .where(eq(standings.seasonId, season.id));

    const hydratedStandings = standingRows.map((s) => ({
      ...s,
      team: teamMap.get(s.teamId) ?? undefined,
    }));

    // Group by conference -> division as DivisionStandings[]
    const divisionMap: Record<string, Record<string, TeamStanding[]>> = {};

    for (const s of hydratedStandings) {
      const conf = s.team?.conference ?? 'Unknown';
      const div = s.team?.division ?? 'Unknown';
      if (!divisionMap[conf]) divisionMap[conf] = {};
      if (!divisionMap[conf][div]) divisionMap[conf][div] = [];
      divisionMap[conf][div].push({
        teamId: s.teamId,
        team: s.team
          ? {
              id: s.team.id,
              name: s.team.name,
              abbreviation: s.team.abbreviation,
              city: s.team.city,
              mascot: s.team.mascot,
              conference: s.team.conference,
              division: s.team.division,
              primaryColor: s.team.primaryColor,
              secondaryColor: s.team.secondaryColor,
              offenseRating: s.team.offenseRating,
              defenseRating: s.team.defenseRating,
              specialTeamsRating: s.team.specialTeamsRating,
              playStyle: s.team.playStyle,
            }
          : undefined,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
        divisionWins: s.divisionWins ?? 0,
        divisionLosses: s.divisionLosses ?? 0,
        conferenceWins: s.conferenceWins ?? 0,
        conferenceLosses: s.conferenceLosses ?? 0,
        pointsFor: s.pointsFor ?? 0,
        pointsAgainst: s.pointsAgainst ?? 0,
        streak: s.streak ?? 'W0',
        clinched: (s.clinched as TeamStanding['clinched']) ?? null,
        playoffSeed: s.playoffSeed ?? null,
      });
    }

    const divisionStandings: DivisionStandings[] = [];
    for (const conf of ['AFC', 'NFC'] as const) {
      for (const div of ['North', 'South', 'East', 'West'] as const) {
        const divTeams = divisionMap[conf]?.[div] ?? [];
        if (divTeams.length > 0) {
          divisionStandings.push({
            conference: conf,
            division: div,
            teams: divTeams,
          });
        }
      }
    }

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
      view,
      games: hydratedGames,
      divisionStandings,
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
  const { week, view } = await searchParams;
  const data = await getScheduleData(week, view);

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
    divisionStandings,
    weeks,
    hasLive,
    isPlayoffs,
  } = data;
  const activeView = data.view;

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
    broadcastStartedAt: g.broadcastStartedAt,
    completedAt: g.completedAt,
  }));

  return (
    <>
      <Header isLive={hasLive} />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
            Season {season.seasonNumber}
          </h1>
          <p className="text-text-secondary">
            {formatSeasonStatus(season.status, season.currentWeek)}
          </p>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-border">
          <Link
            href={`/schedule?week=${targetWeek}&view=schedule`}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeView === 'schedule'
                ? 'text-gold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Schedule
            {activeView === 'schedule' && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-gold rounded-full" />
            )}
          </Link>
          <Link
            href={`/schedule?week=${targetWeek}&view=standings`}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeView === 'standings'
                ? 'text-gold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Standings
            {activeView === 'standings' && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-gold rounded-full" />
            )}
          </Link>
        </div>

        {/* Schedule view */}
        {activeView === 'schedule' && (
          <>
            {/* Week selector */}
            <ScheduleWeekNav
              weeks={weeks}
              targetWeek={targetWeek}
            />

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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scheduledGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Standings view */}
        {activeView === 'standings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {['AFC', 'NFC'].map((conf) => (
              <div key={conf}>
                <h2 className="text-lg font-bold text-text-primary mb-4 tracking-wider">
                  {conf}
                </h2>
                <div className="space-y-4">
                  {divisionStandings
                    .filter((ds) => ds.conference === conf)
                    .map((ds) => (
                      <StandingsTable
                        key={`${ds.conference}-${ds.division}`}
                        standings={ds}
                      />
                    ))}
                </div>
              </div>
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
          href={`/schedule?week=${w}&view=schedule`}
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
