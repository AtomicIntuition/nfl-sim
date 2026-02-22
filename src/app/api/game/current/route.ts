import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, seasons, teams } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { INTERMISSION_MS } from '@/lib/scheduling/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/game/current
 *
 * Finds the game that is currently broadcasting or the next scheduled game.
 * Returns context about the current season state for the homepage.
 *
 * Also returns intermission timing info when a game recently completed.
 */
export async function GET() {
  try {
    // Find the most recent active season
    const seasonRows = await db
      .select()
      .from(seasons)
      .orderBy(desc(seasons.seasonNumber))
      .limit(1);

    if (seasonRows.length === 0) {
      return NextResponse.json({
        currentGame: null,
        nextGame: null,
        seasonStatus: 'offseason',
        currentWeek: 0,
        seasonNumber: 0,
      });
    }

    const season = seasonRows[0];

    // Find the currently broadcasting game
    const broadcastingRows = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.status, 'broadcasting')
        )
      )
      .limit(1);

    let currentGame = broadcastingRows.length > 0 ? broadcastingRows[0] : null;

    // If no broadcasting game, check for a simulating game
    if (!currentGame) {
      const simulatingRows = await db
        .select()
        .from(games)
        .where(
          and(
            eq(games.seasonId, season.id),
            eq(games.status, 'simulating')
          )
        )
        .limit(1);

      currentGame = simulatingRows.length > 0 ? simulatingRows[0] : null;
    }

    // Get current week games
    const weekGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.seasonId, season.id),
          eq(games.week, season.currentWeek)
        )
      );

    // Find the next scheduled game — check current week first
    let nextGameRows = weekGames.filter((g) => g.status === 'scheduled');

    // Cross-week lookup: if no scheduled games in current week, check next week
    if (nextGameRows.length === 0) {
      nextGameRows = await db
        .select()
        .from(games)
        .where(
          and(
            eq(games.seasonId, season.id),
            eq(games.week, season.currentWeek + 1),
            eq(games.status, 'scheduled')
          )
        )
        .limit(5);
    }

    // Prefer featured game, fall back to any scheduled game
    const nextGame =
      nextGameRows.find((g) => g.isFeatured) ??
      nextGameRows[0] ??
      null;

    // Hydrate team data for the current and next game
    const hydrateGameTeams = async (game: typeof currentGame) => {
      if (!game) return null;

      const [homeTeamRows, awayTeamRows] = await Promise.all([
        db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
        db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
      ]);

      return {
        id: game.id,
        week: game.week,
        gameType: game.gameType,
        status: game.status,
        isFeatured: game.isFeatured,
        homeTeam: homeTeamRows[0] ?? null,
        awayTeam: awayTeamRows[0] ?? null,
        // Hide final scores for broadcasting/simulating games to prevent spoilers.
        // Live scores are only available client-side via the SSE event stream.
        homeScore: game.status === 'completed' ? (game.homeScore ?? 0) : null,
        awayScore: game.status === 'completed' ? (game.awayScore ?? 0) : null,
        scheduledAt: game.scheduledAt,
        broadcastStartedAt: game.broadcastStartedAt,
        completedAt: game.completedAt,
      };
    };

    const [hydratedCurrent, hydratedNext] = await Promise.all([
      hydrateGameTeams(currentGame),
      currentGame?.id !== nextGame?.id ? hydrateGameTeams(nextGame) : null,
    ]);

    const completedThisWeek = weekGames.filter((g) => g.status === 'completed').length;
    const totalThisWeek = weekGames.length;

    // Intermission timing: check for recently completed game within intermission window
    let intermission: { endsAt: string; remainingSeconds: number } | null = null;

    if (!currentGame) {
      const recentCompleted = weekGames
        .filter((g) => g.status === 'completed' && g.completedAt)
        .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

      if (recentCompleted?.completedAt) {
        const endsAtMs = recentCompleted.completedAt.getTime() + INTERMISSION_MS;
        const remainingMs = endsAtMs - Date.now();

        if (remainingMs > 0 && nextGameRows.length > 0) {
          intermission = {
            endsAt: new Date(endsAtMs).toISOString(),
            remainingSeconds: Math.ceil(remainingMs / 1000),
          };
        }
      }
    }

    return NextResponse.json({
      currentGame: hydratedCurrent,
      nextGame: hydratedCurrent ? hydratedNext : (hydratedNext ?? hydratedCurrent),
      seasonStatus: season.status,
      currentWeek: season.currentWeek,
      seasonNumber: season.seasonNumber,
      weekProgress: {
        completed: completedThisWeek,
        total: totalThisWeek,
      },
      intermission,
    });
  } catch (error) {
    console.error('Error fetching current game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
