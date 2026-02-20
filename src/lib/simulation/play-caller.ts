// ============================================================================
// GridIron Live - AI Play Caller
// ============================================================================
// The "AI coach" brain that selects what play to call based on game situation.
// Evaluates situation in priority order: special states (kickoff, PAT),
// clock management (kneel, spike), 4th down decisions, situational packages
// (two-minute drill, protect lead, red zone), and finally normal down-and-
// distance play selection. Team playStyle modifiers shift probabilities to
// create distinct offensive identities.
//
// Play selection is a two-step process:
//   1. Determine the CATEGORY (run, shortPass, mediumPass, deepPass)
//      using distribution tables and playStyle modifiers.
//   2. Expand the category into a specific PlayCall using formation-aware
//      weighted sub-distributions for run concepts, pass concepts, etc.
// ============================================================================

import type { GameState, PlayCall, PlayStyle, Formation, SeededRNG, WeightedOption } from './types';
import type { PlayDistribution } from './types';
import {
  PLAY_DISTRIBUTION,
  RED_ZONE_DISTRIBUTION,
  GOAL_LINE_DISTRIBUTION,
  TWO_MINUTE_DRILL_DISTRIBUTION,
  PROTECT_LEAD_DISTRIBUTION,
  DISTANCE_CATEGORIES,
  FIELD_GOAL_RANGE,
  RED_ZONE,
  TWO_MINUTE_WARNING,
} from './constants';

// ============================================================================
// Play category type used internally for the two-step selection process
// ============================================================================

type PlayCategory = 'run' | 'shortPass' | 'mediumPass' | 'deepPass';

// ============================================================================
// Helper: Get the score differential from the perspective of the possessing team
// ============================================================================

function getScoreDifferential(state: GameState): number {
  if (state.possession === 'home') {
    return state.homeScore - state.awayScore;
  }
  return state.awayScore - state.homeScore;
}

// ============================================================================
// Helper: Get the team that currently has possession
// ============================================================================

function getPossessingTeam(state: GameState) {
  return state.possession === 'home' ? state.homeTeam : state.awayTeam;
}

// ============================================================================
// Helper: Determine distance category from yards to go
// ============================================================================

function getDistanceCategory(yardsToGo: number): 'short' | 'medium' | 'long' {
  if (yardsToGo >= DISTANCE_CATEGORIES.long.min) return 'long';
  if (yardsToGo >= DISTANCE_CATEGORIES.medium.min) return 'medium';
  return 'short';
}

// ============================================================================
// Helper: Check if we are in the last N seconds of a half
// ============================================================================

function isEndOfHalf(state: GameState, secondsThreshold: number): boolean {
  const isSecondOrFourth = state.quarter === 2 || state.quarter === 4;
  return isSecondOrFourth && state.clock <= secondsThreshold;
}

// ============================================================================
// Helper: Check if it's the 4th quarter
// ============================================================================

function isFourthQuarter(state: GameState): boolean {
  return state.quarter === 4;
}

// ============================================================================
// Helper: Can we run out the clock with kneels?
// A kneel burns ~40 seconds. With N timeouts for the opponent, we need
// enough kneels to exhaust the clock accounting for potential timeouts.
// ============================================================================

function canKneelOutClock(state: GameState): boolean {
  const opponentTimeouts = state.possession === 'home'
    ? state.awayTimeouts
    : state.homeTimeouts;

  // Each kneel burns ~40 seconds. The opponent can stop the clock with timeouts.
  // After each kneel, if they call a timeout, we lose only ~40s per kneel.
  // We need enough kneels to drain the remaining clock.
  // Worst case: opponent uses all timeouts, each costing us an extra play.
  // We get 3 kneels per set of downs (1st, 2nd, 3rd), then game over if clock runs.
  const kneelTime = 40;
  const kneelsAvailable = 3; // 1st, 2nd, 3rd down kneels before forced 4th down punt

  // With opponent timeouts, we need extra kneels beyond their timeouts
  // Each timeout stops the clock but we still burned ~40s on the kneel itself
  // So effectively we can burn: (kneelsAvailable) * kneelTime regardless of timeouts
  // But if they have timeouts, the clock stops between plays, so we only burn
  // the play clock on the kneel itself.
  // Simplified: we need clock <= kneelsAvailable * kneelTime to be safe
  // But opponent timeouts mean we need more margin
  const effectiveBurnTime = (kneelsAvailable - opponentTimeouts) * kneelTime;

  // Need at least some margin -- if effective burn time covers clock, kneel away
  return state.clock <= Math.max(effectiveBurnTime, kneelTime);
}

// ============================================================================
// Helper: Apply team playStyle modifiers to a distribution
// ============================================================================

function applyPlayStyleModifiers(
  dist: PlayDistribution,
  playStyle: PlayStyle,
): PlayDistribution {
  let { run, shortPass, mediumPass, deepPass } = dist;

  switch (playStyle) {
    case 'pass_heavy':
      run = Math.max(0, run - 0.10);
      shortPass += 0.04;
      mediumPass += 0.04;
      deepPass += 0.02;
      break;

    case 'run_heavy':
      run += 0.10;
      shortPass = Math.max(0, shortPass - 0.04);
      mediumPass = Math.max(0, mediumPass - 0.04);
      deepPass = Math.max(0, deepPass - 0.02);
      break;

    case 'aggressive':
      deepPass += 0.05;
      shortPass = Math.max(0, shortPass - 0.05);
      break;

    case 'conservative':
      run += 0.05;
      deepPass = Math.max(0, deepPass - 0.05);
      break;

    case 'balanced':
    default:
      // No modifications
      break;
  }

  // Normalize to ensure probabilities sum to 1.0
  const total = run + shortPass + mediumPass + deepPass;
  if (total > 0) {
    return {
      run: run / total,
      shortPass: shortPass / total,
      mediumPass: mediumPass / total,
      deepPass: deepPass / total,
    };
  }

  return dist;
}

// ============================================================================
// Step 1: Select a play CATEGORY from a distribution using weighted choice
// ============================================================================

function selectCategory(dist: PlayDistribution, rng: SeededRNG): PlayCategory {
  const options: WeightedOption<PlayCategory>[] = [
    { value: 'run' as const, weight: dist.run },
    { value: 'shortPass' as const, weight: dist.shortPass },
    { value: 'mediumPass' as const, weight: dist.mediumPass },
    { value: 'deepPass' as const, weight: dist.deepPass },
  ].filter(o => o.weight > 0);

  return rng.weightedChoice(options);
}

// ============================================================================
// Step 2: Expand a play category into a specific PlayCall based on formation
// ============================================================================

// --- Run concept expansion by formation ---

function expandRunCategory(
  formation: Formation | undefined,
  yardsToGo: number,
  rng: SeededRNG,
): PlayCall {
  let options: WeightedOption<PlayCall>[];

  switch (formation) {
    case 'under_center':
    case 'i_formation':
    case 'goal_line': {
      const sneakWeight = yardsToGo <= 1 ? 20 : 0;
      const insideWeight = sneakWeight > 0 ? 0 : 20;
      options = [
        { value: 'run_power', weight: 35 },
        { value: 'run_zone', weight: 25 },
        { value: 'run_counter', weight: 20 },
        { value: 'run_qb_sneak', weight: sneakWeight },
        { value: 'run_inside', weight: insideWeight },
      ];
      break;
    }

    case 'shotgun':
    case 'pistol':
      options = [
        { value: 'run_zone', weight: 30 },
        { value: 'run_draw', weight: 20 },
        { value: 'run_option', weight: 20 },
        { value: 'run_outside_zone', weight: 15 },
        { value: 'run_sweep', weight: 15 },
      ];
      break;

    case 'spread':
    case 'empty':
      options = [
        { value: 'run_draw', weight: 35 },
        { value: 'run_sweep', weight: 25 },
        { value: 'run_option', weight: 25 },
        { value: 'run_outside_zone', weight: 15 },
      ];
      break;

    case 'singleback':
      options = [
        { value: 'run_zone', weight: 25 },
        { value: 'run_power', weight: 25 },
        { value: 'run_outside_zone', weight: 20 },
        { value: 'run_counter', weight: 15 },
        { value: 'run_sweep', weight: 15 },
      ];
      break;

    case 'wildcat':
      options = [
        { value: 'run_option', weight: 40 },
        { value: 'run_sweep', weight: 30 },
        { value: 'run_power', weight: 20 },
        { value: 'run_counter', weight: 10 },
      ];
      break;

    default:
      // No formation provided -- use legacy-compatible defaults
      options = [
        { value: 'run_inside', weight: 30 },
        { value: 'run_outside', weight: 25 },
        { value: 'run_power', weight: 20 },
        { value: 'run_zone', weight: 15 },
        { value: 'run_draw', weight: 10 },
      ];
      break;
  }

  return rng.weightedChoice(options.filter(o => o.weight > 0));
}

// --- Short pass concept expansion by formation ---

function expandShortPassCategory(
  formation: Formation | undefined,
  rng: SeededRNG,
): PlayCall {
  // Determine if play action should replace some pass_short weight
  const isPlayActionFormation =
    formation === 'under_center' ||
    formation === 'i_formation' ||
    formation === 'pistol';

  // Determine if RPO is available (shotgun/pistol)
  const isRPOFormation =
    formation === 'shotgun' ||
    formation === 'pistol';

  // Base weights
  let quickWeight = 40;
  let shortWeight = 35;
  const screenWeight = 15;
  let rpoWeight = 0;
  let playActionShortWeight = 0;

  if (isRPOFormation) {
    rpoWeight = 10;
    // Carve RPO weight from short
    shortWeight -= rpoWeight;
  }

  if (isPlayActionFormation) {
    // Play action replaces 30% of pass_short weight
    playActionShortWeight = Math.round(shortWeight * 0.30);
    shortWeight -= playActionShortWeight;
  }

  const options: WeightedOption<PlayCall>[] = [
    { value: 'pass_quick', weight: quickWeight },
    { value: 'pass_short', weight: shortWeight },
    { value: 'screen_pass', weight: screenWeight },
    { value: 'pass_rpo', weight: rpoWeight },
    { value: 'play_action_short', weight: playActionShortWeight },
  ];

  return rng.weightedChoice(options.filter(o => o.weight > 0));
}

// --- Medium pass concept expansion by formation ---

function expandMediumPassCategory(
  formation: Formation | undefined,
  rng: SeededRNG,
): PlayCall {
  const isPlayActionFormation =
    formation === 'under_center' ||
    formation === 'i_formation' ||
    formation === 'pistol' ||
    formation === 'singleback';

  let mediumWeight = 60;
  let playActionShortWeight = 0;
  let shortFillWeight = 0;

  if (isPlayActionFormation) {
    playActionShortWeight = 25;
    // Remaining weight goes to pass_medium (already at 60) and fill
    shortFillWeight = 15;
  } else {
    // No play action available -- redistribute to pass_short as filler
    shortFillWeight = 40;
  }

  const options: WeightedOption<PlayCall>[] = [
    { value: 'pass_medium', weight: mediumWeight },
    { value: 'play_action_short', weight: playActionShortWeight },
    { value: 'pass_short', weight: shortFillWeight },
  ];

  return rng.weightedChoice(options.filter(o => o.weight > 0));
}

// --- Deep pass concept expansion by formation ---

function expandDeepPassCategory(
  formation: Formation | undefined,
  rng: SeededRNG,
): PlayCall {
  const isPlayActionFormation =
    formation === 'under_center' ||
    formation === 'i_formation' ||
    formation === 'pistol';

  const deepWeight = 55;
  let playActionDeepWeight: number;
  let mediumFillWeight: number;

  if (isPlayActionFormation) {
    playActionDeepWeight = 30;
    mediumFillWeight = 15;
  } else {
    playActionDeepWeight = 10;
    mediumFillWeight = 35;
  }

  const options: WeightedOption<PlayCall>[] = [
    { value: 'pass_deep', weight: deepWeight },
    { value: 'play_action_deep', weight: playActionDeepWeight },
    { value: 'pass_medium', weight: mediumFillWeight },
  ];

  return rng.weightedChoice(options.filter(o => o.weight > 0));
}

// ============================================================================
// Expand: Given a category and formation, pick a specific PlayCall
// ============================================================================

function expandCategoryToPlayCall(
  category: PlayCategory,
  formation: Formation | undefined,
  yardsToGo: number,
  rng: SeededRNG,
): PlayCall {
  switch (category) {
    case 'run':
      return expandRunCategory(formation, yardsToGo, rng);
    case 'shortPass':
      return expandShortPassCategory(formation, rng);
    case 'mediumPass':
      return expandMediumPassCategory(formation, rng);
    case 'deepPass':
      return expandDeepPassCategory(formation, rng);
  }
}

// ============================================================================
// Helper: Select distribution, pick category, then expand to PlayCall
// ============================================================================

function selectFromDistribution(
  dist: PlayDistribution,
  formation: Formation | undefined,
  yardsToGo: number,
  rng: SeededRNG,
): PlayCall {
  const category = selectCategory(dist, rng);
  return expandCategoryToPlayCall(category, formation, yardsToGo, rng);
}

// ============================================================================
// Main: selectPlay
// ============================================================================

export function selectPlay(
  state: GameState,
  rng: SeededRNG,
  formation?: Formation,
): PlayCall {
  const scoreDiff = getScoreDifferential(state);
  const team = getPossessingTeam(state);

  // --------------------------------------------------------------------------
  // 1. KICKOFF
  // --------------------------------------------------------------------------
  if (state.kickoff) {
    // Desperate onside kick: losing by any amount with < 2:00 in 4th
    if (isFourthQuarter(state) && state.clock < TWO_MINUTE_WARNING && scoreDiff < 0) {
      if (rng.probability(0.50)) {
        return 'onside_kick';
      }
      return 'kickoff_normal';
    }

    // Trailing by 10+ in 4th quarter with < 5:00
    if (isFourthQuarter(state) && state.clock < 300 && scoreDiff <= -10) {
      if (rng.probability(0.30)) {
        return 'onside_kick';
      }
      return 'kickoff_normal';
    }

    return 'kickoff_normal';
  }

  // --------------------------------------------------------------------------
  // 2. PAT / TWO-POINT CONVERSION
  // --------------------------------------------------------------------------
  if (state.patAttempt) {
    // Trailing by exactly 2 in 4th quarter: go for 2 to tie
    if (isFourthQuarter(state) && scoreDiff === -2) {
      return rng.probability(0.60) ? 'two_point_pass' : 'two_point_run';
    }

    // Trailing by exactly 5 in 4th quarter after scoring a TD:
    // A two-point conversion would make it a 3-point game (FG to tie)
    if (isFourthQuarter(state) && scoreDiff === -5) {
      return rng.probability(0.55) ? 'two_point_pass' : 'two_point_run';
    }

    // Random 2pt attempt for variety (~8% of the time)
    if (rng.probability(0.08)) {
      return rng.probability(0.60) ? 'two_point_pass' : 'two_point_run';
    }

    return 'extra_point';
  }

  // --------------------------------------------------------------------------
  // 3. KNEEL / SPIKE SITUATIONS
  // --------------------------------------------------------------------------

  // Kneel: leading by 1-8 points, 4th quarter, < 2:00, can run out clock
  if (
    isFourthQuarter(state) &&
    scoreDiff >= 1 &&
    scoreDiff <= 8 &&
    state.clock < TWO_MINUTE_WARNING &&
    canKneelOutClock(state)
  ) {
    return 'kneel';
  }

  // Spike: need to stop clock, < 0:40 left in the half
  if (
    isEndOfHalf(state, 40) &&
    scoreDiff <= 0 &&
    state.isClockRunning
  ) {
    return 'spike';
  }

  // --------------------------------------------------------------------------
  // 4. FOURTH DOWN DECISIONS
  // --------------------------------------------------------------------------
  if (state.down === 4) {
    const isBehindLate = scoreDiff < 0 && isFourthQuarter(state) && state.clock < 300;

    // Short yardage past midfield: go for it
    if (state.yardsToGo <= 2 && state.ballPosition >= 60) {
      return selectGoForItPlay(state, rng);
    }

    // In field goal range: kick it (unless desperate)
    if (state.ballPosition >= FIELD_GOAL_RANGE) {
      // If trailing late and it's not quite enough, still consider going for it
      if (isBehindLate && scoreDiff < -3 && state.yardsToGo <= 5) {
        // Go for it on 4th and short when a FG won't help enough
        return selectGoForItPlay(state, rng);
      }
      return 'field_goal';
    }

    // Desperate situation: trailing late, go for it if short or in no-man's land
    if (isBehindLate) {
      if (state.yardsToGo <= 5) {
        return selectGoForItPlay(state, rng);
      }
      // In no-man's land (too far for FG, too close to punt effectively): ~40-62
      if (state.ballPosition >= 40) {
        return selectGoForItPlay(state, rng);
      }
    }

    // Normal situation: punt
    return 'punt';
  }

  // --------------------------------------------------------------------------
  // 5. TWO-MINUTE DRILL
  // --------------------------------------------------------------------------
  if (
    isEndOfHalf(state, TWO_MINUTE_WARNING) &&
    (scoreDiff <= 0 || (scoreDiff > 0 && scoreDiff <= 8))
  ) {
    const dist = applyPlayStyleModifiers(TWO_MINUTE_DRILL_DISTRIBUTION, team.playStyle);
    return selectFromDistribution(dist, formation, state.yardsToGo, rng);
  }

  // --------------------------------------------------------------------------
  // 6. PROTECTING A LEAD (leading by 10+ in 4th quarter, < 5:00)
  // --------------------------------------------------------------------------
  if (isFourthQuarter(state) && scoreDiff >= 10 && state.clock < 300) {
    const dist = applyPlayStyleModifiers(PROTECT_LEAD_DISTRIBUTION, team.playStyle);
    return selectFromDistribution(dist, formation, state.yardsToGo, rng);
  }

  // --------------------------------------------------------------------------
  // 7. RED ZONE (ball position >= 80)
  // --------------------------------------------------------------------------
  if (state.ballPosition >= 95) {
    // Goal line package
    const dist = applyPlayStyleModifiers(GOAL_LINE_DISTRIBUTION, team.playStyle);
    return selectFromDistribution(dist, formation, state.yardsToGo, rng);
  }

  if (state.ballPosition >= RED_ZONE) {
    const dist = applyPlayStyleModifiers(RED_ZONE_DISTRIBUTION, team.playStyle);
    return selectFromDistribution(dist, formation, state.yardsToGo, rng);
  }

  // --------------------------------------------------------------------------
  // 8. NORMAL PLAY SELECTION
  // --------------------------------------------------------------------------
  const distCategory = getDistanceCategory(state.yardsToGo);

  // Build lookup key - first down is always "1_standard"
  let key: string;
  if (state.down === 1) {
    key = '1_standard';
  } else {
    key = `${state.down}_${distCategory}`;
  }

  // Look up distribution, fall back to 1_standard if key not found
  const baseDist = PLAY_DISTRIBUTION[key] ?? PLAY_DISTRIBUTION['1_standard'];
  const dist = applyPlayStyleModifiers(baseDist, team.playStyle);
  return selectFromDistribution(dist, formation, state.yardsToGo, rng);
}

// ============================================================================
// Helper: Select an appropriate play when going for it on 4th down
// ============================================================================

function selectGoForItPlay(state: GameState, rng: SeededRNG): PlayCall {
  if (state.yardsToGo <= 1) {
    // Quarterback sneak / power run territory
    return rng.weightedChoice<PlayCall>([
      { value: 'run_qb_sneak', weight: 50 },
      { value: 'run_power', weight: 30 },
      { value: 'pass_quick', weight: 20 },
    ]);
  }

  if (state.yardsToGo <= 3) {
    // Short yardage: mix of power run and quick passes
    return rng.weightedChoice<PlayCall>([
      { value: 'run_power', weight: 25 },
      { value: 'run_zone', weight: 20 },
      { value: 'pass_quick', weight: 25 },
      { value: 'pass_short', weight: 20 },
      { value: 'screen_pass', weight: 10 },
    ]);
  }

  // Medium/long 4th down: pass-heavy
  return rng.weightedChoice<PlayCall>([
    { value: 'pass_short', weight: 25 },
    { value: 'pass_medium', weight: 35 },
    { value: 'pass_deep', weight: 20 },
    { value: 'screen_pass', weight: 10 },
    { value: 'pass_quick', weight: 10 },
  ]);
}
