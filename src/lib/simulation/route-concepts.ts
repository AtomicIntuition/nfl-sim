// ============================================================================
// GridBlitz - Route Concept System
// ============================================================================
// Selects named route concepts based on play call depth and pre-snap
// coverage read (MOFO vs MOFC). Applies concept-specific modifiers
// against the actual defensive coverage for strategic rock-paper-scissors.
// Based on Bruce Arians' 2016 Cardinals passing playbook.
// ============================================================================

import type {
  PlayCall,
  DefensiveCall,
  RouteConcept,
  CoverageType,
  SeededRNG,
  WeightedOption,
} from './types';

// ============================================================================
// Coverage Classification
// ============================================================================

/** MOFO = Middle Of Field Open (two-high safeties). */
function isMOFO(coverage: CoverageType): boolean {
  return coverage === 'cover_2' || coverage === 'cover_4' || coverage === 'cover_6';
}

// ============================================================================
// Concept Selection Tables
// ============================================================================
// Each play call depth has a MOFO (2-high) and MOFC (1-high/man) table.
// Weights sum to 100 for readability.

type ConceptTable = WeightedOption<RouteConcept>[];

interface DepthConceptTables {
  mofo: ConceptTable;
  mofc: ConceptTable;
}

const CONCEPT_TABLES: Record<string, DepthConceptTables> = {
  pass_quick: {
    mofo: [
      { value: 'stick', weight: 40 },
      { value: 'angle', weight: 30 },
      { value: 'shake', weight: 30 },
    ],
    mofc: [
      { value: 'hitch', weight: 50 },
      { value: 'stick', weight: 30 },
      { value: 'angle', weight: 20 },
    ],
  },
  pass_short: {
    mofo: [
      { value: 'hitch', weight: 35 },
      { value: 'curl', weight: 35 },
      { value: 'shake', weight: 30 },
    ],
    mofc: [
      { value: 'curl', weight: 40 },
      { value: 'shake', weight: 35 },
      { value: 'hitch', weight: 25 },
    ],
  },
  pass_medium: {
    mofo: [
      { value: 'bench', weight: 30 },
      { value: 'blinky', weight: 25 },
      { value: 'cross', weight: 25 },
      { value: 'semi', weight: 20 },
    ],
    mofc: [
      { value: 'drive', weight: 35 },
      { value: 'cross', weight: 30 },
      { value: 'semi', weight: 20 },
      { value: 'blinky', weight: 15 },
    ],
  },
  pass_deep: {
    mofo: [
      { value: 'pylon', weight: 25 },
      { value: 'delta', weight: 25 },
      { value: 'cab', weight: 20 },
      { value: 'caddy', weight: 15 },
      { value: 'x_ray', weight: 15 },
    ],
    mofc: [
      { value: 'go', weight: 35 },
      { value: 'x_ray', weight: 25 },
      { value: 'delta', weight: 15 },
      { value: 'pylon', weight: 15 },
      { value: 'caddy', weight: 10 },
    ],
  },
  screen_pass: {
    mofo: [{ value: 'screen', weight: 100 }],
    mofc: [{ value: 'screen', weight: 100 }],
  },
  play_action_short: {
    mofo: [
      { value: 'semi', weight: 40 },
      { value: 'cross', weight: 30 },
      { value: 'angle', weight: 30 },
    ],
    mofc: [
      { value: 'drive', weight: 40 },
      { value: 'blinky', weight: 30 },
      { value: 'cross', weight: 30 },
    ],
  },
  play_action_deep: {
    mofo: [
      { value: 'cab', weight: 25 },
      { value: 'pylon', weight: 25 },
      { value: 'go', weight: 20 },
      { value: 'caddy', weight: 15 },
      { value: 'x_ray', weight: 15 },
    ],
    mofc: [
      { value: 'go', weight: 30 },
      { value: 'x_ray', weight: 25 },
      { value: 'delta', weight: 20 },
      { value: 'pylon', weight: 15 },
      { value: 'caddy', weight: 10 },
    ],
  },
};

// ============================================================================
// Concept-Coverage Modifiers
// ============================================================================
// Positive = concept exploits coverage weakness.
// Negative = coverage is strong against this concept.

interface ConceptModifiers {
  completionBonus: number;
  yardsBonus: number;
}

const CONCEPT_COVERAGE_MODIFIERS: Partial<Record<RouteConcept, Partial<Record<CoverageType, ConceptModifiers>>>> = {
  // Short concepts
  hitch: {
    cover_3: { completionBonus: 0.03, yardsBonus: 1 },
    cover_2: { completionBonus: -0.02, yardsBonus: 0 },
  },
  curl: {
    cover_3: { completionBonus: 0.04, yardsBonus: 1 },
    man_press: { completionBonus: -0.02, yardsBonus: -1 },
  },
  shake: {
    man_press: { completionBonus: 0.06, yardsBonus: 2 },
    cover_1: { completionBonus: 0.04, yardsBonus: 1 },
    cover_3: { completionBonus: -0.02, yardsBonus: -1 },
  },
  angle: {
    cover_2: { completionBonus: 0.03, yardsBonus: 1 },
    cover_4: { completionBonus: -0.02, yardsBonus: 0 },
  },
  stick: {
    cover_3: { completionBonus: 0.03, yardsBonus: 1 },
    cover_0: { completionBonus: -0.02, yardsBonus: -1 },
  },

  // Medium concepts
  semi: {
    cover_2: { completionBonus: 0.04, yardsBonus: 1 },
    cover_1: { completionBonus: -0.02, yardsBonus: 0 },
  },
  bench: {
    cover_3: { completionBonus: 0.05, yardsBonus: 2 },
    man_press: { completionBonus: -0.03, yardsBonus: -1 },
    cover_1: { completionBonus: -0.02, yardsBonus: -1 },
  },
  drive: {
    cover_1: { completionBonus: 0.06, yardsBonus: 2 },
    man_press: { completionBonus: 0.04, yardsBonus: 1 },
    cover_4: { completionBonus: -0.02, yardsBonus: 0 },
  },
  cross: {
    cover_1: { completionBonus: 0.05, yardsBonus: 2 },
    man_press: { completionBonus: 0.04, yardsBonus: 1 },
    cover_6: { completionBonus: -0.02, yardsBonus: 0 },
  },
  blinky: {
    cover_2: { completionBonus: 0.04, yardsBonus: 1 },
    cover_3: { completionBonus: 0.03, yardsBonus: 1 },
    cover_4: { completionBonus: -0.03, yardsBonus: -1 },
  },

  // Deep concepts
  go: {
    cover_1: { completionBonus: 0.05, yardsBonus: 3 },
    cover_0: { completionBonus: 0.04, yardsBonus: 2 },
    cover_2: { completionBonus: -0.04, yardsBonus: -2 },
    cover_4: { completionBonus: -0.05, yardsBonus: -2 },
  },
  cab: {
    cover_3: { completionBonus: 0.04, yardsBonus: 2 },
    cover_6: { completionBonus: 0.03, yardsBonus: 1 },
    cover_4: { completionBonus: -0.03, yardsBonus: -1 },
  },
  pylon: {
    cover_2: { completionBonus: 0.06, yardsBonus: 3 },
    cover_6: { completionBonus: 0.03, yardsBonus: 1 },
    cover_4: { completionBonus: -0.04, yardsBonus: -2 },
  },
  x_ray: {
    man_press: { completionBonus: 0.07, yardsBonus: 3 },
    cover_1: { completionBonus: 0.05, yardsBonus: 2 },
    cover_4: { completionBonus: -0.03, yardsBonus: -1 },
    cover_6: { completionBonus: -0.02, yardsBonus: -1 },
  },
  delta: {
    cover_2: { completionBonus: 0.05, yardsBonus: 2 },
    cover_6: { completionBonus: 0.03, yardsBonus: 1 },
    cover_1: { completionBonus: -0.03, yardsBonus: -1 },
  },
  caddy: {
    // 18-yard comeback; converts to drive vs cover 2 rotation
    cover_2: { completionBonus: 0.05, yardsBonus: 2 },
    cover_3: { completionBonus: 0.03, yardsBonus: 1 },
    man_press: { completionBonus: -0.02, yardsBonus: -1 },
    cover_4: { completionBonus: -0.03, yardsBonus: -1 },
  },

  // Special
  screen: {},
  waggle: {
    man_press: { completionBonus: 0.04, yardsBonus: 2 },
    cover_0: { completionBonus: 0.03, yardsBonus: 1 },
  },
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Select a named route concept based on the play call depth and
 * pre-snap coverage read. The QB identifies MOFO vs MOFC and
 * selects from the appropriate concept table.
 */
export function selectRouteConcept(
  call: PlayCall,
  defensiveCall: DefensiveCall,
  rng: SeededRNG,
): RouteConcept | undefined {
  const tables = CONCEPT_TABLES[call];
  if (!tables) return undefined;

  const table = isMOFO(defensiveCall.coverage) ? tables.mofo : tables.mofc;
  return rng.weightedChoice(table);
}

/**
 * Get the completion and yardage modifiers for a concept against
 * a specific coverage. Returns zeros if no special interaction exists.
 */
export function getRouteConceptModifiers(
  concept: RouteConcept,
  coverage: CoverageType,
): ConceptModifiers {
  const conceptMods = CONCEPT_COVERAGE_MODIFIERS[concept];
  if (!conceptMods) return { completionBonus: 0, yardsBonus: 0 };

  const coverageMods = conceptMods[coverage];
  if (!coverageMods) return { completionBonus: 0, yardsBonus: 0 };

  return coverageMods;
}
