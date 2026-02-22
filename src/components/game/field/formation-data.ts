/**
 * Formation position data for 22-player field visualization.
 * All positions are relative offsets from the line of scrimmage (LOS):
 *   dx = field% behind LOS (offense, positive = deeper) or ahead of LOS (defense, positive = deeper)
 *   dy = field% offset from center (0 = center, positive = toward bottom of field)
 *   role = player position label for styling/identification
 *
 * Scale guide: 1 yard ≈ 0.83% of field width. Formations are scaled up
 * so they're recognizable on screen — not millimeter-accurate but visually clear.
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
// OL spread ~3% apart vertically, right on the LOS
const OL: PlayerPosition[] = [
  { dx: 0,   dy: 0,    role: 'C' },
  { dx: 0,   dy: -3.5, role: 'LG' },
  { dx: 0,   dy: 3.5,  role: 'RG' },
  { dx: 0,   dy: -7,   role: 'LT' },
  { dx: 0,   dy: 7,    role: 'RT' },
];

export const OFFENSIVE_FORMATIONS: Record<string, PlayerPosition[]> = {
  shotgun: [
    ...OL,
    { dx: 6,   dy: 0,    role: 'QB' },   // QB 6% behind LOS (~7 yards)
    { dx: 6,   dy: 4,    role: 'RB' },   // RB next to QB
    { dx: 0.5, dy: 11,   role: 'TE' },   // TE on line
    { dx: 1,   dy: -20,  role: 'WR' },   // Split end left
    { dx: 1,   dy: 24,   role: 'WR' },   // Flanker right
    { dx: 1,   dy: -35,  role: 'WR' },   // Wide left
  ],
  under_center: [
    ...OL,
    { dx: 1.2, dy: 0,    role: 'QB' },   // QB under center
    { dx: 6,   dy: 0,    role: 'RB' },   // RB deep
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 1,   dy: -20,  role: 'WR' },
    { dx: 1,   dy: 24,   role: 'WR' },
    { dx: 1,   dy: -35,  role: 'WR' },
  ],
  pistol: [
    ...OL,
    { dx: 4,   dy: 0,    role: 'QB' },   // QB in pistol (~4 yards)
    { dx: 7,   dy: 0,    role: 'RB' },   // RB behind QB
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 1,   dy: -20,  role: 'WR' },
    { dx: 1,   dy: 24,   role: 'WR' },
    { dx: 1,   dy: -35,  role: 'WR' },
  ],
  spread: [
    ...OL,
    { dx: 6,   dy: 0,    role: 'QB' },
    { dx: 6,   dy: 4,    role: 'RB' },
    { dx: 1,   dy: -16,  role: 'WR' },   // 4 WR spread
    { dx: 1,   dy: 16,   role: 'WR' },
    { dx: 1,   dy: -32,  role: 'WR' },
    { dx: 1,   dy: 32,   role: 'WR' },
  ],
  i_formation: [
    ...OL,
    { dx: 1.2, dy: 0,    role: 'QB' },
    { dx: 4.5, dy: 0,    role: 'FB' },   // Fullback ahead of HB
    { dx: 7.5, dy: 0,    role: 'RB' },   // Halfback deep
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 1,   dy: -20,  role: 'WR' },
    { dx: 1,   dy: 26,   role: 'WR' },
  ],
  singleback: [
    ...OL,
    { dx: 1.2, dy: 0,    role: 'QB' },
    { dx: 6.5, dy: 0,    role: 'RB' },
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 1,   dy: -20,  role: 'WR' },
    { dx: 1,   dy: 26,   role: 'WR' },
    { dx: 1,   dy: -35,  role: 'WR' },
  ],
  goal_line: [
    ...OL,
    { dx: 1.2, dy: 0,    role: 'QB' },
    { dx: 4,   dy: 0,    role: 'FB' },
    { dx: 6.5, dy: 0,    role: 'RB' },
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 0.5, dy: -11,  role: 'TE' },   // 2 TE set
    { dx: 1,   dy: 20,   role: 'WR' },
  ],
  empty: [
    ...OL,
    { dx: 6,   dy: 0,    role: 'QB' },   // QB alone in shotgun
    { dx: 1,   dy: -16,  role: 'WR' },   // 5 WR
    { dx: 1,   dy: 16,   role: 'WR' },
    { dx: 1,   dy: -32,  role: 'WR' },
    { dx: 1,   dy: 32,   role: 'WR' },
    { dx: 1,   dy: -42,  role: 'WR' },
  ],
  wildcat: [
    ...OL,
    { dx: 1,   dy: -16,  role: 'QB' },   // QB out wide as wing
    { dx: 1.2, dy: 0,    role: 'RB' },   // Direct snap to RB
    { dx: 5,   dy: 3,    role: 'RB' },
    { dx: 0.5, dy: 11,   role: 'TE' },
    { dx: 1,   dy: 26,   role: 'WR' },
    { dx: 1,   dy: -32,  role: 'WR' },
  ],
};

// ══════════════════════════════════════════════════════════════
// DEFENSIVE PERSONNEL (11 players each)
// DL at ~2% from LOS, LBs at ~6%, DBs at ~12-18%
// ══════════════════════════════════════════════════════════════

export const DEFENSIVE_FORMATIONS: Record<string, PlayerPosition[]> = {
  base_4_3: [
    // DL (4) — 2% off LOS, spread across the OL
    { dx: 2,   dy: -5,   role: 'DE' },
    { dx: 2,   dy: -1.5, role: 'DT' },
    { dx: 2,   dy: 1.5,  role: 'DT' },
    { dx: 2,   dy: 5,    role: 'DE' },
    // LB (3) — 6% off LOS
    { dx: 6,   dy: -7,   role: 'LB' },
    { dx: 6,   dy: 0,    role: 'LB' },
    { dx: 6,   dy: 7,    role: 'LB' },
    // DB (4) — CBs at edges, Safeties deep
    { dx: 3,   dy: -22,  role: 'CB' },
    { dx: 3,   dy: 22,   role: 'CB' },
    { dx: 14,  dy: -6,   role: 'S' },
    { dx: 14,  dy: 6,    role: 'S' },
  ],
  base_3_4: [
    // DL (3) — nose tackle + ends
    { dx: 2,   dy: 0,    role: 'NT' },
    { dx: 2,   dy: -4,   role: 'DE' },
    { dx: 2,   dy: 4,    role: 'DE' },
    // LB (4) — 2 ILB + 2 OLB
    { dx: 5,   dy: -9,   role: 'OLB' },
    { dx: 5,   dy: -3,   role: 'ILB' },
    { dx: 5,   dy: 3,    role: 'ILB' },
    { dx: 5,   dy: 9,    role: 'OLB' },
    // DB (4)
    { dx: 3,   dy: -22,  role: 'CB' },
    { dx: 3,   dy: 22,   role: 'CB' },
    { dx: 14,  dy: -6,   role: 'S' },
    { dx: 14,  dy: 6,    role: 'S' },
  ],
  nickel: [
    // DL (4)
    { dx: 2,   dy: -5,   role: 'DE' },
    { dx: 2,   dy: -1.5, role: 'DT' },
    { dx: 2,   dy: 1.5,  role: 'DT' },
    { dx: 2,   dy: 5,    role: 'DE' },
    // LB (2)
    { dx: 6,   dy: -4,   role: 'LB' },
    { dx: 6,   dy: 4,    role: 'LB' },
    // DB (5) — 3 CB + 2 S
    { dx: 3,   dy: -22,  role: 'CB' },
    { dx: 3,   dy: 22,   role: 'CB' },
    { dx: 4,   dy: 13,   role: 'NCB' },
    { dx: 14,  dy: -6,   role: 'S' },
    { dx: 14,  dy: 6,    role: 'S' },
  ],
  dime: [
    // DL (4)
    { dx: 2,   dy: -5,   role: 'DE' },
    { dx: 2,   dy: -1.5, role: 'DT' },
    { dx: 2,   dy: 1.5,  role: 'DT' },
    { dx: 2,   dy: 5,    role: 'DE' },
    // LB (1)
    { dx: 6,   dy: 0,    role: 'LB' },
    // DB (6) — 4 CB + 2 S
    { dx: 3,   dy: -22,  role: 'CB' },
    { dx: 3,   dy: 22,   role: 'CB' },
    { dx: 5,   dy: -13,  role: 'NCB' },
    { dx: 5,   dy: 13,   role: 'NCB' },
    { dx: 14,  dy: -6,   role: 'S' },
    { dx: 14,  dy: 6,    role: 'S' },
  ],
  goal_line: [
    // DL (5) — heavy front
    { dx: 2,   dy: -7,   role: 'DE' },
    { dx: 2,   dy: -3.5, role: 'DT' },
    { dx: 2,   dy: 0,    role: 'NT' },
    { dx: 2,   dy: 3.5,  role: 'DT' },
    { dx: 2,   dy: 7,    role: 'DE' },
    // LB (4)
    { dx: 5,   dy: -9,   role: 'LB' },
    { dx: 5,   dy: -3,   role: 'LB' },
    { dx: 5,   dy: 3,    role: 'LB' },
    { dx: 5,   dy: 9,    role: 'LB' },
    // DB (2)
    { dx: 9,   dy: -14,  role: 'CB' },
    { dx: 9,   dy: 14,   role: 'CB' },
  ],
  prevent: [
    // DL (3) — light rush
    { dx: 2,   dy: -4,   role: 'DE' },
    { dx: 2,   dy: 0,    role: 'DT' },
    { dx: 2,   dy: 4,    role: 'DE' },
    // LB (1)
    { dx: 6,   dy: 0,    role: 'LB' },
    // DB (7) — deep shells everywhere
    { dx: 4,   dy: -22,  role: 'CB' },
    { dx: 4,   dy: 22,   role: 'CB' },
    { dx: 9,   dy: -14,  role: 'CB' },
    { dx: 9,   dy: 14,   role: 'CB' },
    { dx: 18,  dy: -12,  role: 'S' },
    { dx: 18,  dy: 0,    role: 'S' },
    { dx: 18,  dy: 12,   role: 'S' },
  ],
};

// ══════════════════════════════════════════════════════════════
// SPECIAL TEAMS FORMATIONS (11 players each, offense + defense)
// ══════════════════════════════════════════════════════════════

export const SPECIAL_TEAMS = {
  kickoff: {
    kicking: [
      { dx: 0, dy: 0, role: 'K' },
      // Coverage team — staggered depths for realism
      { dx: -1.0, dy: -28, role: 'COV' },
      { dx: -1.8, dy: -20, role: 'COV' },
      { dx: -1.2, dy: -12, role: 'COV' },
      { dx: -1.6, dy: -5, role: 'COV' },
      { dx: -1.6, dy: 5, role: 'COV' },
      { dx: -1.2, dy: 12, role: 'COV' },
      { dx: -1.8, dy: 20, role: 'COV' },
      { dx: -1.0, dy: 28, role: 'COV' },
      { dx: -1.4, dy: -36, role: 'COV' },
      { dx: -1.4, dy: 36, role: 'COV' },
    ] as PlayerPosition[],
    receiving: [
      { dx: 40, dy: 0, role: 'KR' },
      // Wedge blockers — form up ahead of returner
      { dx: 33, dy: -4, role: 'WDG' },
      { dx: 33, dy: 4, role: 'WDG' },
      { dx: 31, dy: 0, role: 'WDG' },
      // Front line blockers
      { dx: 20, dy: -18, role: 'BLK' },
      { dx: 20, dy: 18, role: 'BLK' },
      { dx: 15, dy: -10, role: 'BLK' },
      { dx: 15, dy: 10, role: 'BLK' },
      { dx: 10, dy: -22, role: 'BLK' },
      { dx: 10, dy: 22, role: 'BLK' },
      { dx: 10, dy: 0, role: 'BLK' },
    ] as PlayerPosition[],
  },
  punt: {
    kicking: [
      { dx: 14, dy: 0, role: 'P' },
      { dx: 0, dy: 0, role: 'LS' },
      { dx: 0.5, dy: -3, role: 'BLK' },
      { dx: 0.5, dy: 3, role: 'BLK' },
      { dx: 0.5, dy: -6, role: 'BLK' },
      { dx: 0.5, dy: 6, role: 'BLK' },
      { dx: 0.5, dy: -9, role: 'BLK' },
      { dx: 0.5, dy: 9, role: 'BLK' },
      { dx: 6, dy: -12, role: 'BLK' },
      { dx: 1, dy: -34, role: 'GUN' },
      { dx: 1, dy: 34, role: 'GUN' },
    ] as PlayerPosition[],
    receiving: [
      { dx: 35, dy: 0, role: 'PR' },
      { dx: 2, dy: -4, role: 'RSH' },
      { dx: 2, dy: 4, role: 'RSH' },
      { dx: 2, dy: -8, role: 'RSH' },
      { dx: 2, dy: 8, role: 'RSH' },
      { dx: 2, dy: -12, role: 'RSH' },
      { dx: 2, dy: 12, role: 'RSH' },
      { dx: 5, dy: -28, role: 'JAM' },
      { dx: 5, dy: 28, role: 'JAM' },
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
      { dx: 7, dy: 0, role: 'H' },
      { dx: 8.5, dy: 1.5, role: 'K' },
      { dx: 2.5, dy: -13, role: 'BLK' },
    ] as PlayerPosition[],
    blocking: [
      { dx: 1.5, dy: -5, role: 'RSH' },
      { dx: 1.5, dy: -2.5, role: 'RSH' },
      { dx: 1.5, dy: 0, role: 'RSH' },
      { dx: 1.5, dy: 2.5, role: 'RSH' },
      { dx: 1.5, dy: 5, role: 'RSH' },
      { dx: 1.5, dy: -8, role: 'RSH' },
      { dx: 1.5, dy: 8, role: 'RSH' },
      { dx: 4, dy: -12, role: 'RSH' },
      { dx: 4, dy: 12, role: 'RSH' },
      { dx: 8, dy: 0, role: 'BLK' },
      { dx: 14, dy: 0, role: 'S' },
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
      y: clamp(50 + p.dy, 5, 95),
      role: p.role,
    };
  });
}

/**
 * Generate huddle positions — offense in a recognizable oval huddle,
 * defense loosely spread on their side of the LOS.
 */
export function getIdlePositions(
  losX: number,
  offDir: number,
  side: 'offense' | 'defense',
): { x: number; y: number; role: string }[] {
  if (side === 'offense') {
    // Oval huddle centered 7% behind the LOS
    const huddleCx = losX + offDir * 7;
    const huddleCy = 50;
    const radiusX = 2.2;  // horizontal radius
    const radiusY = 5.5;  // vertical radius
    return Array.from({ length: 11 }, (_, i) => {
      // Place players around an oval, leaving a gap at the "mouth" (toward LOS)
      // QB at position 0 faces toward LOS
      const angle = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2;
      return {
        x: clamp(huddleCx + Math.cos(angle) * radiusX, 2, 98),
        y: clamp(huddleCy + Math.sin(angle) * radiusY, 10, 90),
        role: 'OFF',
      };
    });
  } else {
    // Defense: relaxed spread on their side of the LOS
    // Two rows — front 7 loosely spread, back 4 deeper
    const baseDx = -offDir * 5;  // 5% ahead of LOS
    const deepDx = -offDir * 14; // 14% deep
    return [
      // Front row (7) — loosely across the field
      { x: clamp(losX + baseDx, 2, 98), y: 30, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 37, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 44, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 50, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 56, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 63, role: 'DEF' },
      { x: clamp(losX + baseDx, 2, 98), y: 70, role: 'DEF' },
      // Back row (4) — deeper, wider spread
      { x: clamp(losX + deepDx, 2, 98), y: 25, role: 'DEF' },
      { x: clamp(losX + deepDx, 2, 98), y: 42, role: 'DEF' },
      { x: clamp(losX + deepDx, 2, 98), y: 58, role: 'DEF' },
      { x: clamp(losX + deepDx, 2, 98), y: 75, role: 'DEF' },
    ];
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
