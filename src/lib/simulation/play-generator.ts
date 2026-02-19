// ============================================================================
// GridIron Live - Play Resolution Engine
// ============================================================================
// Resolves what happens on each play. Takes a PlayCall and the current game
// situation, then simulates the outcome through probability checks, yardage
// generation, turnover/scoring detection, and clock effects. Produces a
// complete PlayResult with human-readable descriptions and all derived state.
// ============================================================================

import type {
  GameState,
  PlayCall,
  PlayResult,
  Player,
  Position,
  SeededRNG,
  WeightedOption,
} from './types';

import {
  AVERAGE_YARDS,
  BIG_PLAY_RATE,
  CLOCK_TIME,
  COMPLETION_RATES,
  EXTRA_POINT_RATE,
  FUMBLE_RATE,
  FUMBLE_RECOVERY_DEFENSE,
  FUMBLE_TD_RATE,
  INTERCEPTION_RATE,
  KICKOFF_RETURN_MEAN,
  KICKOFF_RETURN_STDDEV,
  MOMENTUM_MAX_EFFECT,
  ONSIDE_KICK_RECOVERY,
  PICK_SIX_RATE,
  PUNT_DISTANCE_MEAN,
  PUNT_DISTANCE_STDDEV,
  PUNT_RETURN_MEAN,
  PUNT_RETURN_STDDEV,
  FAIR_CATCH_RATE,
  SACK_RATE,
  TOUCHBACK_RATE,
  TWO_POINT_CONVERSION_RATE,
  getFieldGoalAccuracy,
} from './constants';

// ============================================================================
// Helper: Find the highest-rated player at a given position
// ============================================================================

function getPlayerByPosition(players: Player[], position: Position): Player | null {
  const candidates = players.filter(p => p.position === position);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => (p.rating > best.rating ? p : best));
}

/** Get QB or best available player as emergency backup (when QB is injured). */
function getQBOrFallback(players: Player[]): Player {
  const qb = getPlayerByPosition(players, 'QB');
  if (qb) return qb;
  // Emergency: use highest-rated available player as backup QB
  if (players.length === 0) {
    return { id: 'backup-qb', teamId: '', name: 'Backup QB', position: 'QB', number: 0, rating: 60, speed: 60, strength: 60, awareness: 60, clutchRating: 50, injuryProne: false };
  }
  return players.reduce((best, p) => (p.rating > best.rating ? p : best));
}

// ============================================================================
// Helper: Pick a receiver - weighted by rating among WR and TE
// ============================================================================

function selectReceiver(players: Player[], rng: SeededRNG): Player | null {
  const receivers = players.filter(p => p.position === 'WR' || p.position === 'TE');
  if (receivers.length === 0) return null;

  const options: WeightedOption<Player>[] = receivers.map(p => ({
    value: p,
    weight: p.rating,
  }));

  return rng.weightedChoice(options);
}

// ============================================================================
// Helper: Pick a defensive player who made the play
// ============================================================================

function selectDefender(defensePlayers: Player[], rng: SeededRNG): Player | null {
  const defenders = defensePlayers.filter(
    p => p.position === 'DL' || p.position === 'LB' || p.position === 'CB' || p.position === 'S'
  );
  if (defenders.length === 0) return null;

  const options: WeightedOption<Player>[] = defenders.map(p => ({
    value: p,
    weight: p.rating,
  }));

  return rng.weightedChoice(options);
}

// ============================================================================
// Helper: Calculate field goal distance from ball position
// FG distance = yards to endzone + 17 (10 yard endzone + 7 yard snap/hold)
// ============================================================================

function calculateFieldGoalDistance(ballPosition: number): number {
  return (100 - ballPosition) + 17;
}

// ============================================================================
// Helper: Get the abbreviation of the team that has possession
// ============================================================================

function getOffenseAbbr(state: GameState): string {
  return state.possession === 'home'
    ? state.homeTeam.abbreviation
    : state.awayTeam.abbreviation;
}

function getDefenseAbbr(state: GameState): string {
  return state.possession === 'home'
    ? state.awayTeam.abbreviation
    : state.homeTeam.abbreviation;
}

// ============================================================================
// Helper: Format a player name for descriptions (e.g., "T. Brady")
// ============================================================================

function formatName(player: Player): string {
  const parts = player.name.split(' ');
  if (parts.length < 2) return player.name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

// ============================================================================
// Helper: Convert field position to a readable yard line string
// e.g., ballPosition 75 with possession by KC -> "KC 25" (opponent's 25)
// ballPosition 30 with possession by KC -> "KC 30" (own 30)
// ============================================================================

function fieldPositionToString(ballPosition: number, state: GameState): string {
  const offAbbr = getOffenseAbbr(state);
  const defAbbr = getDefenseAbbr(state);

  if (ballPosition === 50) {
    return 'midfield';
  }

  if (ballPosition < 50) {
    // On own side of the field
    return `${offAbbr} ${ballPosition}`;
  }

  // On opponent's side of the field
  const yardLine = 100 - ballPosition;
  return `${defAbbr} ${yardLine}`;
}

// ============================================================================
// Helper: Resolve clock time elapsed for a play
// ============================================================================

function resolveClockElapsed(
  clockKey: string,
  rng: SeededRNG,
  isTwoMinuteDrill: boolean,
): number {
  if (isTwoMinuteDrill && CLOCK_TIME['two_minute_drill']) {
    const range = CLOCK_TIME['two_minute_drill'];
    return rng.randomInt(range.min, range.max);
  }

  const range = CLOCK_TIME[clockKey];
  if (!range) {
    // Default fallback
    return rng.randomInt(20, 35);
  }

  return rng.randomInt(range.min, range.max);
}

// ============================================================================
// Helper: Check if we are in a two-minute drill situation
// ============================================================================

function isTwoMinuteDrill(state: GameState): boolean {
  return (state.quarter === 2 || state.quarter === 4) && state.clock <= 120;
}

// ============================================================================
// Helper: Determine the opposing team's possession key
// ============================================================================

function getOpposingPossession(state: GameState): 'home' | 'away' {
  return state.possession === 'home' ? 'away' : 'home';
}

// ============================================================================
// Helper: Build an empty base PlayResult shell
// ============================================================================

function baseResult(call: PlayCall): PlayResult {
  return {
    type: 'run',
    call,
    description: '',
    yardsGained: 0,
    passer: null,
    rusher: null,
    receiver: null,
    defender: null,
    turnover: null,
    penalty: null,
    injury: null,
    scoring: null,
    clockElapsed: 0,
    isClockStopped: false,
    isFirstDown: false,
    isTouchdown: false,
    isSafety: false,
  };
}

// ============================================================================
// Run Play Resolution
// ============================================================================

function resolveRunPlay(
  call: PlayCall,
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
  momentum: number,
): PlayResult {
  const result = baseResult(call);
  result.type = 'run';

  const rusher = getPlayerByPosition(offensePlayers, 'RB') ??
    getPlayerByPosition(offensePlayers, 'QB')!;
  result.rusher = rusher;

  // Base yards from gaussian distribution
  const yardDist = AVERAGE_YARDS[call] ?? AVERAGE_YARDS['run_inside'];
  let yards = rng.gaussian(yardDist.mean, yardDist.stdDev);

  // Apply momentum modifier
  yards *= (1 + momentum * MOMENTUM_MAX_EFFECT);

  // Apply team rating modifier: offense vs defense rating differential
  const offTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
  const defTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;
  const ratingDiff = (offTeam.offenseRating - defTeam.defenseRating) / 100;
  yards *= (1 + ratingDiff * 0.15);

  // Big play chance
  if (rng.probability(BIG_PLAY_RATE)) {
    yards += rng.randomInt(15, 30);
  }

  // Round to nearest integer
  yards = Math.round(yards);

  // Clamp: minimum -5, maximum to endzone
  const maxYards = 100 - state.ballPosition;
  yards = Math.max(-5, Math.min(yards, maxYards));

  result.yardsGained = yards;

  // Determine new position
  const newPosition = state.ballPosition + yards;

  // Touchdown check
  if (newPosition >= 100) {
    result.isTouchdown = true;
    result.yardsGained = maxYards;
    result.scoring = {
      type: 'touchdown',
      team: state.possession,
      points: 6,
      scorer: rusher,
    };
    result.isClockStopped = true;

    const direction = call === 'run_outside' ? 'around the edge' : 'up the middle';
    result.description =
      `${formatName(rusher)} rushes ${direction} for ${result.yardsGained} yards. TOUCHDOWN!`;
  } else if (newPosition <= 0) {
    // Safety check
    result.isSafety = true;
    result.scoring = {
      type: 'safety',
      team: getOpposingPossession(state),
      points: 2,
      scorer: null,
    };
    result.isClockStopped = true;

    result.description =
      `${formatName(rusher)} tackled in the end zone. SAFETY!`;
  } else {
    // Normal run play
    const direction = call === 'run_outside' ? 'off right tackle' : 'up the middle';
    const posStr = fieldPositionToString(newPosition, state);

    if (yards <= 0) {
      const defender = selectDefender(defensePlayers, rng);
      result.defender = defender;
      const defName = defender ? ` by ${formatName(defender)}` : '';
      result.description =
        `${formatName(rusher)} rushes ${direction} and is stopped${defName} for ${yards === 0 ? 'no gain' : `a loss of ${Math.abs(yards)}`} at the ${posStr}`;
    } else {
      result.description =
        `${formatName(rusher)} rushes ${direction} for ${yards} yard${yards !== 1 ? 's' : ''} to the ${posStr}`;
    }
  }

  // Fumble check (slightly elevated on run plays)
  if (!result.isTouchdown && !result.isSafety && rng.probability(FUMBLE_RATE * 1.1)) {
    const defenseRecovers = rng.probability(FUMBLE_RECOVERY_DEFENSE);
    if (defenseRecovers) {
      const defender = selectDefender(defensePlayers, rng);
      result.defender = defender;

      let returnYards = rng.randomInt(0, 20);
      const returnedForTD = rng.probability(FUMBLE_TD_RATE);
      if (returnedForTD) {
        returnYards = Math.max(returnYards, newPosition); // Return full distance
      }

      result.turnover = {
        type: 'fumble',
        recoveredBy: getOpposingPossession(state),
        returnYards,
        returnedForTD,
      };
      result.isClockStopped = true;

      const defName = defender ? formatName(defender) : 'the defense';
      result.description =
        `${formatName(rusher)} rushes and FUMBLES! Recovered by ${defName}` +
        (returnYards > 0 ? ` and returned ${returnYards} yards` : '') +
        (returnedForTD ? '. TOUCHDOWN!' : '');

      if (returnedForTD) {
        result.scoring = {
          type: 'fumble_recovery_td',
          team: getOpposingPossession(state),
          points: 6,
          scorer: defender,
        };
      }
    } else {
      // Offense recovers own fumble -- play result stands, just add description note
      result.description += ' (fumble recovered by the offense)';
    }
  }

  // First down check
  if (!result.turnover && !result.isTouchdown && !result.isSafety) {
    result.isFirstDown = result.yardsGained >= state.yardsToGo;
  }

  // Clock behavior: run plays keep clock running, unless out of bounds
  const outOfBounds = rng.probability(0.15);
  result.isClockStopped = result.isClockStopped || outOfBounds ||
    result.isTouchdown || result.isSafety || !!result.turnover;

  // Clock elapsed
  const inTwoMinDrill = isTwoMinuteDrill(state);
  result.clockElapsed = resolveClockElapsed('run_normal', rng, inTwoMinDrill);

  if (outOfBounds && !result.isTouchdown && !result.isSafety && !result.turnover) {
    result.description += ' and out of bounds';
  }

  return result;
}

// ============================================================================
// Pass Play Resolution
// ============================================================================

function resolvePassPlay(
  call: PlayCall,
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
  momentum: number,
): PlayResult {
  const result = baseResult(call);

  const passer = getQBOrFallback(offensePlayers);
  result.passer = passer;

  // Map call to completion rate key
  const passTypeMap: Record<string, keyof typeof COMPLETION_RATES> = {
    'pass_short': 'short',
    'pass_medium': 'medium',
    'pass_deep': 'deep',
    'screen_pass': 'screen',
  };
  const passType = passTypeMap[call] ?? 'short';

  // --------------------------------------------------------------------------
  // Scramble check: ~8% of pass plays the QB scrambles
  // --------------------------------------------------------------------------
  if (rng.probability(0.08)) {
    return resolveScramble(call, state, passer, offensePlayers, defensePlayers, rng, momentum);
  }

  // --------------------------------------------------------------------------
  // Sack check FIRST
  // --------------------------------------------------------------------------
  // Apply offensive line vs defensive line rating
  const offTeam = state.possession === 'home' ? state.homeTeam : state.awayTeam;
  const defTeam = state.possession === 'home' ? state.awayTeam : state.homeTeam;
  const lineDiff = (defTeam.defenseRating - offTeam.offenseRating) / 100;
  const adjustedSackRate = Math.max(0.01, Math.min(0.15, SACK_RATE + lineDiff * 0.03));

  if (rng.probability(adjustedSackRate)) {
    result.type = 'sack';
    const sackYardDist = AVERAGE_YARDS['sack'];
    let sackYards = Math.round(rng.gaussian(sackYardDist.mean, sackYardDist.stdDev));
    // Sacks are always negative
    sackYards = Math.min(-1, sackYards);

    result.yardsGained = sackYards;

    const defender = selectDefender(defensePlayers, rng);
    result.defender = defender;

    const newPosition = state.ballPosition + sackYards;

    // Safety check
    if (newPosition <= 0) {
      result.isSafety = true;
      result.scoring = {
        type: 'safety',
        team: getOpposingPossession(state),
        points: 2,
        scorer: defender,
      };
      result.isClockStopped = true;

      const defName = defender ? formatName(defender) : 'The defense';
      result.description =
        `${formatName(passer)} sacked by ${defName} in the end zone! SAFETY!`;
    } else {
      const posStr = fieldPositionToString(newPosition, state);
      const defName = defender ? formatName(defender) : 'the defense';
      result.description =
        `${formatName(passer)} sacked by ${defName} for a loss of ${Math.abs(sackYards)} yards to the ${posStr}`;
    }

    // Fumble on sack: 9% chance
    if (!result.isSafety && rng.probability(0.09)) {
      const defenseRecovers = rng.probability(FUMBLE_RECOVERY_DEFENSE);
      if (defenseRecovers) {
        let returnYards = rng.randomInt(0, 25);
        const returnedForTD = rng.probability(FUMBLE_TD_RATE);
        if (returnedForTD) {
          returnYards = Math.max(returnYards, Math.max(0, newPosition));
        }

        result.turnover = {
          type: 'fumble',
          recoveredBy: getOpposingPossession(state),
          returnYards,
          returnedForTD,
        };
        result.isClockStopped = true;

        const defName2 = defender ? formatName(defender) : 'the defense';
        result.description =
          `${formatName(passer)} sacked and FUMBLES! Recovered by ${defName2}` +
          (returnYards > 0 ? ` and returned ${returnYards} yards` : '') +
          (returnedForTD ? '. TOUCHDOWN!' : '');

        if (returnedForTD) {
          result.scoring = {
            type: 'fumble_recovery_td',
            team: getOpposingPossession(state),
            points: 6,
            scorer: defender,
          };
        }
      } else {
        result.description += ' (fumble recovered by the offense)';
      }
    }

    result.isClockStopped = result.isClockStopped || !!result.turnover;
    result.clockElapsed = resolveClockElapsed('sack', rng, isTwoMinuteDrill(state));

    return result;
  }

  // --------------------------------------------------------------------------
  // Completion check
  // --------------------------------------------------------------------------
  const receiver = selectReceiver(offensePlayers, rng);
  result.receiver = receiver;

  // Base completion rate with modifiers
  let completionRate: number = COMPLETION_RATES[passType];

  // QB rating modifier: +/- 5% based on QB rating relative to 80
  const qbModifier = (passer.rating - 80) / 100 * 0.05;
  completionRate += qbModifier;

  // Momentum modifier: +/- 3%
  completionRate += momentum * MOMENTUM_MAX_EFFECT;

  // Clamp between reasonable bounds
  completionRate = Math.max(0.15, Math.min(0.95, completionRate));

  if (rng.probability(completionRate)) {
    // --------------------------------------------------------------------------
    // COMPLETE PASS
    // --------------------------------------------------------------------------
    result.type = 'pass_complete';

    const yardDist = AVERAGE_YARDS[call] ?? AVERAGE_YARDS['pass_short'];
    let yards = rng.gaussian(yardDist.mean, yardDist.stdDev);

    // Apply momentum
    yards *= (1 + momentum * MOMENTUM_MAX_EFFECT);

    // Apply team ratings
    const ratingDiff = (offTeam.offenseRating - defTeam.defenseRating) / 100;
    yards *= (1 + ratingDiff * 0.10);

    // Big play chance on deep passes
    if (call === 'pass_deep' && rng.probability(0.08)) {
      yards += rng.randomInt(15, 30);
    } else if (rng.probability(BIG_PLAY_RATE)) {
      yards += rng.randomInt(15, 30);
    }

    // Round and clamp
    yards = Math.round(yards);
    const maxYards = 100 - state.ballPosition;
    yards = Math.max(0, Math.min(yards, maxYards));

    result.yardsGained = yards;

    const newPosition = state.ballPosition + yards;

    // Touchdown check
    if (newPosition >= 100) {
      result.isTouchdown = true;
      result.yardsGained = maxYards;
      result.scoring = {
        type: 'touchdown',
        team: state.possession,
        points: 6,
        scorer: receiver,
      };
      result.isClockStopped = true;

      const recName = receiver ? formatName(receiver) : 'the receiver';
      result.description =
        `${formatName(passer)} pass complete to ${recName} for ${result.yardsGained} yards. TOUCHDOWN!`;
    } else {
      const posStr = fieldPositionToString(newPosition, state);
      const recName = receiver ? formatName(receiver) : 'the receiver';
      result.description =
        `${formatName(passer)} pass complete to ${recName} for ${yards} yard${yards !== 1 ? 's' : ''} to the ${posStr}`;
    }

    // Fumble after catch
    if (!result.isTouchdown && rng.probability(FUMBLE_RATE * 0.8)) {
      const defenseRecovers = rng.probability(FUMBLE_RECOVERY_DEFENSE);
      if (defenseRecovers) {
        const defender = selectDefender(defensePlayers, rng);
        result.defender = defender;

        let returnYards = rng.randomInt(0, 20);
        const returnedForTD = rng.probability(FUMBLE_TD_RATE);
        if (returnedForTD) {
          returnYards = Math.max(returnYards, newPosition);
        }

        result.turnover = {
          type: 'fumble',
          recoveredBy: getOpposingPossession(state),
          returnYards,
          returnedForTD,
        };
        result.isClockStopped = true;

        const defName = defender ? formatName(defender) : 'the defense';
        const recName2 = receiver ? formatName(receiver) : 'the receiver';
        result.description =
          `${formatName(passer)} complete to ${recName2} who FUMBLES! Recovered by ${defName}` +
          (returnYards > 0 ? ` and returned ${returnYards} yards` : '') +
          (returnedForTD ? '. TOUCHDOWN!' : '');

        if (returnedForTD) {
          result.scoring = {
            type: 'fumble_recovery_td',
            team: getOpposingPossession(state),
            points: 6,
            scorer: defender,
          };
        }
      } else {
        result.description += ' (fumble recovered by the offense)';
      }
    }

    // First down check
    if (!result.turnover && !result.isTouchdown) {
      result.isFirstDown = result.yardsGained >= state.yardsToGo;
    }

    // Clock: completions keep clock running unless out of bounds
    const outOfBounds = rng.probability(0.15);
    result.isClockStopped = result.isClockStopped || outOfBounds ||
      result.isTouchdown || !!result.turnover;
    result.clockElapsed = resolveClockElapsed('pass_complete', rng, isTwoMinuteDrill(state));

    if (outOfBounds && !result.isTouchdown && !result.turnover) {
      result.description += ' and out of bounds';
    }
  } else {
    // --------------------------------------------------------------------------
    // INCOMPLETE PASS
    // --------------------------------------------------------------------------
    result.type = 'pass_incomplete';
    result.yardsGained = 0;
    result.isClockStopped = true;

    const recName = receiver ? formatName(receiver) : 'the receiver';

    // Interception check
    if (rng.probability(INTERCEPTION_RATE)) {
      result.type = 'pass_incomplete'; // Will be overridden by turnover

      const defender = selectDefender(defensePlayers, rng);
      result.defender = defender;

      let returnYards = rng.randomInt(0, 40);
      const returnedForTD = rng.probability(PICK_SIX_RATE);
      if (returnedForTD) {
        // Pick-six: return for the full distance
        returnYards = rng.randomInt(30, 80);
      }

      result.turnover = {
        type: 'interception',
        recoveredBy: getOpposingPossession(state),
        returnYards,
        returnedForTD,
      };

      const defName = defender ? formatName(defender) : 'a defender';
      result.description =
        `${formatName(passer)} pass intended for ${recName} is INTERCEPTED by ${defName}!` +
        (returnYards > 0 ? ` Returned ${returnYards} yards` : '') +
        (returnedForTD ? ' for a TOUCHDOWN!' : '');

      if (returnedForTD) {
        result.scoring = {
          type: 'pick_six',
          team: getOpposingPossession(state),
          points: 6,
          scorer: defender,
        };
      }
    } else {
      // Just an incomplete pass
      const incompleteDescriptions = [
        `${formatName(passer)} pass intended for ${recName} falls incomplete`,
        `${formatName(passer)} throws to ${recName}, pass is incomplete`,
        `${formatName(passer)} fires toward ${recName}, broken up incomplete`,
        `${formatName(passer)} looks for ${recName}, the pass sails incomplete`,
        `${formatName(passer)} pass to ${recName} is knocked away incomplete`,
      ];
      result.description = incompleteDescriptions[rng.randomInt(0, incompleteDescriptions.length - 1)];
    }

    result.clockElapsed = resolveClockElapsed('pass_incomplete', rng, isTwoMinuteDrill(state));
  }

  return result;
}

// ============================================================================
// Scramble Resolution
// ============================================================================

function resolveScramble(
  call: PlayCall,
  state: GameState,
  qb: Player,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
  momentum: number,
): PlayResult {
  const result = baseResult(call);
  result.type = 'scramble';
  result.rusher = qb;

  const yardDist = AVERAGE_YARDS['scramble'];
  let yards = rng.gaussian(yardDist.mean, yardDist.stdDev);

  // Momentum modifier
  yards *= (1 + momentum * MOMENTUM_MAX_EFFECT);

  // QB speed bonus: faster QBs scramble better
  const speedModifier = (qb.speed - 75) / 100 * 0.3;
  yards *= (1 + speedModifier);

  // Big play chance
  if (rng.probability(BIG_PLAY_RATE * 1.2)) {
    yards += rng.randomInt(10, 25);
  }

  yards = Math.round(yards);
  const maxYards = 100 - state.ballPosition;
  yards = Math.max(-5, Math.min(yards, maxYards));

  result.yardsGained = yards;
  const newPosition = state.ballPosition + yards;

  if (newPosition >= 100) {
    result.isTouchdown = true;
    result.yardsGained = maxYards;
    result.scoring = {
      type: 'touchdown',
      team: state.possession,
      points: 6,
      scorer: qb,
    };
    result.isClockStopped = true;
    result.description =
      `${formatName(qb)} scrambles out of the pocket and takes it ${result.yardsGained} yards for a TOUCHDOWN!`;
  } else if (newPosition <= 0) {
    result.isSafety = true;
    result.scoring = {
      type: 'safety',
      team: getOpposingPossession(state),
      points: 2,
      scorer: null,
    };
    result.isClockStopped = true;
    result.description =
      `${formatName(qb)} scrambles and is brought down in the end zone. SAFETY!`;
  } else {
    const posStr = fieldPositionToString(newPosition, state);
    if (yards <= 0) {
      result.description =
        `${formatName(qb)} scrambles out of the pocket for ${yards === 0 ? 'no gain' : `a loss of ${Math.abs(yards)}`} at the ${posStr}`;
    } else {
      result.description =
        `${formatName(qb)} scrambles out of the pocket for ${yards} yard${yards !== 1 ? 's' : ''} to the ${posStr}`;
    }
  }

  // First down check
  if (!result.isTouchdown && !result.isSafety) {
    result.isFirstDown = result.yardsGained >= state.yardsToGo;
  }

  // Fumble check on scramble
  if (!result.isTouchdown && !result.isSafety && rng.probability(FUMBLE_RATE * 1.3)) {
    const defenseRecovers = rng.probability(FUMBLE_RECOVERY_DEFENSE);
    if (defenseRecovers) {
      const defender = selectDefender(defensePlayers, rng);
      result.defender = defender;
      let returnYards = rng.randomInt(0, 20);
      const returnedForTD = rng.probability(FUMBLE_TD_RATE);
      if (returnedForTD) returnYards = Math.max(returnYards, newPosition);

      result.turnover = {
        type: 'fumble',
        recoveredBy: getOpposingPossession(state),
        returnYards,
        returnedForTD,
      };
      result.isClockStopped = true;

      const defName = defender ? formatName(defender) : 'the defense';
      result.description =
        `${formatName(qb)} scrambles and FUMBLES! Recovered by ${defName}` +
        (returnYards > 0 ? ` and returned ${returnYards} yards` : '') +
        (returnedForTD ? '. TOUCHDOWN!' : '');

      if (returnedForTD) {
        result.scoring = {
          type: 'fumble_recovery_td',
          team: getOpposingPossession(state),
          points: 6,
          scorer: defender,
        };
      }
    } else {
      result.description += ' (fumble recovered by the offense)';
    }
  }

  const outOfBounds = rng.probability(0.25); // QB scrambles go OOB more often
  result.isClockStopped = result.isClockStopped || outOfBounds ||
    result.isTouchdown || result.isSafety || !!result.turnover;
  result.clockElapsed = resolveClockElapsed('run_normal', rng, isTwoMinuteDrill(state));

  if (outOfBounds && !result.isTouchdown && !result.isSafety && !result.turnover) {
    result.description += ' and steps out of bounds';
  }

  return result;
}

// ============================================================================
// Punt Resolution
// ============================================================================

function resolvePunt(
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('punt');
  result.type = 'punt';
  result.isClockStopped = true;

  const punter = getPlayerByPosition(offensePlayers, 'P');

  let puntDistance = Math.round(rng.gaussian(PUNT_DISTANCE_MEAN, PUNT_DISTANCE_STDDEV, 20, 70));

  // Calculate landing position from kicking team's perspective
  const landingPosition = state.ballPosition + puntDistance;

  // If punt would go into endzone, touchback
  if (landingPosition >= 100) {
    puntDistance = 100 - state.ballPosition;
    result.yardsGained = puntDistance;
    result.description = punter
      ? `${formatName(punter)} punts ${puntDistance} yards into the end zone for a touchback`
      : `Punt of ${puntDistance} yards into the end zone for a touchback`;
  } else {
    // Fair catch check
    if (rng.probability(FAIR_CATCH_RATE)) {
      result.yardsGained = puntDistance;
      const posStr = fieldPositionToString(landingPosition, state);
      result.description = punter
        ? `${formatName(punter)} punts ${puntDistance} yards. Fair catch at the ${posStr}`
        : `Punt of ${puntDistance} yards. Fair catch at the ${posStr}`;
    } else {
      // Return
      const returnYards = Math.round(
        rng.gaussian(PUNT_RETURN_MEAN, PUNT_RETURN_STDDEV, 0, 50)
      );
      const netPunt = puntDistance - returnYards;
      result.yardsGained = netPunt;
      result.description = punter
        ? `${formatName(punter)} punts ${puntDistance} yards, returned ${returnYards} yards`
        : `Punt of ${puntDistance} yards, returned ${returnYards} yards`;
    }
  }

  result.clockElapsed = resolveClockElapsed('punt', rng, isTwoMinuteDrill(state));

  return result;
}

// ============================================================================
// Field Goal Resolution
// ============================================================================

function resolveFieldGoal(
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('field_goal');
  result.type = 'field_goal';
  result.isClockStopped = true;

  const kicker = getPlayerByPosition(offensePlayers, 'K');
  const distance = calculateFieldGoalDistance(state.ballPosition);

  // Get base accuracy and adjust for kicker rating
  let accuracy = getFieldGoalAccuracy(distance);
  if (kicker) {
    const kickerMod = (kicker.rating - 80) / 100 * 0.05;
    accuracy = Math.max(0.05, Math.min(0.99, accuracy + kickerMod));
  }

  const kickerName = kicker ? formatName(kicker) : 'The kicker';

  if (rng.probability(accuracy)) {
    // GOOD
    result.yardsGained = 0;
    result.scoring = {
      type: 'field_goal',
      team: state.possession,
      points: 3,
      scorer: kicker,
    };
    result.description = `${kickerName} ${distance}-yard field goal attempt is GOOD!`;
  } else {
    // MISSED
    result.yardsGained = 0;
    result.description = `${kickerName} ${distance}-yard field goal attempt is NO GOOD!`;
  }

  result.clockElapsed = resolveClockElapsed('field_goal', rng, isTwoMinuteDrill(state));

  return result;
}

// ============================================================================
// Extra Point Resolution
// ============================================================================

function resolveExtraPoint(
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('extra_point');
  result.type = 'extra_point';
  result.isClockStopped = true;

  const kicker = getPlayerByPosition(offensePlayers, 'K');
  const kickerName = kicker ? formatName(kicker) : 'The kicker';

  if (rng.probability(EXTRA_POINT_RATE)) {
    result.scoring = {
      type: 'extra_point',
      team: state.possession,
      points: 1,
      scorer: kicker,
    };
    result.description = `${kickerName} extra point is GOOD`;
  } else {
    result.description = `${kickerName} extra point attempt is NO GOOD`;
  }

  result.yardsGained = 0;
  result.clockElapsed = 0; // PATs don't consume game clock

  return result;
}

// ============================================================================
// Two-Point Conversion Resolution
// ============================================================================

function resolveTwoPoint(
  call: PlayCall,
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult(call);
  result.type = 'two_point';
  result.isClockStopped = true;
  result.yardsGained = 0;
  result.clockElapsed = 0; // Two-point conversions don't consume game clock

  const isRun = call === 'two_point_run';

  if (isRun) {
    const rusher = getPlayerByPosition(offensePlayers, 'RB') ??
      getPlayerByPosition(offensePlayers, 'QB')!;
    result.rusher = rusher;

    if (rng.probability(TWO_POINT_CONVERSION_RATE)) {
      result.scoring = {
        type: 'two_point_conversion',
        team: state.possession,
        points: 2,
        scorer: rusher,
      };
      result.description =
        `Two-point conversion: ${formatName(rusher)} rushes into the end zone. GOOD!`;
    } else {
      result.description =
        `Two-point conversion: ${formatName(rusher)} is stopped short. NO GOOD`;
    }
  } else {
    const passer = getQBOrFallback(offensePlayers);
    const receiver = selectReceiver(offensePlayers, rng);
    result.passer = passer;
    result.receiver = receiver;

    const recName = receiver ? formatName(receiver) : 'the receiver';

    if (rng.probability(TWO_POINT_CONVERSION_RATE)) {
      result.scoring = {
        type: 'two_point_conversion',
        team: state.possession,
        points: 2,
        scorer: receiver,
      };
      result.description =
        `Two-point conversion: ${formatName(passer)} finds ${recName} in the end zone. GOOD!`;
    } else {
      result.description =
        `Two-point conversion: ${formatName(passer)} pass to ${recName} is incomplete. NO GOOD`;
    }
  }

  return result;
}

// ============================================================================
// Kickoff Resolution
// ============================================================================

function resolveKickoff(
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('kickoff_normal');
  result.type = 'kickoff';
  result.isClockStopped = true;

  const kicker = getPlayerByPosition(offensePlayers, 'K');

  if (rng.probability(TOUCHBACK_RATE)) {
    // Touchback
    result.yardsGained = 0;
    const kickerName = kicker ? formatName(kicker) : 'Kickoff';
    result.description = `${kickerName} kicks it deep. Touchback. Ball at the 25-yard line`;
    result.clockElapsed = resolveClockElapsed('kickoff', rng, false);
    return result;
  }

  // Return
  let returnYards = Math.round(
    rng.gaussian(KICKOFF_RETURN_MEAN, KICKOFF_RETURN_STDDEV, 5, 60)
  );

  // Rare chance of a huge return
  if (rng.probability(0.02)) {
    returnYards = rng.randomInt(60, 100);
  }

  result.yardsGained = returnYards;

  const isTD = returnYards >= 100;
  if (isTD) {
    result.yardsGained = 100;
    result.isTouchdown = true;
    result.scoring = {
      type: 'touchdown',
      team: getOpposingPossession(state), // The return team scores
      points: 6,
      scorer: null,
    };
    result.description = 'Kickoff returned all the way for a TOUCHDOWN!';
  } else {
    const kickerName = kicker ? formatName(kicker) : 'Kickoff';
    result.description =
      `${kickerName} kicks off, returned ${returnYards} yards`;
  }

  result.clockElapsed = resolveClockElapsed('kickoff', rng, false);

  return result;
}

// ============================================================================
// Onside Kick Resolution
// ============================================================================

function resolveOnsideKick(
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('onside_kick');
  result.type = 'kickoff';
  result.isClockStopped = true;

  const kicker = getPlayerByPosition(offensePlayers, 'K');
  const kickerName = kicker ? formatName(kicker) : 'The kicker';

  if (rng.probability(ONSIDE_KICK_RECOVERY)) {
    // Kicking team recovers!
    result.description =
      `${kickerName} onside kick and it's RECOVERED by the kicking team!`;
    result.yardsGained = 10; // Onside kicks travel ~10 yards
  } else {
    result.description =
      `${kickerName} onside kick attempt is picked up by the receiving team`;
    result.yardsGained = 10;
  }

  result.clockElapsed = resolveClockElapsed('kickoff', rng, false);

  return result;
}

// ============================================================================
// Kneel Resolution
// ============================================================================

function resolveKneel(
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('kneel');
  result.type = 'kneel';

  const qb = getPlayerByPosition(offensePlayers, 'QB')!;
  result.rusher = qb;
  result.yardsGained = -1;
  result.isClockStopped = false;
  result.description = `${formatName(qb)} takes a knee`;
  result.clockElapsed = resolveClockElapsed('kneel', rng, false);

  return result;
}

// ============================================================================
// Spike Resolution
// ============================================================================

function resolveSpike(
  state: GameState,
  offensePlayers: Player[],
  rng: SeededRNG,
): PlayResult {
  const result = baseResult('spike');
  result.type = 'spike';

  const qb = getQBOrFallback(offensePlayers);
  result.passer = qb;
  result.yardsGained = 0;
  result.isClockStopped = true;
  result.description = `${formatName(qb)} spikes the ball to stop the clock`;
  result.clockElapsed = resolveClockElapsed('spike', rng, true);

  return result;
}

// ============================================================================
// Main: resolvePlay
// ============================================================================

export function resolvePlay(
  call: PlayCall,
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  rng: SeededRNG,
  momentum: number,
): PlayResult {
  switch (call) {
    // ---- Run plays ----
    case 'run_inside':
    case 'run_outside':
      return resolveRunPlay(call, state, offensePlayers, defensePlayers, rng, momentum);

    // ---- Pass plays ----
    case 'pass_short':
    case 'pass_medium':
    case 'pass_deep':
    case 'screen_pass':
      return resolvePassPlay(call, state, offensePlayers, defensePlayers, rng, momentum);

    // ---- Special teams ----
    case 'punt':
      return resolvePunt(state, offensePlayers, defensePlayers, rng);

    case 'field_goal':
      return resolveFieldGoal(state, offensePlayers, rng);

    case 'extra_point':
      return resolveExtraPoint(state, offensePlayers, rng);

    case 'two_point_run':
    case 'two_point_pass':
      return resolveTwoPoint(call, state, offensePlayers, rng);

    case 'kickoff_normal':
    case 'kickoff':
      return resolveKickoff(state, offensePlayers, defensePlayers, rng);

    case 'onside_kick':
      return resolveOnsideKick(state, offensePlayers, rng);

    // ---- Clock management ----
    case 'kneel':
      return resolveKneel(state, offensePlayers, rng);

    case 'spike':
      return resolveSpike(state, offensePlayers, rng);

    default: {
      // Fallback: treat unknown calls as a run play
      const _exhaustiveCheck: never = call;
      return resolveRunPlay('run_inside', state, offensePlayers, defensePlayers, rng, momentum);
    }
  }
}
