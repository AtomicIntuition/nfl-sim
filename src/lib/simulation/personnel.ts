// ============================================================================
// GridBlitz - Offensive Personnel Grouping System
// ============================================================================
// Selects personnel groupings (11, 12, 21, etc.) based on game situation
// and constrains formation selection to grouping-legal formations.
// Based on Bruce Arians' 2016 Cardinals offensive playbook.
// ============================================================================

import type {
  GameState,
  Formation,
  PersonnelGrouping,
  SeededRNG,
  WeightedOption,
} from './types';

import { selectFormation } from './formations';

// ============================================================================
// Personnel-to-Formation Mapping
// ============================================================================

const PERSONNEL_FORMATIONS: Record<PersonnelGrouping, Formation[]> = {
  '00': ['spread', 'empty', 'shotgun'],
  '10': ['spread', 'shotgun', 'empty'],
  '11': ['shotgun', 'singleback', 'pistol', 'spread', 'under_center'],
  '12': ['singleback', 'under_center', 'pistol', 'shotgun', 'i_formation'],
  '13': ['under_center', 'i_formation', 'singleback', 'goal_line'],
  '21': ['under_center', 'i_formation', 'singleback', 'pistol'],
  '22': ['i_formation', 'under_center', 'goal_line'],
};

// ============================================================================
// Situation Detection
// ============================================================================

function isTwoMinuteSituation(state: GameState): boolean {
  return (state.quarter === 2 || state.quarter === 4) && state.clock <= 120;
}

function isGoalLineSituation(state: GameState): boolean {
  return state.ballPosition >= 95;
}

function isShortYardage(state: GameState): boolean {
  return state.yardsToGo <= 2 && state.down >= 2;
}

// ============================================================================
// Personnel Selection
// ============================================================================

/**
 * Select an offensive personnel grouping based on game situation.
 * Returns a grouping like '11' (1 RB, 1 TE) that constrains which
 * formations are available.
 */
export function selectPersonnelGrouping(
  state: GameState,
  rng: SeededRNG,
): PersonnelGrouping {
  const team = state.possession === 'home' ? state.homeTeam : state.awayTeam;

  let weights: WeightedOption<PersonnelGrouping>[];

  if (isTwoMinuteSituation(state)) {
    weights = [
      { value: '11', weight: 45 },
      { value: '10', weight: 30 },
      { value: '00', weight: 15 },
      { value: '12', weight: 10 },
    ];
  } else if (isGoalLineSituation(state)) {
    weights = [
      { value: '22', weight: 30 },
      { value: '13', weight: 25 },
      { value: '21', weight: 20 },
      { value: '12', weight: 15 },
      { value: '11', weight: 10 },
    ];
  } else if (isShortYardage(state)) {
    weights = [
      { value: '21', weight: 25 },
      { value: '22', weight: 20 },
      { value: '12', weight: 20 },
      { value: '13', weight: 15 },
      { value: '11', weight: 20 },
    ];
  } else {
    // Normal situation
    weights = [
      { value: '11', weight: 55 },
      { value: '12', weight: 18 },
      { value: '21', weight: 10 },
      { value: '10', weight: 8 },
      { value: '13', weight: 4 },
      { value: '22', weight: 3 },
      { value: '00', weight: 2 },
    ];
  }

  // PlayStyle shift: ±15 between light and heavy groupings
  const lightGroupings: PersonnelGrouping[] = ['00', '10', '11'];
  const heavyGroupings: PersonnelGrouping[] = ['13', '21', '22'];

  if (team.playStyle === 'pass_heavy' || team.playStyle === 'aggressive') {
    weights = weights.map(w => ({
      value: w.value,
      weight: lightGroupings.includes(w.value)
        ? w.weight + 5
        : heavyGroupings.includes(w.value)
          ? Math.max(1, w.weight - 5)
          : w.weight,
    }));
  } else if (team.playStyle === 'run_heavy' || team.playStyle === 'conservative') {
    weights = weights.map(w => ({
      value: w.value,
      weight: heavyGroupings.includes(w.value)
        ? w.weight + 5
        : lightGroupings.includes(w.value)
          ? Math.max(1, w.weight - 5)
          : w.weight,
    }));
  }

  return rng.weightedChoice(weights);
}

// ============================================================================
// Formation Constraint
// ============================================================================

/**
 * Get the list of formations allowed for a given personnel grouping.
 */
export function getFormationsForPersonnel(pg: PersonnelGrouping): Formation[] {
  return PERSONNEL_FORMATIONS[pg];
}

/**
 * Select a formation that's legal for the given personnel grouping.
 * Uses the existing selectFormation() logic, then constrains the result
 * to formations valid for the personnel. Falls back to the first allowed
 * formation if the unconstrained pick is invalid.
 */
export function selectFormationWithPersonnel(
  state: GameState,
  pg: PersonnelGrouping,
  rng: SeededRNG,
): Formation {
  const allowedFormations = PERSONNEL_FORMATIONS[pg];

  // Try the standard formation selection first
  const preferred = selectFormation(state, rng);

  // If the preferred formation is allowed for this personnel, use it
  if (allowedFormations.includes(preferred)) {
    return preferred;
  }

  // Otherwise, pick from the allowed formations weighted by position in array
  // (earlier = more natural for that grouping)
  const weights: WeightedOption<Formation>[] = allowedFormations.map((f, i) => ({
    value: f,
    weight: allowedFormations.length - i,
  }));

  return rng.weightedChoice(weights);
}
