import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, teams, gameEvents } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    // Fetch the game record
    const game = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (game.length === 0) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    const gameData = game[0];

    // Fetch home and away teams
    const [homeTeamRows, awayTeamRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.id, gameData.homeTeamId)).limit(1),
      db.select().from(teams).where(eq(teams.id, gameData.awayTeamId)).limit(1),
    ]);

    if (homeTeamRows.length === 0 || awayTeamRows.length === 0) {
      return NextResponse.json(
        { error: 'Team data not found for this game' },
        { status: 404 }
      );
    }

    const homeTeam = homeTeamRows[0];
    const awayTeam = awayTeamRows[0];

    // Fetch the latest game event for current state (if game is in progress or completed)
    let latestEvent = null;
    if (gameData.status === 'broadcasting' || gameData.status === 'completed') {
      const events = await db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.gameId, gameId))
        .orderBy(asc(gameEvents.eventNumber))
        .limit(1);

      if (events.length > 0) {
        // Get the last event for current game state
        const lastEvents = await db
          .select()
          .from(gameEvents)
          .where(eq(gameEvents.gameId, gameId))
          .orderBy(asc(gameEvents.eventNumber));

        if (lastEvents.length > 0) {
          latestEvent = lastEvents[lastEvents.length - 1];
        }
      }
    }

    return NextResponse.json({
      id: gameData.id,
      seasonId: gameData.seasonId,
      week: gameData.week,
      gameType: gameData.gameType,
      status: gameData.status,
      isFeatured: gameData.isFeatured,
      homeTeam: {
        id: homeTeam.id,
        name: homeTeam.name,
        abbreviation: homeTeam.abbreviation,
        city: homeTeam.city,
        mascot: homeTeam.mascot,
        conference: homeTeam.conference,
        division: homeTeam.division,
        primaryColor: homeTeam.primaryColor,
        secondaryColor: homeTeam.secondaryColor,
        offenseRating: homeTeam.offenseRating,
        defenseRating: homeTeam.defenseRating,
        specialTeamsRating: homeTeam.specialTeamsRating,
        playStyle: homeTeam.playStyle,
      },
      awayTeam: {
        id: awayTeam.id,
        name: awayTeam.name,
        abbreviation: awayTeam.abbreviation,
        city: awayTeam.city,
        mascot: awayTeam.mascot,
        conference: awayTeam.conference,
        division: awayTeam.division,
        primaryColor: awayTeam.primaryColor,
        secondaryColor: awayTeam.secondaryColor,
        offenseRating: awayTeam.offenseRating,
        defenseRating: awayTeam.defenseRating,
        specialTeamsRating: awayTeam.specialTeamsRating,
        playStyle: awayTeam.playStyle,
      },
      // Hide final scores for broadcasting/simulating games to prevent spoilers.
      // Live scores are only available client-side via the SSE event stream.
      homeScore: gameData.status === 'completed' ? (gameData.homeScore ?? 0) : null,
      awayScore: gameData.status === 'completed' ? (gameData.awayScore ?? 0) : null,
      boxScore: gameData.boxScore,
      totalPlays: gameData.totalPlays,
      serverSeedHash: gameData.serverSeedHash,
      // Only reveal the server seed after game is completed
      serverSeed: gameData.status === 'completed' ? gameData.serverSeed : null,
      clientSeed: gameData.clientSeed,
      broadcastStartedAt: gameData.broadcastStartedAt,
      completedAt: gameData.completedAt,
      createdAt: gameData.createdAt,
      // Include current game state from latest event if available
      currentGameState: latestEvent ? latestEvent.gameState : null,
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
