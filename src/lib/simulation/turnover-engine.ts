// ============================================================================
// GridIron Live - Turnover Engine
// ============================================================================
// Handles all turnovers: fumbles, interceptions, turnover on downs, and
// muffed punts. Each turnover generates vivid play-by-play descriptions
// and resolves field position changes after possession flips.
// ============================================================================

import {
  GameState,
  PlayResult,
  TurnoverResult,
  TurnoverType,
  Player,
  SeededRNG,
} from './types';
import * as C from './constants';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Format a yard-line number into a human-readable field position string. */
function formatFieldPosition(ballPosition: number, possession: 'home' | 'away'): string {
  if (ballPosition === 50) return 'midfield';
  if (ballPosition > 50) {
    const yardLine = C.FIELD_LENGTH - ballPosition;
    return `the ${possession === 'home' ? 'away' : 'home'} ${yardLine}`;
  }
  return `the ${possession} ${ballPosition}`;
}

/** Format a yard-line as a simple marker, e.g. "the 35" or "the KC 40". */
function yardLineLabel(yardLine: number): string {
  if (yardLine <= 0) return 'the end zone';
  if (yardLine >= 100) return 'the end zone';
  if (yardLine === 50) return 'midfield';
  if (yardLine > 50) return `the ${100 - yardLine}-yard line`;
  return `the ${yardLine}-yard line`;
}

// ============================================================================
// FUMBLE LOGIC
// ============================================================================

/** Fumble rate on sack plays (higher than normal plays). */
const SACK_FUMBLE_RATE = 0.09;

/** Fumble rate boost when near the goal line (inside the 5). */
const GOAL_LINE_FUMBLE_BOOST = 0.015;

/**
 * Check if a fumble occurs on a play and resolve it.
 *
 * Fumble probabilities vary by situation:
 * - Standard plays: FUMBLE_RATE (1.5%)
 * - Sack plays: 9% (ball-carriers absorbing hits in the pocket)
 * - Goal line plays (ball >= 95): slightly elevated (+1.5%)
 *
 * If a fumble occurs, the defense recovers 52% of the time.
 * Offensive recoveries are treated as no turnover (play stands as-is).
 * Defensive recoveries can be returned 0-25 yards, with a 4% chance
 * of being returned for a touchdown.
 */
export function checkFumble(
  play: PlayResult,
  state: GameState,
  rng: SeededRNG
): TurnoverResult | null {
  // Determine the effective fumble rate for this play
  let fumbleRate = C.FUMBLE_RATE;

  if (play.type === 'sack') {
    fumbleRate = SACK_FUMBLE_RATE;
  }

  // Goal line plays carry extra fumble risk due to pile-ups
  if (state.ballPosition >= 95) {
    fumbleRate += GOAL_LINE_FUMBLE_BOOST;
  }

  // Roll for fumble
  if (!rng.probability(fumbleRate)) {
    return null;
  }

  // Fumble occurred -- who recovers?
  // ~20% of fumbles go out of bounds (offense keeps ball at fumble spot)
  if (rng.probability(0.20)) {
    return {
      type: 'fumble_oob',
      recoveredBy: state.possession, // offense keeps it
      returnYards: 0,
      returnedForTD: false,
    };
  }

  const defenseRecovers = rng.probability(C.FUMBLE_RECOVERY_DEFENSE);

  if (!defenseRecovers) {
    // Offense recovers their own fumble -- no turnover, play stands
    return null;
  }

  // Defense recovers the fumble
  const defensiveTeam = flipPossession(state.possession);

  // Calculate return yards (0-25, weighted toward shorter returns)
  const returnYards = rng.randomInt(0, 25);

  // Check for fumble recovery touchdown (4% of defensive recoveries)
  const returnedForTD = rng.probability(C.FUMBLE_TD_RATE);

  return {
    type: 'fumble',
    recoveredBy: defensiveTeam,
    returnYards: returnedForTD ? 0 : returnYards, // TD yards handled by applyTurnover
    returnedForTD,
  };
}

// ============================================================================
// INTERCEPTION LOGIC
// ============================================================================

/**
 * Generate an interception result.
 *
 * Called by the play resolution layer when a pass play is determined
 * to be intercepted (INTERCEPTION_RATE check happens upstream).
 *
 * Return yards follow a Gaussian distribution centered at 12 yards
 * with considerable variance (0-80 range). Pick-six probability is 3%.
 */
export function generateInterception(
  state: GameState,
  rng: SeededRNG
): TurnoverResult {
  const defensiveTeam = flipPossession(state.possession);

  // Return yardage: gaussian centered at 12 yards, capped at 0-80
  const returnYards = Math.round(rng.gaussian(12, 10, 0, 80));

  // Check for pick-six (3% of interceptions)
  const returnedForTD = rng.probability(C.PICK_SIX_RATE);

  return {
    type: 'interception',
    recoveredBy: defensiveTeam,
    returnYards: returnedForTD ? 0 : returnYards, // TD return handled in applyTurnover
    returnedForTD,
  };
}

// ============================================================================
// TURNOVER ON DOWNS
// ============================================================================

/**
 * Generate a turnover on downs (4th down failed conversion).
 *
 * The simplest turnover type: possession flips and the ball stays
 * at the spot of the failed play. No return yards, no TD possibility.
 */
export function turnoverOnDowns(state: GameState): TurnoverResult {
  const defensiveTeam = flipPossession(state.possession);

  return {
    type: 'turnover_on_downs',
    recoveredBy: defensiveTeam,
    returnYards: 0,
    returnedForTD: false,
  };
}

// ============================================================================
// MUFFED PUNT
// ============================================================================

/**
 * Check for a muffed punt during a punt play.
 *
 * 2% of punts are muffed by the return team, giving the kicking
 * team recovery at the spot of the muff. No return yards -- the
 * ball is dead at the recovery spot.
 */
export function checkMuffedPunt(
  rng: SeededRNG,
  state: GameState
): TurnoverResult | null {
  if (!rng.probability(C.MUFFED_PUNT_RATE)) {
    return null;
  }

  // Kicking team recovers the muffed punt (current possession team
  // is the punting team, so they get the ball back)
  return {
    type: 'muffed_punt',
    recoveredBy: state.possession, // kicking team recovers
    returnYards: 0,
    returnedForTD: false,
  };
}

// ============================================================================
// APPLY TURNOVER (FIELD POSITION RESOLUTION)
// ============================================================================

/**
 * Apply a turnover to the game state and calculate the resulting
 * ball position and possession.
 *
 * Field position math:
 * - The current ballPosition is yards from the *possessing* team's
 *   own goal line (0 = own endzone, 100 = opponent's endzone).
 * - When possession flips, the new team's perspective is inverted:
 *   newPosition = 100 - currentPosition + returnYards
 * - If returnedForTD, the ball is placed at the endzone (100).
 * - Capped at 100 to prevent overflows past the endzone.
 *
 * Special cases:
 * - Turnover on downs: ball stays at the spot (inverted for new team).
 * - Muffed punt: ball at spot (no possession flip -- kicking team recovers).
 */
export function applyTurnover(
  state: GameState,
  turnover: TurnoverResult
): { ballPosition: number; possession: 'home' | 'away' } {
  const newPossession = turnover.recoveredBy;

  // Muffed punt: kicking team (current possession) recovers at the spot
  if (turnover.type === 'muffed_punt') {
    return {
      ballPosition: state.ballPosition,
      possession: newPossession,
    };
  }

  // Fumble out of bounds: offense keeps ball at the fumble spot
  if (turnover.type === 'fumble_oob') {
    return {
      ballPosition: state.ballPosition,
      possession: newPossession,
    };
  }

  // For a returned-for-TD, ball goes to the endzone
  if (turnover.returnedForTD) {
    return {
      ballPosition: C.ENDZONE_END,
      possession: newPossession,
    };
  }

  // Standard turnover: invert field position and add return yards
  const invertedPosition = C.FIELD_LENGTH - state.ballPosition;
  const newBallPosition = Math.min(
    invertedPosition + turnover.returnYards,
    C.ENDZONE_END
  );

  return {
    ballPosition: newBallPosition,
    possession: newPossession,
  };
}

// ============================================================================
// POSSESSION FLIP
// ============================================================================

/** Get the opponent of the current possession team. */
export function flipPossession(possession: 'home' | 'away'): 'home' | 'away' {
  return possession === 'home' ? 'away' : 'home';
}

// ============================================================================
// DESCRIPTION BUILDERS
// ============================================================================

/**
 * Build a vivid play-by-play description for a fumble turnover.
 *
 * Generates immersive broadcast-style text that varies based on
 * whether the fumble was on a sack, at the goal line, or returned
 * for a touchdown.
 */
export function buildFumbleDescription(
  turnover: TurnoverResult,
  state: GameState,
  play: PlayResult,
  defender: Player | null
): string {
  const spot = yardLineLabel(state.ballPosition);
  const defenderName = defender
    ? `#${defender.number} ${defender.name}`
    : 'the defense';

  let description = `FUMBLE! Ball is loose at ${spot}!`;

  if (play.type === 'sack') {
    description = `STRIP SACK! The ball comes loose at ${spot}!`;
  } else if (state.ballPosition >= 95) {
    description = `FUMBLE at the goal line! The ball squirts free at ${spot}!`;
  }

  description += ` Recovered by ${defenderName}!`;

  if (turnover.returnedForTD) {
    description += ' AND HE TAKES IT ALL THE WAY! TOUCHDOWN!';
  } else if (turnover.returnYards > 15) {
    description += ` Returns it ${turnover.returnYards} yards into enemy territory!`;
  } else if (turnover.returnYards > 0) {
    description += ` Returns it ${turnover.returnYards} yards.`;
  } else {
    description += ' Falls on it at the spot.';
  }

  return description;
}

/**
 * Build a vivid play-by-play description for an interception.
 *
 * Generates broadcast-style narration with defender identification,
 * field position, return yardage, and pick-six excitement.
 */
export function buildInterceptionDescription(
  turnover: TurnoverResult,
  state: GameState,
  defender: Player | null
): string {
  const spot = yardLineLabel(C.FIELD_LENGTH - state.ballPosition);
  const defenderName = defender
    ? `#${defender.number} ${defender.name}`
    : 'the defender';

  let description = `INTERCEPTED by ${defenderName} at ${spot}!`;

  if (turnover.returnedForTD) {
    description += ' He breaks free down the sideline... PICK SIX! TOUCHDOWN!';
  } else if (turnover.returnYards > 30) {
    description += ` Big return of ${turnover.returnYards} yards! He finally gets dragged down.`;
  } else if (turnover.returnYards > 10) {
    description += ` Returns it ${turnover.returnYards} yards before being brought down.`;
  } else if (turnover.returnYards > 0) {
    description += ` Returns it ${turnover.returnYards} yards.`;
  } else {
    description += ' Stays down at the spot of the catch.';
  }

  return description;
}

/**
 * Build a description for a turnover on downs.
 *
 * Simple but impactful -- the offense gambled on 4th down and lost.
 */
export function buildTurnoverOnDownsDescription(state: GameState): string {
  const spot = yardLineLabel(state.ballPosition);
  return (
    `TURNOVER ON DOWNS! The offense couldn't convert on 4th down at ${spot}. ` +
    `The defense holds and takes over!`
  );
}

/**
 * Build a description for a muffed punt.
 *
 * Rare and dramatic -- a special teams disaster for the return team.
 */
export function buildMuffedPuntDescription(state: GameState): string {
  const spot = yardLineLabel(state.ballPosition);
  return (
    `MUFFED PUNT! The returner can't handle it at ${spot}! ` +
    `The kicking team pounces on the loose ball! What a disaster for the return unit!`
  );
}
