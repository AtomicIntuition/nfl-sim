/**
 * Grid coordinate math for the full-field LED overlay.
 *
 * Grid: 120 columns (10 away EZ + 100 field + 10 home EZ) x 53 rows (~1 yard each).
 * All positions convert between field-percentage space and grid-cell space.
 */

export const GRID_COLS = 120;
export const GRID_ROWS = 53;

/** End-zone width as a fraction of field container (matches field-surface.tsx) */
const EZ_PCT = 8.33;
/** Playing field width in container % */
const FIELD_PCT = 100 - EZ_PCT * 2; // ~83.34

/** Convert field-percentage position (0-100% of container) to grid cell {col, row}. */
export function fieldPctToGrid(xPct: number, yPct: number): { col: number; row: number } {
  const col = Math.round((xPct / 100) * (GRID_COLS - 1));
  const row = Math.round((yPct / 100) * (GRID_ROWS - 1));
  return {
    col: clamp(col, 0, GRID_COLS - 1),
    row: clamp(row, 0, GRID_ROWS - 1),
  };
}

/** Convert a grid cell to CSS left/top percentages for absolute positioning. */
export function gridToCss(col: number, row: number): { left: string; top: string } {
  return {
    left: `${(col / (GRID_COLS - 1)) * 100}%`,
    top: `${(row / (GRID_ROWS - 1)) * 100}%`,
  };
}

/**
 * Convert a yard-line position (0-100 relative to possessing team) to a grid column.
 * Accounts for end zones: col 0-9 = away EZ, 10-109 = field, 110-119 = home EZ.
 */
export function yardPosToCol(pos: number, possession: 'home' | 'away'): number {
  const absolutePct = possession === 'home' ? 100 - pos : pos;
  return clamp(Math.round(absolutePct) + 10, 0, GRID_COLS - 1);
}

/**
 * Convert a yard-line position to the field container X percentage (for LOS, etc.).
 * Same math as field-visual.tsx uses.
 */
export function yardPosToFieldPct(pos: number, possession: 'home' | 'away'): number {
  const absolutePct = possession === 'home' ? 100 - pos : pos;
  return EZ_PCT + (absolutePct / 100) * FIELD_PCT;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
