// ============================================================
// GridIron Live - NFL Football Simulation Type System
// ============================================================
// This file is the foundational type contract for the entire
// simulation platform. Every module depends on these types.
// ============================================================

// ============================================================
// TEAM & PLAYER TYPES
// ============================================================

/** AFC or NFC conference designation. */
export type Conference = 'AFC' | 'NFC';

/** NFL division within a conference. */
export type Division = 'North' | 'South' | 'East' | 'West';

/** Offensive philosophy that influences play-calling tendencies. */
export type PlayStyle =
  | 'balanced'
  | 'pass_heavy'
  | 'run_heavy'
  | 'aggressive'
  | 'conservative';

export interface Team {
  id: string;
  /** Full franchise name, e.g. "Kansas City Chiefs". */
  name: string;
  /** Standard two- or three-letter abbreviation, e.g. "KC". */
  abbreviation: string;
  city: string;
  mascot: string;
  conference: Conference;
  division: Division;
  primaryColor: string;
  secondaryColor: string;
  /** Overall offensive capability rating. Range: 70-99. */
  offenseRating: number;
  /** Overall defensive capability rating. Range: 70-99. */
  defenseRating: number;
  /** Kicking, punting, and return unit rating. Range: 70-99. */
  specialTeamsRating: number;
  playStyle: PlayStyle;
  /** Optional URL to team logo asset. */
  logo?: string;
}

/** Standard NFL roster positions. */
export type Position =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'OL'
  | 'DL'
  | 'LB'
  | 'CB'
  | 'S'
  | 'K'
  | 'P';

export interface Player {
  id: string;
  teamId: string;
  name: string;
  position: Position;
  /** Jersey number. */
  number: number;
  /** Overall player rating. Range: 60-99. */
  rating: number;
  /** Straight-line speed and acceleration. Range: 60-99. */
  speed: number;
  /** Physical power for blocking, tackling, and breaking tackles. Range: 60-99. */
  strength: number;
  /** Football IQ, reaction time, and decision-making. Range: 60-99. */
  awareness: number;
  /** Performance modifier in high-pressure situations. Range: 60-99. */
  clutchRating: number;
  /** Whether the player has an elevated risk of leaving a game. */
  injuryProne: boolean;
}

// ============================================================
// GAME STATE TYPES
// ============================================================

/** Current quarter of play, including overtime. */
export type Quarter = 1 | 2 | 3 | 4 | 'OT';

/** Which team has possession relative to home/away designation. */
export type PossessionTeam = 'home' | 'away';

export interface GameState {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  quarter: Quarter;
  /**
   * Seconds remaining in the current quarter.
   * Standard NFL quarters are 900 seconds (15 minutes).
   * Overtime is 600 seconds (10 minutes).
   */
  clock: number;
  /**
   * Play clock in seconds. Resets to 40 after most plays
   * or 25 after certain stoppages.
   */
  playClock: number;
  possession: PossessionTeam;
  /** Current down. Range: 1-4. */
  down: 1 | 2 | 3 | 4;
  /** Yards needed for a first down or touchdown. */
  yardsToGo: number;
  /**
   * Field position represented as yards from the possessing team's
   * own goal line. 0 = own end zone, 100 = opponent's end zone.
   * For example, 25 means the team's own 25-yard line.
   */
  ballPosition: number;
  /** Remaining timeouts for the home team. Range: 0-3. */
  homeTimeouts: number;
  /** Remaining timeouts for the away team. Range: 0-3. */
  awayTimeouts: number;
  isClockRunning: boolean;
  /** Whether the two-minute warning has been triggered this half. */
  twoMinuteWarning: boolean;
  isHalftime: boolean;
  /** True when the next play is a kickoff. */
  kickoff: boolean;
  /** True when the next play is a PAT or two-point conversion attempt. */
  patAttempt: boolean;
}

// ============================================================
// PLAY TYPES
// ============================================================

/** The outcome classification of a play after it has been resolved. */
export type PlayType =
  | 'run'
  | 'pass_complete'
  | 'pass_incomplete'
  | 'sack'
  | 'scramble'
  | 'punt'
  | 'field_goal'
  | 'kickoff'
  | 'extra_point'
  | 'two_point'
  | 'kneel'
  | 'spike'
  | 'touchback';

/** The offensive play called before the snap. */
export type PlayCall =
  | 'run_inside'
  | 'run_outside'
  | 'pass_short'
  | 'pass_medium'
  | 'pass_deep'
  | 'screen_pass'
  | 'punt'
  | 'field_goal'
  | 'extra_point'
  | 'two_point_run'
  | 'two_point_pass'
  | 'kneel'
  | 'spike'
  | 'onside_kick'
  | 'kickoff'
  | 'kickoff_normal';

export interface PlayResult {
  type: PlayType;
  call: PlayCall;
  /** Human-readable narrative of what happened on the play. */
  description: string;
  /** Net yards gained (negative for losses). */
  yardsGained: number;
  passer: Player | null;
  rusher: Player | null;
  receiver: Player | null;
  defender: Player | null;
  turnover: TurnoverResult | null;
  penalty: PenaltyResult | null;
  injury: InjuryResult | null;
  scoring: ScoringResult | null;
  /** Seconds elapsed off the game clock during this play. */
  clockElapsed: number;
  /** Whether the game clock stops after this play (incomplete pass, out of bounds, etc.). */
  isClockStopped: boolean;
  isFirstDown: boolean;
  isTouchdown: boolean;
  isSafety: boolean;
}

// ============================================================
// TURNOVER TYPES
// ============================================================

export type TurnoverType =
  | 'fumble'
  | 'interception'
  | 'fumble_recovery'
  | 'turnover_on_downs'
  | 'muffed_punt';

export interface TurnoverResult {
  type: TurnoverType;
  /** Which team recovered the ball. */
  recoveredBy: 'home' | 'away';
  /** Yards returned after the turnover. */
  returnYards: number;
  /** Whether the turnover was returned all the way for a touchdown. */
  returnedForTD: boolean;
}

// ============================================================
// PENALTY TYPES
// ============================================================

/** All NFL penalty types modeled in the simulation. */
export type PenaltyType =
  | 'holding_offense'
  | 'holding_defense'
  | 'false_start'
  | 'offsides'
  | 'encroachment'
  | 'pass_interference_offense'
  | 'pass_interference_defense'
  | 'roughing_the_passer'
  | 'unnecessary_roughness'
  | 'facemask'
  | 'illegal_formation'
  | 'delay_of_game'
  | 'illegal_block'
  | 'illegal_contact'
  | 'neutral_zone_infraction'
  | 'unsportsmanlike_conduct'
  | 'intentional_grounding'
  | 'ineligible_downfield'
  | 'illegal_use_of_hands'
  | 'tripping'
  | 'horse_collar'
  | 'too_many_men';

export interface PenaltyResult {
  type: PenaltyType;
  /** Which team committed the penalty. */
  on: 'home' | 'away';
  /** The player who committed the penalty, if applicable. */
  player: Player | null;
  /** Penalty yardage. */
  yards: number;
  /** Whether this penalty awards an automatic first down (e.g. defensive holding). */
  isAutoFirstDown: boolean;
  /** Whether the penalty is enforced from the spot of the foul (e.g. DPI). */
  isSpotFoul: boolean;
  /** Whether the opposing team declined the penalty. */
  declined: boolean;
  /** Whether this penalty was part of an offsetting penalties situation. */
  offsetting: boolean;
  /** Human-readable description of the infraction. */
  description: string;
}

// ============================================================
// INJURY TYPES
// ============================================================

/** Injury severity matching NFL injury report designations. */
export type InjurySeverity = 'questionable' | 'out';

export interface InjuryResult {
  player: Player;
  severity: InjurySeverity;
  /** Description of the injury, e.g. "left ankle sprain". */
  description: string;
}

// ============================================================
// SCORING TYPES
// ============================================================

/** All ways points can be scored in an NFL game. */
export type ScoringType =
  | 'touchdown'
  | 'field_goal'
  | 'extra_point'
  | 'two_point_conversion'
  | 'safety'
  | 'defensive_touchdown'
  | 'pick_six'
  | 'fumble_recovery_td';

export interface ScoringResult {
  type: ScoringType;
  /** Which team scored. */
  team: 'home' | 'away';
  /** Points awarded: 6 (TD), 3 (FG), 1 (XP), 2 (2pt/safety). */
  points: number;
  /** The player who scored, if applicable. */
  scorer: Player | null;
}

// ============================================================
// COMMENTARY & NARRATIVE
// ============================================================

/** Ambient crowd audio reaction to a play. */
export type CrowdReaction =
  | 'roar'
  | 'cheer'
  | 'groan'
  | 'gasp'
  | 'silence'
  | 'murmur'
  | 'boo'
  | 'chant';

export interface PlayCommentary {
  /** Play-by-play call, e.g. "Martinez drops back, fires deep down the sideline..." */
  playByPlay: string;
  /** Color analyst insight, e.g. "That's the third time he's gone to Johnson on 3rd down." */
  colorAnalysis: string;
  crowdReaction: CrowdReaction;
  /** Excitement level of the moment. Range: 0-100. */
  excitement: number;
}

/** Categorization of emerging storylines during a game. */
export type NarrativeThreadType =
  | 'hot_streak'
  | 'cold_streak'
  | 'defensive_dominance'
  | 'comeback'
  | 'shootout'
  | 'defensive_battle'
  | 'rivalry_moment'
  | 'record_chase'
  | 'rookie_spotlight';

export interface NarrativeThread {
  type: NarrativeThreadType;
  description: string;
  involvedPlayers: Player[];
  /** How intense this storyline is. Range: 0-100. */
  intensity: number;
  /** The event number at which this narrative thread began. */
  startedAt: number;
}

export interface NarrativeSnapshot {
  /**
   * Momentum indicator for the game.
   * Range: -100 to 100. Positive values favor the home team,
   * negative values favor the away team. 0 is neutral.
   */
  momentum: number;
  /** Overall game excitement level. Range: 0-100. */
  excitement: number;
  /** Currently active storylines being tracked. */
  activeThreads: NarrativeThread[];
  /** Whether the trailing team is building a potential comeback. */
  isComebackBrewing: boolean;
  /** Whether the game is in a high-pressure clutch situation (e.g. 4th quarter, close score). */
  isClutchMoment: boolean;
  /** Whether the score differential suggests a lopsided game (21+ points). */
  isBlowout: boolean;
  /** A single player putting up a dominant stat line, if applicable. */
  isDominatingPerformance: { player: Player; stat: string } | null;
}

// ============================================================
// GAME EVENT & COMPLETE GAME
// ============================================================

export interface GameEvent {
  /** Sequential play number within the game, starting at 1. */
  eventNumber: number;
  playResult: PlayResult;
  commentary: PlayCommentary;
  /** Full game state snapshot after this play has been resolved. */
  gameState: GameState;
  narrativeContext: NarrativeSnapshot;
  /**
   * Millisecond offset from game start, used by the client
   * for real-time playback pacing and synchronization.
   */
  timestamp: number;
  /** Which drive this event belongs to, starting at 1. */
  driveNumber: number;
}

/** How a drive ended. */
export type DriveResult =
  | 'touchdown'
  | 'field_goal'
  | 'punt'
  | 'turnover'
  | 'turnover_on_downs'
  | 'end_of_half'
  | 'safety'
  | 'in_progress';

export interface Drive {
  /** Drive number within the game, starting at 1. */
  number: number;
  /** Which team had possession during this drive. */
  team: 'home' | 'away';
  /** Starting field position (0-100 scale, own end zone to opponent's). */
  startPosition: number;
  /** Quarter in which the drive began. */
  startQuarter: number;
  /** Clock time remaining when the drive began (in seconds). */
  startClock: number;
  /** Total number of plays in the drive. */
  plays: number;
  /** Total yards gained during the drive. */
  yards: number;
  result: DriveResult;
  /** Total time elapsed during the drive, in seconds. */
  timeElapsed: number;
}

// ============================================================
// STATS TYPES
// ============================================================

export interface PlayerGameStats {
  player: Player;

  // Passing
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  completions: number;
  attempts: number;

  // Rushing
  rushingYards: number;
  rushingTDs: number;
  carries: number;

  // Receiving
  receivingYards: number;
  receivingTDs: number;
  receptions: number;
  targets: number;

  // Defense
  sacks: number;
  tackles: number;
  forcedFumbles: number;
  fumblesLost: number;

  // Special teams / kicking
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  puntYards: number;
  punts: number;
}

export interface TeamGameStats {
  totalYards: number;
  passingYards: number;
  rushingYards: number;
  firstDowns: number;
  thirdDownConversions: number;
  thirdDownAttempts: number;
  fourthDownConversions: number;
  fourthDownAttempts: number;
  turnovers: number;
  penalties: number;
  penaltyYards: number;
  /** Total time of possession in seconds. */
  timeOfPossession: number;
  /** Sacks recorded by the defense. */
  sacks: number;
  /** Sacks allowed by the offensive line. */
  sacksAllowed: number;
  /** Number of drives that entered the red zone (opponent's 20-yard line). */
  redZoneAttempts: number;
  /** Touchdowns scored from red zone possessions. */
  redZoneTDs: number;
}

export interface BoxScore {
  homeStats: TeamGameStats;
  awayStats: TeamGameStats;
  homePlayerStats: PlayerGameStats[];
  awayPlayerStats: PlayerGameStats[];
  homeDrives: Drive[];
  awayDrives: Drive[];
  /** All scoring plays in chronological order for the scoring summary. */
  scoringPlays: GameEvent[];
}

// ============================================================
// GAME CLASSIFICATION
// ============================================================

/** What stage of the season this game belongs to. */
export type GameType =
  | 'regular'
  | 'wild_card'
  | 'divisional'
  | 'conference_championship'
  | 'super_bowl';

/** Lifecycle status of a game. */
export type GameStatus =
  | 'scheduled'
  | 'simulating'
  | 'broadcasting'
  | 'completed';

// ============================================================
// SIMULATED GAME (COMPLETE OUTPUT)
// ============================================================

export interface SimulatedGame {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  gameType: GameType;
  /** Complete ordered list of every play event in the game. */
  events: GameEvent[];
  finalScore: { home: number; away: number };
  /**
   * SHA-256 hash of the server seed, published before game start
   * so users can verify fairness after the seed is revealed.
   */
  serverSeedHash: string;
  /** The actual server seed, revealed after the game completes. */
  serverSeed: string;
  /** Client-provided seed component for provably fair RNG. */
  clientSeed: string;
  /** Incrementing nonce used alongside seeds for each random draw. */
  nonce: number;
  /** Total number of plays in the game. */
  totalPlays: number;
  /** Most Valuable Player of the game based on statistical performance. */
  mvp: PlayerGameStats;
  boxScore: BoxScore;
  drives: Drive[];
}

// ============================================================
// SEASON & SCHEDULING
// ============================================================

/** Current phase of the season. */
export type SeasonStatus =
  | 'regular_season'
  | 'wild_card'
  | 'divisional'
  | 'conference_championship'
  | 'super_bowl'
  | 'offseason';

export interface ScheduledGame {
  id: string;
  /** Week number in the season schedule. */
  week: number;
  gameType: GameType;
  homeTeamId: string;
  awayTeamId: string;
  /** Populated when hydrated with full team data. */
  homeTeam?: Team;
  /** Populated when hydrated with full team data. */
  awayTeam?: Team;
  /** Null until the game has been completed. */
  homeScore: number | null;
  /** Null until the game has been completed. */
  awayScore: number | null;
  status: GameStatus;
  /** Whether this game is the featured broadcast game for the week. */
  isFeatured: boolean;
  /** Estimated time when this game will start broadcasting. */
  scheduledAt: Date | null;
  /** When the SSE broadcast began streaming events. */
  broadcastStartedAt: Date | null;
  /** When the game simulation and broadcast finished. */
  completedAt: Date | null;
}

export interface WeekSchedule {
  week: number;
  games: ScheduledGame[];
  /** ID of the game selected for the featured live broadcast. */
  featuredGameId: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
}

export interface TeamStanding {
  teamId: string;
  /** Populated when hydrated with full team data. */
  team?: Team;
  wins: number;
  losses: number;
  ties: number;
  divisionWins: number;
  divisionLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  /** Total points scored across all games. */
  pointsFor: number;
  /** Total points allowed across all games. */
  pointsAgainst: number;
  /** Current win/loss streak, e.g. "W3" or "L1". */
  streak: string;
  /** Playoff clinch status, null if not yet determined. */
  clinched: 'division' | 'wild_card' | 'bye' | 'eliminated' | null;
  /** Playoff seeding position, null if not in playoff contention. */
  playoffSeed: number | null;
}

export interface DivisionStandings {
  conference: Conference;
  division: Division;
  teams: TeamStanding[];
}

export interface PlayoffMatchup {
  /** Null until the game for this matchup has been created. */
  gameId: string | null;
  homeSeed: number;
  awaySeed: number;
  /** Null until the participating team is determined (e.g. awaiting prior round result). */
  homeTeam: Team | null;
  /** Null until the participating team is determined. */
  awayTeam: Team | null;
  /** Null until the game has been completed. */
  homeScore: number | null;
  /** Null until the game has been completed. */
  awayScore: number | null;
  /** Null until a winner has been determined. */
  winner: Team | null;
  status: GameStatus;
}

export interface PlayoffRound {
  /** Display name, e.g. "Wild Card Round", "Divisional Round". */
  name: string;
  matchups: PlayoffMatchup[];
}

export interface PlayoffBracket {
  /** AFC playoff rounds from Wild Card through Conference Championship. */
  afc: PlayoffRound[];
  /** NFC playoff rounds from Wild Card through Conference Championship. */
  nfc: PlayoffRound[];
  /** The Super Bowl matchup, null until both conference champions are decided. */
  superBowl: PlayoffMatchup | null;
}

export interface Season {
  id: string;
  /** Incrementing season number for the platform (Season 1, Season 2, etc.). */
  seasonNumber: number;
  /** The current week being played or upcoming. */
  currentWeek: number;
  status: SeasonStatus;
  schedule: WeekSchedule[];
  standings: DivisionStandings[];
  /** Null until the playoff round begins. */
  playoffBracket: PlayoffBracket | null;
  /** The team that won the Super Bowl, null until determined. */
  champion: Team | null;
  /** Season MVP, null until the season concludes. */
  mvp: PlayerGameStats | null;
  /** Master RNG seed for the entire season's simulation determinism. */
  seed: string;
  createdAt: Date;
  /** Null until the entire season (including Super Bowl) completes. */
  completedAt: Date | null;
}

// ============================================================
// PREDICTION & USER TYPES
// ============================================================

export type PredictionResult = 'pending' | 'won' | 'lost';

export interface Prediction {
  id: string;
  userId: string;
  gameId: string;
  /** Team ID of the user's predicted winner. */
  predictedWinner: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  /** Points awarded for this prediction (based on accuracy). */
  pointsEarned: number;
  result: PredictionResult;
  createdAt: Date;
}

export interface UserScore {
  userId: string;
  displayName?: string | null;
  totalPoints: number;
  correctPredictions: number;
  totalPredictions: number;
  /** Current consecutive correct predictions. */
  currentStreak: number;
  /** All-time best consecutive correct predictions. */
  bestStreak: number;
  /** Leaderboard ranking. */
  rank: number;
}

// ============================================================
// SSE STREAM TYPES
// ============================================================

/**
 * Server-Sent Events message types for the live game broadcast stream.
 * Uses a discriminated union on the `type` field so clients can
 * narrow the payload with a simple switch statement.
 */

export interface StreamCatchupMessage {
  type: 'catchup';
  /** All events that have already occurred, for clients joining mid-game. */
  events: GameEvent[];
  /** Current game state snapshot. */
  gameState: GameState;
}

export interface StreamPlayMessage {
  type: 'play';
  /** The newly resolved play event. */
  event: GameEvent;
}

export interface StreamGameOverMessage {
  type: 'game_over';
  boxScore: BoxScore;
  finalScore: { home: number; away: number };
  mvp: PlayerGameStats;
}

export interface StreamIntermissionMessage {
  type: 'intermission';
  /** Display message during the break, e.g. "Up next: Bears vs Packers". */
  message: string;
  /** ID of the next game to broadcast, null if no more games this week. */
  nextGameId: string | null;
  /** Countdown in seconds until the next broadcast begins. */
  countdown: number;
}

export interface StreamWeekRecapMessage {
  type: 'week_recap';
  week: number;
  /** Final results of all games played this week. */
  results: ScheduledGame[];
  /** Human-readable standings changes, e.g. "Chiefs clinch AFC West". */
  standingsUpdates: string[];
}

export interface StreamReconnectMessage {
  type: 'reconnect';
}

export interface StreamErrorMessage {
  type: 'error';
  message: string;
}

/** Discriminated union of all SSE stream message types. */
export type StreamMessage =
  | StreamCatchupMessage
  | StreamPlayMessage
  | StreamGameOverMessage
  | StreamIntermissionMessage
  | StreamReconnectMessage
  | StreamWeekRecapMessage
  | StreamErrorMessage;

// ============================================================
// RNG TYPES
// ============================================================

export interface WeightedOption<T> {
  value: T;
  /** Relative weight. Higher values increase selection probability. */
  weight: number;
}

/**
 * Deterministic seeded random number generator interface.
 * All simulation randomness flows through this interface
 * to ensure provably fair, reproducible game outcomes.
 */
export interface SeededRNG {
  /** Returns a pseudo-random float in [0, 1). */
  random(): number;
  /** Returns a pseudo-random integer in [min, max] (inclusive on both ends). */
  randomInt(min: number, max: number): number;
  /** Returns a pseudo-random float in [min, max). */
  randomFloat(min: number, max: number): number;
  /** Selects a value from weighted options using relative probability. */
  weightedChoice<T>(options: WeightedOption<T>[]): T;
  /** Returns true with the given probability p in [0, 1]. */
  probability(p: number): boolean;
  /** Returns a new array with elements in a pseudo-random order (Fisher-Yates). */
  shuffle<T>(array: T[]): T[];
  /** Returns a value from a Gaussian (normal) distribution using Box-Muller transform. */
  gaussian(mean: number, stdDev: number, min?: number, max?: number): number;
  /** Returns the current seed string. */
  getSeed(): string;
  /** Returns the current nonce (number of random draws made). */
  getNonce(): number;
}

// ============================================================
// CONSTANTS-RELATED TYPES
// ============================================================

/** Penalty definition used in the PENALTIES constant array. */
export interface PenaltyDefinition {
  /** Unique identifier for the penalty type. */
  readonly type: string;
  /** Human-readable display name (e.g., "Offensive Holding"). */
  readonly name: string;
  /** Yardage assessed; 0 for spot fouls where distance varies. */
  readonly yards: number;
  /** Whether the penalty automatically awards a first down. */
  readonly isAutoFirstDown: boolean;
  /** Whether the penalty occurs before the snap (dead ball foul). */
  readonly isPreSnap: boolean;
  /** Whether penalty is enforced at the spot of the foul (e.g., DPI). */
  readonly isSpotFoul: boolean;
  /** Whether the penalty results in a loss of down (e.g., intentional grounding). */
  readonly lossOfDown?: boolean;
  /** Relative frequency weight for penalty selection (higher = more common). */
  readonly frequencyWeight: number;
}

/** Mean and standard deviation for a normal distribution of yardage outcomes. */
export interface YardDistribution {
  readonly mean: number;
  readonly stdDev: number;
}

/** Play call probability distribution across the four play categories. */
export interface PlayDistribution {
  readonly run: number;
  readonly shortPass: number;
  readonly mediumPass: number;
  readonly deepPass: number;
}

/** Min/max range for game clock consumption per play type (in seconds). */
export interface ClockRange {
  readonly min: number;
  readonly max: number;
}
