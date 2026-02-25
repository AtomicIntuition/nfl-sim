export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TeamHeader } from '@/components/team/team-header';
import { RosterList } from '@/components/team/roster-list';
import { TeamStats } from '@/components/team/team-stats';
import { getTeamById, getTeamPlayers, getStandings } from '@/lib/db/queries/teams';
import { db } from '@/lib/db';
import { games, seasons, teams } from '@/lib/db/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { formatRecord } from '@/lib/utils/formatting';
import { ROUTES } from '@/lib/utils/constants';
import { TeamLogo } from '@/components/team/team-logo';
import type { Team, Player } from '@/lib/simulation/types';

// ============================================================
// Types
// ============================================================

interface PageProps {
  params: Promise<{ teamId: string }>;
}

// ============================================================
// Dynamic metadata
// ============================================================

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { teamId } = await params;

  try {
    const team = await getTeamById(teamId);
    if (!team) {
      return { title: 'Team Not Found' };
    }

    return {
      title: `${team.city} ${team.mascot}`,
      description: `Team profile, roster, and season stats for the ${team.city} ${team.mascot} on GridBlitz.`,
    };
  } catch {
    return { title: 'Team Not Found' };
  }
}

// ============================================================
// Data fetching
// ============================================================

async function getTeamData(teamId: string) {
  try {
    // Fetch team
    const team = await getTeamById(teamId);
    if (!team) return null;

    // Fetch roster
    const roster = await getTeamPlayers(teamId);

    // Get latest season
    const seasonRows = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);

    const season = seasonRows[0] ?? null;

    // Get team standings for current season
    let hydratedStandings: Awaited<ReturnType<typeof getStandings>> = [];
    let teamStanding: (typeof hydratedStandings)[number] | null = null;
    let divisionRank = 1;

    if (season) {
      hydratedStandings = await getStandings(season.id);
      teamStanding =
        hydratedStandings.find((s) => s.teamId === teamId) ?? null;

      // Calculate division rank
      const divisionTeams = hydratedStandings
        .filter(
          (s) =>
            s.team?.conference === team.conference &&
            s.team?.division === team.division
        )
        .sort((a, b) => {
          const winDiff = (b.wins ?? 0) - (a.wins ?? 0);
          if (winDiff !== 0) return winDiff;
          return (
            (b.pointsFor ?? 0) -
            (b.pointsAgainst ?? 0) -
            ((a.pointsFor ?? 0) - (a.pointsAgainst ?? 0))
          );
        });

      divisionRank =
        divisionTeams.findIndex((s) => s.teamId === teamId) + 1 || 1;
    }

    // Get all team games this season
    let teamGames: Array<{
      game: typeof games.$inferSelect;
      opponent: typeof teams.$inferSelect | null;
      isHome: boolean;
    }> = [];

    if (season) {
      const allGames = await db
        .select()
        .from(games)
        .where(
          and(
            eq(games.seasonId, season.id),
            or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
          )
        );

      // Sort by week
      allGames.sort((a, b) => a.week - b.week);

      // Get all opponent teams
      const opponentIds = new Set<string>();
      for (const g of allGames) {
        const oppId = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
        opponentIds.add(oppId);
      }

      const opponentIdList = [...opponentIds];
      const opponentTeams =
        opponentIdList.length > 0
          ? await db
              .select()
              .from(teams)
              .where(or(...opponentIdList.map((id) => eq(teams.id, id))))
          : [];

      const opponentMap = new Map(opponentTeams.map((t) => [t.id, t]));

      teamGames = allGames.map((g) => {
        const isHome = g.homeTeamId === teamId;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;
        return {
          game: g,
          opponent: opponentMap.get(oppId) ?? null,
          isHome,
        };
      });
    }

    // Compute team stats from completed games
    const completedGames = teamGames.filter(
      (tg) => tg.game.status === 'completed'
    );
    const gamesPlayed = completedGames.length;

    let totalPointsFor = 0;
    let totalPointsAgainst = 0;
    for (const { game, isHome } of completedGames) {
      totalPointsFor += isHome ? (game.homeScore ?? 0) : (game.awayScore ?? 0);
      totalPointsAgainst += isHome
        ? (game.awayScore ?? 0)
        : (game.homeScore ?? 0);
    }

    const teamStats = {
      pointsPerGame: gamesPlayed > 0 ? totalPointsFor / gamesPlayed : undefined,
      pointsAllowedPerGame:
        gamesPlayed > 0 ? totalPointsAgainst / gamesPlayed : undefined,
      turnoverDifferential: undefined,
      thirdDownPct: undefined,
      redZonePct: undefined,
    };

    return {
      team,
      roster,
      season,
      teamStanding,
      divisionRank,
      teamGames,
      teamStats,
    };
  } catch (error) {
    console.error('Failed to fetch team data:', error);
    return null;
  }
}

// ============================================================
// Page component
// ============================================================

export default async function TeamPage({ params }: PageProps) {
  const { teamId } = await params;
  const data = await getTeamData(teamId);

  if (!data) {
    notFound();
  }

  const { team, roster, season, teamStanding, divisionRank, teamGames, teamStats } =
    data;

  // Map DB team to the Team type expected by TeamHeader
  const teamType: Team = {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    city: team.city,
    mascot: team.mascot,
    conference: team.conference,
    division: team.division,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    offenseRating: team.offenseRating,
    defenseRating: team.defenseRating,
    specialTeamsRating: team.specialTeamsRating,
    playStyle: team.playStyle,
  };

  // Map DB players to the Player type expected by RosterList
  const rosterPlayers: Player[] = roster.map((p) => ({
    id: p.id,
    teamId: p.teamId,
    name: p.name,
    position: p.position,
    number: p.number,
    rating: p.rating,
    speed: p.speed,
    strength: p.strength,
    awareness: p.awareness,
    clutchRating: p.clutchRating,
    injuryProne: p.injuryProne ?? false,
  }));

  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight">
        {/* Team header using the shared component */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
          <TeamHeader
            team={teamType}
            wins={teamStanding?.wins ?? 0}
            losses={teamStanding?.losses ?? 0}
            ties={teamStanding?.ties ?? 0}
            divisionRank={divisionRank}
            playoffSeed={teamStanding?.playoffSeed ?? null}
          />
        </section>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
          {/* Team stats using the shared component */}
          <section>
            <TeamStats
              stats={teamStats}
              teamColor={team.primaryColor}
            />
          </section>

          {/* Season schedule */}
          {teamGames.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-text-primary mb-4">
                Season {season?.seasonNumber ?? ''} Schedule
              </h2>
              <Card variant="default" padding="none">
                <div className="divide-y divide-border/50">
                  {/* Header */}
                  <div className="grid grid-cols-[50px_1fr_80px_80px] sm:grid-cols-[60px_1fr_100px_100px] px-4 py-2 text-[10px] font-bold text-text-muted tracking-wider uppercase">
                    <span>Week</span>
                    <span>Opponent</span>
                    <span className="text-center">Result</span>
                    <span className="text-right">Score</span>
                  </div>
                  {teamGames.map(({ game, opponent, isHome }) => {
                    const isCompleted = game.status === 'completed';
                    const isLive =
                      game.status === 'broadcasting' ||
                      game.status === 'simulating';

                    const teamScore = isHome
                      ? game.homeScore ?? 0
                      : game.awayScore ?? 0;
                    const oppScore = isHome
                      ? game.awayScore ?? 0
                      : game.homeScore ?? 0;

                    const won = isCompleted && teamScore > oppScore;
                    const lost = isCompleted && teamScore < oppScore;
                    const tied = isCompleted && teamScore === oppScore;

                    return (
                      <Link
                        key={game.id}
                        href={ROUTES.GAME(game.id)}
                        className="grid grid-cols-[50px_1fr_80px_80px] sm:grid-cols-[60px_1fr_100px_100px] px-4 py-2.5 items-center hover:bg-surface-hover transition-colors"
                      >
                        <span className="text-xs text-text-muted font-mono tabular-nums">
                          {game.week}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-text-muted">
                            {isHome ? 'vs' : '@'}
                          </span>
                          {opponent && (
                            <TeamLogo
                              abbreviation={opponent.abbreviation}
                              teamName={opponent.name}
                              size={18}
                              className="w-[18px] h-[18px] object-contain flex-shrink-0"
                            />
                          )}
                          <span className="text-sm font-bold truncate">
                            {opponent?.abbreviation ?? '???'}
                          </span>
                          <span className="text-xs text-text-muted truncate hidden sm:inline">
                            {opponent?.mascot ?? ''}
                          </span>
                        </div>
                        <div className="flex justify-center">
                          {isLive && (
                            <Badge variant="live" size="sm" pulse>
                              LIVE
                            </Badge>
                          )}
                          {won && (
                            <Badge variant="big-play" size="sm">
                              W
                            </Badge>
                          )}
                          {lost && (
                            <Badge variant="turnover" size="sm">
                              L
                            </Badge>
                          )}
                          {tied && (
                            <Badge variant="default" size="sm">
                              T
                            </Badge>
                          )}
                          {!isCompleted && !isLive && (
                            <span className="text-xs text-text-muted">--</span>
                          )}
                        </div>
                        <div className="text-right">
                          {isCompleted || isLive ? (
                            <span className="font-mono text-sm font-bold tabular-nums">
                              {teamScore}-{oppScore}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">--</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            </section>
          )}

          {/* Roster using the shared component */}
          {rosterPlayers.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-text-primary mb-4">
                Roster
              </h2>
              <RosterList
                players={rosterPlayers}
                teamColor={team.primaryColor}
              />
            </section>
          )}

          {/* Team info card */}
          <section>
            <h2 className="text-lg font-bold text-text-primary mb-4">
              Team Info
            </h2>
            <Card variant="glass" padding="md">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                    Play Style
                  </p>
                  <p className="text-sm font-medium text-text-primary capitalize">
                    {team.playStyle.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                    Conference
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {team.conference}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                    Division
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {team.division}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                    Roster Size
                  </p>
                  <p className="text-sm font-medium text-text-primary">
                    {roster.length} players
                  </p>
                </div>
              </div>
              {teamStanding && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                      Points For
                    </p>
                    <p className="text-sm font-mono font-bold tabular-nums text-text-primary">
                      {teamStanding.pointsFor ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                      Points Against
                    </p>
                    <p className="text-sm font-mono font-bold tabular-nums text-text-primary">
                      {teamStanding.pointsAgainst ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                      Div Record
                    </p>
                    <p className="text-sm font-mono font-bold tabular-nums text-text-primary">
                      {teamStanding.divisionWins ?? 0}-
                      {teamStanding.divisionLosses ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted tracking-wider uppercase mb-1">
                      Conf Record
                    </p>
                    <p className="text-sm font-mono font-bold tabular-nums text-text-primary">
                      {teamStanding.conferenceWins ?? 0}-
                      {teamStanding.conferenceLosses ?? 0}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
