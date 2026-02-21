/**
 * Formation position data for 22-player field visualization.
 * All positions are relative offsets from the line of scrimmage (LOS):
 *   dx = field% behind LOS (offense, positive = deeper) or ahead of LOS (defense, positive = deeper)
 *   dy = field% offset from center (0 = center, positive = toward bottom of field)
 *   role = player position label for styling/identification
 */

export interface PlayerPosition {
  dx: number;
  dy: number;
  role: string;
}

// ══════════════════════════════════════════════════════════════
// OFFENSIVE FORMATIONS (11 players each)
// ══════════════════════════════════════════════════════════════

// Shared OL positions (always the same 5)
const OL: PlayerPosition[] = [
  { dx: 0, dy: 0, role: 'C' },
  { dx: 0, dy: -4, role: 'LG' },
  { dx: 0, dy: 4, role: 'RG' },
  { dx: 0, dy: -8, role: 'LT' },
  { dx: 0, dy: 8, role: 'RT' },
];

export const OFFENSIVE_FORMATIONS: Record<string, PlayerPosition[]> = {
  shotgun: [
    ...OL,
    { dx: 4, dy: 0, role: 'QB' },
    { dx: 4, dy: 3, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: -22, role: 'WR' },
    { dx: 0.5, dy: 26, role: 'WR' },
    { dx: 0.5, dy: -36, role: 'WR' },
  ],
  under_center: [
    ...OL,
    { dx: 0.8, dy: 0, role: 'QB' },
    { dx: 4, dy: 0, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: -22, role: 'WR' },
    { dx: 0.5, dy: 26, role: 'WR' },
    { dx: 0.5, dy: -36, role: 'WR' },
  ],
  pistol: [
    ...OL,
    { dx: 3, dy: 0, role: 'QB' },
    { dx: 5.5, dy: 0, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: -22, role: 'WR' },
    { dx: 0.5, dy: 26, role: 'WR' },
    { dx: 0.5, dy: -36, role: 'WR' },
  ],
  spread: [
    ...OL,
    { dx: 4, dy: 0, role: 'QB' },
    { dx: 4, dy: 3, role: 'RB' },
    { dx: 0.5, dy: -18, role: 'WR' },
    { dx: 0.5, dy: 18, role: 'WR' },
    { dx: 0.5, dy: -34, role: 'WR' },
    { dx: 0.5, dy: 34, role: 'WR' },
  ],
  i_formation: [
    ...OL,
    { dx: 0.8, dy: 0, role: 'QB' },
    { dx: 3.5, dy: 0, role: 'FB' },
    { dx: 6, dy: 0, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: -22, role: 'WR' },
    { dx: 0.5, dy: 28, role: 'WR' },
  ],
  singleback: [
    ...OL,
    { dx: 0.8, dy: 0, role: 'QB' },
    { dx: 5, dy: 0, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: -22, role: 'WR' },
    { dx: 0.5, dy: 28, role: 'WR' },
    { dx: 0.5, dy: -36, role: 'WR' },
  ],
  goal_line: [
    ...OL,
    { dx: 0.8, dy: 0, role: 'QB' },
    { dx: 3, dy: 0, role: 'FB' },
    { dx: 5, dy: 0, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0, dy: -12, role: 'TE' },
    { dx: 0.5, dy: 22, role: 'WR' },
  ],
  empty: [
    ...OL,
    { dx: 4, dy: 0, role: 'QB' },
    { dx: 0.5, dy: -18, role: 'WR' },
    { dx: 0.5, dy: 18, role: 'WR' },
    { dx: 0.5, dy: -34, role: 'WR' },
    { dx: 0.5, dy: 34, role: 'WR' },
    { dx: 0.5, dy: -44, role: 'WR' },
  ],
  wildcat: [
    ...OL,
    { dx: 0.5, dy: -18, role: 'QB' },  // QB out as wing
    { dx: 0.8, dy: 0, role: 'RB' },     // Direct snap to RB
    { dx: 4, dy: 2, role: 'RB' },
    { dx: 0, dy: 12, role: 'TE' },
    { dx: 0.5, dy: 28, role: 'WR' },
    { dx: 0.5, dy: -34, role: 'WR' },
  ],
};

// ══════════════════════════════════════════════════════════════
// DEFENSIVE PERSONNEL (11 players each)
// ══════════════════════════════════════════════════════════════

export const DEFENSIVE_FORMATIONS: Record<string, PlayerPosition[]> = {
  base_4_3: [
    // DL (4)
    { dx: 1, dy: -6, role: 'DE' },
    { dx: 1, dy: -2, role: 'DT' },
    { dx: 1, dy: 2, role: 'DT' },
    { dx: 1, dy: 6, role: 'DE' },
    // LB (3)
    { dx: 4, dy: -8, role: 'LB' },
    { dx: 4, dy: 0, role: 'LB' },
    { dx: 4, dy: 8, role: 'LB' },
    // DB (4)
    { dx: 2, dy: -24, role: 'CB' },
    { dx: 2, dy: 24, role: 'CB' },
    { dx: 8, dy: -5, role: 'S' },
    { dx: 8, dy: 5, role: 'S' },
  ],
  base_3_4: [
    // DL (3) — nose tackle + ends
    { dx: 1, dy: 0, role: 'NT' },
    { dx: 1, dy: -5, role: 'DE' },
    { dx: 1, dy: 5, role: 'DE' },
    // LB (4) — 2 ILB + 2 OLB
    { dx: 3, dy: -10, role: 'OLB' },
    { dx: 3, dy: -3, role: 'ILB' },
    { dx: 3, dy: 3, role: 'ILB' },
    { dx: 3, dy: 10, role: 'OLB' },
    // DB (4)
    { dx: 2, dy: -24, role: 'CB' },
    { dx: 2, dy: 24, role: 'CB' },
    { dx: 8, dy: -5, role: 'S' },
    { dx: 8, dy: 5, role: 'S' },
  ],
  nickel: [
    // DL (4)
    { dx: 1, dy: -6, role: 'DE' },
    { dx: 1, dy: -2, role: 'DT' },
    { dx: 1, dy: 2, role: 'DT' },
    { dx: 1, dy: 6, role: 'DE' },
    // LB (2)
    { dx: 4, dy: -4, role: 'LB' },
    { dx: 4, dy: 4, role: 'LB' },
    // DB (5) — 3 CB + 2 S
    { dx: 2, dy: -24, role: 'CB' },
    { dx: 2, dy: 24, role: 'CB' },
    { dx: 3, dy: 14, role: 'NCB' },
    { dx: 8, dy: -5, role: 'S' },
    { dx: 8, dy: 5, role: 'S' },
  ],
  dime: [
    // DL (4)
    { dx: 1, dy: -6, role: 'DE' },
    { dx: 1, dy: -2, role: 'DT' },
    { dx: 1, dy: 2, role: 'DT' },
    { dx: 1, dy: 6, role: 'DE' },
    // LB (1)
    { dx: 4, dy: 0, role: 'LB' },
    // DB (6) — 4 CB + 2 S
    { dx: 2, dy: -24, role: 'CB' },
    { dx: 2, dy: 24, role: 'CB' },
    { dx: 3, dy: -14, role: 'NCB' },
    { dx: 3, dy: 14, role: 'NCB' },
    { dx: 8, dy: -5, role: 'S' },
    { dx: 8, dy: 5, role: 'S' },
  ],
  goal_line: [
    // DL (5)
    { dx: 1, dy: -8, role: 'DE' },
    { dx: 1, dy: -4, role: 'DT' },
    { dx: 1, dy: 0, role: 'NT' },
    { dx: 1, dy: 4, role: 'DT' },
    { dx: 1, dy: 8, role: 'DE' },
    // LB (4)
    { dx: 3, dy: -10, role: 'LB' },
    { dx: 3, dy: -3, role: 'LB' },
    { dx: 3, dy: 3, role: 'LB' },
    { dx: 3, dy: 10, role: 'LB' },
    // DB (2)
    { dx: 6, dy: -15, role: 'CB' },
    { dx: 6, dy: 15, role: 'CB' },
  ],
  prevent: [
    // DL (3)
    { dx: 1, dy: -4, role: 'DE' },
    { dx: 1, dy: 0, role: 'DT' },
    { dx: 1, dy: 4, role: 'DE' },
    // LB (1)
    { dx: 4, dy: 0, role: 'LB' },
    // DB (7) — deep shells
    { dx: 3, dy: -24, role: 'CB' },
    { dx: 3, dy: 24, role: 'CB' },
    { dx: 6, dy: -14, role: 'CB' },
    { dx: 10, dy: -12, role: 'S' },
    { dx: 10, dy: 0, role: 'S' },
    { dx: 10, dy: 12, role: 'S' },
    { dx: 6, dy: 14, role: 'CB' },
  ],
};

// ══════════════════════════════════════════════════════════════
// SPECIAL TEAMS FORMATIONS (11 players each, offense + defense)
// ══════════════════════════════════════════════════════════════

export const SPECIAL_TEAMS = {
  kickoff: {
    kicking: [
      { dx: 0, dy: 0, role: 'K' },
      { dx: -1, dy: -30, role: 'COV' },
      { dx: -1, dy: -22, role: 'COV' },
      { dx: -1, dy: -14, role: 'COV' },
      { dx: -1, dy: -7, role: 'COV' },
      { dx: -1, dy: 7, role: 'COV' },
      { dx: -1, dy: 14, role: 'COV' },
      { dx: -1, dy: 22, role: 'COV' },
      { dx: -1, dy: 30, role: 'COV' },
      { dx: -1, dy: -38, role: 'COV' },
      { dx: -1, dy: 38, role: 'COV' },
    ] as PlayerPosition[],
    receiving: [
      { dx: 40, dy: 0, role: 'KR' },
      { dx: 30, dy: -12, role: 'BLK' },
      { dx: 30, dy: 12, role: 'BLK' },
      { dx: 25, dy: -6, role: 'BLK' },
      { dx: 25, dy: 6, role: 'BLK' },
      { dx: 20, dy: -18, role: 'BLK' },
      { dx: 20, dy: 18, role: 'BLK' },
      { dx: 15, dy: -10, role: 'BLK' },
      { dx: 15, dy: 10, role: 'BLK' },
      { dx: 10, dy: -22, role: 'BLK' },
      { dx: 10, dy: 22, role: 'BLK' },
    ] as PlayerPosition[],
  },
  punt: {
    kicking: [
      { dx: 12, dy: 0, role: 'P' },
      { dx: 0, dy: 0, role: 'LS' },
      { dx: 0.5, dy: -3, role: 'BLK' },
      { dx: 0.5, dy: 3, role: 'BLK' },
      { dx: 0.5, dy: -6, role: 'BLK' },
      { dx: 0.5, dy: 6, role: 'BLK' },
      { dx: 0.5, dy: -9, role: 'BLK' },
      { dx: 0.5, dy: 9, role: 'BLK' },
      { dx: 5, dy: -12, role: 'BLK' },
      { dx: 0.5, dy: -36, role: 'GUN' },
      { dx: 0.5, dy: 36, role: 'GUN' },
    ] as PlayerPosition[],
    receiving: [
      { dx: 35, dy: 0, role: 'PR' },
      { dx: 2, dy: -4, role: 'RSH' },
      { dx: 2, dy: 4, role: 'RSH' },
      { dx: 2, dy: -8, role: 'RSH' },
      { dx: 2, dy: 8, role: 'RSH' },
      { dx: 2, dy: -12, role: 'RSH' },
      { dx: 2, dy: 12, role: 'RSH' },
      { dx: 4, dy: -30, role: 'JAM' },
      { dx: 4, dy: 30, role: 'JAM' },
      { dx: 25, dy: -10, role: 'BLK' },
      { dx: 25, dy: 10, role: 'BLK' },
    ] as PlayerPosition[],
  },
  field_goal: {
    kicking: [
      { dx: 0, dy: -1, role: 'C' },
      { dx: 0, dy: -4, role: 'LG' },
      { dx: 0, dy: 2, role: 'RG' },
      { dx: 0, dy: -7, role: 'LT' },
      { dx: 0, dy: 5, role: 'RT' },
      { dx: 0, dy: -10, role: 'TE' },
      { dx: 0, dy: 8, role: 'TE' },
      { dx: 0, dy: 11, role: 'WNG' },
      { dx: 6, dy: 0, role: 'H' },
      { dx: 7.5, dy: 1.5, role: 'K' },
      { dx: 2, dy: -13, role: 'BLK' },
    ] as PlayerPosition[],
    blocking: [
      { dx: 1, dy: -6, role: 'RSH' },
      { dx: 1, dy: -3, role: 'RSH' },
      { dx: 1, dy: 0, role: 'RSH' },
      { dx: 1, dy: 3, role: 'RSH' },
      { dx: 1, dy: 6, role: 'RSH' },
      { dx: 1, dy: -9, role: 'RSH' },
      { dx: 1, dy: 9, role: 'RSH' },
      { dx: 3, dy: -12, role: 'RSH' },
      { dx: 3, dy: 12, role: 'RSH' },
      { dx: 6, dy: 0, role: 'BLK' },
      { dx: 10, dy: 0, role: 'S' },
    ] as PlayerPosition[],
  },
};

// ══════════════════════════════════════════════════════════════
// POSITION HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Convert relative formation positions to absolute field percentages.
 * @param positions — array of {dx, dy, role} relative offsets
 * @param losX — line of scrimmage as field percentage (8.33–91.66)
 * @param offDir — 1 if offense goes right (home), -1 if left (away)
 * @param side — 'offense' subtracts dx (behind LOS), 'defense' adds dx (ahead of LOS)
 */
export function getAbsolutePositions(
  positions: PlayerPosition[],
  losX: number,
  offDir: number,
  side: 'offense' | 'defense',
): { x: number; y: number; role: string }[] {
  return positions.map((p) => {
    const directedDx = side === 'offense'
      ? losX + offDir * p.dx   // offense: behind LOS (positive dx = further from LOS)
      : losX - offDir * p.dx;  // defense: ahead of LOS (positive dx = further from LOS)
    return {
      x: clamp(directedDx, 2, 98),
      y: clamp(50 + p.dy, 8, 92),
      role: p.role,
    };
  });
}

/**
 * Generate idle/huddle positions — loose cluster near LOS.
 * Deterministic based on losX for consistency.
 */
export function getIdlePositions(
  losX: number,
  offDir: number,
  side: 'offense' | 'defense',
): { x: number; y: number; role: string }[] {
  const seed = Math.round(losX * 100);
  const baseOffset = side === 'offense' ? offDir * 3 : -offDir * 3;
  return Array.from({ length: 11 }, (_, i) => {
    const xSpread = ((seed + i * 17) % 15) / 10;
    const ySpread = ((seed + i * 31) % 20) - 10;
    return {
      x: clamp(losX + baseOffset + xSpread * offDir * 0.5, 2, 98),
      y: clamp(50 + ySpread * 0.8, 20, 80),
      role: side === 'offense' ? 'OFF' : 'DEF',
    };
  });
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
