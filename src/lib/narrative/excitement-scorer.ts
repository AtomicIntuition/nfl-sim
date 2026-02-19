// ============================================================================
// GridIron Live - Excitement Scorer
// ============================================================================
// Rates each play's excitement level 0-100 to control commentary
// intensity, crowd audio volume/type, and UI animation scaling.
// The score is built from a base value determined by play type, then
// adjusted by situational modifiers from the drama detector. The
// resulting score maps to a crowd reaction sound cue.
// ============================================================================

import { PlayResult, GameState, CrowdReaction } from '../simulation/types';
import { DramaFlags } from './drama-detector';

// ============================================================================
// BASE EXCITEMENT BY PLAY TYPE
// ============================================================================

/**
 * Returns the base excitement score for a play based purely on what
 * happened on the field, before any situational context is applied.
 */
function getBaseExcitement(play: PlayResult): number {
  // --- Touchdown (any kind) ---
  if (play.isTouchdown) {
    return 85;
  }

  // --- Turnover (interception, fumble recovery, etc.) ---
  if (play.turnover) {
    return 70;
  }

  // --- Field goal made ---
  if (
    play.scoring &&
    play.scoring.type === 'field_goal'
  ) {
    return 40;
  }

  // --- Two-point conversion attempt ---
  if (play.type === 'two_point') {
    return 55;
  }

  // --- Extra point ---
  if (play.type === 'extra_point') {
    return 5;
  }

  // --- Sack ---
  if (play.type === 'sack') {
    return 45;
  }

  // --- Big play (20+ yards, no TD or turnover already handled) ---
  if (play.yardsGained >= 20) {
    return 60;
  }

  // --- First down ---
  if (play.isFirstDown) {
    return 20;
  }

  // --- Kneel / Spike ---
  if (play.type === 'kneel' || play.type === 'spike') {
    return 3;
  }

  // --- Incomplete pass ---
  if (play.type === 'pass_incomplete') {
    return 10;
  }

  // --- Short run or other routine play ---
  if (play.type === 'run' || play.type === 'scramble') {
    return 8;
  }

  // --- Punt / kickoff / touchback (procedural plays) ---
  if (
    play.type === 'punt' ||
    play.type === 'kickoff' ||
    play.type === 'touchback'
  ) {
    return 5;
  }

  // --- Fallback for any other play ---
  return 10;
}

// ============================================================================
// SITUATIONAL MODIFIERS
// ============================================================================

/**
 * Calculate additive modifiers based on dramatic context.
 * These bonuses layer on top of the base excitement score.
 */
function getSituationalModifiers(
  play: PlayResult,
  state: GameState,
  drama: DramaFlags,
  momentum: number
): number {
  let modifier = 0;

  // --- Clutch moment: 4th qtr / OT, under 2:00, close game ---
  if (drama.isClutchMoment) {
    modifier += 20;
  }

  // --- Comeback drive ---
  if (drama.isComebackBrewing) {
    modifier += 15;
  }

  // --- Game-winning score ---
  // A scoring play during a game-winning drive situation.
  if (drama.isGameWinningDrive && play.scoring) {
    modifier += 15;
  }

  // --- Red zone ---
  if (drama.isRedZone) {
    modifier += 10;
  }

  // --- Two-minute drill ---
  if (drama.isTwoMinuteDrill) {
    modifier += 10;
  }

  // --- Goal line (inside 5-yard line) ---
  if (drama.isGoalLineStand) {
    modifier += 10;
  }

  // --- 4th down conversion ---
  if (state.down === 4 && play.isFirstDown) {
    modifier += 15;
  }

  // --- 4th down stop (defense holds on 4th down) ---
  if (
    state.down === 4 &&
    !play.isFirstDown &&
    !play.isTouchdown &&
    play.type !== 'punt' &&
    play.type !== 'field_goal'
  ) {
    modifier += 15;
  }

  // --- Large momentum swing (absolute shift > 30) ---
  // We approximate this by checking if momentum magnitude is high.
  if (Math.abs(momentum) > 30) {
    modifier += 10;
  }

  // --- Overtime ---
  if (drama.isOvertimeThriller) {
    modifier += 10;
  }

  return modifier;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Score the excitement of a play from 0-100.
 *
 * Combines a base score from the play type with additive situational
 * modifiers from the drama context. The result is clamped to [0, 100].
 */
export function scoreExcitement(
  play: PlayResult,
  state: GameState,
  drama: DramaFlags,
  momentum: number
): number {
  const base = getBaseExcitement(play);
  const modifiers = getSituationalModifiers(play, state, drama, momentum);
  return Math.min(100, Math.max(0, base + modifiers));
}

/**
 * Map an excitement score to a crowd reaction sound cue.
 *
 * The mapping considers the excitement level, whether the play
 * involves a turnover or penalty, and whether the play benefits
 * the home or away team.
 */
export function getReactionFromExcitement(
  excitement: number,
  play: PlayResult,
  possession: 'home' | 'away'
): CrowdReaction {
  // --- Special cases that override the excitement tier ---

  // Penalties always get boos from the crowd (regardless of who committed them).
  if (play.penalty && !play.penalty.declined && !play.penalty.offsetting) {
    return 'boo';
  }

  // Turnovers produce a gasp reaction (shock).
  if (play.turnover) {
    return 'gasp';
  }

  // --- Excitement tier mapping ---
  // The crowd reacts from the home team's perspective.
  // Scoring plays or big plays for the home team produce positive reactions.
  // The same plays for the away team produce negative reactions.

  // Determine if this play is "good" for the home team.
  const isHomePositive =
    (play.scoring && play.scoring.team === 'home') ||
    (possession === 'home' && play.yardsGained > 0 && !play.turnover) ||
    (possession === 'away' && play.type === 'sack');

  if (excitement >= 80) {
    return isHomePositive ? 'roar' : 'groan';
  }

  if (excitement >= 60) {
    return isHomePositive ? 'cheer' : 'gasp';
  }

  if (excitement >= 40) {
    return 'cheer';
  }

  if (excitement >= 20) {
    return 'murmur';
  }

  return 'silence';
}
