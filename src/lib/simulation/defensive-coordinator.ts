// ============================================================================
// GridIron Live - Defensive Coordinator AI
// ============================================================================
// Selects defensive personnel, coverage schemes, and blitz packages based
// on game situation. The coordinator reads the offensive formation, down
// and distance, score differential, and clock to produce a DefensiveCall
// that the play generator uses to resolve each snap.
// ============================================================================

import type {
  GameState,
  Formation,
  DefensivePersonnel,
  CoverageType,
  BlitzPackage,
  DefensiveCall,
  PlayStyle,
  SeededRNG,
  WeightedOption,
} from './types';

// ============================================================================
// Defensive Modifiers Interface
// ============================================================================

export interface DefensiveModifiers {
  /** Multiplier on sack rate (blitzing increases it). */
  sackRateMultiplier: number;
  /** Multiplier on short pass completion rate. */
  shortCompletionModifier: number;
  /** Multiplier on medium pass completion rate. */
  mediumCompletionModifier: number;
  /** Multiplier on deep pass completion rate. */
  deepCompletionModifier: number;
  /** Multiplier on run yards. */
  runYardModifier: number;
  /** Multiplier on screen pass success. */
  screenModifier: number;
  /** Extra rushers beyond standard 4-man front (affects sack rate and open receivers). */
  extraRushers: number;
}

// ============================================================================
// Personnel Base Modifiers
// ============================================================================

const PERSONNEL_MODIFIERS: Record<DefensivePersonnel, DefensiveModifiers> = {
  base_4_3: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 1.0,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    runYardModifier: 0.95,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  base_3_4: {
    sackRateMultiplier: 1.05,
    shortCompletionModifier: 1.0,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    runYardModifier: 1.0,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  nickel: {
    sackRateMultiplier: 0.95,
    shortCompletionModifier: 0.95,
    mediumCompletionModifier: 0.95,
    deepCompletionModifier: 0.95,
    runYardModifier: 1.1,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  dime: {
    sackRateMultiplier: 0.9,
    shortCompletionModifier: 0.9,
    mediumCompletionModifier: 0.9,
    deepCompletionModifier: 0.9,
    runYardModifier: 1.2,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  goal_line: {
    sackRateMultiplier: 1.1,
    shortCompletionModifier: 1.0,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    runYardModifier: 0.8,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  prevent: {
    sackRateMultiplier: 0.7,
    shortCompletionModifier: 1.0,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    runYardModifier: 1.3,
    screenModifier: 1.0,
    extraRushers: 0,
  },
};

// ============================================================================
// Coverage Modifiers (multiplied onto personnel base)
// ============================================================================

interface CoverageModifierSet {
  sackRateMultiplier: number;
  shortCompletionModifier: number;
  mediumCompletionModifier: number;
  deepCompletionModifier: number;
  screenModifier: number;
}

const COVERAGE_MODIFIERS: Record<CoverageType, CoverageModifierSet> = {
  cover_0: {
    sackRateMultiplier: 1.3,
    shortCompletionModifier: 0.85,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.3,
    screenModifier: 1.0,
  },
  cover_1: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 0.9,
    mediumCompletionModifier: 0.9,
    deepCompletionModifier: 1.0,
    screenModifier: 1.0,
  },
  cover_2: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 0.85,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.1,
    screenModifier: 1.0,
  },
  cover_3: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 1.05,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 0.85,
    screenModifier: 1.0,
  },
  cover_4: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 1.1,
    mediumCompletionModifier: 1.05,
    deepCompletionModifier: 0.75,
    screenModifier: 1.0,
  },
  cover_6: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 0.9,
    mediumCompletionModifier: 0.95,
    deepCompletionModifier: 0.9,
    screenModifier: 1.0,
  },
  man_press: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 0.8,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.15,
    screenModifier: 1.3,
  },
};

// ============================================================================
// Blitz Modifiers (multiplied onto personnel + coverage)
// ============================================================================

interface BlitzModifierSet {
  sackRateMultiplier: number;
  shortCompletionModifier: number;
  mediumCompletionModifier: number;
  deepCompletionModifier: number;
  screenModifier: number;
  extraRushers: number;
}

const BLITZ_MODIFIERS: Record<BlitzPackage, BlitzModifierSet> = {
  none: {
    sackRateMultiplier: 1.0,
    shortCompletionModifier: 1.0,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    screenModifier: 1.0,
    extraRushers: 0,
  },
  lb_blitz: {
    sackRateMultiplier: 1.5,
    shortCompletionModifier: 1.05,
    mediumCompletionModifier: 1.1,
    deepCompletionModifier: 1.0,
    screenModifier: 0.7,
    extraRushers: 1,
  },
  db_blitz: {
    sackRateMultiplier: 1.7,
    shortCompletionModifier: 1.1,
    mediumCompletionModifier: 1.15,
    deepCompletionModifier: 1.1,
    screenModifier: 0.6,
    extraRushers: 2,
  },
  all_out: {
    sackRateMultiplier: 2.0,
    shortCompletionModifier: 1.2,
    mediumCompletionModifier: 1.25,
    deepCompletionModifier: 1.2,
    screenModifier: 0.5,
    extraRushers: 3,
  },
  zone_blitz: {
    sackRateMultiplier: 1.3,
    shortCompletionModifier: 0.95,
    mediumCompletionModifier: 1.0,
    deepCompletionModifier: 1.0,
    screenModifier: 0.85,
    extraRushers: 1,
  },
};

// ============================================================================
// Personnel Selection
// ============================================================================

/**
 * Determine whether the game is in a late-game prevent situation.
 * The defense is losing by 14+ points with under 2 minutes remaining
 * in the 4th quarter or overtime.
 */
function isPreventSituation(state: GameState): boolean {
  const isLateGame =
    (state.quarter === 4 || state.quarter === 'OT') && state.clock <= 120;
  if (!isLateGame) return false;

  const defensiveTeam = state.possession === 'home' ? 'away' : 'home';
  const defenseScore = defensiveTeam === 'home' ? state.homeScore : state.awayScore;
  const offenseScore = defensiveTeam === 'home' ? state.awayScore : state.homeScore;

  return defenseScore >= offenseScore + 14;
}

/**
 * Check if the current situation is a passing down.
 * 3rd down with 7 or more yards to go qualifies.
 */
function isPassingDown(state: GameState): boolean {
  return state.down === 3 && state.yardsToGo >= 7;
}

/**
 * Check if the current situation is short yardage.
 * 2 or fewer yards to go qualifies.
 */
function isShortYardage(state: GameState): boolean {
  return state.yardsToGo <= 2;
}

/**
 * Select defensive personnel based on offensive formation and game situation.
 */
function selectPersonnel(
  state: GameState,
  formation: Formation,
  rng: SeededRNG,
): DefensivePersonnel {
  // Late game, defense winning by 14+, under 2 minutes
  if (isPreventSituation(state)) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'prevent', weight: 70 },
      { value: 'dime', weight: 30 },
    ]);
  }

  // vs spread/empty formations: nickel or dime
  if (formation === 'spread' || formation === 'empty') {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'nickel', weight: 70 },
      { value: 'dime', weight: 30 },
    ]);
  }

  // vs goal line/i-formation in short yardage
  if (
    (formation === 'goal_line' || formation === 'i_formation') &&
    isShortYardage(state)
  ) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'goal_line', weight: 60 },
      { value: 'base_4_3', weight: 40 },
    ]);
  }

  // vs shotgun on passing downs (3rd & 7+)
  if (formation === 'shotgun' && isPassingDown(state)) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'nickel', weight: 50 },
      { value: 'dime', weight: 40 },
      { value: 'base_3_4', weight: 10 },
    ]);
  }

  // Default by down and distance
  if (state.down === 1) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'base_4_3', weight: 40 },
      { value: 'base_3_4', weight: 25 },
      { value: 'nickel', weight: 35 },
    ]);
  }

  if (state.down === 2 && isShortYardage(state)) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'base_4_3', weight: 45 },
      { value: 'base_3_4', weight: 30 },
      { value: 'nickel', weight: 25 },
    ]);
  }

  if (state.down === 2 && !isShortYardage(state)) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'nickel', weight: 45 },
      { value: 'base_4_3', weight: 25 },
      { value: 'base_3_4', weight: 20 },
      { value: 'dime', weight: 10 },
    ]);
  }

  if (state.down >= 3 && isShortYardage(state)) {
    return rng.weightedChoice<DefensivePersonnel>([
      { value: 'base_4_3', weight: 40 },
      { value: 'base_3_4', weight: 35 },
      { value: 'nickel', weight: 25 },
    ]);
  }

  // 3rd/4th and long
  return rng.weightedChoice<DefensivePersonnel>([
    { value: 'nickel', weight: 40 },
    { value: 'dime', weight: 30 },
    { value: 'base_3_4', weight: 20 },
    { value: 'base_4_3', weight: 10 },
  ]);
}

// ============================================================================
// Coverage Selection
// ============================================================================

/**
 * Check if the offensive formation is run-heavy.
 */
function isRunHeavyFormation(formation: Formation): boolean {
  return formation === 'under_center' || formation === 'i_formation';
}

/**
 * Select a coverage scheme based on personnel, down, distance, and formation.
 */
function selectCoverage(
  state: GameState,
  formation: Formation,
  personnel: DefensivePersonnel,
  rng: SeededRNG,
): CoverageType {
  // Prevent always runs cover 4
  if (personnel === 'prevent') {
    return 'cover_4';
  }

  // Goal line coverage
  if (personnel === 'goal_line') {
    return rng.weightedChoice<CoverageType>([
      { value: 'cover_1', weight: 50 },
      { value: 'cover_0', weight: 30 },
      { value: 'man_press', weight: 20 },
    ]);
  }

  // Dime coverage
  if (personnel === 'dime') {
    return rng.weightedChoice<CoverageType>([
      { value: 'cover_2', weight: 30 },
      { value: 'cover_3', weight: 25 },
      { value: 'cover_4', weight: 30 },
      { value: 'cover_6', weight: 15 },
    ]);
  }

  // Nickel coverage
  if (personnel === 'nickel') {
    if (state.down === 3 && state.yardsToGo >= 7) {
      // 3rd and long
      return rng.weightedChoice<CoverageType>([
        { value: 'cover_3', weight: 35 },
        { value: 'cover_2', weight: 25 },
        { value: 'cover_4', weight: 25 },
        { value: 'man_press', weight: 15 },
      ]);
    }
    // Other nickel situations
    return rng.weightedChoice<CoverageType>([
      { value: 'cover_1', weight: 25 },
      { value: 'cover_2', weight: 25 },
      { value: 'cover_3', weight: 30 },
      { value: 'man_press', weight: 20 },
    ]);
  }

  // Base 4-3 or 3-4 coverage
  if (isRunHeavyFormation(formation)) {
    return rng.weightedChoice<CoverageType>([
      { value: 'cover_1', weight: 35 },
      { value: 'cover_2', weight: 30 },
      { value: 'man_press', weight: 20 },
      { value: 'cover_3', weight: 15 },
    ]);
  }

  // Base personnel, non-run-heavy formation
  return rng.weightedChoice<CoverageType>([
    { value: 'cover_2', weight: 30 },
    { value: 'cover_3', weight: 35 },
    { value: 'cover_1', weight: 20 },
    { value: 'cover_4', weight: 15 },
  ]);
}

// ============================================================================
// Blitz Selection
// ============================================================================

/**
 * Apply a multiplier to all blitz options (not "none") and re-normalize.
 * Used to increase or decrease blitz frequency against certain play styles.
 */
function applyBlitzMultiplier(
  options: WeightedOption<BlitzPackage>[],
  multiplier: number,
): WeightedOption<BlitzPackage>[] {
  return options.map((opt) => ({
    value: opt.value,
    weight: opt.value === 'none' ? opt.weight : opt.weight * multiplier,
  }));
}

/**
 * Get the play style of the offensive team for blitz adjustments.
 */
function getOffensivePlayStyle(state: GameState): PlayStyle {
  const offensiveTeam =
    state.possession === 'home' ? state.homeTeam : state.awayTeam;
  return offensiveTeam.playStyle;
}

/**
 * Select a blitz package based on down, distance, personnel, and opponent tendency.
 */
function selectBlitz(
  state: GameState,
  personnel: DefensivePersonnel,
  rng: SeededRNG,
): BlitzPackage {
  // Never blitz with prevent or dime
  if (personnel === 'prevent' || personnel === 'dime') {
    return 'none';
  }

  // Goal line blitz
  if (personnel === 'goal_line') {
    return rng.weightedChoice<BlitzPackage>([
      { value: 'lb_blitz', weight: 40 },
      { value: 'all_out', weight: 25 },
      { value: 'none', weight: 35 },
    ]);
  }

  let options: WeightedOption<BlitzPackage>[];

  // 3rd & 6+
  if (state.down === 3 && state.yardsToGo >= 6) {
    options = [
      { value: 'lb_blitz', weight: 25 },
      { value: 'db_blitz', weight: 15 },
      { value: 'zone_blitz', weight: 15 },
      { value: 'none', weight: 45 },
    ];
  } else if (state.down <= 2) {
    // 1st or 2nd down
    options = [
      { value: 'none', weight: 65 },
      { value: 'lb_blitz', weight: 20 },
      { value: 'zone_blitz', weight: 15 },
    ];
  } else {
    // 3rd & short, 4th down, etc.
    options = [
      { value: 'none', weight: 50 },
      { value: 'lb_blitz', weight: 25 },
      { value: 'zone_blitz', weight: 15 },
      { value: 'db_blitz', weight: 10 },
    ];
  }

  // Adjust based on opponent play style
  const offenseStyle = getOffensivePlayStyle(state);
  if (offenseStyle === 'pass_heavy') {
    options = applyBlitzMultiplier(options, 1.3);
  } else if (offenseStyle === 'run_heavy') {
    options = applyBlitzMultiplier(options, 0.7);
  }

  return rng.weightedChoice(options);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Call a defensive play based on the current game state and offensive formation.
 * Selects personnel grouping, coverage scheme, and blitz package using
 * situational logic and the seeded RNG for deterministic outcomes.
 *
 * @param state     - Current game state (score, clock, down, distance, etc.)
 * @param formation - The offensive formation the defense is reacting to
 * @param rng       - Seeded RNG for deterministic selection
 * @returns A complete DefensiveCall with personnel, coverage, and blitz
 */
export function callDefense(
  state: GameState,
  formation: Formation,
  rng: SeededRNG,
): DefensiveCall {
  const personnel = selectPersonnel(state, formation, rng);
  const coverage = selectCoverage(state, formation, personnel, rng);
  const blitz = selectBlitz(state, personnel, rng);

  return { personnel, coverage, blitz };
}

// ============================================================================
// Defensive Modifiers Calculation
// ============================================================================

/**
 * Compute the composite defensive modifiers for a given DefensiveCall.
 * The play generator uses these multipliers to adjust completion rates,
 * sack probability, run yardage, and screen effectiveness.
 *
 * Modifiers are layered multiplicatively:
 *   personnel base x coverage modifier x blitz modifier
 *
 * @param call - The defensive play call (personnel + coverage + blitz)
 * @returns DefensiveModifiers with all multipliers computed
 */
export function getDefensiveModifiers(call: DefensiveCall): DefensiveModifiers {
  const base = PERSONNEL_MODIFIERS[call.personnel];
  const cov = COVERAGE_MODIFIERS[call.coverage];
  const blz = BLITZ_MODIFIERS[call.blitz];

  return {
    sackRateMultiplier:
      base.sackRateMultiplier * cov.sackRateMultiplier * blz.sackRateMultiplier,
    shortCompletionModifier:
      base.shortCompletionModifier *
      cov.shortCompletionModifier *
      blz.shortCompletionModifier,
    mediumCompletionModifier:
      base.mediumCompletionModifier *
      cov.mediumCompletionModifier *
      blz.mediumCompletionModifier,
    deepCompletionModifier:
      base.deepCompletionModifier *
      cov.deepCompletionModifier *
      blz.deepCompletionModifier,
    runYardModifier: base.runYardModifier,
    screenModifier: base.screenModifier * cov.screenModifier * blz.screenModifier,
    extraRushers: base.extraRushers + blz.extraRushers,
  };
}
