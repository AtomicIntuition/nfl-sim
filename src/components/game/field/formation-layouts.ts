import type { Formation, DefensivePersonnel } from '@/lib/simulation/types';

/**
 * Formation coordinate layouts for 9 offensive and 6 defensive formations.
 * Each position is defined relative to the line of scrimmage (LOS).
 * x: offset from LOS (positive = behind offense / toward own end zone)
 * y: lateral position (0 = far left, 100 = far right, 50 = center)
 */

export interface FormationPosition {
  x: number;     // Offset from LOS (positive = behind offense)
  y: number;     // Lateral position (0-100)
  role: string;  // Position label: QB, RB, WR, TE, OL, etc.
}

// ════════════════════════════════════════════════════════════════
// OFFENSIVE FORMATIONS
// ════════════════════════════════════════════════════════════════

const OL_BASE: FormationPosition[] = [
  { x: 0, y: 42, role: 'OL' },
  { x: 0, y: 46, role: 'OL' },
  { x: 0, y: 50, role: 'OL' },
  { x: 0, y: 54, role: 'OL' },
  { x: 0, y: 58, role: 'OL' },
];

export const OFFENSIVE_FORMATIONS: Record<Formation, FormationPosition[]> = {
  shotgun: [
    ...OL_BASE,
    { x: 5, y: 50, role: 'QB' },
    { x: 5, y: 56, role: 'RB' },
    { x: 0.3, y: 64, role: 'TE' },
    { x: 0.5, y: 12, role: 'WR' },
    { x: 0.5, y: 88, role: 'WR' },
    { x: 0.3, y: 28, role: 'WR' },
  ],

  under_center: [
    ...OL_BASE,
    { x: 0.5, y: 50, role: 'QB' },
    { x: 5, y: 50, role: 'RB' },
    { x: 0.3, y: 38, role: 'TE' },
    { x: 0.5, y: 12, role: 'WR' },
    { x: 0.5, y: 88, role: 'WR' },
    { x: 0.3, y: 64, role: 'TE' },
  ],

  pistol: [
    ...OL_BASE,
    { x: 3, y: 50, role: 'QB' },
    { x: 6, y: 50, role: 'RB' },
    { x: 0.3, y: 64, role: 'TE' },
    { x: 0.5, y: 12, role: 'WR' },
    { x: 0.5, y: 88, role: 'WR' },
    { x: 0.3, y: 28, role: 'WR' },
  ],

  spread: [
    ...OL_BASE,
    { x: 5, y: 50, role: 'QB' },
    { x: 5, y: 57, role: 'RB' },
    { x: 0.5, y: 8, role: 'WR' },
    { x: 0.5, y: 25, role: 'WR' },
    { x: 0.5, y: 75, role: 'WR' },
    { x: 0.5, y: 92, role: 'WR' },
  ],

  i_formation: [
    ...OL_BASE,
    { x: 0.5, y: 50, role: 'QB' },
    { x: 3, y: 50, role: 'FB' },
    { x: 6, y: 50, role: 'RB' },
    { x: 0.3, y: 38, role: 'TE' },
    { x: 0.5, y: 12, role: 'WR' },
    { x: 0.5, y: 88, role: 'WR' },
  ],

  singleback: [
    ...OL_BASE,
    { x: 0.5, y: 50, role: 'QB' },
    { x: 5, y: 50, role: 'RB' },
    { x: 0.3, y: 38, role: 'TE' },
    { x: 0.5, y: 12, role: 'WR' },
    { x: 0.5, y: 88, role: 'WR' },
    { x: 0.3, y: 28, role: 'WR' },
  ],

  goal_line: [
    ...OL_BASE,
    { x: 0.5, y: 50, role: 'QB' },
    { x: 3, y: 48, role: 'FB' },
    { x: 5, y: 50, role: 'RB' },
    { x: 0.3, y: 38, role: 'TE' },
    { x: 0.3, y: 62, role: 'TE' },
    { x: 0.5, y: 88, role: 'WR' },
  ],

  empty: [
    ...OL_BASE,
    { x: 5, y: 50, role: 'QB' },
    { x: 0.5, y: 8, role: 'WR' },
    { x: 0.5, y: 25, role: 'WR' },
    { x: 0.3, y: 64, role: 'TE' },
    { x: 0.5, y: 75, role: 'WR' },
    { x: 0.5, y: 92, role: 'WR' },
  ],

  wildcat: [
    ...OL_BASE,
    { x: 5, y: 50, role: 'RB' },  // Direct snap to RB
    { x: 0.5, y: 12, role: 'QB' }, // QB split wide
    { x: 5, y: 56, role: 'RB' },
    { x: 0.3, y: 64, role: 'TE' },
    { x: 0.5, y: 88, role: 'WR' },
    { x: 0.3, y: 28, role: 'WR' },
  ],
};

// ════════════════════════════════════════════════════════════════
// DEFENSIVE FORMATIONS
// ════════════════════════════════════════════════════════════════

export const DEFENSIVE_FORMATIONS: Record<DefensivePersonnel, FormationPosition[]> = {
  base_4_3: [
    // DL (4)
    { x: -1.5, y: 44, role: 'DL' },
    { x: -1.5, y: 48, role: 'DL' },
    { x: -1.5, y: 52, role: 'DL' },
    { x: -1.5, y: 56, role: 'DL' },
    // LB (3)
    { x: -5, y: 38, role: 'LB' },
    { x: -5, y: 50, role: 'LB' },
    { x: -5, y: 62, role: 'LB' },
    // CB (2)
    { x: -7, y: 14, role: 'CB' },
    { x: -7, y: 86, role: 'CB' },
    // S (2)
    { x: -14, y: 42, role: 'S' },
    { x: -14, y: 58, role: 'S' },
  ],

  base_3_4: [
    // DL (3)
    { x: -1.5, y: 44, role: 'DL' },
    { x: -1.5, y: 50, role: 'DL' },
    { x: -1.5, y: 56, role: 'DL' },
    // LB (4)
    { x: -5, y: 32, role: 'LB' },
    { x: -5, y: 44, role: 'LB' },
    { x: -5, y: 56, role: 'LB' },
    { x: -5, y: 68, role: 'LB' },
    // CB (2)
    { x: -7, y: 14, role: 'CB' },
    { x: -7, y: 86, role: 'CB' },
    // S (2)
    { x: -14, y: 42, role: 'S' },
    { x: -14, y: 58, role: 'S' },
  ],

  nickel: [
    // DL (4)
    { x: -1.5, y: 44, role: 'DL' },
    { x: -1.5, y: 48, role: 'DL' },
    { x: -1.5, y: 52, role: 'DL' },
    { x: -1.5, y: 56, role: 'DL' },
    // LB (2)
    { x: -5, y: 42, role: 'LB' },
    { x: -5, y: 58, role: 'LB' },
    // CB (3)
    { x: -7, y: 14, role: 'CB' },
    { x: -5, y: 28, role: 'CB' },
    { x: -7, y: 86, role: 'CB' },
    // S (2)
    { x: -14, y: 42, role: 'S' },
    { x: -14, y: 58, role: 'S' },
  ],

  dime: [
    // DL (4)
    { x: -1.5, y: 44, role: 'DL' },
    { x: -1.5, y: 48, role: 'DL' },
    { x: -1.5, y: 52, role: 'DL' },
    { x: -1.5, y: 56, role: 'DL' },
    // LB (1)
    { x: -5, y: 50, role: 'LB' },
    // CB (4)
    { x: -7, y: 14, role: 'CB' },
    { x: -5, y: 28, role: 'CB' },
    { x: -5, y: 72, role: 'CB' },
    { x: -7, y: 86, role: 'CB' },
    // S (2)
    { x: -14, y: 42, role: 'S' },
    { x: -14, y: 58, role: 'S' },
  ],

  goal_line: [
    // DL (5)
    { x: -1.5, y: 40, role: 'DL' },
    { x: -1.5, y: 45, role: 'DL' },
    { x: -1.5, y: 50, role: 'DL' },
    { x: -1.5, y: 55, role: 'DL' },
    { x: -1.5, y: 60, role: 'DL' },
    // LB (3)
    { x: -4, y: 36, role: 'LB' },
    { x: -4, y: 50, role: 'LB' },
    { x: -4, y: 64, role: 'LB' },
    // CB (1)
    { x: -6, y: 86, role: 'CB' },
    // S (2)
    { x: -10, y: 42, role: 'S' },
    { x: -10, y: 58, role: 'S' },
  ],

  prevent: [
    // DL (3)
    { x: -1.5, y: 44, role: 'DL' },
    { x: -1.5, y: 50, role: 'DL' },
    { x: -1.5, y: 56, role: 'DL' },
    // LB (1)
    { x: -5, y: 50, role: 'LB' },
    // CB (3)
    { x: -10, y: 14, role: 'CB' },
    { x: -10, y: 50, role: 'CB' },
    { x: -10, y: 86, role: 'CB' },
    // S (4)
    { x: -18, y: 25, role: 'S' },
    { x: -18, y: 42, role: 'S' },
    { x: -18, y: 58, role: 'S' },
    { x: -18, y: 75, role: 'S' },
  ],
};
