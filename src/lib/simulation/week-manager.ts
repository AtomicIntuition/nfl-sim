// ============================================================
// GridBlitz - Week Manager
// ============================================================
// Handles advancing between weeks, including regular season
// week advances and playoff round transitions.
// ============================================================

import { db } from '@/lib/db';
import { games, seasons } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { projectFutureGameTimes } from '@/lib/scheduling/game-time-projector';
import { pickBestFeaturedGame } from './featured-game-picker';
import {
  generateWildCardGames,
  generateDivisionalGames,
  generateConferenceChampionshipGames,
  generateSuperBowlGame,
} from './playoff-generator';

// ============================================================
// Advance Week
// ============================================================

export async function handleAdvanceWeek(seasonId: string) {
  const seasonRows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (seasonRows.length === 0) {
    return { error: 'Season not found' };
  }

  const season = seasonRows[0];

  // Defensive check: refuse to advance if any game is still active
  const currentWeekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, seasonId), eq(games.week, season.currentWeek))
    );

  const activeOrScheduled = currentWeekGames.filter(
    (g) => g.status === 'scheduled' || g.status === 'broadcasting' || g.status === 'simulating'
  );
  if (activeOrScheduled.length > 0) {
    console.warn(
      `handleAdvanceWeek: ${activeOrScheduled.length} games still active/scheduled in week ${season.currentWeek}`,
      activeOrScheduled.map((g) => ({ id: g.id, status: g.status }))
    );
    return {
      error: `Cannot advance week — ${activeOrScheduled.length} game(s) still ${activeOrScheduled[0].status} in week ${season.currentWeek}`,
    };
  }

  // ==================================================================
  // Regular season -> Playoffs transition (week 18 complete)
  // ==================================================================
  if (season.status === 'regular_season' && season.currentWeek >= 18) {
    await db
      .update(seasons)
      .set({ status: 'wild_card', currentWeek: 19 })
      .where(eq(seasons.id, seasonId));

    // Generate Wild Card games based on standings
    const gamesCreated = await generateWildCardGames(seasonId);
    await projectFutureGameTimes(seasonId);

    return {
      previousWeek: season.currentWeek,
      newWeek: 19,
      newStatus: 'wild_card',
      gamesCreated,
      message: 'Regular season complete. Wild Card games generated from standings!',
    };
  }

  // ==================================================================
  // Wild Card -> Divisional transition
  // ==================================================================
  if (season.status === 'wild_card') {
    await db
      .update(seasons)
      .set({ status: 'divisional', currentWeek: 20 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateDivisionalGames(seasonId);
    await projectFutureGameTimes(seasonId);

    return {
      previousWeek: 19,
      newWeek: 20,
      newStatus: 'divisional',
      gamesCreated,
      message: 'Wild Card complete. Divisional matchups set!',
    };
  }

  // ==================================================================
  // Divisional -> Conference Championship transition
  // ==================================================================
  if (season.status === 'divisional') {
    await db
      .update(seasons)
      .set({ status: 'conference_championship', currentWeek: 21 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateConferenceChampionshipGames(seasonId);
    await projectFutureGameTimes(seasonId);

    return {
      previousWeek: 20,
      newWeek: 21,
      newStatus: 'conference_championship',
      gamesCreated,
      message: 'Divisional round complete. Conference Championships set!',
    };
  }

  // ==================================================================
  // Conference Championship -> Super Bowl transition
  // ==================================================================
  if (season.status === 'conference_championship') {
    await db
      .update(seasons)
      .set({ status: 'super_bowl', currentWeek: 22 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateSuperBowlGame(seasonId);
    await projectFutureGameTimes(seasonId);

    return {
      previousWeek: 21,
      newWeek: 22,
      newStatus: 'super_bowl',
      gamesCreated,
      message: 'Conference Championships complete. Super Bowl is set!',
    };
  }

  // ==================================================================
  // Regular season week advance (games already exist from schedule generator)
  // ==================================================================
  const nextWeek = season.currentWeek + 1;
  await db
    .update(seasons)
    .set({ currentWeek: nextWeek })
    .where(eq(seasons.id, seasonId));

  // Pick a featured game for the next week if not already set
  const nextWeekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, seasonId), eq(games.week, nextWeek))
    );

  const hasFeatured = nextWeekGames.some((g) => g.isFeatured);
  if (!hasFeatured && nextWeekGames.length > 0) {
    const scheduled = nextWeekGames.filter((g) => g.status === 'scheduled');
    if (scheduled.length > 0) {
      const featuredId = await pickBestFeaturedGame(
        scheduled, seasonId, nextWeek
      );
      await db
        .update(games)
        .set({ isFeatured: true })
        .where(eq(games.id, featuredId));
    }
  }

  // Re-project future game times
  await projectFutureGameTimes(seasonId);

  return {
    previousWeek: season.currentWeek,
    newWeek: nextWeek,
    message: `Advanced to week ${nextWeek}`,
  };
}
