/**
 * Shared play animation timing constants and types.
 * Used by LedGrid and any future animation components.
 */

// ── Standard play timing ───────────────────────────────────
export const PRE_SNAP_MS = 400;
export const SNAP_MS = 200;
export const DEVELOPMENT_MS = 1800;
export const RESULT_MS = 400;
export const POST_PLAY_MS = 100;

// ── Kickoff-specific timing ────────────────────────────────
export const KICKOFF_PRE_SNAP_MS = 500;
export const KICKOFF_SNAP_MS = 200;
export const KICKOFF_RESULT_MS = 400;
export const KICKOFF_POST_PLAY_MS = 100;

export type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

/** Kickoff flight phase fraction (when ball lands) */
export const KICKOFF_PHASE_END = 0.45;

/** Get the development phase duration for kickoffs based on play outcome */
export function getKickoffDevMs(play: { type: string; yardsGained: number; isTouchdown?: boolean } | null): number {
  if (!play || play.type !== 'kickoff') return DEVELOPMENT_MS;
  if (play.yardsGained === 0) return 1400;  // touchback
  if (play.isTouchdown) return 2400;        // TD return
  if (play.yardsGained >= 35) return 2000;  // big return
  return 1800;                               // normal return
}
