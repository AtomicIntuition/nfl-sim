import { NextResponse } from 'next/server';
import { getGameById } from '@/lib/db/queries/games';

export const dynamic = 'force-dynamic';

// ============================================================
// GET /api/verify/[gameId]
// Returns provably fair verification data for a completed game.
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    const game = await getGameById(gameId);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found.' },
        { status: 404 }
      );
    }

    // Only reveal the server seed for completed games
    if (game.status !== 'completed') {
      return NextResponse.json(
        {
          error:
            'Game has not been completed yet. The server seed is only revealed after the game finishes to ensure provable fairness.',
          status: game.status,
          serverSeedHash: game.serverSeedHash,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      gameId: game.id,
      serverSeed: game.serverSeed,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      totalPlays: game.totalPlays,
      homeTeam: game.homeTeam
        ? {
            id: game.homeTeam.id,
            name: game.homeTeam.name,
            abbreviation: game.homeTeam.abbreviation,
          }
        : null,
      awayTeam: game.awayTeam
        ? {
            id: game.awayTeam.id,
            name: game.awayTeam.name,
            abbreviation: game.awayTeam.abbreviation,
          }
        : null,
      finalScore: {
        home: game.homeScore,
        away: game.awayScore,
      },
      completedAt: game.completedAt,
    });
  } catch (error) {
    console.error('Verification API error:', error);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
