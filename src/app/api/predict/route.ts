import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { predictions, games, teams } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/predict
 *
 * Submit a game prediction. Requires a userId (from session/cookie).
 *
 * Body:
 *   - gameId: string
 *   - predictedWinner: string (team ID)
 *   - predictedHomeScore: number
 *   - predictedAwayScore: number
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID from headers or cookies
    // In production this would come from an auth provider (Clerk, NextAuth, etc.)
    const userId =
      request.headers.get('x-user-id') ??
      request.cookies.get('userId')?.value;

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in to make predictions.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { gameId, predictedWinner, predictedHomeScore, predictedAwayScore } =
      body;

    // ---- Validate input ----
    if (!gameId || typeof gameId !== 'string') {
      return NextResponse.json(
        { error: 'gameId is required' },
        { status: 400 }
      );
    }

    if (!predictedWinner || typeof predictedWinner !== 'string') {
      return NextResponse.json(
        { error: 'predictedWinner (team ID) is required' },
        { status: 400 }
      );
    }

    if (
      typeof predictedHomeScore !== 'number' ||
      predictedHomeScore < 0 ||
      !Number.isInteger(predictedHomeScore)
    ) {
      return NextResponse.json(
        { error: 'predictedHomeScore must be a non-negative integer' },
        { status: 400 }
      );
    }

    if (
      typeof predictedAwayScore !== 'number' ||
      predictedAwayScore < 0 ||
      !Number.isInteger(predictedAwayScore)
    ) {
      return NextResponse.json(
        { error: 'predictedAwayScore must be a non-negative integer' },
        { status: 400 }
      );
    }

    // ---- Validate game exists and hasn't started ----
    const gameRows = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameRows.length === 0) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    const game = gameRows[0];

    if (game.status !== 'scheduled') {
      return NextResponse.json(
        {
          error:
            'Predictions can only be made before the game starts. This game is already ' +
            game.status +
            '.',
        },
        { status: 400 }
      );
    }

    // ---- Validate predictedWinner is one of the teams ----
    if (
      predictedWinner !== game.homeTeamId &&
      predictedWinner !== game.awayTeamId
    ) {
      return NextResponse.json(
        { error: 'predictedWinner must be either the home or away team' },
        { status: 400 }
      );
    }

    // ---- Validate the predicted winner team exists ----
    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.id, predictedWinner))
      .limit(1);

    if (teamRows.length === 0) {
      return NextResponse.json(
        { error: 'Predicted winner team not found' },
        { status: 400 }
      );
    }

    // ---- Check for existing prediction ----
    const existingPrediction = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, userId),
          eq(predictions.gameId, gameId)
        )
      )
      .limit(1);

    if (existingPrediction.length > 0) {
      return NextResponse.json(
        {
          error:
            'You have already made a prediction for this game. Only one prediction per game is allowed.',
          existingPrediction: {
            id: existingPrediction[0].id,
            predictedWinner: existingPrediction[0].predictedWinner,
            predictedHomeScore: existingPrediction[0].predictedHomeScore,
            predictedAwayScore: existingPrediction[0].predictedAwayScore,
            createdAt: existingPrediction[0].createdAt,
          },
        },
        { status: 409 }
      );
    }

    // ---- Score reasonableness check ----
    if (predictedHomeScore > 70 || predictedAwayScore > 70) {
      return NextResponse.json(
        { error: 'Predicted scores seem unreasonably high (max: 70)' },
        { status: 400 }
      );
    }

    // The predicted winner should match the higher score
    const winnerIsHome = predictedWinner === game.homeTeamId;
    if (
      (winnerIsHome && predictedHomeScore < predictedAwayScore) ||
      (!winnerIsHome && predictedAwayScore < predictedHomeScore)
    ) {
      return NextResponse.json(
        {
          error:
            'Predicted winner must have the higher (or equal) predicted score',
        },
        { status: 400 }
      );
    }

    // ---- Store prediction ----
    const newPrediction = await db
      .insert(predictions)
      .values({
        userId,
        gameId,
        predictedWinner,
        predictedHomeScore,
        predictedAwayScore,
        pointsEarned: 0,
        result: 'pending',
      })
      .returning();

    return NextResponse.json(
      {
        prediction: {
          id: newPrediction[0].id,
          gameId,
          predictedWinner,
          predictedHomeScore,
          predictedAwayScore,
          result: 'pending',
          createdAt: newPrediction[0].createdAt,
        },
        message: 'Prediction submitted successfully!',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error submitting prediction:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
