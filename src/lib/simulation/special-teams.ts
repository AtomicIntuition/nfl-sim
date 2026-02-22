// ============================================================================
// GridIron Live - Special Teams Engine
// ============================================================================
// Handles all kicking and special teams plays: kickoffs, punts, field goals,
// extra points, two-point conversions, and onside kicks. Each play type
// generates vivid broadcast-style descriptions and resolves field position,
// scoring, and clock effects.
// ============================================================================

import {
  GameState,
  PlayResult,
  PlayCall,
  ScoringResult,
  Player,
  SeededRNG,
} from './types';
import type { WeatherModifiers } from './engine';
import * as C from './constants';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Format a yard line into a human-readable label. */
function yardLineLabel(position: number): string {
  if (position <= 0) return 'the end zone';
  if (position >= 100) return 'the end zone';
  if (position === 50) return 'midfield';
  return `the ${position}-yard line`;
}

/** Build a base PlayResult with sensible defaults for special teams. */
function basePlayResult(
  type: PlayResult['type'],
  call: PlayResult['call']
): PlayResult {
  return {
    type,
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
    isClockStopped: true,
    isFirstDown: false,
    isTouchdown: false,
    isSafety: false,
  };
}

/** Get the kicker's name for descriptions, or a generic label. */
function kickerName(kicker: Player | null): string {
  return kicker ? kicker.name : 'the kicker';
}

/** Clamp a value between min and max (inclusive). */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// KICKOFF
// ============================================================================

/**
 * Resolve a kickoff play.
 *
 * Touchback rate: ~40% of kickoffs result in a touchback (ball placed
 * at the receiving team's own 25-yard line). Otherwise, the return
 * team fields the kick and returns it. Return distance follows a
 * Gaussian distribution: mean 23 yards, stddev 12, range 5-98.
 *
 * After any kickoff, the game clock elapsed is minimal (5-8 seconds)
 * and the clock is stopped for the change of possession.
 */
export function resolveKickoff(
  state: GameState,
  rng: SeededRNG,
  kicker: Player | null,
  weatherMods?: WeatherModifiers,
  returner?: Player | null,
): PlayResult {
  const result = basePlayResult('kickoff', 'kickoff_normal');
  const name = kickerName(kicker);
  const returnerName = returner ? returner.name : 'the returner';

  // Clock: kickoffs consume 5-8 seconds, clock stops for possession change
  result.clockElapsed = rng.randomInt(
    C.CLOCK_TIME.kickoff.min,
    C.CLOCK_TIME.kickoff.max
  );
  result.isClockStopped = true;

  // --- Existing RNG draw order preserved: touchback → OOB → fair catch → return yards ---

  // Touchback check (wind reduces touchback rate)
  const touchbackRate = weatherMods && weatherMods.puntDistanceMod < -3
    ? C.TOUCHBACK_RATE * 0.90
    : C.TOUCHBACK_RATE;
  if (rng.probability(touchbackRate)) {
    result.type = 'touchback';
    result.yardsGained = 0;
    // Generate kickoff meta even for touchbacks
    const kickDistance = rng.randomInt(62, 72);
    const hangTime = rng.randomFloat(3.8, 4.5);
    result.kickoffMeta = { distance: kickDistance, hangTime, catchSpot: 0 };
    const tbDescs = [
      `${name} kicks it deep... taken in the end zone for a touchback. Ball at the 25-yard line.`,
      `${name} boots it through the end zone. Touchback. Ball on the 25.`,
      `Big leg from ${name}. Into the end zone, no return. Touchback.`,
      `${name} sends it sky-high into the end zone. Smart to take a knee. Ball at the 25.`,
      `${name} with a booming kickoff. Touchback. ${returnerName} wisely stays put.`,
    ];
    result.description = tbDescs[rng.randomInt(0, tbDescs.length - 1)];
    return result;
  }

  // Kickoff out of bounds check (~3%)
  if (rng.probability(C.KICKOFF_OOB_RATE)) {
    result.yardsGained = 0; // engine will use KICKOFF_OOB_POSITION
    result.call = 'kickoff_normal';
    result.description =
      `${name} kicks it off and it sails out of bounds! Penalty on the ` +
      `kicking team. Receiving team gets the ball at their own 40-yard line.`;
    (result as PlayResult & { kickoffOOB?: boolean }).kickoffOOB = true;
    return result;
  }

  // Fair catch on kickoff (~15%) — ball dead at catch spot, first-and-10
  if (rng.probability(C.KICKOFF_FAIR_CATCH_RATE)) {
    const catchSpot = rng.randomInt(15, 30);
    const kickDistance = rng.randomInt(55, 65);
    const hangTime = rng.randomFloat(3.5, 4.2);
    result.yardsGained = catchSpot;
    result.kickoffMeta = { distance: kickDistance, hangTime, catchSpot };
    result.description =
      `${name} kicks it deep. ${returnerName} waves for a fair catch at ` +
      `${yardLineLabel(catchSpot)}. Ball is dead right there, first-and-10.`;
    (result as PlayResult & { kickoffFairCatch?: boolean }).kickoffFairCatch = true;
    return result;
  }

  // Live return — wider range allows short and long returns
  const returnYards = Math.round(
    rng.gaussian(C.KICKOFF_RETURN_MEAN, C.KICKOFF_RETURN_STDDEV, 5, 98)
  );

  // --- New RNG draws AFTER existing draws (preserves downstream determinism) ---

  // Kickoff metadata for visualization
  const kickDistance = rng.randomInt(58, 70);
  const hangTime = rng.randomFloat(3.4, 4.3);
  const catchSpot = rng.randomInt(2, 12);
  result.kickoffMeta = { distance: kickDistance, hangTime, catchSpot };

  // Kickoff return TD check: when return is very long, roll for TD
  if (returnYards >= 80 && rng.probability(C.KICKOFF_RETURN_TD_RATE / (1 - C.TOUCHBACK_RATE))) {
    result.yardsGained = 100;
    result.isTouchdown = true;
    result.scoring = {
      type: 'touchdown',
      team: state.possession === 'home' ? 'away' : 'home',
      points: 6,
      scorer: returner ?? null,
    };
    const tdDescs = [
      `${name} kicks it deep... ${returnerName} fields it at the ${catchSpot}... he's got a wall! ` +
        `BREAKS ONE TACKLE! TO THE 40! THE 50! HE'S GONE! KICKOFF RETURN TOUCHDOWN!`,
      `${name} sends it end over end... ${returnerName} catches it, finds a seam... ` +
        `NOBODY IS GOING TO CATCH HIM! ALL THE WAY! KICKOFF RETURN FOR A TOUCHDOWN!`,
    ];
    result.description = tdDescs[rng.randomInt(0, tdDescs.length - 1)];
    return result;
  }

  result.yardsGained = returnYards;

  // 6-tier description system
  if (returnYards < 15) {
    // Stuffed
    const descs = [
      `${name} kicks it to the ${catchSpot}. ${returnerName} is swarmed immediately -- stuffed after just ${returnYards} yards.`,
      `${name} sends it deep. ${returnerName} picks it up... and the coverage is ALL over him. ${returnYards}-yard return, stopped cold.`,
      `Short return for ${returnerName}. Only ${returnYards} yards -- the coverage unit was flying downfield.`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  } else if (returnYards < 25) {
    // Average
    const descs = [
      `${name} kicks it away. Return of ${returnYards} yards by ${returnerName}, brought down around ${yardLineLabel(returnYards)}.`,
      `${name} boots it deep. ${returnerName} returns it ${returnYards} yards. Standard start.`,
      `${returnerName} fields the kick and gets ${returnYards} yards before being tackled.`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  } else if (returnYards < 35) {
    // Good
    const descs = [
      `${name} kicks it off. ${returnerName} finds a lane and picks up ${returnYards} yards! Nice start for the offense.`,
      `${returnerName} with a good return! ${returnYards} yards. The wedge opened up a crease.`,
      `${name} sends it deep. ${returnerName} cuts upfield for a ${returnYards}-yard return. Good field position.`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  } else if (returnYards < 50) {
    // Big
    const descs = [
      `${name} kicks it deep. Fielded at the ${catchSpot}... and ${returnerName}'s got room! ` +
        `Breaks a tackle, cuts to the sideline -- finally brought down after a ${returnYards}-yard return!`,
      `${returnerName} HAS A SEAM! ${returnYards} yards on the return! Big play by the return unit!`,
      `Watch out! ${returnerName} makes a man miss and bursts for ${returnYards} yards! What a return!`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  } else if (returnYards < 80) {
    // Explosive
    const descs = [
      `${returnerName} BREAKS FREE! ${returnYards} yards on the return! He was finally brought down inside the ${100 - returnYards}!`,
      `HUGE return by ${returnerName}! ${returnYards} yards! Breaking tackles left and right!`,
      `${returnerName} IS LOOSE! ${returnYards} yards before they can haul him down! What a start!`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  } else {
    // House call (near-TD distance but didn't hit the TD roll)
    const descs = [
      `${returnerName} takes it ${returnYards} yards! He was THIS close to taking it all the way! Incredible return!`,
      `WHAT A RETURN! ${returnerName} goes ${returnYards} yards! Finally tripped up just short of the end zone!`,
    ];
    result.description = descs[rng.randomInt(0, descs.length - 1)];
  }

  return result;
}

// ============================================================================
// ONSIDE KICK
// ============================================================================

/**
 * Resolve an onside kick attempt.
 *
 * Onside kicks are recovered by the kicking team only 10% of the time
 * in the modern NFL (post-2018 rule changes). The ball is spotted
 * around the 45-50 yard line area on a successful recovery, and
 * around the receiving team's 45-50 on a failed attempt.
 */
export function resolveOnsideKick(
  state: GameState,
  rng: SeededRNG,
  kicker: Player | null
): PlayResult {
  const result = basePlayResult('kickoff', 'onside_kick');
  const name = kickerName(kicker);

  result.clockElapsed = rng.randomInt(
    C.CLOCK_TIME.kickoff.min,
    C.CLOCK_TIME.kickoff.max
  );
  result.isClockStopped = true;

  if (rng.probability(C.ONSIDE_KICK_RECOVERY)) {
    // Kicking team recovers!
    const recoverySpot = rng.randomInt(45, 50);
    result.yardsGained = recoverySpot;
    result.description =
      `${name} with the onside kick! The ball bounces... IT'S RECOVERED ` +
      `BY THE KICKING TEAM! They pounce on it at ${yardLineLabel(recoverySpot)}! ` +
      `What a play!`;
    // Use dedicated flag for onside kick recovery (not isFirstDown)
    (result as PlayResult & { onsideKickRecovered?: boolean }).onsideKickRecovered = true;
  } else {
    // Receiving team recovers (most likely outcome)
    const recoverySpot = rng.randomInt(45, 55);
    result.yardsGained = recoverySpot;
    result.description =
      `${name} tries the onside kick... and the receiving team smothers it ` +
      `right away at ${yardLineLabel(recoverySpot)}. No surprise there -- ` +
      `those are so hard to pull off in today's game.`;
  }

  return result;
}

// ============================================================================
// PUNT
// ============================================================================

/**
 * Resolve a punt play.
 *
 * Punt distance follows a Gaussian distribution: mean 45 yards,
 * stddev 6, range 25-65. After the punt, the return team either
 * calls a fair catch (55%) or returns the ball (gaussian mean 9,
 * stddev 5, range 0-30). A 2% muffed punt check is also applied.
 *
 * The resulting ball position is calculated from the receiving
 * team's perspective after the possession change.
 */
export function resolvePunt(
  state: GameState,
  rng: SeededRNG,
  punter: Player | null,
  weatherMods?: WeatherModifiers,
): PlayResult {
  const result = basePlayResult('punt', 'punt');
  const name = punter ? punter.name : 'the punter';

  result.clockElapsed = rng.randomInt(
    C.CLOCK_TIME.punt.min,
    C.CLOCK_TIME.punt.max
  );
  result.isClockStopped = true;

  // Calculate punt distance (weather affects distance)
  const puntMean = C.PUNT_DISTANCE_MEAN + (weatherMods?.puntDistanceMod ?? 0);
  const puntDistance = Math.round(
    rng.gaussian(puntMean, C.PUNT_DISTANCE_STDDEV, 25, 65)
  );

  // Where the ball lands from the receiving team's perspective:
  // Current team punts from ballPosition, ball travels puntDistance toward
  // the opponent's side. Landing spot = ballPosition + puntDistance.
  // But we cap it -- if it goes into/past the end zone, it's a touchback.
  const landingSpot = state.ballPosition + puntDistance;

  // Touchback on punt (ball goes into or past the end zone)
  if (landingSpot >= C.ENDZONE_END) {
    result.yardsGained = puntDistance;
    result.description =
      `${name} booms it ${puntDistance} yards... and it sails into the end zone. ` +
      `Touchback. Receiving team takes over at their own 20.`;
    return result;
  }

  // Muffed punt check (2%)
  if (rng.probability(C.MUFFED_PUNT_RATE)) {
    // The punt traveled but was muffed at the landing spot
    result.yardsGained = puntDistance;
    result.turnover = {
      type: 'muffed_punt',
      recoveredBy: state.possession, // kicking team recovers
      returnYards: 0,
      returnedForTD: false,
    };
    result.description =
      `${name} punts it ${puntDistance} yards... and THE RETURNER DROPS IT! ` +
      `The ball is loose! The kicking team dives on it at ` +
      `${yardLineLabel(landingSpot)}! What a special teams blunder!`;
    return result;
  }

  // Fair catch check (55%)
  if (rng.probability(C.FAIR_CATCH_RATE)) {
    result.yardsGained = puntDistance;
    result.description =
      `${name} gets off a ${puntDistance}-yard punt. Fair catch signal... ` +
      `and he waves for the fair catch at ${yardLineLabel(C.FIELD_LENGTH - landingSpot)}.`;
    return result;
  }

  // Live return
  const returnYards = Math.round(
    rng.gaussian(C.PUNT_RETURN_MEAN, C.PUNT_RETURN_STDDEV, 0, 30)
  );
  result.yardsGained = puntDistance - returnYards; // net punt yardage

  if (returnYards >= 20) {
    result.description =
      `${name} punts it ${puntDistance} yards. Fielded on the bounce... ` +
      `he's got room! Cuts across the field -- ${returnYards}-yard return! ` +
      `That'll give the offense some extra real estate.`;
  } else if (returnYards >= 10) {
    result.description =
      `${name} sends a ${puntDistance}-yard punt downfield. Returned ` +
      `${returnYards} yards before the coverage unit brings him down.`;
  } else if (returnYards > 0) {
    result.description =
      `${name} punts it ${puntDistance} yards. Short return of ` +
      `${returnYards} yards -- the coverage was right there.`;
  } else {
    result.description =
      `${name} gets off a ${puntDistance}-yard punt. Fielded and immediately ` +
      `swarmed by the coverage team. No return.`;
  }

  return result;
}

// ============================================================================
// FIELD GOAL
// ============================================================================

/**
 * Calculate field goal distance from ball position.
 *
 * The NFL field goal distance includes:
 * - Yards from the ball to the end zone: (100 - ballPosition)
 * - 17 yards for the snap (7 yards) + hold position + end zone depth (10 yards)
 *
 * Example: ball at the opponent's 23 (position=77) = 100-77+17 = 40-yard FG.
 */
export function fieldGoalDistance(ballPosition: number): number {
  return C.FIELD_LENGTH - ballPosition + 17;
}

/**
 * Resolve a field goal attempt.
 *
 * Accuracy is determined by distance using the FIELD_GOAL_ACCURACY_BY_DISTANCE
 * lookup table from constants. If made, 3 points are scored and the next play
 * is a kickoff. If missed, the opposing team gets the ball at the spot of the
 * kick (or their own 20, whichever is further from their own goal line).
 */
export function resolveFieldGoal(
  state: GameState,
  rng: SeededRNG,
  kicker: Player | null,
  weatherMods?: WeatherModifiers,
): PlayResult {
  const result = basePlayResult('field_goal', 'field_goal');
  const name = kickerName(kicker);
  const distance = fieldGoalDistance(state.ballPosition);

  result.clockElapsed = rng.randomInt(
    C.CLOCK_TIME.field_goal.min,
    C.CLOCK_TIME.field_goal.max
  );
  result.isClockStopped = true;

  // Get base accuracy and apply kicker rating modifier
  let accuracy = C.getFieldGoalAccuracy(distance);

  // Slight modifier based on kicker rating (if available)
  if (kicker) {
    const ratingBonus = (kicker.rating - 80) * 0.002; // +/-0.04 max for elite/poor kickers
    accuracy = clamp(accuracy + ratingBonus, 0, 1);
  }

  // Weather modifier on FG accuracy (wind, rain, snow reduce accuracy)
  if (weatherMods) {
    accuracy *= weatherMods.fieldGoalMod;
    accuracy = clamp(accuracy, 0, 1);
  }

  const isMade = rng.probability(accuracy);

  if (isMade) {
    // Field goal is GOOD
    const scoringTeam = state.possession;
    result.scoring = {
      type: 'field_goal',
      team: scoringTeam,
      points: 3,
      scorer: kicker,
    };
    result.yardsGained = 0;

    if (distance >= 50) {
      result.description =
        `${distance}-yard field goal attempt by ${name}... the snap, the hold, ` +
        `the kick is up and it has the distance... IT'S GOOD! What a boot! ` +
        `${distance} yards right through the uprights!`;
    } else if (distance >= 40) {
      result.description =
        `${distance}-yard field goal attempt by ${name}... the snap is down, ` +
        `kick is up... IT'S GOOD! Right down the middle from ${distance} yards.`;
    } else {
      result.description =
        `${name} lines up the ${distance}-yard chip shot... the snap... ` +
        `the kick... GOOD! Three points on the board.`;
    }
  } else {
    // Field goal MISSED
    result.yardsGained = 0;

    // Miss descriptions vary
    const missType = rng.randomInt(0, 2);
    const missLabel =
      missType === 0 ? 'Wide right' : missType === 1 ? 'Wide left' : 'No good';

    if (distance >= 50) {
      result.description =
        `The snap... the kick... ${name} tries it from ${distance} yards... ` +
        `NO GOOD! ${missLabel} from ${distance} yards! He just didn't have enough.`;
    } else if (distance >= 40) {
      result.description =
        `${distance}-yard field goal attempt by ${name}... the snap, ` +
        `the hold, the kick... ${missLabel}! Missed from ${distance} yards!`;
    } else {
      result.description =
        `${name} with the ${distance}-yard attempt... and he MISSES it! ` +
        `${missLabel}! You have to make those.`;
    }
  }

  return result;
}

// ============================================================================
// EXTRA POINT (PAT)
// ============================================================================

/**
 * Resolve an extra point attempt.
 *
 * 94% success rate from the 15-yard line (33-yard kick).
 * If made: 1 point. If missed: 0 points.
 * After the attempt, the next play is always a kickoff.
 */
export function resolveExtraPoint(
  state: GameState,
  rng: SeededRNG,
  kicker: Player | null
): PlayResult {
  const result = basePlayResult('extra_point', 'extra_point');
  const name = kickerName(kicker);

  // Extra points consume minimal clock (snap + kick)
  result.clockElapsed = 0; // PATs don't consume game clock
  result.isClockStopped = true;

  let accuracy = C.EXTRA_POINT_RATE;

  // Slight kicker rating modifier
  if (kicker) {
    const ratingBonus = (kicker.rating - 80) * 0.001;
    accuracy = clamp(accuracy + ratingBonus, 0, 1);
  }

  if (rng.probability(accuracy)) {
    // Extra point is good
    result.scoring = {
      type: 'extra_point',
      team: state.possession,
      points: 1,
      scorer: kicker,
    };
    result.description = `${name} for the extra point... GOOD. The PAT is up and through.`;
  } else {
    // Missed extra point
    result.description =
      `${name} for the extra point... NO GOOD! The kick drifts wide! ` +
      `That missed PAT could come back to haunt them.`;
  }

  return result;
}

// ============================================================================
// TWO-POINT CONVERSION
// ============================================================================

/**
 * Resolve a two-point conversion attempt.
 *
 * 48% success rate. Can be called as either a run or a pass.
 * If successful: 2 points. If failed: 0 points.
 * The ball is placed at the 2-yard line for the attempt.
 */
export function resolveTwoPoint(
  call: PlayCall,
  state: GameState,
  rng: SeededRNG,
  players: Player[]
): PlayResult {
  const isRun = call === 'two_point_run';
  const result = basePlayResult('two_point', call);

  result.clockElapsed = 0; // Two-point attempts don't consume game clock
  result.isClockStopped = true;

  // Find relevant players from the roster
  const qb = players.find((p) => p.position === 'QB') ?? null;
  const rb = players.find((p) => p.position === 'RB') ?? null;
  const wr = players.find((p) => p.position === 'WR') ?? null;
  const te = players.find((p) => p.position === 'TE') ?? null;

  const successRate = isRun ? C.TWO_POINT_RUN_RATE : C.TWO_POINT_PASS_RATE;
  if (rng.probability(successRate)) {
    // Conversion successful!
    result.scoring = {
      type: 'two_point_conversion',
      team: state.possession,
      points: 2,
      scorer: null,
    };
    result.yardsGained = 2;
    result.isTouchdown = false; // Technically not a TD, but a conversion

    if (isRun) {
      const runner = rb;
      result.rusher = runner;
      result.scoring.scorer = runner;
      const runnerName = runner ? runner.name : 'the running back';
      result.description =
        `Two-point attempt -- handoff to ${runnerName}... he drives forward... ` +
        `HE'S IN! Two-point conversion is GOOD! What a gutsy call!`;
    } else {
      result.passer = qb;
      const target = wr ?? te;
      result.receiver = target;
      result.scoring.scorer = target;
      const qbName = qb ? qb.name : 'the quarterback';
      const targetName = target ? target.name : 'the receiver';
      result.description =
        `Two-point try -- ${qbName} takes the snap, fires to ${targetName} ` +
        `in the end zone... CAUGHT! Two-point conversion is GOOD!`;
    }
  } else {
    // Conversion failed
    result.yardsGained = 0;

    if (isRun) {
      const runner = rb;
      result.rusher = runner;
      const runnerName = runner ? runner.name : 'the running back';
      result.description =
        `Two-point attempt -- ${runnerName} takes the handoff... ` +
        `stuffed at the goal line! The conversion FAILS. The defense holds!`;
    } else {
      result.passer = qb;
      const target = wr ?? te;
      result.receiver = target;
      const qbName = qb ? qb.name : 'the quarterback';
      result.description =
        `Two-point try -- ${qbName} rolls out, throws to the end zone... ` +
        `INCOMPLETE! The pass is batted away! Conversion NO GOOD!`;
    }
  }

  return result;
}

// ============================================================================
// COMPOSITE HELPERS FOR GAME ENGINE INTEGRATION
// ============================================================================

/**
 * Calculate the new ball position for the receiving team after a punt.
 *
 * Takes the punting team's current ball position, the punt distance,
 * and the return yards (if any), and returns the resulting field
 * position from the receiving team's perspective.
 *
 * @returns Ball position (0-100) from the receiving team's own goal line.
 */
export function calculatePuntReturnPosition(
  puntingTeamBallPosition: number,
  puntDistance: number,
  returnYards: number
): number {
  // Punt lands at: landingSpot = puntingTeamBallPosition + puntDistance
  // From receiving team's perspective: their position = 100 - landingSpot
  // After return: position = (100 - landingSpot) + returnYards
  const landingSpot = puntingTeamBallPosition + puntDistance;

  // If the punt goes into the end zone, touchback at 20 (punt rule)
  if (landingSpot >= C.ENDZONE_END) {
    return C.PUNT_TOUCHBACK_POSITION;
  }

  const receivingTeamPosition = C.FIELD_LENGTH - landingSpot + returnYards;

  // Clamp between own goal line and opponent's endzone
  return clamp(receivingTeamPosition, 1, C.ENDZONE_END);
}

/**
 * Calculate the new ball position for the receiving team after a kickoff return.
 *
 * @param returnYards - Total yards returned from the point of reception.
 * @returns Ball position from the receiving team's own goal line.
 */
export function calculateKickoffReturnPosition(returnYards: number): number {
  // Kick returners field the ball deep in their own territory (typically 0-5)
  // and return it. The final position is simply the return distance.
  return clamp(returnYards, 1, C.ENDZONE_END);
}

/**
 * Calculate the ball position for the opposing team after a missed field goal.
 *
 * NFL rule: after a missed field goal, the opposing team takes over at
 * the spot of the kick (line of scrimmage) or their own 20-yard line,
 * whichever gives them better field position.
 *
 * @param kickingTeamBallPosition - Where the kicking team attempted the FG from.
 * @returns Ball position from the receiving team's own goal line.
 */
export function calculateMissedFieldGoalPosition(
  kickingTeamBallPosition: number
): number {
  // Spot of the kick from the opponent's perspective
  const opponentPosition = C.FIELD_LENGTH - kickingTeamBallPosition;

  // Minimum is the 20-yard line (more favorable for the receiving team)
  return Math.max(opponentPosition, 20);
}
