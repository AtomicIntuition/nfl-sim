// ============================================================================
// GridIron Live - Drama Detector
// ============================================================================
// Detects high-stakes dramatic moments that change commentary tone and
// crowd energy. Each play is analyzed for situational flags (clutch,
// comeback, blowout, red zone, etc.) and a composite drama level 0-100
// is produced. The drama level feeds into commentary intensity, crowd
// audio selection, and UI animation scaling.
// ============================================================================

import { GameState, PlayResult } from '../simulation/types';

// ============================================================================
// TYPES
// ============================================================================

export interface DramaFlags {
  /** 4th quarter / OT, under 2:00, score within 8 points. */
  isClutchMoment: boolean;
  /** A team was down 14+ at some point and is now within 7. */
  isComebackBrewing: boolean;
  /** Point differential >= 21. */
  isBlowout: boolean;
  /** Defense inside own 5-yard line, 3rd or 4th down. */
  isGoalLineStand: boolean;
  /** Under 2:00 in the 2nd or 4th quarter, trailing team has ball. */
  isTwoMinuteDrill: boolean;
  /** In overtime and a score has occurred. */
  isOvertimeThriller: boolean;
  /** Ball position >= 80 (inside opponent's 20). */
  isRedZone: boolean;
  /** 4th quarter, under 5:00, trailing team has ball, within 8 points. */
  isGameWinningDrive: boolean;
  /** Composite drama score from 0 (boring) to 100 (peak drama). */
  dramaLevel: number;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Returns the absolute point differential. */
function scoreDiff(state: GameState): number {
  return Math.abs(state.homeScore - state.awayScore);
}

/** Returns which side is trailing ('home' | 'away' | null if tied). */
function trailingTeam(state: GameState): 'home' | 'away' | null {
  if (state.homeScore < state.awayScore) return 'home';
  if (state.awayScore < state.homeScore) return 'away';
  return null;
}

/** Whether the game clock is under a given number of seconds. */
function clockUnder(state: GameState, seconds: number): boolean {
  return state.clock <= seconds;
}

/** Whether we are in the 4th quarter or overtime. */
function isLateGame(state: GameState): boolean {
  return state.quarter === 4 || state.quarter === 'OT';
}

/**
 * Scan previous plays to find the largest deficit the currently-trailing
 * (or tied) team has faced. Returns the maximum point deficit seen during
 * the game for the team that is currently trailing (or 0 if no deficit).
 */
function findLargestDeficit(
  state: GameState,
  previousPlays: PlayResult[]
): number {
  // We approximate deficit from scoring plays in the history.
  // Walk scoring plays and track running score to find max deficit
  // for the team that is currently behind (or was behind).
  let homeRunning = 0;
  let awayRunning = 0;
  let maxDeficitForTrailing = 0;

  const trailing = trailingTeam(state);
  if (trailing === null) {
    // Game is tied. Check if either team was ever behind by 14+.
    // Use home perspective.
    for (const play of previousPlays) {
      if (play.scoring) {
        if (play.scoring.team === 'home') homeRunning += play.scoring.points;
        else awayRunning += play.scoring.points;
      }
      const homeDeficit = awayRunning - homeRunning;
      const awayDeficit = homeRunning - awayRunning;
      maxDeficitForTrailing = Math.max(
        maxDeficitForTrailing,
        homeDeficit,
        awayDeficit
      );
    }
    return maxDeficitForTrailing;
  }

  for (const play of previousPlays) {
    if (play.scoring) {
      if (play.scoring.team === 'home') homeRunning += play.scoring.points;
      else awayRunning += play.scoring.points;
    }
    const deficit =
      trailing === 'home'
        ? awayRunning - homeRunning
        : homeRunning - awayRunning;
    if (deficit > maxDeficitForTrailing) {
      maxDeficitForTrailing = deficit;
    }
  }

  return maxDeficitForTrailing;
}

/**
 * Check if a score has occurred in overtime by examining whether
 * either team has scored since overtime began.
 */
function hasOvertimeScore(state: GameState, previousPlays: PlayResult[]): boolean {
  if (state.quarter !== 'OT') return false;
  // Any scoring play in OT means the score has changed in overtime.
  // We detect this by checking if either score is non-zero relative to
  // the last regulation score. Since we don't track regulation-end scores
  // directly, we look for any scoring play that occurred during OT.
  // The simplest proxy: if totalScore is odd or different from a tie,
  // a score has happened. But more reliably, check if there are any
  // scoring plays in recent history.
  for (const play of previousPlays) {
    if (play.scoring) {
      // We can't definitively know which plays are OT plays without
      // timestamps, so we check if the current state is OT and the
      // scores are not tied. If not tied, someone scored in OT.
      if (state.homeScore !== state.awayScore) return true;
    }
  }
  return false;
}

// ============================================================================
// DRAMA LEVEL COMPUTATION
// ============================================================================

/**
 * Compute a composite drama level from 0-100 based on active flags
 * and how close the game is.
 */
function computeDramaLevel(
  flags: Omit<DramaFlags, 'dramaLevel'>,
  state: GameState,
  momentum: number
): number {
  const diff = scoreDiff(state);

  // --- Blowout short-circuits to low drama ---
  if (flags.isBlowout) {
    // Even blowouts have some baseline interest (garbage time TDs, etc.)
    return Math.max(10, 20 - Math.floor(diff / 7));
  }

  let drama = 0;

  // --- Closeness of score is the primary driver ---
  // Tied game in the 4th quarter is peak baseline.
  if (diff === 0) {
    drama += 45;
  } else if (diff <= 3) {
    drama += 40; // one score (FG)
  } else if (diff <= 7) {
    drama += 32; // one score (TD)
  } else if (diff <= 8) {
    drama += 28; // one score (TD + 2pt)
  } else if (diff <= 14) {
    drama += 20; // two scores
  } else {
    drama += 10;
  }

  // --- Quarter multiplier: later = higher stakes ---
  if (state.quarter === 'OT') {
    drama += 20;
  } else if (state.quarter === 4) {
    drama += 15;
  } else if (state.quarter === 3) {
    drama += 5;
  }

  // --- Flag bonuses ---
  if (flags.isClutchMoment) drama += 20;
  if (flags.isComebackBrewing) drama += 12;
  if (flags.isGameWinningDrive) drama += 15;
  if (flags.isTwoMinuteDrill) drama += 8;
  if (flags.isGoalLineStand) drama += 10;
  if (flags.isOvertimeThriller) drama += 12;
  if (flags.isRedZone) drama += 5;

  // --- Momentum extremes add tension ---
  if (Math.abs(momentum) >= 60) {
    drama += 5;
  }

  return Math.min(100, Math.max(0, drama));
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Analyze the current game state for dramatic elements.
 *
 * Returns a DramaFlags object with boolean situation flags and a
 * composite drama level score from 0-100.
 */
export function detectDrama(
  state: GameState,
  play: PlayResult,
  momentum: number,
  previousPlays: PlayResult[]
): DramaFlags {
  const diff = scoreDiff(state);
  const trailing = trailingTeam(state);

  // --- Clutch Moment ---
  // 4th quarter or OT, < 2:00 remaining, score within 8 points.
  const isClutchMoment =
    isLateGame(state) &&
    clockUnder(state, 120) &&
    diff <= 8;

  // --- Comeback Brewing ---
  // Team was down 14+ at any point, now within 7.
  const largestDeficit = findLargestDeficit(state, previousPlays);
  const isComebackBrewing = largestDeficit >= 14 && diff <= 7;

  // --- Blowout ---
  const isBlowout = diff >= 21;

  // --- Goal Line Stand ---
  // Defense is inside their own 5-yard line, 3rd or 4th down.
  // Ball position >= 95 means the offense is at the 5-yard line or closer
  // to the end zone. The defense is making a stand.
  const isGoalLineStand =
    state.ballPosition >= 95 &&
    (state.down === 3 || state.down === 4);

  // --- Two-Minute Drill ---
  // Under 2:00 in 2nd or 4th quarter, trailing team has ball.
  const isSecondOrFourth = state.quarter === 2 || state.quarter === 4;
  const isTwoMinuteDrill =
    isSecondOrFourth &&
    clockUnder(state, 120) &&
    trailing !== null &&
    state.possession === trailing;

  // --- Overtime Thriller ---
  const isOvertimeThriller =
    state.quarter === 'OT' && hasOvertimeScore(state, previousPlays);

  // --- Red Zone ---
  const isRedZone = state.ballPosition >= 80;

  // --- Game-Winning Drive ---
  // 4th quarter, under 5:00, trailing team has ball, within 8 points.
  const isGameWinningDrive =
    state.quarter === 4 &&
    clockUnder(state, 300) &&
    diff <= 8 &&
    trailing !== null &&
    state.possession === trailing;

  const partialFlags = {
    isClutchMoment,
    isComebackBrewing,
    isBlowout,
    isGoalLineStand,
    isTwoMinuteDrill,
    isOvertimeThriller,
    isRedZone,
    isGameWinningDrive,
  };

  const dramaLevel = computeDramaLevel(partialFlags, state, momentum);

  return {
    ...partialFlags,
    dramaLevel,
  };
}
