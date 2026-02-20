// ============================================================================
// GridIron Live - Offensive Formation System
// ============================================================================
// Selects offensive formations based on game situation, down/distance,
// field position, and team playStyle. Each formation carries modifiers
// that affect sack rate, run success, play-action effectiveness, etc.
// ============================================================================

import type { GameState, Formation, PlayStyle, SeededRNG, WeightedOption } from './types';

// ============================================================================
// Formation Modifier Data
// ============================================================================

export interface FormationModifiers {
  /** Multiplier on sack rate (< 1.0 = better protection). */
  sackRateMultiplier: number;
  /** Additive modifier to run yard mean. */
  runYardBonus: number;
  /** Multiplier on play-action effectiveness (completion rate bonus). */
  playActionBonus: number;
  /** Multiplier on QB scramble rate (> 1.0 = more scrambles). */
  scrambleMultiplier: number;
  /** Multiplier on screen pass success. */
  screenBonus: number;
  /** Multiplier on deep pass completion rate. */
  deepPassModifier: number;
  /** How likely QB is to get the ball out quick (reduces sack on quick passes). */
  quickReleaseBonus: number;
}

const FORMATION_DATA: Record<Formation, FormationModifiers> = {
  under_center: {
    sackRateMultiplier: 1.1,    // Slower drop, more sack risk
    runYardBonus: 0.8,          // Strong run game
    playActionBonus: 1.4,       // Play action very effective from under center
    scrambleMultiplier: 0.6,    // Hard to scramble from under center
    screenBonus: 1.0,
    deepPassModifier: 0.95,
    quickReleaseBonus: 0.9,
  },
  shotgun: {
    sackRateMultiplier: 0.85,   // Better vision, faster release
    runYardBonus: -0.3,         // Slightly weaker run game
    playActionBonus: 0.7,       // Play action less convincing
    scrambleMultiplier: 1.4,    // Easy to scramble
    screenBonus: 1.1,
    deepPassModifier: 1.05,
    quickReleaseBonus: 1.15,
  },
  pistol: {
    sackRateMultiplier: 0.95,
    runYardBonus: 0.3,          // Decent run game
    playActionBonus: 1.2,       // Good play action disguise
    scrambleMultiplier: 1.2,
    screenBonus: 1.0,
    deepPassModifier: 1.0,
    quickReleaseBonus: 1.05,
  },
  spread: {
    sackRateMultiplier: 0.80,   // Quick passes reduce sack risk
    runYardBonus: -0.5,         // Weaker run game (fewer blockers)
    playActionBonus: 0.5,       // Play action unconvincing in spread
    scrambleMultiplier: 1.5,    // Lots of room to scramble
    screenBonus: 1.3,           // Screens great from spread
    deepPassModifier: 1.1,      // Stretches defense
    quickReleaseBonus: 1.2,
  },
  i_formation: {
    sackRateMultiplier: 1.15,   // Slow developing plays
    runYardBonus: 1.2,          // Power run game
    playActionBonus: 1.5,       // Best play-action formation
    scrambleMultiplier: 0.5,    // QB buried behind fullback
    screenBonus: 0.8,
    deepPassModifier: 0.9,
    quickReleaseBonus: 0.85,
  },
  singleback: {
    sackRateMultiplier: 1.0,    // Neutral
    runYardBonus: 0.5,          // Solid run game
    playActionBonus: 1.1,
    scrambleMultiplier: 1.0,
    screenBonus: 1.0,
    deepPassModifier: 1.0,
    quickReleaseBonus: 1.0,
  },
  goal_line: {
    sackRateMultiplier: 1.2,    // Heavy formation, slow development
    runYardBonus: 1.5,          // Maximum run blocking
    playActionBonus: 1.3,       // Effective because defense expects run
    scrambleMultiplier: 0.3,
    screenBonus: 0.5,
    deepPassModifier: 0.6,
    quickReleaseBonus: 0.7,
  },
  empty: {
    sackRateMultiplier: 1.1,    // No RB to block = more pressure
    runYardBonus: -2.0,         // Almost no run game
    playActionBonus: 0.3,       // No one to fake to
    scrambleMultiplier: 1.3,    // Open field for QB
    screenBonus: 1.4,           // Bubble screens very effective
    deepPassModifier: 1.15,     // Maximum route runners
    quickReleaseBonus: 1.25,    // Must get ball out fast
  },
  wildcat: {
    sackRateMultiplier: 0.7,    // Rare, catches defense off guard
    runYardBonus: 1.0,          // Good surprise run
    playActionBonus: 0.4,
    scrambleMultiplier: 2.0,    // Direct snap to RB = scramble-heavy
    screenBonus: 0.6,
    deepPassModifier: 0.4,      // Bad passing formation
    quickReleaseBonus: 0.5,
  },
};

export function getFormationModifiers(formation: Formation): FormationModifiers {
  return FORMATION_DATA[formation];
}

// ============================================================================
// Formation Selection
// ============================================================================

/**
 * Select an offensive formation based on game situation.
 * Returns a formation that makes tactical sense for the current down,
 * distance, field position, score, and team playStyle.
 */
export function selectFormation(
  state: GameState,
  rng: SeededRNG,
): Formation {
  const team = state.possession === 'home' ? state.homeTeam : state.awayTeam;

  // Goal line (inside the 3)
  if (state.ballPosition >= 97 && !state.kickoff && !state.patAttempt) {
    return rng.weightedChoice<Formation>([
      { value: 'goal_line', weight: 50 },
      { value: 'i_formation', weight: 20 },
      { value: 'shotgun', weight: 15 },
      { value: 'under_center', weight: 15 },
    ]);
  }

  // Short yardage (1-2 yards to go)
  if (state.yardsToGo <= 2 && state.down >= 3) {
    return rng.weightedChoice<Formation>([
      { value: 'under_center', weight: 35 },
      { value: 'i_formation', weight: 25 },
      { value: 'goal_line', weight: 15 },
      { value: 'pistol', weight: 15 },
      { value: 'shotgun', weight: 10 },
    ]);
  }

  // Two-minute drill / hurry-up
  const isLateHalf = (state.quarter === 2 || state.quarter === 4) && state.clock <= 120;
  if (isLateHalf) {
    return rng.weightedChoice<Formation>([
      { value: 'shotgun', weight: 45 },
      { value: 'spread', weight: 25 },
      { value: 'empty', weight: 15 },
      { value: 'pistol', weight: 15 },
    ]);
  }

  // 3rd and long (8+ yards)
  if (state.down === 3 && state.yardsToGo >= 8) {
    return rng.weightedChoice<Formation>([
      { value: 'shotgun', weight: 40 },
      { value: 'spread', weight: 30 },
      { value: 'empty', weight: 15 },
      { value: 'singleback', weight: 15 },
    ]);
  }

  // Red zone (inside 20)
  if (state.ballPosition >= 80) {
    return rng.weightedChoice<Formation>([
      { value: 'shotgun', weight: 25 },
      { value: 'singleback', weight: 20 },
      { value: 'under_center', weight: 20 },
      { value: 'i_formation', weight: 15 },
      { value: 'pistol', weight: 10 },
      { value: 'spread', weight: 10 },
    ]);
  }

  // Normal down — base distribution modified by playStyle
  const baseWeights = getBaseFormationWeights(team.playStyle);
  return rng.weightedChoice(baseWeights);
}

function getBaseFormationWeights(playStyle: PlayStyle): WeightedOption<Formation>[] {
  switch (playStyle) {
    case 'pass_heavy':
      return [
        { value: 'shotgun', weight: 35 },
        { value: 'spread', weight: 20 },
        { value: 'singleback', weight: 15 },
        { value: 'pistol', weight: 12 },
        { value: 'empty', weight: 8 },
        { value: 'under_center', weight: 7 },
        { value: 'i_formation', weight: 3 },
      ];
    case 'run_heavy':
      return [
        { value: 'under_center', weight: 25 },
        { value: 'i_formation', weight: 22 },
        { value: 'singleback', weight: 18 },
        { value: 'pistol', weight: 15 },
        { value: 'shotgun', weight: 12 },
        { value: 'goal_line', weight: 5 },
        { value: 'wildcat', weight: 3 },
      ];
    case 'aggressive':
      return [
        { value: 'shotgun', weight: 30 },
        { value: 'spread', weight: 22 },
        { value: 'pistol', weight: 18 },
        { value: 'empty', weight: 10 },
        { value: 'singleback', weight: 10 },
        { value: 'under_center', weight: 7 },
        { value: 'wildcat', weight: 3 },
      ];
    case 'conservative':
      return [
        { value: 'under_center', weight: 25 },
        { value: 'singleback', weight: 22 },
        { value: 'i_formation', weight: 18 },
        { value: 'pistol', weight: 15 },
        { value: 'shotgun', weight: 15 },
        { value: 'spread', weight: 5 },
      ];
    case 'balanced':
    default:
      return [
        { value: 'shotgun', weight: 25 },
        { value: 'singleback', weight: 20 },
        { value: 'under_center', weight: 15 },
        { value: 'pistol', weight: 15 },
        { value: 'i_formation', weight: 10 },
        { value: 'spread', weight: 10 },
        { value: 'empty', weight: 3 },
        { value: 'wildcat', weight: 2 },
      ];
  }
}
