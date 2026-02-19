import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, seasons, teams, standings } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schedule
 *
 * Returns schedule data for the current season.
 * Query params:
 *   - week: number (optional, defaults to current week)
 *   - seasonId: string (optional, defaults to most recent season)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week');
    const seasonIdParam = searchParams.get('seasonId');

    // Find the season
    let season;
    if (seasonIdParam) {
      const rows = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, seasonIdParam))
        .limit(1);
      season = rows[0] ?? null;
    } else {
      const rows = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.seasonNumber))
        .limit(1);
      season = rows[0] ?? null;
    }

    if (!season) {
      return NextResponse.json({
        season: null,
        games: [],
        standings: [],
        weeks: [],
        message: 'No active season found',
      });
    }

    const targetWeek = weekParam ? parseInt(weekParam, 10) : season.currentWeek;

    // Fetch games for the requested week
    const weekGames = await db
      .select()
      .from(games)
      .where(
        and(eq(games.seasonId, season.id), eq(games.week, targetWeek))
      );

    // Hydrate team data for each game
    const teamCache = new Map<string, typeof teams.$inferSelect>();

    async function getTeam(teamId: string) {
      if (teamCache.has(teamId)) return teamCache.get(teamId)!;
      const rows = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      if (rows[0]) teamCache.set(teamId, rows[0]);
      return rows[0] ?? null;
    }

    const hydratedGames = await Promise.all(
      weekGames.map(async (game) => {
        const [homeTeam, awayTeam] = await Promise.all([
          getTeam(game.homeTeamId),
          getTeam(game.awayTeamId),
        ]);

        return {
          id: game.id,
          week: game.week,
          gameType: game.gameType,
          status: game.status,
          isFeatured: game.isFeatured,
          homeTeam: homeTeam
            ? {
                id: homeTeam.id,
                name: homeTeam.name,
                abbreviation: homeTeam.abbreviation,
                city: homeTeam.city,
                mascot: homeTeam.mascot,
                conference: homeTeam.conference,
                division: homeTeam.division,
                primaryColor: homeTeam.primaryColor,
                secondaryColor: homeTeam.secondaryColor,
              }
            : null,
          awayTeam: awayTeam
            ? {
                id: awayTeam.id,
                name: awayTeam.name,
                abbreviation: awayTeam.abbreviation,
                city: awayTeam.city,
                mascot: awayTeam.mascot,
                conference: awayTeam.conference,
                division: awayTeam.division,
                primaryColor: awayTeam.primaryColor,
                secondaryColor: awayTeam.secondaryColor,
              }
            : null,
          homeScore: game.homeScore ?? 0,
          awayScore: game.awayScore ?? 0,
          completedAt: game.completedAt,
          broadcastStartedAt: game.broadcastStartedAt,
        };
      })
    );

    // Fetch standings for this season
    const standingRows = await db
      .select()
      .from(standings)
      .where(eq(standings.seasonId, season.id));

    // Hydrate standings with team data
    const hydratedStandings = await Promise.all(
      standingRows.map(async (standing) => {
        const team = await getTeam(standing.teamId);
        return {
          ...standing,
          team: team
            ? {
                id: team.id,
                name: team.name,
                abbreviation: team.abbreviation,
                city: team.city,
                mascot: team.mascot,
                conference: team.conference,
                division: team.division,
                primaryColor: team.primaryColor,
                secondaryColor: team.secondaryColor,
              }
            : null,
        };
      })
    );

    // Group standings by conference and division
    const groupedStandings: Record<
      string,
      Record<string, typeof hydratedStandings>
    > = {};

    for (const standing of hydratedStandings) {
      const conf = standing.team?.conference ?? 'Unknown';
      const div = standing.team?.division ?? 'Unknown';
      if (!groupedStandings[conf]) groupedStandings[conf] = {};
      if (!groupedStandings[conf][div]) groupedStandings[conf][div] = [];
      groupedStandings[conf][div].push(standing);
    }

    // Sort each division by wins (descending)
    for (const conf of Object.keys(groupedStandings)) {
      for (const div of Object.keys(groupedStandings[conf])) {
        groupedStandings[conf][div].sort(
          (a, b) => (b.wins ?? 0) - (a.wins ?? 0)
        );
      }
    }

    // Build the list of available weeks
    const allGames = await db
      .select({ week: games.week })
      .from(games)
      .where(eq(games.seasonId, season.id));

    const uniqueWeeks = [...new Set(allGames.map((g) => g.week))].sort(
      (a, b) => a - b
    );

    return NextResponse.json({
      season: {
        id: season.id,
        seasonNumber: season.seasonNumber,
        currentWeek: season.currentWeek,
        status: season.status,
        totalWeeks: season.totalWeeks,
      },
      currentWeek: targetWeek,
      games: hydratedGames,
      standings: groupedStandings,
      weeks: uniqueWeeks,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
