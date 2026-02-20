// ============================================================================
// GridIron Live - NFL Game Clock Manager
// ============================================================================
// Manages NFL game clock with precise adherence to real NFL timing rules.
// Handles quarter transitions, two-minute warning, halftime, overtime,
// and all clock-stopping scenarios.
// ============================================================================

import type { GameState, PlayResult, SeededRNG } from './types';
import { QUARTER_LENGTH, TWO_MINUTE_WARNING, CLOCK_TIME, PLAY_CLOCK } from './constants';

// ============================================================================
// Constants
// ============================================================================

/** Overtime period length: 10 minutes = 600 seconds */
const OVERTIME_LENGTH = 600;

/** Quarters that trigger the two-minute warning (end of each half) */
const TWO_MINUTE_WARNING_QUARTERS: ReadonlySet<GameState['quarter']> = new Set([2, 4]);

/** Standard timeouts per team per half */
const TIMEOUTS_PER_HALF = 3;

// ============================================================================
// Types
// ============================================================================

export interface ClockUpdate {
  clock: number;
  quarter: GameState['quarter'];
  isClockRunning: boolean;
  twoMinuteWarning: boolean;
  isHalftime: boolean;
  isGameOver: boolean;
  isOvertimeOver: boolean;
}

// ============================================================================
// Primary Clock Functions
// ============================================================================

/**
 * Calculate how much time elapsed on the play and return updated clock state.
 *
 * This is the main entry point for clock management. It computes time elapsed,
 * applies it to the game clock, checks for two-minute warning, quarter
 * transitions, halftime, and game-over conditions.
 */
export function advanceClock(
  state: GameState,
  play: PlayResult,
  rng: SeededRNG
): ClockUpdate {
  const prevClock = state.clock;
  const timeElapsed = calculatePlayTime(play, state, rng);

  // Subtract elapsed time from clock, never go below 0
  let newClock = Math.max(0, prevClock - timeElapsed);

  // Check for two-minute warning before finalizing clock
  const twoMinWarning = checkTwoMinuteWarning(prevClock, newClock, state.quarter);
  if (twoMinWarning && !state.twoMinuteWarning) {
    // Two-minute warning freezes the clock at exactly 2:00 (or wherever
    // it crossed). The remaining time below 2:00 is preserved.
    newClock = Math.min(newClock, TWO_MINUTE_WARNING);
  }

  // Determine if clock is running after this play
  const clockStopped = shouldClockStop(play, state) || twoMinWarning;

  // Check if the quarter has ended (clock hit 0)
  if (newClock <= 0) {
    newClock = 0;

    // Quarter is over - advance to the next quarter
    const quarterResult = advanceQuarter(state);

    return {
      clock: quarterResult.clock,
      quarter: quarterResult.quarter,
      isClockRunning: false,
      twoMinuteWarning: false, // reset for new quarter/half
      isHalftime: quarterResult.isHalftime,
      isGameOver: quarterResult.isGameOver,
      isOvertimeOver: quarterResult.isGameOver && state.quarter === 'OT',
    };
  }

  // Check overtime sudden death conditions mid-quarter
  if (state.quarter === 'OT' && play.scoring !== null) {
    const gameOver = isGameOver({
      ...state,
      clock: newClock,
      homeScore: state.homeScore + (play.scoring.team === 'home' ? play.scoring.points : 0),
      awayScore: state.awayScore + (play.scoring.team === 'away' ? play.scoring.points : 0),
    });

    if (gameOver) {
      return {
        clock: newClock,
        quarter: 'OT',
        isClockRunning: false,
        twoMinuteWarning: false,
        isHalftime: false,
        isGameOver: true,
        isOvertimeOver: true,
      };
    }
  }

  return {
    clock: newClock,
    quarter: state.quarter,
    isClockRunning: !clockStopped,
    twoMinuteWarning: twoMinWarning,
    isHalftime: false,
    isGameOver: false,
    isOvertimeOver: false,
  };
}

/**
 * Calculate time elapsed for a specific play type.
 *
 * Uses CLOCK_TIME constants with randomized values within the defined ranges.
 * Applies two-minute drill reduction when the game situation demands hurry-up.
 */
export function calculatePlayTime(
  play: PlayResult,
  state: GameState,
  rng: SeededRNG
): number {
  // If the play already has a clockElapsed value set (e.g., from pre-computation),
  // respect it as an override
  if (play.clockElapsed > 0) {
    return play.clockElapsed;
  }

  // Determine if we are in a two-minute drill scenario:
  // Last 2 minutes of the 2nd or 4th quarter and trailing or tied
  const inTwoMinuteDrill = isInTwoMinuteDrill(state);

  // Select the appropriate clock range based on play type
  const clockRange = getClockRangeForPlay(play, inTwoMinuteDrill);

  // Generate randomized time within the range
  let elapsed = rng.randomInt(clockRange.min, clockRange.max);

  // Clock never runs more time than is actually remaining
  elapsed = Math.min(elapsed, state.clock);

  // Ensure non-negative
  return Math.max(0, elapsed);
}

/**
 * Check if the two-minute warning should trigger.
 *
 * The two-minute warning is an automatic timeout that occurs when the game
 * clock first crosses below 2:00 remaining in the 2nd or 4th quarter.
 * It triggers when the clock was above 2:00 before the play and is now
 * at or below 2:00 after the play.
 */
export function checkTwoMinuteWarning(
  prevClock: number,
  newClock: number,
  quarter: GameState['quarter']
): boolean {
  // Only applies in the 2nd and 4th quarters
  if (!TWO_MINUTE_WARNING_QUARTERS.has(quarter)) {
    return false;
  }

  // Triggers when clock crosses from above 2:00 to at-or-below 2:00
  return prevClock > TWO_MINUTE_WARNING && newClock <= TWO_MINUTE_WARNING;
}

/**
 * Check if the game clock should stop after this play.
 *
 * NFL rules define numerous clock-stopping scenarios. This function evaluates
 * all of them based on the play result and current game state.
 */
export function shouldClockStop(play: PlayResult, state: GameState): boolean {
  // Clock always stops on these play outcomes
  if (play.type === 'pass_incomplete') return true;
  if (play.type === 'spike') return true;
  if (play.type === 'punt') return true;
  if (play.type === 'field_goal') return true;
  if (play.type === 'kickoff') return true;
  if (play.type === 'touchback') return true;
  if (play.type === 'extra_point') return true;
  if (play.type === 'two_point') return true;

  // Clock stops on any scoring play
  if (play.isTouchdown || play.isSafety) return true;
  if (play.scoring !== null) return true;

  // Clock stops on turnovers (change of possession)
  if (play.turnover !== null) return true;

  // Clock stops on accepted penalties (simplified: any penalty stops clock)
  if (play.penalty !== null && !play.penalty.declined && !play.penalty.offsetting) {
    return true;
  }

  // Clock stops when the ball carrier goes out of bounds
  // We infer this from the isClockStopped flag on the play result itself
  if (play.isClockStopped) return true;

  // In the last 2 minutes of the 2nd and 4th quarters, clock stops on first downs
  // (to reset the chains)
  if (play.isFirstDown && isInLastTwoMinutes(state)) {
    return true;
  }

  // Default: clock keeps running (run plays, complete passes in bounds)
  return false;
}

/**
 * Advance to the next quarter.
 *
 * Handles all quarter transition logic including:
 * - Q1 -> Q2: Reset clock, teams switch direction (handled elsewhere)
 * - Q2 -> Q3: Halftime - reset clock, reset timeouts
 * - Q3 -> Q4: Reset clock
 * - Q4 -> OT or Game Over: Check score, enter overtime if tied
 * - OT -> Game Over: Overtime period ends
 */
export function advanceQuarter(state: GameState): {
  quarter: GameState['quarter'];
  clock: number;
  isHalftime: boolean;
  isGameOver: boolean;
} {
  const { quarter, homeScore, awayScore } = state;

  switch (quarter) {
    case 1:
      // Q1 -> Q2: Same half continues, just reset the clock
      return {
        quarter: 2,
        clock: QUARTER_LENGTH,
        isHalftime: false,
        isGameOver: false,
      };

    case 2:
      // Q2 -> Halftime -> Q3
      return {
        quarter: 3,
        clock: QUARTER_LENGTH,
        isHalftime: true,
        isGameOver: false,
      };

    case 3:
      // Q3 -> Q4: Same half continues
      return {
        quarter: 4,
        clock: QUARTER_LENGTH,
        isHalftime: false,
        isGameOver: false,
      };

    case 4:
      // Q4 -> End of regulation
      if (homeScore !== awayScore) {
        // Game is decided - not tied
        return {
          quarter: 4,
          clock: 0,
          isHalftime: false,
          isGameOver: true,
        };
      }
      // Tied at end of regulation: go to overtime
      return {
        quarter: 'OT',
        clock: OVERTIME_LENGTH,
        isHalftime: false,
        isGameOver: false,
      };

    case 'OT':
      // Overtime period has ended
      // In regular season, if still tied, game ends in a tie
      // In playoffs, additional OT periods would be needed (simplified: game over)
      return {
        quarter: 'OT',
        clock: 0,
        isHalftime: false,
        isGameOver: true,
      };

    default:
      // Should never reach here, but handle gracefully
      return {
        quarter: 4,
        clock: 0,
        isHalftime: false,
        isGameOver: true,
      };
  }
}

/**
 * Check if the game is over.
 *
 * A game ends when:
 * 1. End of 4th quarter with one team leading
 * 2. During overtime: when a team scores and both teams have had a possession
 *    (or first possession results in a TD)
 * 3. End of overtime period (regular season can end in tie)
 *
 * Note: This checks the current state. Scoring plays during OT that would
 * end the game are handled by the caller updating scores first.
 */
export function isGameOver(state: GameState): boolean {
  const { quarter, clock, homeScore, awayScore } = state;

  // Game cannot be over during quarters 1-3
  if (quarter === 1 || quarter === 2 || quarter === 3) {
    return false;
  }

  // End of 4th quarter
  if (quarter === 4 && clock <= 0) {
    // Game over if not tied; if tied, goes to OT
    return homeScore !== awayScore;
  }

  // During 4th quarter - game is still in progress
  if (quarter === 4 && clock > 0) {
    return false;
  }

  // Overtime
  if (quarter === 'OT') {
    // If clock has expired, game is over regardless of score
    // (regular season: tie is possible; playoffs would continue but we simplify)
    if (clock <= 0) {
      return true;
    }

    // During OT with clock remaining: game ends if one team has more points
    // (This covers walk-off scores. The simulation engine should update scores
    // before calling this function to detect walk-off scenarios.)
    if (homeScore !== awayScore) {
      return true;
    }

    return false;
  }

  return false;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine the appropriate clock range for the given play type.
 *
 * Maps play results to their corresponding CLOCK_TIME entries.
 * Falls back to two-minute drill timing when applicable.
 */
function getClockRangeForPlay(
  play: PlayResult,
  inTwoMinuteDrill: boolean
): { min: number; max: number } {
  // Pre-snap penalties consume no game clock
  if (play.penalty !== null && !play.penalty.declined && isPreSnapPenalty(play)) {
    return CLOCK_TIME.penalty_presnap;
  }

  // If in two-minute drill and clock should run, use hurry-up timing
  if (inTwoMinuteDrill) {
    // These play types have their own fixed timing even in hurry-up
    if (play.type === 'spike') return CLOCK_TIME.spike;
    if (play.type === 'kneel') return CLOCK_TIME.kneel;
    if (play.type === 'punt') return CLOCK_TIME.punt;
    if (play.type === 'field_goal') return CLOCK_TIME.field_goal;
    if (play.type === 'kickoff') return CLOCK_TIME.kickoff;
    if (play.type === 'pass_incomplete') {
      // Even hurry-up incomplete passes still stop the clock
      return { min: 3, max: 6 };
    }
    // Everything else uses the two-minute drill pace
    return CLOCK_TIME.two_minute_drill;
  }

  // Standard timing by play type
  switch (play.type) {
    case 'run':
    case 'scramble':
      return CLOCK_TIME.run_normal;

    case 'pass_complete':
      return CLOCK_TIME.pass_complete;

    case 'pass_incomplete':
      return CLOCK_TIME.pass_incomplete;

    case 'sack':
      return CLOCK_TIME.sack;

    case 'punt':
      return CLOCK_TIME.punt;

    case 'field_goal':
    case 'extra_point':
    case 'two_point':
      return CLOCK_TIME.field_goal;

    case 'kickoff':
    case 'touchback':
      return CLOCK_TIME.kickoff;

    case 'kneel':
      return CLOCK_TIME.kneel;

    case 'spike':
      return CLOCK_TIME.spike;

    default:
      // Fallback to a reasonable default
      return CLOCK_TIME.pass_complete;
  }
}

/**
 * Check if we are in the last two minutes of the 2nd or 4th quarter.
 * Used to determine if first downs stop the clock and other
 * late-half clock rules.
 */
function isInLastTwoMinutes(state: GameState): boolean {
  if (state.quarter !== 2 && state.quarter !== 4) {
    return false;
  }
  return state.clock <= TWO_MINUTE_WARNING;
}

/**
 * Check if the current game situation calls for a two-minute drill.
 *
 * A team runs a two-minute drill when:
 * - It is the last 2 minutes of the 2nd quarter (any team may hurry)
 * - It is the last 2 minutes of the 4th quarter and the possessing team
 *   is trailing or the game is tied
 * - It is overtime and the game is close
 */
function isInTwoMinuteDrill(state: GameState): boolean {
  // Last 2 minutes of the 2nd quarter - teams often hurry before half
  if (state.quarter === 2 && state.clock <= TWO_MINUTE_WARNING) {
    return true;
  }

  // Last 2 minutes of the 4th quarter
  if (state.quarter === 4 && state.clock <= TWO_MINUTE_WARNING) {
    const possessingScore =
      state.possession === 'home' ? state.homeScore : state.awayScore;
    const opposingScore =
      state.possession === 'home' ? state.awayScore : state.homeScore;

    // Trailing or tied team hurries; leading team runs clock (not hurry-up)
    if (possessingScore <= opposingScore) {
      return true;
    }
    return false;
  }

  // Overtime: teams generally play with urgency
  if (state.quarter === 'OT' && state.clock <= TWO_MINUTE_WARNING) {
    return true;
  }

  return false;
}

/**
 * Check if a play's penalty was a pre-snap infraction.
 * Pre-snap penalties are dead-ball fouls that occur before the snap.
 */
function isPreSnapPenalty(play: PlayResult): boolean {
  if (play.penalty === null) return false;

  const preSnapTypes: ReadonlySet<string> = new Set([
    'false_start',
    'delay_of_game',
    'too_many_men',
    'offsides',
    'encroachment',
    'neutral_zone_infraction',
    'illegal_formation',
  ]);

  return preSnapTypes.has(play.penalty.type);
}

/**
 * Get the quarter length for the current quarter.
 * Standard quarters are 900 seconds; overtime is 600 seconds.
 */
export function getQuarterLength(quarter: GameState['quarter']): number {
  return quarter === 'OT' ? OVERTIME_LENGTH : QUARTER_LENGTH;
}

/**
 * Format a clock value (in seconds) as a readable MM:SS string.
 * Useful for commentary and display purposes.
 */
export function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get the reset values for timeouts at halftime.
 * Both teams get their timeouts restored to 3 at the start of the second half.
 */
export function getHalftimeTimeoutReset(): {
  homeTimeouts: number;
  awayTimeouts: number;
} {
  return {
    homeTimeouts: TIMEOUTS_PER_HALF,
    awayTimeouts: TIMEOUTS_PER_HALF,
  };
}

/**
 * Calculate the play clock value after a play.
 * Most plays reset the play clock to 40 seconds.
 * After certain stoppages (penalties, timeouts, change of possession),
 * the play clock resets to 25 seconds.
 */
export function getPlayClockReset(play: PlayResult, state: GameState): number {
  // 25-second play clock after administrative stoppages
  if (play.penalty !== null && !play.penalty.declined) {
    return 25;
  }

  // After a timeout
  // (timeouts are handled externally; this covers the common case)

  // After a change of possession
  if (play.turnover !== null) {
    return 25;
  }

  // After scoring plays
  if (play.scoring !== null) {
    return 25;
  }

  // Standard 40-second play clock
  return PLAY_CLOCK;
}

// ============================================================================
// Timeout Strategy
// ============================================================================

/**
 * Determine whether a team should call a timeout after the current play.
 *
 * NFL teams call timeouts strategically:
 * 1. Save clock when trailing late in the game (defense calls TO after opponent's play)
 * 2. Ice the kicker before a field goal attempt
 * 3. Avoid delay of game penalty
 * 4. Before the two-minute warning if it helps strategy
 *
 * Returns which team (if any) should call a timeout.
 */
export function shouldCallTimeout(
  state: GameState,
  play: PlayResult,
  rng: SeededRNG,
): { team: 'home' | 'away'; reason: string } | null {
  // Don't call timeouts during special situations
  if (state.kickoff || state.patAttempt) return null;

  // Can't call a timeout if clock isn't running
  if (!state.isClockRunning) return null;

  const homeTrailing = state.homeScore < state.awayScore;
  const awayTrailing = state.awayScore < state.homeScore;
  const homeDefending = state.possession === 'away';
  const awayDefending = state.possession === 'home';

  // ── Strategy 1: Trailing team's defense saves clock in 4th quarter ──
  // When trailing in the 4th quarter with < 2:00, the defensive team
  // should call timeout to stop the clock and preserve time for their offense.
  if (state.quarter === 4 && state.clock <= 120) {
    // Home team is on defense and trailing
    if (homeDefending && homeTrailing && state.homeTimeouts > 0) {
      // Don't waste timeout if clock will stop anyway
      if (play.isClockStopped) return null;
      // More aggressive as clock gets lower
      const urgency = state.clock <= 60 ? 0.90 : 0.70;
      if (rng.probability(urgency)) {
        return { team: 'home', reason: 'Save clock while trailing' };
      }
    }
    // Away team is on defense and trailing
    if (awayDefending && awayTrailing && state.awayTimeouts > 0) {
      if (play.isClockStopped) return null;
      const urgency = state.clock <= 60 ? 0.90 : 0.70;
      if (rng.probability(urgency)) {
        return { team: 'away', reason: 'Save clock while trailing' };
      }
    }
  }

  // ── Strategy 2: Trailing team saves clock in 4th quarter 2:00-5:00 ──
  // Less aggressive timeout usage between 2 and 5 minutes
  if (state.quarter === 4 && state.clock > 120 && state.clock <= 300) {
    if (homeDefending && homeTrailing && state.homeTimeouts > 1) {
      if (play.isClockStopped) return null;
      const scoreDiff = state.awayScore - state.homeScore;
      // Only call timeout if trailing by more than one score
      if (scoreDiff >= 9 && rng.probability(0.40)) {
        return { team: 'home', reason: 'Save clock, trailing by multiple scores' };
      }
    }
    if (awayDefending && awayTrailing && state.awayTimeouts > 1) {
      if (play.isClockStopped) return null;
      const scoreDiff = state.homeScore - state.awayScore;
      if (scoreDiff >= 9 && rng.probability(0.40)) {
        return { team: 'away', reason: 'Save clock, trailing by multiple scores' };
      }
    }
  }

  // ── Strategy 3: Ice the kicker ──
  // Call timeout right before a field goal attempt to disrupt the kicker.
  // This happens when the offensive team is in FG range on 4th down.
  if (state.down === 4 && state.ballPosition >= 63) {
    // The defending team might ice the kicker
    if (homeDefending && state.homeTimeouts > 0 && (state.quarter === 4 || state.quarter === 'OT')) {
      if (rng.probability(0.35)) {
        return { team: 'home', reason: 'Ice the kicker' };
      }
    }
    if (awayDefending && state.awayTimeouts > 0 && (state.quarter === 4 || state.quarter === 'OT')) {
      if (rng.probability(0.35)) {
        return { team: 'away', reason: 'Ice the kicker' };
      }
    }
  }

  // ── Strategy 4: End of first half (Q2) ──
  // Offense saves clock if driving with < 1:00
  if (state.quarter === 2 && state.clock <= 60 && state.clock > 5) {
    const possTeam = state.possession;
    const timeouts = possTeam === 'home' ? state.homeTimeouts : state.awayTimeouts;
    if (timeouts > 0 && !play.isClockStopped && state.ballPosition >= 40) {
      if (rng.probability(0.60)) {
        return { team: possTeam, reason: 'Save clock for end-of-half drive' };
      }
    }
  }

  return null;
}
