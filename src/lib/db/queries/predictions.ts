import { db } from "@/lib/db";
import { predictions, games } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/** Get a user's prediction for a game */
export async function getUserPrediction(userId: string, gameId: string) {
  const result = await db
    .select()
    .from(predictions)
    .where(
      and(eq(predictions.userId, userId), eq(predictions.gameId, gameId))
    )
    .limit(1);
  return result[0] ?? null;
}

/** Get all predictions for a user */
export async function getUserPredictions(userId: string) {
  return db
    .select()
    .from(predictions)
    .where(eq(predictions.userId, userId));
}

/** Create a new prediction */
export async function createPrediction(data: {
  userId: string;
  gameId: string;
  predictedWinner: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
}) {
  // Check if prediction already exists
  const existing = await getUserPrediction(data.userId, data.gameId);
  if (existing) {
    throw new Error("Prediction already exists for this game");
  }

  // Check if game is still scheduled (not started)
  const game = await db
    .select()
    .from(games)
    .where(eq(games.id, data.gameId))
    .limit(1);

  if (game.length === 0) {
    throw new Error("Game not found");
  }

  if (game[0].status !== "scheduled") {
    throw new Error("Game has already started — predictions are locked");
  }

  await db.insert(predictions).values({
    ...data,
    result: "pending",
    pointsEarned: 0,
  });
}

/** Score predictions after a game completes */
export async function scorePredictions(
  gameId: string,
  winnerId: string,
  homeScore: number,
  awayScore: number
) {
  const gamePredictions = await db
    .select()
    .from(predictions)
    .where(eq(predictions.gameId, gameId));

  for (const pred of gamePredictions) {
    let points = 0;
    const isCorrectWinner = pred.predictedWinner === winnerId;

    if (isCorrectWinner) {
      points += 10; // Correct winner

      // Check margin
      const actualMargin = Math.abs(homeScore - awayScore);
      const predictedMargin = Math.abs(
        pred.predictedHomeScore - pred.predictedAwayScore
      );
      if (Math.abs(actualMargin - predictedMargin) <= 3) {
        points += 5; // Correct margin (within 3)
      }

      // Check exact score
      if (
        pred.predictedHomeScore === homeScore &&
        pred.predictedAwayScore === awayScore
      ) {
        points += 25; // Exact score bonus
      }
    }

    await db
      .update(predictions)
      .set({
        result: isCorrectWinner ? "won" : "lost",
        pointsEarned: points,
      })
      .where(eq(predictions.id, pred.id));
  }
}

/** Get all predictions for a game */
export async function getGamePredictions(gameId: string) {
  return db
    .select()
    .from(predictions)
    .where(eq(predictions.gameId, gameId));
}
