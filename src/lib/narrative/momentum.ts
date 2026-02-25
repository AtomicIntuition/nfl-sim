// ============================================================================
// GridBlitz - Momentum Tracker
// ============================================================================
// Tracks the intangible "feel" of who has the upper hand in a game.
// Momentum is a continuous value from -100 (away dominates) to +100
// (home dominates). It shifts on big plays and turnovers, decays
// naturally toward neutral, and applies a small probability modifier
// to play outcomes (up to +/-3%).
// ============================================================================

import { GameState, PlayResult } from '../simulation/types';
import {
  MOMENTUM_TOUCHDOWN,
  MOMENTUM_FIELD_GOAL,
  MOMENTUM_TURNOVER,
  MOMENTUM_SACK,
  MOMENTUM_BIG_PLAY,
  MOMENTUM_THREE_AND_OUT,
  MOMENTUM_DECAY_PER_PLAY,
  MOMENTUM_MAX_EFFECT,
} from '../simulation/constants';

// ============================================================================
// HELPERS
// ============================================================================

/** Clamp a value between min and max (inclusive). */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Determine the direction multiplier for a momentum shift.
 * Positive events for the home team push momentum toward +100.
 * Positive events for the away team push momentum toward -100.
 */
function directionFor(possession: 'home' | 'away', favorable: boolean): number {
  // A favorable event for the possessing team:
  //   home possession + favorable = +1 (toward home)
  //   away possession + favorable = -1 (toward away)
  // An unfavorable event (turnover, sack) flips the sign.
  if (possession === 'home') {
    return favorable ? 1 : -1;
  }
  return favorable ? -1 : 1;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Initialize momentum at 0 (neutral). */
export function createInitialMomentum(): number {
  return 0;
}

/**
 * Calculate the momentum change produced by a single play.
 *
 * Returns a signed delta: positive shifts momentum toward the home team,
 * negative shifts it toward the away team. The caller should add this
 * delta to the current momentum value and clamp.
 */
export function calculateMomentumShift(
  play: PlayResult,
  state: GameState,
  currentMomentum: number
): number {
  const possession = state.possession;
  let shift = 0;

  // --- Touchdown ---
  if (play.isTouchdown && play.scoring) {
    // The scoring team gets the momentum boost.
    const scoringTeamIsHome = play.scoring.team === 'home';
    shift += MOMENTUM_TOUCHDOWN * (scoringTeamIsHome ? 1 : -1);
  }

  // --- Field goal ---
  if (
    play.scoring &&
    play.scoring.type === 'field_goal'
  ) {
    const scoringTeamIsHome = play.scoring.team === 'home';
    shift += MOMENTUM_FIELD_GOAL * (scoringTeamIsHome ? 1 : -1);
  }

  // --- Turnover (the single biggest momentum changer) ---
  if (play.turnover) {
    // Momentum swings toward the team that recovered the ball.
    const recoveryIsHome = play.turnover.recoveredBy === 'home';
    shift += MOMENTUM_TURNOVER * (recoveryIsHome ? 1 : -1);
  }

  // --- Sack (favorable for the defense) ---
  if (play.type === 'sack') {
    // Defense benefits. If home has possession and gets sacked,
    // momentum swings away (negative). If away is sacked, momentum
    // swings home (positive).
    shift += MOMENTUM_SACK * directionFor(possession, false);
  }

  // --- Big play (15+ yards gained) ---
  if (play.yardsGained >= 15 && !play.isTouchdown && !play.turnover) {
    shift += MOMENTUM_BIG_PLAY * directionFor(possession, true);
  }

  // --- Three-and-out detection ---
  // A three-and-out is signaled by a punt on what was the third play
  // of a possession. We detect this indirectly: if the play is a punt
  // and the down is 4 (meaning offense failed on 1st-3rd and punted),
  // we treat it as a three-and-out. The defense gains momentum.
  if (play.type === 'punt') {
    // Punt indicates the offense stalled. Momentum toward the defense.
    // We award three-and-out momentum here; the story tracker handles
    // the actual play-count validation for narrative threads.
    shift += MOMENTUM_THREE_AND_OUT * directionFor(possession, false);
  }

  return shift;
}

/**
 * Apply natural momentum decay toward neutral (0).
 *
 * Each play, momentum decays by MOMENTUM_DECAY_PER_PLAY toward zero.
 * This prevents momentum from being permanently locked at extremes
 * and models the natural ebb-and-flow of a real game.
 */
export function applyMomentumDecay(momentum: number): number {
  if (momentum > 0) {
    return clamp(momentum - MOMENTUM_DECAY_PER_PLAY, 0, 100);
  }
  if (momentum < 0) {
    return clamp(momentum + MOMENTUM_DECAY_PER_PLAY, -100, 0);
  }
  return 0;
}

/**
 * Get the probability modifier for the possessing team based on
 * the current momentum value.
 *
 * At momentum +100 the home team receives +3% (MOMENTUM_MAX_EFFECT)
 * and the away team receives -3%. At momentum 0 there is no effect.
 *
 * Returns a signed float that should be added to base success
 * probabilities for the possessing team's plays.
 */
export function getMomentumModifier(
  momentum: number,
  possession: 'home' | 'away'
): number {
  // Raw modifier ranges from -0.03 to +0.03.
  // Positive momentum favors home; negative favors away.
  const rawModifier = (momentum / 100) * MOMENTUM_MAX_EFFECT;

  // If home has the ball, positive momentum helps them.
  // If away has the ball, they benefit from negative momentum,
  // so we flip the sign.
  const modifier = possession === 'home' ? rawModifier : -rawModifier;
  return modifier || 0; // Avoid -0
}
