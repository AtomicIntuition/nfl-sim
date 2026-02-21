// ============================================================================
// GridIron Live - NFL Simulation Constants
// ============================================================================
// Single source of truth for all simulation tuning knobs.
// All values are calibrated against real NFL statistical data.
// ============================================================================

import type {
  PenaltyDefinition,
  YardDistribution,
  PlayDistribution,
  ClockRange,
} from './types';

// ============================================================================
// CLOCK CONSTANTS
// ============================================================================

/** Standard NFL quarter length: 15 minutes = 900 seconds */
export const QUARTER_LENGTH = 900;

/** NFL play clock: 40 seconds from end of previous play */
export const PLAY_CLOCK = 40;

/** Halftime duration in simulation seconds (compressed for game flow) */
export const HALFTIME_DURATION = 15;

/** Two-minute warning triggers at 120 seconds remaining in 2nd and 4th quarters */
export const TWO_MINUTE_WARNING = 120;

// ============================================================================
// PLAY OUTCOME PROBABILITIES
// Based on real NFL data (2020-2024 seasons aggregate)
// ============================================================================

/**
 * Base completion percentages by pass type.
 * Short: 0-9 yards, Medium: 10-19 yards, Deep: 20+ yards, Screen: behind LOS
 */
export const COMPLETION_RATES = {
  short: 0.72,
  medium: 0.58,
  deep: 0.38,
  screen: 0.80,
} as const;

/**
 * Average yards gained by play type.
 * Mean and standard deviation for a normal distribution model.
 * Negative stdDev tails are clamped at the play resolution layer.
 */
export const AVERAGE_YARDS: Record<string, YardDistribution> = {
  run_inside: { mean: 4.0, stdDev: 3.5 },
  run_outside: { mean: 4.6, stdDev: 4.0 },
  pass_short: { mean: 6.5, stdDev: 3.0 },
  pass_medium: { mean: 12.0, stdDev: 5.0 },
  pass_deep: { mean: 28.0, stdDev: 10.0 },
  screen_pass: { mean: 5.5, stdDev: 4.0 },
  scramble: { mean: 6.0, stdDev: 4.5 },
  sack: { mean: -7.0, stdDev: 2.5 },
} as const;

/** Sack rate on any pass play (~6.5% NFL average) */
export const SACK_RATE = 0.065;

/** Probability of a 20+ yard gain on any given play */
export const BIG_PLAY_RATE = 0.05;

// ============================================================================
// TURNOVER RATES (per play)
// ============================================================================

/** Fumble rate per play across all play types (~1.5% NFL average) */
export const FUMBLE_RATE = 0.015;

/** Defense recovers ~52% of fumbles; offense recovers ~48% */
export const FUMBLE_RECOVERY_DEFENSE = 0.52;

/** Interception rate per pass attempt (~2.5% NFL average) */
export const INTERCEPTION_RATE = 0.025;

/** ~3% of interceptions are returned for a touchdown (pick-six) */
export const PICK_SIX_RATE = 0.03;

/** ~4% of defensive fumble recoveries are returned for a touchdown */
export const FUMBLE_TD_RATE = 0.04;

/** ~2% of punts are muffed by the return team */
export const MUFFED_PUNT_RATE = 0.02;

// ============================================================================
// SPECIAL TEAMS
// ============================================================================

/** ~62% of kickoffs result in a touchback (post-2023 rule era) */
export const TOUCHBACK_RATE = 0.62;

/** Average kickoff return distance in yards */
export const KICKOFF_RETURN_MEAN = 23.0;
export const KICKOFF_RETURN_STDDEV = 8.0;

/** Average punt distance in yards (gross) */
export const PUNT_DISTANCE_MEAN = 45.0;
export const PUNT_DISTANCE_STDDEV = 6.0;

/** Average punt return distance in yards */
export const PUNT_RETURN_MEAN = 9.0;
export const PUNT_RETURN_STDDEV = 5.0;

/** ~55% of catchable punts result in a fair catch */
export const FAIR_CATCH_RATE = 0.55;

/** ~15% chance of fair catch on kickoff returns (ball dead at catch spot) */
export const KICKOFF_FAIR_CATCH_RATE = 0.15;

/**
 * Field goal accuracy by distance range.
 * Ranges are inclusive lower, exclusive upper.
 * Values reflect NFL kicker accuracy from recent seasons.
 */
export const FIELD_GOAL_ACCURACY_BY_DISTANCE = [
  { minDistance: 0, maxDistance: 20, accuracy: 0.98 },
  { minDistance: 20, maxDistance: 30, accuracy: 0.93 },
  { minDistance: 30, maxDistance: 40, accuracy: 0.87 },
  { minDistance: 40, maxDistance: 50, accuracy: 0.78 },
  { minDistance: 50, maxDistance: 55, accuracy: 0.60 },
  { minDistance: 55, maxDistance: 70, accuracy: 0.35 },
] as const;

/**
 * Returns the base field goal accuracy for a given distance in yards.
 * Uses the FIELD_GOAL_ACCURACY_BY_DISTANCE lookup table.
 * Returns 0 for distances >= 70 yards (impossible).
 */
export function getFieldGoalAccuracy(distanceYards: number): number {
  for (const range of FIELD_GOAL_ACCURACY_BY_DISTANCE) {
    if (distanceYards >= range.minDistance && distanceYards < range.maxDistance) {
      return range.accuracy;
    }
  }
  return 0;
}

/** Extra point (PAT) success rate from the 15-yard line (~94% NFL average) */
export const EXTRA_POINT_RATE = 0.94;

/** Two-point conversion success rates (run ~55%, pass ~45% in NFL) */
export const TWO_POINT_CONVERSION_RATE = 0.48; // legacy fallback
export const TWO_POINT_RUN_RATE = 0.55;
export const TWO_POINT_PASS_RATE = 0.45;

/** Onside kick recovery rate (~10% in modern NFL after 2018 rule changes) */
export const ONSIDE_KICK_RECOVERY = 0.10;

// ============================================================================
// PENALTY DEFINITIONS
// ============================================================================
// Each penalty includes: type identifier, display name, yardage, and flags.
// frequencyWeight values are calibrated so that over a full game (~130 plays
// at 7.5% penalty rate = ~10 penalties), the distribution matches NFL data:
//   holding_offense ~22%, false_start ~18%, offsides ~8%, DPI ~9.5%, etc.
// ============================================================================

export const PENALTIES: readonly PenaltyDefinition[] = [
  {
    type: 'holding_offense',
    name: 'Offensive Holding',
    yards: 10,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 22,
  },
  {
    type: 'holding_defense',
    name: 'Defensive Holding',
    yards: 5,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 4,
  },
  {
    type: 'false_start',
    name: 'False Start',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 18,
  },
  {
    type: 'offsides',
    name: 'Offsides',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 8,
  },
  {
    type: 'encroachment',
    name: 'Encroachment',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 2,
  },
  {
    type: 'pass_interference_offense',
    name: 'Offensive Pass Interference',
    yards: 10,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 2,
  },
  {
    type: 'pass_interference_defense',
    name: 'Defensive Pass Interference',
    yards: 0, // spot foul - yardage determined at enforcement
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: true,
    frequencyWeight: 9.5,
  },
  {
    type: 'roughing_the_passer',
    name: 'Roughing the Passer',
    yards: 15,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 2.5,
  },
  {
    type: 'unnecessary_roughness',
    name: 'Unnecessary Roughness',
    yards: 15,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'facemask',
    name: 'Facemask',
    yards: 15,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 2.5,
  },
  {
    type: 'illegal_formation',
    name: 'Illegal Formation',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 2,
  },
  {
    type: 'delay_of_game',
    name: 'Delay of Game',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'illegal_block',
    name: 'Illegal Block in the Back',
    yards: 10,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'illegal_contact',
    name: 'Illegal Contact',
    yards: 5,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 2,
  },
  {
    type: 'neutral_zone_infraction',
    name: 'Neutral Zone Infraction',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'unsportsmanlike_conduct',
    name: 'Unsportsmanlike Conduct',
    yards: 15,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 2,
  },
  {
    type: 'intentional_grounding',
    name: 'Intentional Grounding',
    yards: 0, // spot foul + loss of down; enforced at spot of foul
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: true,
    lossOfDown: true,
    frequencyWeight: 1.5,
  },
  {
    type: 'ineligible_downfield',
    name: 'Ineligible Receiver Downfield',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 1.5,
  },
  {
    type: 'illegal_use_of_hands',
    name: 'Illegal Use of Hands',
    yards: 10,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'tripping',
    name: 'Tripping',
    yards: 10,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 1,
  },
  {
    type: 'horse_collar',
    name: 'Horse Collar Tackle',
    yards: 15,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 1.5,
  },
  {
    type: 'too_many_men',
    name: 'Too Many Men on the Field',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: true,
    isSpotFoul: false,
    frequencyWeight: 3,
  },
  {
    type: 'roughing_the_kicker',
    name: 'Roughing the Kicker',
    yards: 15,
    isAutoFirstDown: true,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 0.5,
  },
  {
    type: 'running_into_kicker',
    name: 'Running Into the Kicker',
    yards: 5,
    isAutoFirstDown: false,
    isPreSnap: false,
    isSpotFoul: false,
    frequencyWeight: 1.0,
  },
] as const;

/** Total of all penalty frequency weights (for probability normalization) */
export const PENALTY_TOTAL_WEIGHT = PENALTIES.reduce(
  (sum, p) => sum + p.frequencyWeight,
  0
);

/** ~7.5% of plays result in a penalty (NFL average ~7-8%) */
export const PENALTY_RATE = 0.075;

// ============================================================================
// INJURY RATES
// ============================================================================

/** Probability of an injury occurring on any given play */
export const INJURY_RATE_PER_PLAY = 0.003;

/** Cap on injuries per game to keep simulation playable */
export const MAX_INJURIES_PER_GAME = 4;

/**
 * Relative injury likelihood by position.
 * Higher weight = more likely to be injured on a given play.
 * Calibrated from NFL injury report data: skill positions and linemen
 * who absorb repeated contact have the highest rates.
 */
export const POSITION_INJURY_WEIGHTS: Record<string, number> = {
  QB: 1.0,
  RB: 1.4,
  WR: 1.2,
  TE: 1.1,
  OL: 1.0,
  DL: 1.0,
  LB: 1.3,
  CB: 1.3,
  S: 1.1,
  K: 0.2,
  P: 0.2,
  KR: 1.5, // kick returners face high-speed collisions
  PR: 1.4,
} as const;

// ============================================================================
// PLAY CALLING SITUATION TABLES
// ============================================================================
// Distribution arrays are [run%, shortPass%, mediumPass%, deepPass%].
// All values in each array sum to 1.0.
// ============================================================================

/**
 * Default play distribution by down and distance category.
 * Keys use the format: "down_distanceCategory"
 */
export const PLAY_DISTRIBUTION: Record<string, PlayDistribution> = {
  // --- First Down ---
  '1_standard': { run: 0.45, shortPass: 0.35, mediumPass: 0.15, deepPass: 0.05 },

  // --- Second Down ---
  '2_short': { run: 0.55, shortPass: 0.25, mediumPass: 0.15, deepPass: 0.05 },   // 1-3 yards to go
  '2_medium': { run: 0.40, shortPass: 0.30, mediumPass: 0.20, deepPass: 0.10 },  // 4-7 yards to go
  '2_long': { run: 0.25, shortPass: 0.30, mediumPass: 0.25, deepPass: 0.20 },    // 8+ yards to go

  // --- Third Down ---
  '3_short': { run: 0.45, shortPass: 0.30, mediumPass: 0.20, deepPass: 0.05 },   // 1-3 yards to go
  '3_medium': { run: 0.15, shortPass: 0.30, mediumPass: 0.35, deepPass: 0.20 },  // 4-7 yards to go
  '3_long': { run: 0.05, shortPass: 0.25, mediumPass: 0.35, deepPass: 0.35 },    // 8+ yards to go

  // --- Fourth Down (going for it) ---
  '4_short': { run: 0.60, shortPass: 0.20, mediumPass: 0.15, deepPass: 0.05 },   // 1-3 yards to go
} as const;

/**
 * Red zone adjustments (ball inside opponent's 20-yard line).
 * Deep passes are limited by available field.
 */
export const RED_ZONE_DISTRIBUTION: PlayDistribution = {
  run: 0.42,
  shortPass: 0.38,
  mediumPass: 0.17,
  deepPass: 0.03,
} as const;

/**
 * Goal line adjustments (ball inside opponent's 5-yard line).
 * Power run and quick passes dominate; no room for deep routes.
 */
export const GOAL_LINE_DISTRIBUTION: PlayDistribution = {
  run: 0.50,
  shortPass: 0.40,
  mediumPass: 0.10,
  deepPass: 0.00,
} as const;

/**
 * Two-minute drill adjustments.
 * Heavily pass-oriented with hurry-up tempo.
 * Spike and no-huddle options are handled at the play-selection layer.
 */
export const TWO_MINUTE_DRILL_DISTRIBUTION: PlayDistribution = {
  run: 0.10,
  shortPass: 0.40,
  mediumPass: 0.30,
  deepPass: 0.20,
} as const;

/**
 * Protecting a lead (ahead by 10+ points in the 4th quarter).
 * Run-heavy to drain clock. Kneel-down logic is handled separately
 * when game clock is under ~2:00 with sufficient lead.
 */
export const PROTECT_LEAD_DISTRIBUTION: PlayDistribution = {
  run: 0.80,
  shortPass: 0.15,
  mediumPass: 0.05,
  deepPass: 0.00,
} as const;

/**
 * Distance-category thresholds used to look up PLAY_DISTRIBUTION keys.
 * "short" = 1-3 yards, "medium" = 4-7 yards, "long" = 8+ yards.
 */
export const DISTANCE_CATEGORIES = {
  short: { min: 1, max: 3 },
  medium: { min: 4, max: 7 },
  long: { min: 8, max: Infinity },
} as const;

// ============================================================================
// GAME PACING (for SSE streaming, in milliseconds)
// ============================================================================
// These control the delay between play events sent to the client.
// Tuned for a cinematic broadcast-like experience.
// ============================================================================

/** Standard delay between plays during normal game flow */
export const PLAY_DELAY_NORMAL = 4000;

/** Faster pace during two-minute drill / hurry-up */
export const PLAY_DELAY_TWO_MINUTE = 2000;

/** Longer pause after a touchdown for celebration / replay */
export const PLAY_DELAY_AFTER_TOUCHDOWN = 5000;

/** Pause after turnovers for dramatic effect */
export const PLAY_DELAY_AFTER_TURNOVER = 3500;

/** Extended pause for clutch / high-leverage moments */
export const PLAY_DELAY_CLUTCH = 6000;

/** Pause between quarters for transition */
export const PLAY_DELAY_BETWEEN_QUARTERS = 8000;

/** Extended pause at halftime */
export const PLAY_DELAY_HALFTIME = 15000;

// ============================================================================
// REAL-TIME GAME PACING (for authentic ~60-80 minute broadcast)
// ============================================================================
// These control SSE delays that map to actual game-time consumption,
// producing an authentic broadcast experience instead of a 5-minute highlight reel.
// ============================================================================

/** Real-time delay when the clock is stopped (huddle + lineup time) */
export const REALTIME_PLAY_CLOCK_DELAY_MS = 8_000;

/** Faster play clock during two-minute drill / hurry-up */
export const REALTIME_TWO_MINUTE_PLAY_CLOCK_MS = 5_000;

/** Pause between quarters (Q1→Q2, Q3→Q4) */
export const REALTIME_QUARTER_BREAK_MS = 15_000;

/** Halftime break */
export const REALTIME_HALFTIME_MS = 45_000;

/** Pause for the two-minute warning */
export const REALTIME_TWO_MINUTE_WARNING_MS = 8_000;

/** Extra celebration pause after a touchdown */
export const REALTIME_TOUCHDOWN_BONUS_MS = 6_000;

/** Dramatic pause after a turnover */
export const REALTIME_TURNOVER_BONUS_MS = 4_000;

/** Estimated total game duration including all delays (~30 min) */
export const ESTIMATED_GAME_DURATION_MS = 30 * 60 * 1000;

/** Estimated game slot including post-game intermission (~45 min) */
export const ESTIMATED_GAME_SLOT_MS = 45 * 60 * 1000;

// ============================================================================
// SCORING DISTRIBUTION TARGETS (for validation / regression testing)
// ============================================================================
// These are not used in simulation logic directly, but serve as
// reference targets when tuning the engine to match real NFL outputs.
// ============================================================================

/** Real NFL average total points per game: ~45-47 (both teams combined) */
export const AVERAGE_TOTAL_POINTS = 46.0;

/** Average number of plays (both teams) in an NFL game */
export const AVERAGE_PLAYS_PER_GAME = 140;

/** League-wide pass play percentage (~57%) */
export const AVERAGE_PASS_PERCENTAGE = 0.57;

/** ~6% of NFL games go to overtime */
export const OVERTIME_RATE = 0.06;

// ============================================================================
// MOMENTUM CONSTANTS
// ============================================================================
// Momentum is a per-team modifier that shifts play outcome probabilities
// slightly. It builds on big plays and decays over time, simulating
// the real-world "hot hand" and crowd energy effects.
// ============================================================================

/** Momentum gained by the scoring team after a touchdown */
export const MOMENTUM_TOUCHDOWN = 25;

/** Momentum gained after a field goal */
export const MOMENTUM_FIELD_GOAL = 10;

/** Momentum swing on a turnover (gained by defense, lost by offense) */
export const MOMENTUM_TURNOVER = 35;

/** Momentum gained by the defensive team after a sack */
export const MOMENTUM_SACK = 10;

/** Momentum gained after a big play (20+ yards) */
export const MOMENTUM_BIG_PLAY = 15;

/** Momentum gained by the defensive team after forcing a three-and-out */
export const MOMENTUM_THREE_AND_OUT = 12;

/** Momentum decays by this amount per play to prevent runaway effects */
export const MOMENTUM_DECAY_PER_PLAY = 2;

/** Maximum probability modifier from momentum: +/- 3% */
export const MOMENTUM_MAX_EFFECT = 0.03;

// ============================================================================
// FIELD POSITION CONSTANTS
// ============================================================================
// The field is modeled as 0-100 where 0 is the offensive team's own goal
// line and 100 is the opponent's goal line (endzone).
// ============================================================================

/** Total field length in yards (goal line to goal line) */
export const FIELD_LENGTH = 100;

/** Own goal line (endzone behind the offense) */
export const ENDZONE_START = 0;

/** Opponent's goal line (endzone the offense is attacking) */
export const ENDZONE_END = 100;

/** Ball position >= 80 means inside the opponent's 20-yard line (red zone) */
export const RED_ZONE = 80;

/**
 * Maximum ball position from which a field goal is considered viable.
 * Ball at 63 = opponent's 37-yard line = 47-yard field goal attempt
 * (37 yards + 10 yards endzone + ~7 yards snap to hold).
 */
export const FIELD_GOAL_RANGE = 63;

/** Ball placed at own 25-yard line after a kickoff touchback (post-2016 rule) */
export const TOUCHBACK_POSITION = 25;

/** Ball placed at own 20-yard line after a punt touchback */
export const PUNT_TOUCHBACK_POSITION = 20;

/** Chance a kickoff goes out of bounds (~3% in NFL) */
export const KICKOFF_OOB_RATE = 0.03;

/** Ball placed at receiving team's 40 after kickoff OOB */
export const KICKOFF_OOB_POSITION = 40;

/** Chance of a fake punt on 4th-and-short in opponent territory */
export const FAKE_PUNT_RATE = 0.02;

/** Chance of a fake field goal */
export const FAKE_FG_RATE = 0.01;

/**
 * Safety threshold: if a ball carrier is tackled at or behind their
 * own 2-yard line during a sack/tackle-for-loss, check for safety.
 */
export const SAFETY_POSITION = 2;

// ============================================================================
// CLOCK TIME PER PLAY TYPE (seconds of game clock elapsed)
// ============================================================================
// Each play type consumes a range of game clock time.
// Run plays and completions burn more clock; incompletions stop the clock.
// ============================================================================

export const CLOCK_TIME: Record<string, ClockRange> = {
  /** Run play: snap to whistle + huddle. Clock runs. */
  run_normal: { min: 25, max: 40 },

  /** Completed pass: clock runs after the catch until next snap/OOB. */
  pass_complete: { min: 20, max: 35 },

  /** Incomplete pass: clock stops. Only accounts for play clock runoff. */
  pass_incomplete: { min: 5, max: 10 },

  /** Sack: clock runs (QB tackled in bounds). */
  sack: { min: 20, max: 35 },

  /** Pre-snap penalty: no game clock elapses (play never started). */
  penalty_presnap: { min: 0, max: 0 },

  /** Punt: kick + return + dead ball. Clock stops on change of possession. */
  punt: { min: 5, max: 10 },

  /** Field goal attempt: snap, hold, kick. Clock stops afterward. */
  field_goal: { min: 5, max: 8 },

  /** Kickoff: kick + return/touchback. Clock stops on change of possession. */
  kickoff: { min: 5, max: 8 },

  /** QB kneel: burns nearly the full play clock. */
  kneel: { min: 38, max: 40 },

  /** Clock-stopping spike: minimum time off the clock. */
  spike: { min: 2, max: 3 },

  /** Two-minute drill / hurry-up: reduced huddle and clock usage. */
  two_minute_drill: { min: 5, max: 15 },
} as const;
