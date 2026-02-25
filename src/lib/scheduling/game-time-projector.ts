// ============================================================
// GridBlitz - Game Time Projector
// ============================================================
// Projects scheduledAt for all future games in a season,
// using actual event stream durations for precise anchoring.
// ============================================================

import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { ESTIMATED_GAME_SLOT_MS } from '@/lib/simulation/constants';
import { INTERMISSION_MS, WEEK_BREAK_MS } from '@/lib/scheduling/constants';

/**
 * Projects scheduledAt for ALL future games in the season.
 *
 * Key improvements over the naive approach:
 * 1. Uses gameDurationMs (actual event stream length) + 60s buffer for
 *    the broadcasting game anchor — giving the NEXT game an exact start time.
 * 2. Averages gameDurationMs from completed games (not broadcast wall-clock
 *    duration, which includes idle/wait time that inflates estimates).
 * 3. Adds INTERMISSION_MS between games and WEEK_BREAK_MS between weeks.
 */
export async function projectFutureGameTimes(seasonId: string) {
  const BROADCAST_BUFFER_MS = 60_000; // 60s post-broadcast buffer

  // Get all games ordered by week then by existing scheduledAt
  const allGames = await db
    .select()
    .from(games)
    .where(eq(games.seasonId, seasonId))
    .orderBy(asc(games.week), asc(games.scheduledAt));

  // Only project for scheduled games
  const scheduled = allGames.filter((g) => g.status === 'scheduled');
  if (scheduled.length === 0) return;

  // Compute average game duration from completed games using gameDurationMs.
  // This is the actual event stream length, not wall-clock broadcast time.
  let gameSlotMs = ESTIMATED_GAME_SLOT_MS;

  const completedDurations: number[] = [];
  for (const g of allGames) {
    if (g.status === 'completed' && g.gameDurationMs && g.gameDurationMs > 0) {
      completedDurations.push(g.gameDurationMs + BROADCAST_BUFFER_MS + INTERMISSION_MS);
    }
  }

  if (completedDurations.length >= 3) {
    gameSlotMs = completedDurations.reduce((sum, d) => sum + d, 0) / completedDurations.length;
  }

  // Find the anchor point — the time at which the next game will start.
  let anchor = Date.now();

  const broadcasting = allGames.find((g) => g.status === 'broadcasting');
  if (broadcasting?.broadcastStartedAt) {
    // When a game is broadcasting, we know its exact duration.
    // Next game starts at: broadcastStart + gameDuration + buffer + intermission
    const duration = broadcasting.gameDurationMs ?? 0;
    anchor =
      new Date(broadcasting.broadcastStartedAt).getTime() +
      duration +
      BROADCAST_BUFFER_MS +
      INTERMISSION_MS;
  } else {
    // No broadcasting game — anchor from last completed game
    const completed = allGames
      .filter((g) => g.status === 'completed' && g.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());
    if (completed.length > 0) {
      anchor = completed[0].completedAt!.getTime() + INTERMISSION_MS;
    }
  }

  // Ensure anchor is not in the past (can happen if intermission already elapsed)
  if (anchor < Date.now()) {
    anchor = Date.now();
  }

  // Group scheduled games by week
  const byWeek = new Map<number, typeof scheduled>();
  for (const g of scheduled) {
    const weekGames = byWeek.get(g.week) ?? [];
    weekGames.push(g);
    byWeek.set(g.week, weekGames);
  }

  // Determine which week the anchor belongs to (current week with scheduled games,
  // or the first week that still has scheduled games)
  const anchorWeek = broadcasting?.week
    ?? allGames
        .filter((g) => g.status === 'completed')
        .sort((a, b) => b.week - a.week)[0]?.week
    ?? scheduled[0]?.week
    ?? 1;

  const weeks = [...byWeek.keys()].sort((a, b) => a - b);

  let cursor = anchor;
  let isFirstWeek = true;

  for (const week of weeks) {
    // Add week break when transitioning to a new week
    // (only if this week is different from the anchor's week)
    if (!isFirstWeek && week > anchorWeek) {
      cursor += WEEK_BREAK_MS;
    }
    isFirstWeek = false;

    const weekGames = byWeek.get(week)!;
    for (let i = 0; i < weekGames.length; i++) {
      const scheduledAt = new Date(cursor + i * gameSlotMs);
      await db
        .update(games)
        .set({ scheduledAt })
        .where(eq(games.id, weekGames[i].id));
    }

    // Move cursor past the last game in this week
    cursor += weekGames.length * gameSlotMs;
  }
}
