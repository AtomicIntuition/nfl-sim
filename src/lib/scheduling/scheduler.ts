// ============================================================
// GridIron Live - Scheduler (Cron-Driven State Machine)
// ============================================================
// The always-on scheduler that drives the simulation forward.
// Designed to be called by a cron job every ~2 minutes.
//
// This module is pure logic with no side effects -- it examines
// the current season state and returns the action that should be
// taken next. The caller is responsible for executing the action
// (creating a season, starting a game simulation, etc.).
//
// State machine logic:
//   1. No season exists              -> create_season
//   2. Offseason, enough time passed -> create_season (new)
//   3. Week has unstarted games      -> start_game
//   4. Game is broadcasting          -> no_action (let it finish)
//   5. Featured game done, others ok -> no_action (background sims)
//   6. All games in week complete    -> complete_week / advance_week
//   7. Regular season done (wk 18)   -> start_playoffs
//   8. Playoff round complete        -> advance_playoffs
//   9. Super Bowl complete           -> end_season
// ============================================================

import type { Season, SimulatedGame } from '../simulation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchedulerAction {
  type:
    | 'no_action'
    | 'create_season'
    | 'start_game'
    | 'complete_week'
    | 'advance_week'
    | 'start_playoffs'
    | 'advance_playoffs'
    | 'super_bowl'
    | 'end_season';
  seasonId?: string;
  gameId?: string;
  message: string;
}

export interface BroadcastState {
  status: 'live' | 'intermission' | 'upcoming' | 'offseason';
  currentGameId: string | null;
  nextGameId: string | null;
  /** Seconds until the next game begins (0 if live). */
  countdown: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import {
  OFFSEASON_MS,
  INTERMISSION_SECONDS as SHARED_INTERMISSION_SECONDS,
} from './constants';

/** @deprecated Use OFFSEASON_MS from scheduling/constants instead */
const OFFSEASON_DURATION_MS = OFFSEASON_MS;

/** @deprecated Use INTERMISSION_SECONDS from scheduling/constants instead */
const INTERMISSION_SECONDS = SHARED_INTERMISSION_SECONDS;

/** Countdown displayed before the very first game of a week (in seconds). */
const UPCOMING_COUNTDOWN_SECONDS = 120;

const REGULAR_SEASON_WEEKS = 18;

// ---------------------------------------------------------------------------
// Scheduler: determine next action
// ---------------------------------------------------------------------------

/**
 * Examine the current season state and determine what the scheduler
 * should do next.
 *
 * This is a pure function: it only reads the season state and returns
 * an action descriptor. The caller must execute the action.
 *
 * @deprecated Not called anywhere. The actual state machine logic lives
 * inline in `src/app/api/simulate/route.ts` determineNextAction().
 * Kept for reference/testing. Constants have been updated to match
 * the values in `scheduling/constants.ts`.
 *
 * @param season - The current season, or null if no season exists
 * @returns A SchedulerAction describing the next step
 */
export function determineNextAction(season: Season | null): SchedulerAction {
  // -----------------------------------------------------------------------
  // Case 1: No season exists at all
  // -----------------------------------------------------------------------
  if (season === null) {
    return {
      type: 'create_season',
      message: 'No active season found. Creating a new season.',
    };
  }

  // -----------------------------------------------------------------------
  // Case 2: Season is in offseason -- create new season after cooldown
  // -----------------------------------------------------------------------
  if (season.status === 'offseason') {
    if (season.completedAt) {
      const elapsed = Date.now() - new Date(season.completedAt).getTime();
      if (elapsed >= OFFSEASON_DURATION_MS) {
        return {
          type: 'create_season',
          seasonId: season.id,
          message: `Offseason complete for Season ${season.seasonNumber}. Creating Season ${season.seasonNumber + 1}.`,
        };
      }
      return {
        type: 'no_action',
        seasonId: season.id,
        message: `Offseason in progress. ${Math.ceil((OFFSEASON_DURATION_MS - elapsed) / 1000)}s remaining.`,
      };
    }
    // Offseason without completedAt -- should not happen, but handle gracefully
    return {
      type: 'create_season',
      seasonId: season.id,
      message: `Offseason state without completion timestamp. Creating new season.`,
    };
  }

  // -----------------------------------------------------------------------
  // Get current week data
  // -----------------------------------------------------------------------
  const currentWeekIdx = season.currentWeek - 1;
  const currentWeek =
    currentWeekIdx >= 0 && currentWeekIdx < season.schedule.length
      ? season.schedule[currentWeekIdx]
      : null;

  if (!currentWeek || currentWeek.games.length === 0) {
    // Edge case: current week has no games (should not happen in a valid schedule)
    // This could happen during playoff transition when games haven't been added yet
    if (season.status === 'wild_card' || season.status === 'divisional' ||
        season.status === 'conference_championship' || season.status === 'super_bowl') {
      return {
        type: 'no_action',
        seasonId: season.id,
        message: `Waiting for ${season.status} games to be scheduled.`,
      };
    }
    return {
      type: 'advance_week',
      seasonId: season.id,
      message: `Week ${season.currentWeek} has no games. Advancing.`,
    };
  }

  // -----------------------------------------------------------------------
  // Categorise games in the current week
  // -----------------------------------------------------------------------
  const games = currentWeek.games;
  const broadcastingGames = games.filter((g) => g.status === 'broadcasting');
  const simulatingGames = games.filter((g) => g.status === 'simulating');
  const scheduledGames = games.filter((g) => g.status === 'scheduled');
  const completedGames = games.filter((g) => g.status === 'completed');

  const allComplete = completedGames.length === games.length;
  const hasActiveGames = broadcastingGames.length > 0 || simulatingGames.length > 0;

  // -----------------------------------------------------------------------
  // Case 4: A game is currently broadcasting -- let it finish
  // -----------------------------------------------------------------------
  if (broadcastingGames.length > 0) {
    return {
      type: 'no_action',
      seasonId: season.id,
      gameId: broadcastingGames[0].id,
      message: `Game ${broadcastingGames[0].id} is currently broadcasting. Waiting for completion.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 5: Games are simulating in background -- let them finish
  // -----------------------------------------------------------------------
  if (simulatingGames.length > 0 && scheduledGames.length === 0) {
    return {
      type: 'no_action',
      seasonId: season.id,
      message: `${simulatingGames.length} game(s) simulating in background. Waiting for completion.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 3: Week has scheduled (unstarted) games -- start the next one
  // -----------------------------------------------------------------------
  if (scheduledGames.length > 0) {
    // Determine which game to start next
    let nextGameId: string;

    // If the featured game hasn't been played yet, prioritise it
    if (
      currentWeek.featuredGameId &&
      scheduledGames.some((g) => g.id === currentWeek.featuredGameId)
    ) {
      nextGameId = currentWeek.featuredGameId;
    } else {
      // Start the next scheduled game
      nextGameId = scheduledGames[0].id;
    }

    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: nextGameId,
      message: `Starting game ${nextGameId} in Week ${season.currentWeek}.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 6/7/8/9: All games in the current week are complete
  // -----------------------------------------------------------------------
  if (allComplete) {
    return handleWeekComplete(season);
  }

  // -----------------------------------------------------------------------
  // Fallback: should not reach here, but return no_action for safety
  // -----------------------------------------------------------------------
  return {
    type: 'no_action',
    seasonId: season.id,
    message: `Scheduler in unexpected state. Week ${season.currentWeek}, ${completedGames.length}/${games.length} complete.`,
  };
}

/**
 * Handle the case where all games in the current week are complete.
 */
function handleWeekComplete(season: Season): SchedulerAction {
  const isRegularSeason = season.status === 'regular_season';
  const isLastRegularWeek = season.currentWeek >= REGULAR_SEASON_WEEKS;

  // -----------------------------------------------------------------------
  // Case 7: Regular season done (week 18 complete) -> start playoffs
  // -----------------------------------------------------------------------
  if (isRegularSeason && isLastRegularWeek) {
    return {
      type: 'start_playoffs',
      seasonId: season.id,
      message: `Regular season complete. Transitioning to playoffs.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 6: Regular season week complete -> advance to next week
  // -----------------------------------------------------------------------
  if (isRegularSeason) {
    return {
      type: 'advance_week',
      seasonId: season.id,
      message: `Week ${season.currentWeek} complete. Advancing to Week ${season.currentWeek + 1}.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 9: Super Bowl complete -> end season
  // -----------------------------------------------------------------------
  if (season.status === 'super_bowl') {
    return {
      type: 'end_season',
      seasonId: season.id,
      message: `Super Bowl complete! Ending Season ${season.seasonNumber}.`,
    };
  }

  // -----------------------------------------------------------------------
  // Case 8: Playoff round complete -> advance to next round
  // -----------------------------------------------------------------------
  if (
    season.status === 'wild_card' ||
    season.status === 'divisional' ||
    season.status === 'conference_championship'
  ) {
    return {
      type: 'advance_playoffs',
      seasonId: season.id,
      message: `${formatRoundName(season.status)} complete. Advancing to next playoff round.`,
    };
  }

  // Fallback
  return {
    type: 'no_action',
    seasonId: season.id,
    message: `All games complete but no state transition matched.`,
  };
}

/**
 * Convert a SeasonStatus to a human-readable playoff round name.
 */
function formatRoundName(status: string): string {
  switch (status) {
    case 'wild_card':
      return 'Wild Card Round';
    case 'divisional':
      return 'Divisional Round';
    case 'conference_championship':
      return 'Conference Championships';
    case 'super_bowl':
      return 'Super Bowl';
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Broadcast state: what should the homepage show?
// ---------------------------------------------------------------------------

/**
 * Compute the current broadcast state for the homepage display.
 *
 * This tells the front-end whether a game is live, in intermission,
 * upcoming, or if the platform is in an offseason state.
 *
 * @deprecated Not called anywhere. The homepage builds its own broadcast
 * state inline in `src/app/page.tsx` getHomePageData(). Kept for
 * reference/testing.
 *
 * @param season - The current season, or null if none exists
 * @returns A BroadcastState object for the UI
 */
export function getBroadcastState(season: Season | null): BroadcastState {
  // -----------------------------------------------------------------------
  // No season or offseason
  // -----------------------------------------------------------------------
  if (season === null) {
    return {
      status: 'offseason',
      currentGameId: null,
      nextGameId: null,
      countdown: 0,
      message: 'No active season. A new season will begin shortly.',
    };
  }

  if (season.status === 'offseason') {
    let countdown = 0;
    if (season.completedAt) {
      const elapsed = Date.now() - new Date(season.completedAt).getTime();
      countdown = Math.max(0, Math.ceil((OFFSEASON_DURATION_MS - elapsed) / 1000));
    }
    return {
      status: 'offseason',
      currentGameId: null,
      nextGameId: null,
      countdown,
      message: season.champion
        ? `Season ${season.seasonNumber} is over. The ${season.champion.name} are champions! Next season begins soon.`
        : `Season ${season.seasonNumber} offseason. Next season begins soon.`,
    };
  }

  // -----------------------------------------------------------------------
  // Active season: examine the current week
  // -----------------------------------------------------------------------
  const currentWeekIdx = season.currentWeek - 1;
  const currentWeek =
    currentWeekIdx >= 0 && currentWeekIdx < season.schedule.length
      ? season.schedule[currentWeekIdx]
      : null;

  if (!currentWeek || currentWeek.games.length === 0) {
    return {
      status: 'upcoming',
      currentGameId: null,
      nextGameId: null,
      countdown: UPCOMING_COUNTDOWN_SECONDS,
      message: `Week ${season.currentWeek} is being prepared.`,
    };
  }

  const games = currentWeek.games;
  const broadcastingGame = games.find((g) => g.status === 'broadcasting');
  const scheduledGames = games.filter((g) => g.status === 'scheduled');
  const allComplete = games.every((g) => g.status === 'completed');

  // -----------------------------------------------------------------------
  // A game is currently live
  // -----------------------------------------------------------------------
  if (broadcastingGame) {
    // Find the next game that will be broadcast after this one
    const nextGame = scheduledGames.length > 0 ? scheduledGames[0] : null;

    return {
      status: 'live',
      currentGameId: broadcastingGame.id,
      nextGameId: nextGame?.id ?? null,
      countdown: 0,
      message: buildLiveMessage(broadcastingGame, season),
    };
  }

  // -----------------------------------------------------------------------
  // Intermission: between games (some completed, some scheduled, none live)
  // -----------------------------------------------------------------------
  if (scheduledGames.length > 0 && !allComplete) {
    const nextGameId =
      currentWeek.featuredGameId &&
      scheduledGames.some((g) => g.id === currentWeek.featuredGameId)
        ? currentWeek.featuredGameId
        : scheduledGames[0].id;

    return {
      status: 'intermission',
      currentGameId: null,
      nextGameId,
      countdown: INTERMISSION_SECONDS,
      message: `Intermission. Next game starting soon.`,
    };
  }

  // -----------------------------------------------------------------------
  // All games complete -- waiting for advancement
  // -----------------------------------------------------------------------
  if (allComplete) {
    return {
      status: 'intermission',
      currentGameId: null,
      nextGameId: null,
      countdown: 0,
      message: `Week ${season.currentWeek} is complete. Preparing next week.`,
    };
  }

  // -----------------------------------------------------------------------
  // Upcoming: no games have started yet
  // -----------------------------------------------------------------------
  const featuredId = currentWeek.featuredGameId ?? scheduledGames[0]?.id ?? null;
  return {
    status: 'upcoming',
    currentGameId: null,
    nextGameId: featuredId,
    countdown: UPCOMING_COUNTDOWN_SECONDS,
    message: buildUpcomingMessage(season),
  };
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function buildLiveMessage(
  game: { homeTeamId: string; awayTeamId: string; homeTeam?: { abbreviation: string }; awayTeam?: { abbreviation: string } },
  season: Season
): string {
  const homeAbbr = game.homeTeam?.abbreviation ?? game.homeTeamId.substring(0, 3).toUpperCase();
  const awayAbbr = game.awayTeam?.abbreviation ?? game.awayTeamId.substring(0, 3).toUpperCase();
  const roundLabel = getRoundLabel(season.status, season.currentWeek);
  return `LIVE: ${awayAbbr} @ ${homeAbbr} | ${roundLabel}`;
}

function buildUpcomingMessage(season: Season): string {
  const roundLabel = getRoundLabel(season.status, season.currentWeek);
  return `${roundLabel} starting soon.`;
}

function getRoundLabel(status: string, week: number): string {
  switch (status) {
    case 'regular_season':
      return `Week ${week}`;
    case 'wild_card':
      return 'Wild Card Round';
    case 'divisional':
      return 'Divisional Round';
    case 'conference_championship':
      return 'Conference Championships';
    case 'super_bowl':
      return 'Super Bowl';
    case 'offseason':
      return 'Offseason';
    default:
      return `Week ${week}`;
  }
}
