// ============================================================================
// GridBlitz - AI Play Caller
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
  FAKE_PUNT_RATE,
  FAKE_FG_RATE,
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
  const scoreDiff = getScoreDifferential(state);
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

  // Large leads (17+): opponents won't waste timeouts to stop kneels, so
  // we can kneel with up to 2 minutes left regardless of their timeouts.
  if (scoreDiff >= 17) {
    return state.clock <= 120;
  }

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
    // 2025 rule: trailing team can declare onside kick at ANY point in the game.
    // Traditional alignment applies on onside kicks (not Dynamic Kickoff).
    if (scoreDiff < 0) {
      // Q4 < 2:00 trailing: 50% chance (desperate)
      if (isFourthQuarter(state) && state.clock < TWO_MINUTE_WARNING) {
        if (rng.probability(0.50)) return 'onside_kick';
        return 'kickoff_normal';
      }
      // Q4 < 5:00 trailing by 10+: 30% chance
      if (isFourthQuarter(state) && state.clock < 300 && scoreDiff <= -10) {
        if (rng.probability(0.30)) return 'onside_kick';
        return 'kickoff_normal';
      }
      // Q3+ trailing by 14+: 8% chance
      if ((state.quarter === 3 || state.quarter === 4) && scoreDiff <= -14) {
        if (rng.probability(0.08)) return 'onside_kick';
      }
      // Any time trailing by 17+: 5% chance (desperation)
      if (scoreDiff <= -17) {
        if (rng.probability(0.05)) return 'onside_kick';
      }
    }

    return 'kickoff_normal';
  }

  // --------------------------------------------------------------------------
  // 2. PAT / TWO-POINT CONVERSION
  // --------------------------------------------------------------------------
  if (state.patAttempt) {
    const goForTwo = () => rng.probability(0.55) ? 'two_point_pass' as const : 'two_point_run' as const;

    // ---- NFL 2-point conversion decision chart ----
    // scoreDiff is AFTER the TD (6 points already added) but BEFORE PAT
    // So scoreDiff represents current lead/deficit including the just-scored TD

    const isLateGame = isFourthQuarter(state) && state.clock < 300;

    // Down 2: go for 2 to tie (vs kick to go up 1)
    if (scoreDiff === -2) return goForTwo();

    // Down 5: go for 2 to make it a 3-pt game (FG ties)
    if (scoreDiff === -5) return goForTwo();

    // Down 9: go for 2 to make it a 7-pt game (TD ties)
    if (scoreDiff === -9) return goForTwo();

    // Down 12: go for 2 to make it a 10-pt game (TD+FG ties)
    if (scoreDiff === -12) return goForTwo();

    // Down 16: go for 2 to make it a 14-pt game (2 TDs)
    if (scoreDiff === -16) return goForTwo();

    // Down 19: go for 2 to make it a 17-pt game
    if (scoreDiff === -19) return goForTwo();

    // Up 1: go for 2 to go up 3 (force FG to tie instead of XP)
    if (scoreDiff === 1) return goForTwo();

    // Up 4: go for 2 to go up 6 (force TD to take lead)
    if (scoreDiff === 4) return goForTwo();

    // Late game: more aggressive on other score differentials
    if (isLateGame) {
      // Down 3: go for 2 to make it a 1-pt game
      if (scoreDiff === -3) return goForTwo();
      // Down 8: go for 2 to make it a 6-pt game
      if (scoreDiff === -8) return goForTwo();
    }

    // Random 2pt attempt for variety (~5% of the time)
    if (rng.probability(0.05)) return goForTwo();

    return 'extra_point';
  }

  // --------------------------------------------------------------------------
  // 3. KNEEL / SPIKE SITUATIONS
  // --------------------------------------------------------------------------

  // Kneel: leading by any amount, 4th quarter, < 2:00, can run out clock
  if (
    isFourthQuarter(state) &&
    scoreDiff >= 1 &&
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
  // 3b. CLOCK-BURNING STRATEGY (small lead, Q4, < 5:00)
  // --------------------------------------------------------------------------
  // Teams leading 1-9 in Q4 with < 5:00 left run heavy to burn clock.
  if (
    isFourthQuarter(state) &&
    scoreDiff >= 1 &&
    scoreDiff < 10 &&
    state.clock < 300 &&
    state.down !== 4
  ) {
    const clockBurnDist: PlayDistribution = {
      run: 0.65,
      shortPass: 0.25,
      mediumPass: 0.10,
      deepPass: 0.00,
    };
    const dist = applyPlayStyleModifiers(clockBurnDist, team.playStyle);
    return selectFromDistribution(dist, formation, state.yardsToGo, rng);
  }

  // --------------------------------------------------------------------------
  // 4. FOURTH DOWN DECISIONS
  // --------------------------------------------------------------------------
  if (state.down === 4) {
    const isBehindLate = scoreDiff < 0 && isFourthQuarter(state) && state.clock < 300;
    const isBlowout = scoreDiff < -21;
    const isTrailingQ4 = scoreDiff < 0 && isFourthQuarter(state);

    // ---- Analytics-informed go-for-it logic (modern NFL is aggressive) ----

    // Blowout: go for it almost everywhere (nothing to lose)
    if (isBlowout && state.yardsToGo <= 8) {
      return selectGoForItPlay(state, rng);
    }

    // Trailing in Q4: much more aggressive
    if (isTrailingQ4) {
      // Trailing late with < 2 min: go for it on anything reasonable
      if (state.clock < 120 && state.yardsToGo <= 10) {
        return selectGoForItPlay(state, rng);
      }
      // Trailing late with < 5 min: go for it when FG won't help enough
      if (isBehindLate && scoreDiff < -3 && state.yardsToGo <= 6) {
        return selectGoForItPlay(state, rng);
      }
      // Trailing Q4 in no-man's land (past own 35): go for it on short
      if (state.yardsToGo <= 3 && state.ballPosition >= 35) {
        return selectGoForItPlay(state, rng);
      }
    }

    // In field goal range: usually kick it
    if (state.ballPosition >= FIELD_GOAL_RANGE) {
      // Unless trailing late and FG won't cut it
      if (isBehindLate && scoreDiff < -3 && state.yardsToGo <= 5) {
        return selectGoForItPlay(state, rng);
      }
      // Fake field goal (~1% chance)
      if (rng.probability(FAKE_FG_RATE)) {
        return selectGoForItPlay(state, rng);
      }
      return 'field_goal';
    }

    // ---- Expected-points-style go-for-it thresholds by field position ----
    // Modern NFL teams go for it aggressively in opponent territory

    // 4th & 1: Go for it inside opponent's 45
    if (state.yardsToGo <= 1 && state.ballPosition >= 55) {
      return selectGoForItPlay(state, rng);
    }

    // 4th & 2: Go for it inside opponent's 40
    if (state.yardsToGo <= 2 && state.ballPosition >= 60) {
      return selectGoForItPlay(state, rng);
    }

    // 4th & 3: Go for it inside opponent's 35
    if (state.yardsToGo <= 3 && state.ballPosition >= 65) {
      return selectGoForItPlay(state, rng);
    }

    // 4th & 4-5: Go for it inside opponent's 30 (but out of FG range)
    if (state.yardsToGo <= 5 && state.ballPosition >= 70 && state.ballPosition < FIELD_GOAL_RANGE) {
      return selectGoForItPlay(state, rng);
    }

    // Fake punt (~2% when 4th-and-short in opponent territory)
    if (state.yardsToGo <= 3 && state.ballPosition >= 50 && rng.probability(FAKE_PUNT_RATE)) {
      return selectGoForItPlay(state, rng);
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
