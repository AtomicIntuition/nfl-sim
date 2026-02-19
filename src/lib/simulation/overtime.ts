// ============================================================================
// GridIron Live - Overtime Engine
// ============================================================================
// Implements the current NFL overtime rules (2024+):
//
// 1. Coin toss determines who receives/defers.
// 2. BOTH teams are guaranteed at least one possession, regardless
//    of what the first team does (new rule since 2024 -- a TD on the
//    first possession no longer ends the game immediately).
// 3. After both teams have possessed the ball at least once:
//    - If scores are still tied, the game enters sudden death.
//    - The next score of any kind wins.
// 4. The OT period is 10 minutes (600 seconds).
// 5. Regular season: if tied after the OT period, the game ends as a tie.
// 6. Playoffs: additional OT periods are played until a winner emerges.
// 7. Each team receives 2 timeouts per OT period.
// 8. There is no two-minute warning in overtime.
// ============================================================================

import { GameState, GameType, SeededRNG } from './types';

// ============================================================================
// OVERTIME STATE TYPE
// ============================================================================

export interface OvertimeState {
  /** Which team won the opening coin toss. */
  coinTossWinner: 'home' | 'away';
  /** What the coin toss winner elected to do. */
  coinTossChoice: 'receive' | 'defer';
  /** Whether the home team has completed at least one possession. */
  homePossessed: boolean;
  /** Whether the away team has completed at least one possession. */
  awayPossessed: boolean;
  /**
   * How the first possession of OT ended.
   * null means the first possession hasn't ended yet.
   * 'in_progress' means the first possession is currently underway.
   */
  firstPossessionResult:
    | 'touchdown'
    | 'field_goal'
    | 'turnover'
    | 'punt'
    | 'safety'
    | 'in_progress'
    | null;
  /** Whether overtime is complete (a winner has been determined or time expired). */
  isComplete: boolean;
  /** Whether the game has entered sudden death mode (both teams have possessed). */
  isSuddenDeath: boolean;
}

// ============================================================================
// OT CONSTANTS
// ============================================================================

/** Overtime period length: 10 minutes = 600 seconds. */
const OT_PERIOD_LENGTH = 600;

/** Each team gets 2 timeouts in overtime. */
const OT_TIMEOUTS = 2;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize overtime state after a coin toss.
 *
 * The coin toss winner is provided. The RNG determines whether
 * the winner chooses to receive (most common, ~90%) or defer.
 * In real NFL overtime, nearly every team elects to receive.
 *
 * @param coinTossWinner - Which team won the coin toss.
 * @param rng - Seeded RNG for the coin toss choice.
 * @returns A fresh OvertimeState ready for the OT period.
 */
export function initializeOvertime(
  coinTossWinner: 'home' | 'away',
  rng: SeededRNG
): OvertimeState {
  // ~90% of coin toss winners elect to receive
  const coinTossChoice: 'receive' | 'defer' = rng.probability(0.9)
    ? 'receive'
    : 'defer';

  return {
    coinTossWinner,
    coinTossChoice,
    homePossessed: false,
    awayPossessed: false,
    firstPossessionResult: null,
    isComplete: false,
    isSuddenDeath: false,
  };
}

// ============================================================================
// OVERTIME END CHECK
// ============================================================================

/**
 * Check if overtime is complete after a score or possession change.
 *
 * This function evaluates the current OT state and game scores to
 * determine if the game has ended. The logic follows the 2024+ NFL
 * overtime rules:
 *
 * Phase 1 - Guaranteed Possessions:
 *   Both teams must have at least one possession before the game
 *   can end (unless time expires). Even if the first team scores
 *   a touchdown, the second team gets to answer.
 *
 * Phase 2 - Sudden Death:
 *   Once both teams have possessed the ball, any score wins. If
 *   the second team ties it up, subsequent scores are sudden death.
 *
 * Time Expiration:
 *   - Regular season: game ends as a tie.
 *   - Playoffs: a new OT period begins (no ties in playoffs).
 *
 * @returns isOver (boolean), winner ('home'|'away'|'tie'|null).
 *          winner is null when the game is not over yet.
 */
export function checkOvertimeEnd(
  otState: OvertimeState,
  gameState: GameState,
  gameType: GameType
): { isOver: boolean; winner: 'home' | 'away' | 'tie' | null } {
  const { homeScore, awayScore, clock } = gameState;
  const bothPossessed = otState.homePossessed && otState.awayPossessed;

  // ---- Time expired ----
  if (clock <= 0) {
    if (homeScore !== awayScore) {
      // Someone is ahead -- they win
      return {
        isOver: true,
        winner: homeScore > awayScore ? 'home' : 'away',
      };
    }

    // Scores still tied at the end of the period
    if (gameType === 'regular') {
      // Regular season: game ends in a tie
      return { isOver: true, winner: 'tie' };
    }

    // Playoffs: OT period ends but the game continues (new period needed)
    // Return not-over so the game engine can reset for another OT period
    return { isOver: false, winner: null };
  }

  // ---- Sudden death phase (both teams have had at least one possession) ----
  if (otState.isSuddenDeath) {
    // In sudden death, any score difference ends the game immediately
    if (homeScore !== awayScore) {
      return {
        isOver: true,
        winner: homeScore > awayScore ? 'home' : 'away',
      };
    }
    // Scores are still tied in sudden death -- game continues
    return { isOver: false, winner: null };
  }

  // ---- Guaranteed possession phase ----
  // Both teams haven't possessed yet -- game cannot end on a score
  if (!bothPossessed) {
    return { isOver: false, winner: null };
  }

  // Both teams have now possessed at least once.
  // If the scores are different, the team with more points wins.
  if (homeScore !== awayScore) {
    return {
      isOver: true,
      winner: homeScore > awayScore ? 'home' : 'away',
    };
  }

  // Scores are tied after both teams possessed -- enter sudden death
  // (handled by the caller transitioning isSuddenDeath = true)
  return { isOver: false, winner: null };
}

// ============================================================================
// POSSESSION STATE UPDATE
// ============================================================================

/**
 * Update the OT state after a possession ends.
 *
 * Called when a team's possession concludes (via score, turnover,
 * punt, or time expiration). Marks which team has possessed and
 * tracks the first possession result for narrative purposes.
 *
 * Transitions the game into sudden death mode when both teams
 * have completed at least one possession and the score is tied.
 *
 * @param otState - Current overtime state.
 * @param possessionTeam - Which team just finished a possession.
 * @param result - How the possession ended.
 * @returns Updated OvertimeState (new object, does not mutate input).
 */
export function updateOvertimeState(
  otState: OvertimeState,
  possessionTeam: 'home' | 'away',
  result: 'touchdown' | 'field_goal' | 'turnover' | 'punt' | 'safety'
): OvertimeState {
  const updated: OvertimeState = { ...otState };

  // Mark that this team has had a possession
  if (possessionTeam === 'home') {
    updated.homePossessed = true;
  } else {
    updated.awayPossessed = true;
  }

  // Track the first possession result (only set once)
  if (updated.firstPossessionResult === null || updated.firstPossessionResult === 'in_progress') {
    updated.firstPossessionResult = result;
  }

  // Check if both teams have now possessed the ball
  if (updated.homePossessed && updated.awayPossessed && !updated.isSuddenDeath) {
    // Both teams have had their guaranteed possession.
    // The game transitions to sudden death for any subsequent possessions.
    updated.isSuddenDeath = true;
  }

  return updated;
}

// ============================================================================
// OT GAME STATE CREATION
// ============================================================================

/**
 * Build the initial game state for an overtime period.
 *
 * Resets the clock to 10 minutes, awards 2 timeouts per team,
 * disables the two-minute warning, and sets up the kickoff.
 * Possession is determined by the coin toss result.
 *
 * @param state - The current game state (end of regulation or previous OT).
 * @param otState - The initialized overtime state with coin toss results.
 * @returns A new GameState configured for the start of overtime.
 */
export function createOvertimeGameState(
  state: GameState,
  otState: OvertimeState
): GameState {
  // Determine which team receives the OT kickoff
  const receivingTeam = determineReceivingTeam(otState);
  // The kicking team has possession during the kickoff
  const kickingTeam: 'home' | 'away' =
    receivingTeam === 'home' ? 'away' : 'home';

  return {
    ...state,
    quarter: 'OT',
    clock: OT_PERIOD_LENGTH,
    playClock: 40,
    possession: kickingTeam, // kicking team "has the ball" for the kickoff
    down: 1,
    yardsToGo: 10,
    ballPosition: 35, // kickoff from the 35
    homeTimeouts: OT_TIMEOUTS,
    awayTimeouts: OT_TIMEOUTS,
    isClockRunning: false,
    twoMinuteWarning: true, // Set to true to prevent it from triggering (no 2MW in OT)
    isHalftime: false,
    kickoff: true,
    patAttempt: false,
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Determine which team receives the overtime kickoff based on
 * the coin toss winner's election.
 */
function determineReceivingTeam(otState: OvertimeState): 'home' | 'away' {
  if (otState.coinTossChoice === 'receive') {
    return otState.coinTossWinner;
  }
  // Winner deferred -- the other team receives
  return otState.coinTossWinner === 'home' ? 'away' : 'home';
}

// ============================================================================
// DESCRIPTION BUILDERS
// ============================================================================

/**
 * Build a description for the overtime coin toss result.
 *
 * @param otState - The overtime state after initialization.
 * @param homeTeamName - Display name of the home team.
 * @param awayTeamName - Display name of the away team.
 * @returns A broadcast-style coin toss announcement.
 */
export function buildCoinTossDescription(
  otState: OvertimeState,
  homeTeamName: string,
  awayTeamName: string
): string {
  const winnerName =
    otState.coinTossWinner === 'home' ? homeTeamName : awayTeamName;
  const receivingTeam = determineReceivingTeam(otState);
  const receiverName =
    receivingTeam === 'home' ? homeTeamName : awayTeamName;

  if (otState.coinTossChoice === 'receive') {
    return (
      `We're heading to OVERTIME! The ${winnerName} win the coin toss ` +
      `and elect to RECEIVE. The ${receiverName} will get the ball first. ` +
      `Remember, under the new rules, both teams are guaranteed a possession.`
    );
  }
  return (
    `We're heading to OVERTIME! The ${winnerName} win the coin toss ` +
    `and surprisingly DEFER! The ${receiverName} will receive the opening kickoff. ` +
    `Bold strategy -- both teams get at least one shot under the new OT rules.`
  );
}

/**
 * Build a description for an overtime period ending without a winner
 * (playoffs only -- triggers additional OT periods).
 *
 * @returns A broadcast-style description for a continuing OT.
 */
export function buildAdditionalOTPeriodDescription(): string {
  return (
    'The overtime period has expired with the score STILL TIED! ' +
    'In the playoffs, we keep going. Another overtime period is coming up. ' +
    'Both teams reset with 2 timeouts. This one is going the distance!'
  );
}

/**
 * Build a description for a regular season tie.
 *
 * @param homeTeamName - Display name of the home team.
 * @param awayTeamName - Display name of the away team.
 * @param score - The tied score.
 * @returns A broadcast-style tie announcement.
 */
export function buildTieGameDescription(
  homeTeamName: string,
  awayTeamName: string,
  score: number
): string {
  return (
    `That's it! Time has expired in overtime and this game ends in a ` +
    `${score}-${score} TIE between the ${homeTeamName} and the ${awayTeamName}! ` +
    `Nobody goes home happy today. Ties are rare in the NFL, and you just witnessed one.`
  );
}

/**
 * Build a description for an overtime victory.
 *
 * @param winnerName - Display name of the winning team.
 * @param scoringPlay - How the winning points were scored.
 * @param isSuddenDeath - Whether the win came in sudden death.
 * @returns A broadcast-style victory announcement.
 */
export function buildOTWinDescription(
  winnerName: string,
  scoringPlay: 'touchdown' | 'field_goal' | 'safety',
  isSuddenDeath: boolean
): string {
  if (scoringPlay === 'touchdown') {
    if (isSuddenDeath) {
      return (
        `TOUCHDOWN! GAME OVER! The ${winnerName} score in SUDDEN DEATH ` +
        `overtime! What an incredible finish! The players mob each other ` +
        `at midfield!`
      );
    }
    return (
      `TOUCHDOWN! The ${winnerName} WIN IT IN OVERTIME! The defense ` +
      `couldn't answer and the ${winnerName} take this one! What a game!`
    );
  }

  if (scoringPlay === 'field_goal') {
    if (isSuddenDeath) {
      return (
        `IT'S GOOD! FIELD GOAL! The ${winnerName} win it in SUDDEN DEATH! ` +
        `The kick splits the uprights and this game is OVER! ` +
        `What a way to end it!`
      );
    }
    return (
      `The field goal is GOOD! The ${winnerName} take the lead and the ` +
      `other team couldn't answer! The ${winnerName} WIN in overtime!`
    );
  }

  // Safety
  return (
    `SAFETY! In overtime! The ${winnerName} get two points on a safety ` +
    `and that's enough to win it! You don't see that every day!`
  );
}
