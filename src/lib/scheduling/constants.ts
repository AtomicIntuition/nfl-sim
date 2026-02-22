// ============================================================================
// GridIron Live - Scheduling Constants (Single Source of Truth)
// ============================================================================
// All timing-related constants for intermissions, breaks, and offseasons.
// Import these wherever timing decisions are made to avoid drift.
// ============================================================================

/** 15-minute intermission between games within the same week (ms) */
export const INTERMISSION_MS = 15 * 60 * 1000;

/** 30-minute break between weeks after all games in a week complete (ms) */
export const WEEK_BREAK_MS = 30 * 60 * 1000;

/** 30-minute offseason between end of one season and start of next (ms) */
export const OFFSEASON_MS = 30 * 60 * 1000;

/** Same values in seconds for SSE/client use */
export const INTERMISSION_SECONDS = INTERMISSION_MS / 1000;
export const WEEK_BREAK_SECONDS = WEEK_BREAK_MS / 1000;
export const OFFSEASON_SECONDS = OFFSEASON_MS / 1000;
