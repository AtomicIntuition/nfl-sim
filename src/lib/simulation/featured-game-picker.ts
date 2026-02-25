// ============================================================
// GridBlitz - Featured Game Picker (DB-aware)
// ============================================================
// Scores each scheduled game and returns the ID of the most
// appealing one for live broadcast. Uses standings from the DB.
// ============================================================

import { db } from '@/lib/db';
import { teams, standings, games as gamesTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Score each scheduled game and return the ID of the most appealing one.
 *
 * Factors (mirrors src/lib/scheduling/featured-game-picker.ts):
 *   +30  Both teams in playoff contention
 *   +20  Division rivalry
 *   +15  Close records (within 2 wins)
 *   +15  Both teams have winning records
 *   +10  High combined ratings
 *   +10  Undefeated team involved
 *   +10  Winless team in danger
 *   +10  Late season (week 15+)
 *    +5  Super Bowl rematch proxy
 */
export async function pickBestFeaturedGame(
  scheduledGames: (typeof gamesTable.$inferSelect)[],
  seasonId: string,
  currentWeek: number,
): Promise<string> {
  if (scheduledGames.length <= 1) return scheduledGames[0].id;

  const allTeamRows = await db.select().from(teams);
  const teamMap = new Map(allTeamRows.map((t) => [t.id, t]));

  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));
  const standingMap = new Map(standingRows.map((s) => [s.teamId, s]));

  let bestId = scheduledGames[0].id;
  let bestScore = -1;

  for (const g of scheduledGames) {
    const home = teamMap.get(g.homeTeamId);
    const away = teamMap.get(g.awayTeamId);
    const hs = standingMap.get(g.homeTeamId);
    const as_ = standingMap.get(g.awayTeamId);

    let score = 0;

    // +30: Both in playoff contention (not eliminated)
    if (hs?.clinched !== 'eliminated' && as_?.clinched !== 'eliminated') {
      score += 30;
    }

    // +20: Division rivalry
    if (
      home && away &&
      home.conference === away.conference &&
      home.division === away.division
    ) {
      score += 20;
    }

    // +15: Close records (within 2 wins)
    if (hs && as_) {
      if (Math.abs((hs.wins ?? 0) - (as_.wins ?? 0)) <= 2) score += 15;
    }

    // +15: Both winning records
    if (
      hs && as_ &&
      (hs.wins ?? 0) > (hs.losses ?? 0) &&
      (as_.wins ?? 0) > (as_.losses ?? 0)
    ) {
      score += 15;
    }

    // +10: High combined ratings (>340)
    if (home && away) {
      const combined =
        home.offenseRating + home.defenseRating +
        away.offenseRating + away.defenseRating;
      if (combined > 340) score += 10;
    }

    // +10: Undefeated team involved
    if (
      (hs && (hs.losses ?? 0) === 0 && (hs.wins ?? 0) > 0) ||
      (as_ && (as_.losses ?? 0) === 0 && (as_.wins ?? 0) > 0)
    ) {
      score += 10;
    }

    // +10: Winless team in danger
    if (
      (hs && (hs.wins ?? 0) === 0 && (hs.losses ?? 0) > 0) ||
      (as_ && (as_.wins ?? 0) === 0 && (as_.losses ?? 0) > 0)
    ) {
      score += 10;
    }

    // +10: Late season (week 15+)
    if (currentWeek >= 15) score += 10;

    // +5: Super Bowl rematch proxy (both top-2 seeds, different conferences)
    if (
      hs?.playoffSeed != null && as_?.playoffSeed != null &&
      hs.playoffSeed <= 2 && as_.playoffSeed <= 2
    ) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = g.id;
    }
  }

  return bestId;
}
