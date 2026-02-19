// ============================================================================
// GridIron Live - NFL Penalty Engine
// ============================================================================
// Generates and enforces NFL penalties with realistic frequency and
// distribution. Handles penalty selection, contextual filtering,
// auto-decline logic, and enforcement with proper yardage calculation.
// ============================================================================

import type {
  GameState,
  PlayResult,
  PenaltyResult,
  PenaltyType,
  PenaltyDefinition,
  Player,
  SeededRNG,
  WeightedOption,
} from './types';
import { PENALTIES, PENALTY_RATE } from './constants';

// ============================================================================
// Penalty Team Classification
// ============================================================================

/**
 * Penalties that are always committed by the offense.
 * These are fouls by the team that has or had possession of the ball.
 */
const OFFENSIVE_PENALTY_TYPES: ReadonlySet<string> = new Set([
  'holding_offense',
  'false_start',
  'illegal_formation',
  'delay_of_game',
  'intentional_grounding',
  'ineligible_downfield',
  'pass_interference_offense',
]);

/**
 * Penalties that are always committed by the defense.
 * These are fouls by the team that does not have possession.
 */
const DEFENSIVE_PENALTY_TYPES: ReadonlySet<string> = new Set([
  'offsides',
  'encroachment',
  'pass_interference_defense',
  'holding_defense',
  'roughing_the_passer',
  'illegal_contact',
  'neutral_zone_infraction',
]);

/**
 * Penalties that require a pass play to occur.
 * These cannot be called on running plays.
 */
const PASS_ONLY_PENALTY_TYPES: ReadonlySet<string> = new Set([
  'pass_interference_offense',
  'pass_interference_defense',
  'roughing_the_passer',
  'intentional_grounding',
  'illegal_contact',
  'ineligible_downfield',
]);

/**
 * Pre-snap penalty types. These occur before the ball is snapped
 * and are dead-ball fouls.
 */
const PRE_SNAP_PENALTY_TYPES: ReadonlySet<string> = new Set([
  'false_start',
  'delay_of_game',
  'too_many_men',
  'offsides',
  'encroachment',
  'neutral_zone_infraction',
  'illegal_formation',
]);

// ============================================================================
// Primary Penalty Functions
// ============================================================================

/**
 * Check if a penalty occurs on this play and generate the penalty result.
 *
 * Process:
 * 1. Roll for penalty occurrence (~7.5% of plays)
 * 2. Filter penalties valid for this play context
 * 3. Select a penalty using weighted random choice
 * 4. Determine which team committed the foul
 * 5. Select the offending player
 * 6. Build the complete PenaltyResult
 */
export function checkForPenalty(
  state: GameState,
  play: PlayResult,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG
): PenaltyResult | null {
  // Step 1: Roll for penalty occurrence
  if (!rng.probability(PENALTY_RATE)) {
    return null;
  }

  // Step 2: Get contextually valid penalties for this play
  const validPenalties = filterPenaltiesByContext(play);

  if (validPenalties.length === 0) {
    return null;
  }

  // Step 3: Select a penalty using weighted random choice
  const penaltyOptions: WeightedOption<PenaltyDefinition>[] = validPenalties.map(
    (p) => ({
      value: p,
      weight: p.frequencyWeight,
    })
  );

  const selectedPenalty = rng.weightedChoice(penaltyOptions);

  // Step 4: Determine which team committed the foul
  const penaltyOnTeam = determinePenaltyTeam(
    selectedPenalty,
    state.possession,
    rng
  );

  // Step 5: Select the offending player
  const isOnOffense = penaltyOnTeam === state.possession;
  const candidatePlayers = isOnOffense ? offensePlayers : defensePlayers;
  const offendingPlayer = selectPenaltyPlayer(
    selectedPenalty,
    candidatePlayers,
    rng
  );

  // Step 6: Calculate penalty yards
  const penaltyYards = calculatePenaltyYards(
    selectedPenalty,
    state,
    play
  );

  // Step 7: Build the PenaltyResult
  const penalty: PenaltyResult = {
    type: selectedPenalty.type as PenaltyType,
    on: penaltyOnTeam,
    player: offendingPlayer,
    yards: penaltyYards,
    isAutoFirstDown: selectedPenalty.isAutoFirstDown,
    isSpotFoul: selectedPenalty.isSpotFoul,
    declined: false,
    offsetting: false,
    description: '',
  };

  // Step 8: Check if the penalty should be declined
  penalty.declined = shouldDeclinePenalty(state, play, penalty);

  // Step 9: Generate description
  penalty.description = describePenalty(penalty);

  return penalty;
}

/**
 * Determine if a penalty should be declined.
 *
 * The opposing team (the team that did NOT commit the penalty) chooses
 * whether to accept or decline. They decline when the play result is
 * more advantageous than enforcing the penalty would be.
 */
export function shouldDeclinePenalty(
  state: GameState,
  play: PlayResult,
  penalty: PenaltyResult
): boolean {
  const penaltyOnOffense = penalty.on === state.possession;

  if (penaltyOnOffense) {
    // Offensive penalty: the defense decides whether to accept or decline.
    //
    // Defense declines if:
    // - There was a turnover (turnover is better for the defense than yardage)
    //   Note: In real NFL, offensive penalties before a turnover nullify the
    //   turnover. But for simulation simplicity, pre-snap penalties replay
    //   the down and post-snap offensive penalties can be declined if the
    //   defense prefers the play result.
    // - The play resulted in a loss greater than the penalty yards
    //   (e.g., sack for -8 yards vs 5-yard penalty)

    // Pre-snap offensive penalties always replay the down; these are rarely declined
    if (PRE_SNAP_PENALTY_TYPES.has(penalty.type)) {
      return false;
    }

    // If there was a turnover, defense usually prefers the turnover
    if (play.turnover !== null) {
      return true;
    }

    // If the play lost more yards than the penalty would assess,
    // the defense may prefer the play result
    if (play.yardsGained < 0 && Math.abs(play.yardsGained) > penalty.yards) {
      return true;
    }

    // Generally accept offensive penalties
    return false;
  } else {
    // Defensive penalty: the offense decides whether to accept or decline.
    //
    // Offense declines if:
    // - The play gained more yards than the penalty would provide
    // - The play resulted in a first down and the penalty would not provide
    //   a better field position
    // - The play scored a touchdown

    // Always accept on scoring plays? No - if offense scored a TD, decline penalty
    if (play.isTouchdown) {
      return true;
    }

    // If the play was a big gain exceeding what the penalty would provide
    const penaltyGain = estimatePenaltyYardBenefit(state, penalty);
    if (play.yardsGained > penaltyGain && play.yardsGained > 0) {
      // But if penalty gives auto first down and play didn't get one,
      // might still want the penalty
      if (penalty.isAutoFirstDown && !play.isFirstDown) {
        // Penalty gives first down which is valuable, but only if the
        // yardage difference isn't huge
        if (play.yardsGained > penaltyGain + 5) {
          return true;
        }
        return false;
      }
      return true;
    }

    // If the play got a first down with good yardage but penalty is small
    if (play.isFirstDown && play.yardsGained > 0 && penalty.yards <= 5) {
      return true;
    }

    // Generally accept defensive penalties
    return false;
  }
}

/**
 * Apply a penalty to the game state.
 *
 * Returns the modified field position, down, and distance after enforcement.
 *
 * Enforcement rules:
 * - Pre-snap: enforce from previous line of scrimmage, replay the down
 * - Spot foul (DPI): enforce from the spot of the foul, automatic first down
 * - Standard: enforce from line of scrimmage
 * - Half the distance to the goal: if penalty would move ball into/past end zone
 * - Auto first down: reset downs to 1st and 10
 * - Loss of down: advance the down counter
 */
export function enforcePenalty(
  state: GameState,
  penalty: PenaltyResult
): {
  ballPosition: number;
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  isFirstDown: boolean;
} {
  // If penalty is declined or offsetting, no enforcement - return current state
  if (penalty.declined || penalty.offsetting) {
    return {
      ballPosition: state.ballPosition,
      down: state.down,
      yardsToGo: state.yardsToGo,
      isFirstDown: false,
    };
  }

  const penaltyOnOffense = penalty.on === state.possession;
  let newBallPosition = state.ballPosition;
  let newDown = state.down;
  let newYardsToGo = state.yardsToGo;
  let isFirstDown = false;

  if (penaltyOnOffense) {
    // ----------------------------------------------------------------
    // OFFENSIVE PENALTY: move ball backward (toward own goal line)
    // ----------------------------------------------------------------
    const penaltyYards = calculateHalfDistanceIfNeeded(
      state.ballPosition,
      penalty.yards,
      'backward'
    );

    newBallPosition = state.ballPosition - penaltyYards;

    // Ensure ball stays in bounds (minimum own 1-yard line; 0 would be safety)
    // A penalty that would put the ball in/behind the end zone enforces
    // half the distance. We already handled that above, but clamp as safety net.
    newBallPosition = Math.max(1, newBallPosition);

    // Increase yards to go by the penalty yardage
    newYardsToGo = state.yardsToGo + penaltyYards;

    // Check for loss of down (e.g., intentional grounding)
    const penaltyDef = findPenaltyDefinition(penalty.type);
    if (penaltyDef?.lossOfDown) {
      newDown = Math.min(state.down + 1, 4) as 1 | 2 | 3 | 4;
    }

    // Pre-snap penalties replay the current down
    if (PRE_SNAP_PENALTY_TYPES.has(penalty.type)) {
      newDown = state.down;
    }
  } else {
    // ----------------------------------------------------------------
    // DEFENSIVE PENALTY: move ball forward (toward opponent's goal line)
    // ----------------------------------------------------------------
    if (penalty.isSpotFoul) {
      // Spot foul (e.g., DPI): enforce from spot of the foul.
      // For simulation purposes, we estimate the spot of the foul
      // based on the play. The spot is roughly where the foul occurred,
      // which we approximate as the ball position + some portion of
      // a typical pass distance.
      const spotOfFoul = estimateSpotOfFoul(state, penalty);
      const penaltyYards = calculateHalfDistanceIfNeeded(
        spotOfFoul,
        penalty.yards,
        'forward'
      );
      newBallPosition = Math.min(99, spotOfFoul + penaltyYards);
    } else {
      // Standard enforcement from line of scrimmage
      const penaltyYards = calculateHalfDistanceIfNeeded(
        state.ballPosition,
        penalty.yards,
        'forward'
      );
      newBallPosition = Math.min(99, state.ballPosition + penaltyYards);
    }

    // Auto first down
    if (penalty.isAutoFirstDown) {
      isFirstDown = true;
      newDown = 1;
      newYardsToGo = Math.min(10, 100 - newBallPosition);
    } else {
      // Recalculate yards to go based on new position
      const yardsGainedFromPenalty = newBallPosition - state.ballPosition;
      newYardsToGo = Math.max(1, state.yardsToGo - yardsGainedFromPenalty);

      // Check if the penalty gain is enough for a first down
      if (yardsGainedFromPenalty >= state.yardsToGo) {
        isFirstDown = true;
        newDown = 1;
        newYardsToGo = Math.min(10, 100 - newBallPosition);
      }
    }

    // Pre-snap defensive penalties (offsides, encroachment, NZI)
    // do NOT replay the down; they simply enforce yards.
    // The offense can accept the penalty and it's a free play result,
    // or it replays the down from the new spot. In our simulation,
    // since the penalty was accepted (not declined), we treat it as
    // enforced from LOS with potential first down.
  }

  // For pre-snap offensive penalties, replay the same down
  if (penaltyOnOffense && PRE_SNAP_PENALTY_TYPES.has(penalty.type)) {
    newDown = state.down;
  } else if (penaltyOnOffense && !isFirstDown) {
    // Post-snap offensive penalties generally replay the down
    // unless otherwise specified (like loss of down)
    const penaltyDef = findPenaltyDefinition(penalty.type);
    if (!penaltyDef?.lossOfDown) {
      newDown = state.down;
    }
  }

  return {
    ballPosition: newBallPosition,
    down: newDown,
    yardsToGo: newYardsToGo,
    isFirstDown,
  };
}

/**
 * Generate descriptive penalty text for broadcast display.
 *
 * Produces text in the style of NFL broadcast graphics:
 * "FLAG -- Offensive Holding, #72 J. Williams, 10-yard penalty, replay 2nd down"
 * "FLAG -- Defensive Pass Interference on #24 D. Slay, ball placed at the spot, automatic first down"
 */
export function describePenalty(penalty: PenaltyResult): string {
  const penaltyDef = findPenaltyDefinition(penalty.type);
  const penaltyName = penaltyDef?.name ?? formatPenaltyType(penalty.type);

  // Build player identification string
  const playerStr = penalty.player
    ? `#${penalty.player.number} ${penalty.player.name}`
    : 'unknown player';

  // Declined penalties
  if (penalty.declined) {
    return `FLAG -- ${penaltyName} on ${playerStr} -- DECLINED`;
  }

  // Offsetting penalties
  if (penalty.offsetting) {
    return `FLAG -- ${penaltyName} on ${playerStr} -- Offsetting penalties, replay the down`;
  }

  // Build the enforcement description
  const parts: string[] = [`FLAG -- ${penaltyName}, ${playerStr}`];

  // Yardage
  if (penalty.isSpotFoul && penalty.yards === 0) {
    // Spot fouls like DPI where yardage is variable
    parts.push('enforced at the spot of the foul');
  } else if (penalty.yards > 0) {
    parts.push(`${penalty.yards}-yard penalty`);
  }

  // Auto first down
  if (penalty.isAutoFirstDown) {
    parts.push('automatic first down');
  }

  // Loss of down
  if (penaltyDef?.lossOfDown) {
    parts.push('loss of down');
  }

  return parts.join(', ');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filter the PENALTIES array to only include penalties valid for the
 * current play context.
 */
function filterPenaltiesByContext(play: PlayResult): PenaltyDefinition[] {
  const isPassPlay =
    play.type === 'pass_complete' ||
    play.type === 'pass_incomplete' ||
    play.type === 'sack';

  const isRunPlay =
    play.type === 'run' || play.type === 'scramble';

  const isSpecialTeams =
    play.type === 'punt' ||
    play.type === 'kickoff' ||
    play.type === 'field_goal' ||
    play.type === 'extra_point' ||
    play.type === 'touchback';

  return PENALTIES.filter((penalty) => {
    // Pass-only penalties require a pass play
    if (PASS_ONLY_PENALTY_TYPES.has(penalty.type) && !isPassPlay) {
      return false;
    }

    // On special teams plays, limit to a subset of applicable penalties
    if (isSpecialTeams) {
      const specialTeamsPenalties: ReadonlySet<string> = new Set([
        'offsides',
        'illegal_block',
        'holding_offense',
        'holding_defense',
        'unnecessary_roughness',
        'facemask',
        'unsportsmanlike_conduct',
        'too_many_men',
        'delay_of_game',
      ]);
      return specialTeamsPenalties.has(penalty.type);
    }

    // Pre-snap penalties can occur on any play (they happen before the snap)
    // Post-snap penalties require a play to have occurred
    // No additional filtering needed here since we already handled pass-only

    return true;
  });
}

/**
 * Determine which team (home or away) committed the penalty.
 *
 * Uses the penalty type classification (offensive vs defensive) and the
 * current possession to map to home/away.
 */
function determinePenaltyTeam(
  penalty: PenaltyDefinition,
  possession: GameState['possession'],
  rng: SeededRNG
): 'home' | 'away' {
  const offenseTeam = possession; // 'home' or 'away'
  const defenseTeam = possession === 'home' ? 'away' : 'home';

  if (OFFENSIVE_PENALTY_TYPES.has(penalty.type)) {
    return offenseTeam;
  }

  if (DEFENSIVE_PENALTY_TYPES.has(penalty.type)) {
    return defenseTeam;
  }

  // Ambiguous penalties (e.g., unnecessary_roughness, facemask, illegal_block,
  // unsportsmanlike_conduct, illegal_use_of_hands, tripping, horse_collar,
  // too_many_men): can go either way.
  // Weight slightly toward offense for holding-type and slightly toward
  // defense for roughness-type.
  switch (penalty.type) {
    case 'unnecessary_roughness':
    case 'facemask':
    case 'horse_collar':
      // More commonly called on defense (60/40)
      return rng.probability(0.6) ? defenseTeam : offenseTeam;

    case 'illegal_block':
    case 'tripping':
    case 'illegal_use_of_hands':
      // More commonly called on offense (60/40)
      return rng.probability(0.6) ? offenseTeam : defenseTeam;

    case 'unsportsmanlike_conduct':
      // Equal probability
      return rng.probability(0.5) ? offenseTeam : defenseTeam;

    case 'too_many_men':
      // Slightly more common on defense (55/45)
      return rng.probability(0.55) ? defenseTeam : offenseTeam;

    default:
      // Default 50/50
      return rng.probability(0.5) ? offenseTeam : defenseTeam;
  }
}

/**
 * Select the player who committed the penalty.
 *
 * Uses positional weighting: linemen are more likely for holding,
 * DBs for pass interference, etc.
 */
function selectPenaltyPlayer(
  penalty: PenaltyDefinition,
  players: Player[],
  rng: SeededRNG
): Player | null {
  if (players.length === 0) {
    return null;
  }

  // Build position-weighted options based on penalty type
  const positionWeights = getPenaltyPositionWeights(penalty.type);

  const weightedPlayers: WeightedOption<Player>[] = players.map((player) => ({
    value: player,
    weight: positionWeights[player.position] ?? 1,
  }));

  // Filter out zero-weight options
  const validOptions = weightedPlayers.filter((opt) => opt.weight > 0);

  if (validOptions.length === 0) {
    // Fallback: pick any random player
    const idx = rng.randomInt(0, players.length - 1);
    return players[idx];
  }

  return rng.weightedChoice(validOptions);
}

/**
 * Get position weights for penalty player selection.
 * Higher weight means more likely to be flagged for this penalty type.
 */
function getPenaltyPositionWeights(
  penaltyType: string
): Record<string, number> {
  switch (penaltyType) {
    case 'holding_offense':
    case 'illegal_use_of_hands':
      // Offensive linemen, tight ends most commonly flagged
      return { OL: 10, TE: 3, RB: 2, WR: 1, QB: 0, DL: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0 };

    case 'holding_defense':
      // DBs and linebackers
      return { CB: 8, S: 5, LB: 5, DL: 3, OL: 0, TE: 0, RB: 0, WR: 0, QB: 0, K: 0, P: 0 };

    case 'false_start':
    case 'illegal_formation':
      // Offensive linemen, occasionally skill positions
      return { OL: 10, TE: 3, WR: 2, RB: 1, QB: 1, DL: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0 };

    case 'offsides':
    case 'encroachment':
    case 'neutral_zone_infraction':
      // Defensive linemen and linebackers
      return { DL: 10, LB: 5, CB: 1, S: 1, OL: 0, TE: 0, RB: 0, WR: 0, QB: 0, K: 0, P: 0 };

    case 'pass_interference_offense':
    case 'ineligible_downfield':
      // Receivers and tight ends
      return { WR: 8, TE: 5, OL: 3, RB: 1, QB: 0, DL: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0 };

    case 'pass_interference_defense':
    case 'illegal_contact':
      // Cornerbacks and safeties
      return { CB: 10, S: 6, LB: 3, DL: 1, OL: 0, TE: 0, RB: 0, WR: 0, QB: 0, K: 0, P: 0 };

    case 'roughing_the_passer':
      // Defensive linemen and linebackers (pass rushers)
      return { DL: 10, LB: 6, CB: 1, S: 2, OL: 0, TE: 0, RB: 0, WR: 0, QB: 0, K: 0, P: 0 };

    case 'unnecessary_roughness':
    case 'facemask':
    case 'horse_collar':
      // Any position, but more common for defenders
      return { DL: 5, LB: 5, CB: 4, S: 4, OL: 3, TE: 2, RB: 2, WR: 1, QB: 0, K: 0, P: 0 };

    case 'intentional_grounding':
      // Only the quarterback
      return { QB: 10, OL: 0, TE: 0, RB: 0, WR: 0, DL: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0 };

    case 'delay_of_game':
      // Usually attributed to the QB or center
      return { QB: 8, OL: 5, RB: 1, WR: 0, TE: 0, DL: 0, LB: 0, CB: 0, S: 0, K: 0, P: 0 };

    case 'too_many_men':
      // Any position
      return { OL: 2, DL: 2, LB: 2, CB: 2, S: 2, WR: 2, TE: 2, RB: 2, QB: 1, K: 1, P: 1 };

    case 'illegal_block':
    case 'tripping':
      // Linemen and blockers
      return { OL: 8, TE: 4, RB: 3, WR: 3, DL: 3, LB: 3, CB: 1, S: 1, QB: 0, K: 0, P: 0 };

    case 'unsportsmanlike_conduct':
      // Any player
      return { OL: 2, DL: 2, LB: 3, CB: 3, S: 3, WR: 3, TE: 2, RB: 2, QB: 2, K: 1, P: 1 };

    default:
      // Equal weight for all positions
      return { QB: 1, RB: 1, WR: 1, TE: 1, OL: 1, DL: 1, LB: 1, CB: 1, S: 1, K: 1, P: 1 };
  }
}

/**
 * Calculate the actual penalty yards, accounting for the spot of the foul
 * for spot fouls and the standard yardage for other penalties.
 */
function calculatePenaltyYards(
  penalty: PenaltyDefinition,
  state: GameState,
  play: PlayResult
): number {
  if (penalty.isSpotFoul) {
    // Spot fouls (like DPI) have yardage determined by where the foul occurred.
    // For DPI, the ball is placed at the spot of the foul.
    // We return 0 here because spot foul enforcement handles position directly.
    // The actual yards will be computed during enforcement.
    if (penalty.type === 'pass_interference_defense') {
      return 0; // Spot foul - yardage varies
    }
    if (penalty.type === 'intentional_grounding') {
      // Intentional grounding: loss of down and ball spotted where QB was.
      // Approximate as a loss based on how far behind LOS the QB was.
      return Math.max(0, Math.abs(play.yardsGained));
    }
    return penalty.yards;
  }

  return penalty.yards;
}

/**
 * Apply half-the-distance-to-the-goal rule.
 *
 * If a penalty's yardage would move the ball into or past the end zone,
 * the ball is instead moved half the distance from the current spot to
 * the goal line.
 */
function calculateHalfDistanceIfNeeded(
  currentPosition: number,
  penaltyYards: number,
  direction: 'forward' | 'backward'
): number {
  if (direction === 'backward') {
    // Moving toward own goal line (position 0)
    // If penalty would put ball at or past own goal line
    if (penaltyYards >= currentPosition) {
      // Half the distance to the goal
      return Math.max(1, Math.floor(currentPosition / 2));
    }
    return penaltyYards;
  } else {
    // Moving toward opponent's goal line (position 100)
    const distanceToGoal = 100 - currentPosition;
    if (penaltyYards >= distanceToGoal) {
      // Half the distance to the goal - ball placed inside the 1
      return Math.max(1, Math.floor(distanceToGoal / 2));
    }
    return penaltyYards;
  }
}

/**
 * Estimate the spot of the foul for spot-foul penalties (e.g., DPI).
 *
 * For defensive pass interference, the spot is where the interference
 * occurred, which is roughly where the intended receiver was when contacted.
 * We approximate this based on ball position and a typical route depth.
 */
function estimateSpotOfFoul(
  state: GameState,
  penalty: PenaltyResult
): number {
  if (penalty.type === 'pass_interference_defense') {
    // DPI typically occurs 10-30 yards downfield from the line of scrimmage.
    // We estimate the depth as 15 yards (a typical intermediate route), clamped
    // to ensure the spot stays on the field (at most 1 yard from the goal line).
    const maxDepth = Math.max(1, 99 - state.ballPosition);
    const estimatedDepth = Math.min(15, maxDepth);
    const spotPosition = state.ballPosition + estimatedDepth;
    return spotPosition;
  }

  if (penalty.type === 'intentional_grounding') {
    // Grounding occurs at or behind the line of scrimmage
    return Math.max(1, state.ballPosition - 5);
  }

  // Default: line of scrimmage
  return state.ballPosition;
}

/**
 * Estimate how many yards of benefit a defensive penalty provides
 * to the offense, for use in decline decision logic.
 */
function estimatePenaltyYardBenefit(
  state: GameState,
  penalty: PenaltyResult
): number {
  if (penalty.isSpotFoul && penalty.type === 'pass_interference_defense') {
    // DPI is a spot foul, typically 10-30 yards
    return Math.min(30, 100 - state.ballPosition);
  }

  return penalty.yards;
}

/**
 * Look up the PenaltyDefinition for a given penalty type.
 */
function findPenaltyDefinition(type: PenaltyType): PenaltyDefinition | undefined {
  return PENALTIES.find((p) => p.type === type);
}

/**
 * Format a penalty type string into a human-readable name.
 * Used as a fallback when the penalty definition is not found.
 */
function formatPenaltyType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
