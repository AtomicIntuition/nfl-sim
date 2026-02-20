import { db } from "@/lib/db";
import { userScores, predictions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/** Get the top N users on the leaderboard */
export async function getLeaderboard(limit: number = 100) {
  return db
    .select()
    .from(userScores)
    .orderBy(desc(userScores.totalPoints))
    .limit(limit);
}

/** Get a specific user's score */
export async function getUserScore(userId: string) {
  const result = await db
    .select()
    .from(userScores)
    .where(eq(userScores.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

/** Update user scores after predictions are scored */
export async function updateUserScore(
  userId: string,
  pointsEarned: number,
  won: boolean
) {
  const existing = await getUserScore(userId);

  if (!existing) {
    // Create new user score entry (displayName may already exist from /api/user)
    await db.insert(userScores).values({
      userId,
      totalPoints: pointsEarned,
      correctPredictions: won ? 1 : 0,
      totalPredictions: 1,
      currentStreak: won ? 1 : 0,
      bestStreak: won ? 1 : 0,
      rank: 0, // Will be recalculated
    });
  } else {
    const newStreak = won ? existing.currentStreak! + 1 : 0;
    const bestStreak = Math.max(existing.bestStreak!, newStreak);

    await db
      .update(userScores)
      .set({
        totalPoints: existing.totalPoints! + pointsEarned,
        correctPredictions: existing.correctPredictions! + (won ? 1 : 0),
        totalPredictions: existing.totalPredictions! + 1,
        currentStreak: newStreak,
        bestStreak: bestStreak,
      })
      .where(eq(userScores.userId, userId));
  }

  // Recalculate ranks for all users
  await recalculateRanks();
}

/** Recalculate leaderboard ranks */
async function recalculateRanks() {
  const allScores = await db
    .select()
    .from(userScores)
    .orderBy(desc(userScores.totalPoints));

  for (let i = 0; i < allScores.length; i++) {
    await db
      .update(userScores)
      .set({ rank: i + 1 })
      .where(eq(userScores.id, allScores[i].id));
  }
}

/** Get total number of users with predictions */
export async function getTotalPredictors(): Promise<number> {
  const result = await db.select().from(userScores);
  return result.length;
}
