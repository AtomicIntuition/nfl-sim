// ============================================================================
// GridBlitz - Defensive Coordinator AI
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
  DefensiveFront,
  RunStunt,
  PassRushGame,
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
    shortCompletionModifier: 1.15, // Give up underneath
    mediumCompletionModifier: 0.90,
    deepCompletionModifier: 0.70, // Primary purpose: prevent deep completions
    runYardModifier: 1.3,
    screenModifier: 1.2, // Vulnerable to screens
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
 *
 * Prevent defense triggers when:
 * - Leading by 10+ with under 2 minutes in Q4/OT
 * - Leading by any amount with under 30 seconds in Q4/OT
 */
function isPreventSituation(state: GameState): boolean {
  if (state.quarter !== 4 && state.quarter !== 'OT') return false;

  const defensiveTeam = state.possession === 'home' ? 'away' : 'home';
  const defenseScore = defensiveTeam === 'home' ? state.homeScore : state.awayScore;
  const offenseScore = defensiveTeam === 'home' ? state.awayScore : state.homeScore;
  const lead = defenseScore - offenseScore;

  if (lead <= 0) return false;

  // Leading by any amount with < 30 seconds
  if (state.clock <= 30) return true;

  // Leading by 10+ with < 2 minutes
  if (state.clock <= 120 && lead >= 10) return true;

  return false;
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
// Front Selection (Rex Ryan 3-4 Scheme)
// ============================================================================

/**
 * Check if the offensive formation suggests a run-heavy tendency.
 */
function isRunHeavyFormationForFront(formation: Formation): boolean {
  return formation === 'under_center' || formation === 'i_formation' || formation === 'goal_line';
}

/**
 * Check if the offensive formation suggests a pass tendency.
 */
function isPassFormation(formation: Formation): boolean {
  return formation === 'shotgun' || formation === 'spread' || formation === 'empty';
}

/**
 * Select a defensive front alignment. Only applies to base_3_4 personnel.
 * Rex Ryan's 3-4 variations: Odd (base), Over, Under, Reduce, Sink/46.
 */
function selectFront(
  state: GameState,
  formation: Formation,
  rng: SeededRNG,
): DefensiveFront {
  if (isRunHeavyFormationForFront(formation)) {
    return rng.weightedChoice<DefensiveFront>([
      { value: 'under', weight: 30 },
      { value: 'reduce', weight: 25 },
      { value: 'odd', weight: 20 },
      { value: 'sink_46', weight: 15 },
      { value: 'over', weight: 10 },
    ]);
  }

  if (isPassFormation(formation)) {
    return rng.weightedChoice<DefensiveFront>([
      { value: 'over', weight: 35 },
      { value: 'odd', weight: 30 },
      { value: 'under', weight: 20 },
      { value: 'reduce', weight: 10 },
      { value: 'sink_46', weight: 5 },
    ]);
  }

  // Default
  return rng.weightedChoice<DefensiveFront>([
    { value: 'odd', weight: 35 },
    { value: 'over', weight: 25 },
    { value: 'under', weight: 20 },
    { value: 'reduce', weight: 12 },
    { value: 'sink_46', weight: 8 },
  ]);
}

// ============================================================================
// Front Modifiers
// ============================================================================

interface FrontModifierSet {
  sackRateMultiplier: number;
  runYardModifier: number;
  shortCompletionModifier: number;
  deepCompletionModifier: number;
}

const FRONT_MODIFIERS: Record<DefensiveFront, FrontModifierSet> = {
  odd:      { sackRateMultiplier: 1.0,  runYardModifier: 1.0,  shortCompletionModifier: 1.0,  deepCompletionModifier: 1.0  },
  over:     { sackRateMultiplier: 1.08, runYardModifier: 1.02, shortCompletionModifier: 0.97, deepCompletionModifier: 1.0  },
  under:    { sackRateMultiplier: 0.95, runYardModifier: 0.92, shortCompletionModifier: 1.02, deepCompletionModifier: 1.0  },
  reduce:   { sackRateMultiplier: 0.90, runYardModifier: 0.88, shortCompletionModifier: 1.04, deepCompletionModifier: 1.02 },
  sink_46:  { sackRateMultiplier: 1.15, runYardModifier: 0.82, shortCompletionModifier: 0.95, deepCompletionModifier: 1.10 },
};

// ============================================================================
// Run Stunt Selection
// ============================================================================

/**
 * Select a run defense stunt. Only applies to base_4_3 and base_3_4.
 */
function selectRunStunt(
  state: GameState,
  personnel: DefensivePersonnel,
  rng: SeededRNG,
): RunStunt {
  if (personnel !== 'base_4_3' && personnel !== 'base_3_4') return 'none';

  // Run-expected downs: 1st down, 2nd and short
  const isRunExpected = state.down === 1 || (state.down === 2 && state.yardsToGo <= 4);

  if (isRunExpected) {
    return rng.weightedChoice<RunStunt>([
      { value: 'none', weight: 55 },
      { value: 'stir', weight: 25 },
      { value: 'knife', weight: 20 },
    ]);
  }

  return rng.weightedChoice<RunStunt>([
    { value: 'none', weight: 75 },
    { value: 'stir', weight: 15 },
    { value: 'knife', weight: 10 },
  ]);
}

// ============================================================================
// Run Stunt Modifiers
// ============================================================================

interface RunStuntModifierSet {
  runYardModifier: number;
  screenModifier: number;
}

const RUN_STUNT_MODIFIERS: Record<RunStunt, RunStuntModifierSet> = {
  none:  { runYardModifier: 1.0,  screenModifier: 1.0  },
  stir:  { runYardModifier: 0.88, screenModifier: 1.15 },
  knife: { runYardModifier: 0.92, screenModifier: 1.08 },
};

// ============================================================================
// Pass Rush Game Selection
// ============================================================================

/**
 * Select a pass rush game (DL twist/stunt). Only when no blitz is called
 * and not in prevent/dime.
 */
function selectPassRushGame(
  state: GameState,
  personnel: DefensivePersonnel,
  blitz: BlitzPackage,
  rng: SeededRNG,
): PassRushGame {
  // Only when standard rush (no blitz) and not prevent/dime
  if (blitz !== 'none') return 'none';
  if (personnel === 'prevent' || personnel === 'dime') return 'none';

  // Passing downs: 3rd and 5+
  const isPassingDown = state.down >= 3 && state.yardsToGo >= 5;

  if (isPassingDown) {
    return rng.weightedChoice<PassRushGame>([
      { value: 'none', weight: 50 },
      { value: 't_e', weight: 20 },
      { value: 'e_t', weight: 18 },
      { value: 'tom', weight: 12 },
    ]);
  }

  return rng.weightedChoice<PassRushGame>([
    { value: 'none', weight: 70 },
    { value: 't_e', weight: 12 },
    { value: 'e_t', weight: 10 },
    { value: 'tom', weight: 8 },
  ]);
}

// ============================================================================
// Pass Rush Game Modifiers
// ============================================================================

interface PassRushGameModifierSet {
  sackRateMultiplier: number;
  screenModifier: number;
}

const PASS_RUSH_GAME_MODIFIERS: Record<PassRushGame, PassRushGameModifierSet> = {
  none: { sackRateMultiplier: 1.0,  screenModifier: 1.0  },
  t_e:  { sackRateMultiplier: 1.12, screenModifier: 1.10 },
  e_t:  { sackRateMultiplier: 1.15, screenModifier: 1.05 },
  tom:  { sackRateMultiplier: 1.18, screenModifier: 1.15 },
};

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Call a defensive play based on the current game state and offensive formation.
 * Selects personnel grouping, coverage scheme, blitz package, and optionally
 * a 3-4 front alignment, run stunt, and pass rush game.
 *
 * @param state     - Current game state (score, clock, down, distance, etc.)
 * @param formation - The offensive formation the defense is reacting to
 * @param rng       - Seeded RNG for deterministic selection
 * @returns A complete DefensiveCall with all selected layers
 */
export function callDefense(
  state: GameState,
  formation: Formation,
  rng: SeededRNG,
): DefensiveCall {
  const personnel = selectPersonnel(state, formation, rng);
  const coverage = selectCoverage(state, formation, personnel, rng);
  const blitz = selectBlitz(state, personnel, rng);

  // 3-4 front selection (only for base_3_4)
  const front = personnel === 'base_3_4'
    ? selectFront(state, formation, rng)
    : undefined;

  // Run stunt (only for base personnel)
  const runStunt = selectRunStunt(state, personnel, rng);

  // Pass rush game (only when no blitz, not prevent/dime)
  const passRushGame = selectPassRushGame(state, personnel, blitz, rng);

  return {
    personnel,
    coverage,
    blitz,
    ...(front && { front }),
    ...(runStunt !== 'none' && { runStunt }),
    ...(passRushGame !== 'none' && { passRushGame }),
  };
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
 *   personnel base x coverage x blitz x front x stunt x rush game
 *
 * @param call - The defensive play call (personnel + coverage + blitz + optional layers)
 * @returns DefensiveModifiers with all multipliers computed
 */
export function getDefensiveModifiers(call: DefensiveCall): DefensiveModifiers {
  const base = PERSONNEL_MODIFIERS[call.personnel];
  const cov = COVERAGE_MODIFIERS[call.coverage];
  const blz = BLITZ_MODIFIERS[call.blitz];

  let sackRate = base.sackRateMultiplier * cov.sackRateMultiplier * blz.sackRateMultiplier;
  let shortComp = base.shortCompletionModifier * cov.shortCompletionModifier * blz.shortCompletionModifier;
  let medComp = base.mediumCompletionModifier * cov.mediumCompletionModifier * blz.mediumCompletionModifier;
  let deepComp = base.deepCompletionModifier * cov.deepCompletionModifier * blz.deepCompletionModifier;
  let runYard = base.runYardModifier;
  let screen = base.screenModifier * cov.screenModifier * blz.screenModifier;

  // Layer front modifiers (3-4 only)
  if (call.front) {
    const fm = FRONT_MODIFIERS[call.front];
    sackRate *= fm.sackRateMultiplier;
    runYard *= fm.runYardModifier;
    shortComp *= fm.shortCompletionModifier;
    deepComp *= fm.deepCompletionModifier;
  }

  // Layer run stunt modifiers
  if (call.runStunt) {
    const sm = RUN_STUNT_MODIFIERS[call.runStunt];
    runYard *= sm.runYardModifier;
    screen *= sm.screenModifier;
  }

  // Layer pass rush game modifiers
  if (call.passRushGame) {
    const pm = PASS_RUSH_GAME_MODIFIERS[call.passRushGame];
    sackRate *= pm.sackRateMultiplier;
    screen *= pm.screenModifier;
  }

  return {
    sackRateMultiplier: sackRate,
    shortCompletionModifier: shortComp,
    mediumCompletionModifier: medComp,
    deepCompletionModifier: deepComp,
    runYardModifier: runYard,
    screenModifier: screen,
    extraRushers: base.extraRushers + blz.extraRushers,
  };
}
