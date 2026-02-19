// ============================================================================
// GridIron Live - Stats Tracker
// ============================================================================
// Tracks ALL live statistics per player and per team throughout the game.
// This is the statistical heart of the simulation -- every play flows
// through updateStats() to accumulate box score data.
// ============================================================================

import type {
  GameState,
  PlayResult,
  PlayerGameStats,
  TeamGameStats,
  BoxScore,
  Drive,
  DriveResult,
  GameEvent,
  Player,
} from './types';

// ============================================================================
// MUTABLE INTERNAL TYPES
// ============================================================================
// These mirror the immutable public types but are freely mutated during
// simulation. They are converted to their readonly counterparts by
// finalizeBoxScore() at the end of the game.
// ============================================================================

interface MutableTeamStats {
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
  timeOfPossession: number;
  sacks: number;
  sacksAllowed: number;
  redZoneAttempts: number;
  redZoneTDs: number;
}

interface MutablePlayerStats {
  player: Player;
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  completions: number;
  attempts: number;
  rushingYards: number;
  rushingTDs: number;
  carries: number;
  receivingYards: number;
  receivingTDs: number;
  receptions: number;
  targets: number;
  sacks: number;
  tackles: number;
  forcedFumbles: number;
  fumblesLost: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  puntYards: number;
  punts: number;
}

interface MutableDrive {
  number: number;
  team: 'home' | 'away';
  startPosition: number;
  startQuarter: number;
  startClock: number;
  plays: number;
  yards: number;
  result: DriveResult;
  timeElapsed: number;
}

// ============================================================================
// PUBLIC ACCUMULATOR TYPE
// ============================================================================

/** Mutable stats accumulator used during simulation */
export interface StatsAccumulator {
  homeTeam: MutableTeamStats;
  awayTeam: MutableTeamStats;
  homePlayers: Map<string, MutablePlayerStats>;
  awayPlayers: Map<string, MutablePlayerStats>;
  drives: Drive[];
  currentDrive: MutableDrive | null;
  scoringPlays: GameEvent[];
  /** Tracks whether a red zone attempt has already been counted for the current drive */
  _redZoneTracked: boolean;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/** Create empty team stats with all counters at zero */
function createEmptyTeamStats(): MutableTeamStats {
  return {
    totalYards: 0,
    passingYards: 0,
    rushingYards: 0,
    firstDowns: 0,
    thirdDownConversions: 0,
    thirdDownAttempts: 0,
    fourthDownConversions: 0,
    fourthDownAttempts: 0,
    turnovers: 0,
    penalties: 0,
    penaltyYards: 0,
    timeOfPossession: 0,
    sacks: 0,
    sacksAllowed: 0,
    redZoneAttempts: 0,
    redZoneTDs: 0,
  };
}

/** Create empty player stats for a given player */
function createEmptyPlayerStats(player: Player): MutablePlayerStats {
  return {
    player,
    passingYards: 0,
    passingTDs: 0,
    interceptions: 0,
    completions: 0,
    attempts: 0,
    rushingYards: 0,
    rushingTDs: 0,
    carries: 0,
    receivingYards: 0,
    receivingTDs: 0,
    receptions: 0,
    targets: 0,
    sacks: 0,
    tackles: 0,
    forcedFumbles: 0,
    fumblesLost: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    puntYards: 0,
    punts: 0,
  };
}

/**
 * Get or create player stats entry.
 * Lazily initialises a MutablePlayerStats record the first time
 * a player is referenced.
 */
function getPlayerStats(
  acc: StatsAccumulator,
  player: Player,
  team: 'home' | 'away',
): MutablePlayerStats {
  const map = team === 'home' ? acc.homePlayers : acc.awayPlayers;
  let stats = map.get(player.id);
  if (!stats) {
    stats = createEmptyPlayerStats(player);
    map.set(player.id, stats);
  }
  return stats;
}

/** Create a fresh stats accumulator for a new game */
export function createStatsAccumulator(
  homePlayers: Player[],
  awayPlayers: Player[],
): StatsAccumulator {
  const acc: StatsAccumulator = {
    homeTeam: createEmptyTeamStats(),
    awayTeam: createEmptyTeamStats(),
    homePlayers: new Map<string, MutablePlayerStats>(),
    awayPlayers: new Map<string, MutablePlayerStats>(),
    drives: [],
    currentDrive: null,
    scoringPlays: [],
    _redZoneTracked: false,
  };

  // Pre-populate player stats maps so every rostered player has an entry
  for (const player of homePlayers) {
    acc.homePlayers.set(player.id, createEmptyPlayerStats(player));
  }
  for (const player of awayPlayers) {
    acc.awayPlayers.set(player.id, createEmptyPlayerStats(player));
  }

  return acc;
}

// ============================================================================
// DRIVE MANAGEMENT
// ============================================================================

/** Start a new drive */
export function startDrive(acc: StatsAccumulator, state: GameState): void {
  const driveNumber = acc.drives.length + 1;
  acc.currentDrive = {
    number: driveNumber,
    team: state.possession,
    startPosition: state.ballPosition,
    startQuarter: typeof state.quarter === 'number' ? state.quarter : 5, // OT = 5
    startClock: state.clock,
    plays: 0,
    yards: 0,
    result: 'in_progress',
    timeElapsed: 0,
  };
  acc._redZoneTracked = false;
}

/** End the current drive with a result */
export function endDrive(
  acc: StatsAccumulator,
  result: DriveResult,
  state: GameState,
): void {
  if (!acc.currentDrive) return;

  acc.currentDrive.result = result;

  // Freeze the drive into the completed drives list
  const completedDrive: Drive = {
    number: acc.currentDrive.number,
    team: acc.currentDrive.team,
    startPosition: acc.currentDrive.startPosition,
    startQuarter: acc.currentDrive.startQuarter,
    startClock: acc.currentDrive.startClock,
    plays: acc.currentDrive.plays,
    yards: acc.currentDrive.yards,
    result: acc.currentDrive.result,
    timeElapsed: acc.currentDrive.timeElapsed,
  };

  acc.drives.push(completedDrive);
  acc.currentDrive = null;
}

// ============================================================================
// CORE STAT UPDATE
// ============================================================================

/**
 * Update stats after a play.
 *
 * This is the main entry point called after every play resolution.
 * It dispatches to type-specific handlers and updates universal
 * counters (first downs, third/fourth down tracking, penalties,
 * turnovers, time of possession, red zone, and drive tracking).
 */
export function updateStats(
  acc: StatsAccumulator,
  play: PlayResult,
  prevState: GameState,
  newState: GameState,
  event?: GameEvent,
): void {
  const offenseTeam = prevState.possession;
  const defenseTeam: 'home' | 'away' = offenseTeam === 'home' ? 'away' : 'home';
  const offenseStats = offenseTeam === 'home' ? acc.homeTeam : acc.awayTeam;
  const defenseStats = defenseTeam === 'home' ? acc.homeTeam : acc.awayTeam;

  // ----- Type-specific stat updates -----
  switch (play.type) {
    case 'run':
    case 'scramble': {
      if (play.rusher) {
        const rusherStats = getPlayerStats(acc, play.rusher, offenseTeam);
        rusherStats.carries += 1;
        rusherStats.rushingYards += play.yardsGained;
        if (play.isTouchdown) {
          rusherStats.rushingTDs += 1;
        }
      }
      offenseStats.rushingYards += play.yardsGained;
      offenseStats.totalYards += play.yardsGained;
      break;
    }

    case 'pass_complete': {
      if (play.passer) {
        const passerStats = getPlayerStats(acc, play.passer, offenseTeam);
        passerStats.attempts += 1;
        passerStats.completions += 1;
        passerStats.passingYards += play.yardsGained;
        if (play.isTouchdown) {
          passerStats.passingTDs += 1;
        }
      }
      if (play.receiver) {
        const receiverStats = getPlayerStats(acc, play.receiver, offenseTeam);
        receiverStats.targets += 1;
        receiverStats.receptions += 1;
        receiverStats.receivingYards += play.yardsGained;
        if (play.isTouchdown) {
          receiverStats.receivingTDs += 1;
        }
      }
      offenseStats.passingYards += play.yardsGained;
      offenseStats.totalYards += play.yardsGained;
      break;
    }

    case 'pass_incomplete': {
      if (play.passer) {
        const passerStats = getPlayerStats(acc, play.passer, offenseTeam);
        passerStats.attempts += 1;
      }
      if (play.receiver) {
        const receiverStats = getPlayerStats(acc, play.receiver, offenseTeam);
        receiverStats.targets += 1;
      }
      break;
    }

    case 'sack': {
      // Defensive player records a sack
      if (play.defender) {
        const defenderStats = getPlayerStats(acc, play.defender, defenseTeam);
        defenderStats.sacks += 1;
      }
      defenseStats.sacks += 1;
      offenseStats.sacksAllowed += 1;
      // Sack yardage counts against passing yards and total yards
      offenseStats.passingYards += play.yardsGained; // yardsGained is negative for sacks
      offenseStats.totalYards += play.yardsGained;
      break;
    }

    case 'field_goal': {
      if (play.rusher) {
        // Kicker is sometimes set as rusher for FG attempts
        const kickerStats = getPlayerStats(acc, play.rusher, offenseTeam);
        kickerStats.fieldGoalsAttempted += 1;
        if (play.scoring) {
          kickerStats.fieldGoalsMade += 1;
        }
      } else if (play.passer) {
        // Some implementations may use passer for the kicker
        const kickerStats = getPlayerStats(acc, play.passer, offenseTeam);
        kickerStats.fieldGoalsAttempted += 1;
        if (play.scoring) {
          kickerStats.fieldGoalsMade += 1;
        }
      }
      break;
    }

    case 'punt': {
      if (play.rusher) {
        // Punter is sometimes encoded as rusher
        const punterStats = getPlayerStats(acc, play.rusher, offenseTeam);
        punterStats.punts += 1;
        punterStats.puntYards += Math.abs(play.yardsGained);
      } else if (play.passer) {
        const punterStats = getPlayerStats(acc, play.passer, offenseTeam);
        punterStats.punts += 1;
        punterStats.puntYards += Math.abs(play.yardsGained);
      }
      break;
    }

    case 'extra_point': {
      // Extra point attempts don't accumulate standard stats beyond scoring
      break;
    }

    case 'two_point': {
      // Two-point conversions: track like a run or pass depending on the call
      if (play.call === 'two_point_run' && play.rusher) {
        const rusherStats = getPlayerStats(acc, play.rusher, offenseTeam);
        rusherStats.carries += 1;
      } else if (play.call === 'two_point_pass') {
        if (play.passer) {
          const passerStats = getPlayerStats(acc, play.passer, offenseTeam);
          passerStats.attempts += 1;
          if (play.scoring) {
            passerStats.completions += 1;
          }
        }
        if (play.receiver && play.scoring) {
          const receiverStats = getPlayerStats(acc, play.receiver, offenseTeam);
          receiverStats.targets += 1;
          receiverStats.receptions += 1;
        }
      }
      break;
    }

    // Kickoff, kneel, spike, touchback: no individual stat updates needed
    default:
      break;
  }

  // ----- Defensive tackle tracking -----
  // If a defender is named on a non-sack play, credit a tackle
  if (
    play.defender &&
    play.type !== 'sack' &&
    play.type !== 'pass_incomplete' &&
    play.type !== 'punt' &&
    play.type !== 'field_goal' &&
    play.type !== 'kickoff' &&
    play.type !== 'extra_point' &&
    play.type !== 'two_point' &&
    play.type !== 'kneel' &&
    play.type !== 'spike' &&
    play.type !== 'touchback'
  ) {
    const defenderStats = getPlayerStats(acc, play.defender, defenseTeam);
    defenderStats.tackles += 1;
  }

  // ----- First down tracking -----
  if (play.isFirstDown) {
    offenseStats.firstDowns += 1;
  }

  // ----- Third down tracking -----
  if (prevState.down === 3) {
    offenseStats.thirdDownAttempts += 1;
    if (play.isFirstDown || play.isTouchdown) {
      offenseStats.thirdDownConversions += 1;
    }
  }

  // ----- Fourth down tracking (going for it, not punts/FGs) -----
  if (
    prevState.down === 4 &&
    play.type !== 'punt' &&
    play.type !== 'field_goal'
  ) {
    offenseStats.fourthDownAttempts += 1;
    if (play.isFirstDown || play.isTouchdown) {
      offenseStats.fourthDownConversions += 1;
    }
  }

  // ----- Turnover tracking -----
  if (play.turnover) {
    offenseStats.turnovers += 1;

    // Track forced fumbles and fumbles lost
    if (play.turnover.type === 'fumble' || play.turnover.type === 'fumble_recovery') {
      // Credit the defender with a forced fumble if one is named
      if (play.defender) {
        const defenderStats = getPlayerStats(acc, play.defender, defenseTeam);
        defenderStats.forcedFumbles += 1;
      }
      // Credit the ball carrier with a fumble lost
      const fumbler = play.rusher ?? play.receiver;
      if (fumbler) {
        const fumblerStats = getPlayerStats(acc, fumbler, offenseTeam);
        fumblerStats.fumblesLost += 1;
      }
    }

    // Track interceptions on the passer
    if (play.turnover.type === 'interception' && play.passer) {
      const passerStats = getPlayerStats(acc, play.passer, offenseTeam);
      passerStats.interceptions += 1;
    }
  }

  // ----- Penalty tracking -----
  if (play.penalty && !play.penalty.declined && !play.penalty.offsetting) {
    const penaltyTeamStats =
      play.penalty.on === 'home' ? acc.homeTeam : acc.awayTeam;
    penaltyTeamStats.penalties += 1;
    penaltyTeamStats.penaltyYards += play.penalty.yards;
  }

  // ----- Time of possession -----
  // Credit clock elapsed to the team that had possession before the play
  offenseStats.timeOfPossession += play.clockElapsed;

  // ----- Red zone tracking -----
  // Track when the ball enters or is in the opponent's 20 (position >= 80).
  // Count at most one red zone attempt per drive.
  if (prevState.ballPosition >= 80 || newState.ballPosition >= 80) {
    if (!acc._redZoneTracked) {
      offenseStats.redZoneAttempts += 1;
      acc._redZoneTracked = true;
    }
    // Track red zone TDs
    if (play.isTouchdown && play.scoring && play.scoring.team === offenseTeam) {
      offenseStats.redZoneTDs += 1;
    }
  }

  // ----- Drive tracking -----
  if (acc.currentDrive) {
    acc.currentDrive.plays += 1;
    acc.currentDrive.yards += play.yardsGained;
    acc.currentDrive.timeElapsed += play.clockElapsed;
  }

  // ----- Scoring play bookkeeping -----
  if (event && play.scoring) {
    acc.scoringPlays.push(event);
  }
}

// ============================================================================
// BOX SCORE FINALIZATION
// ============================================================================

/** Convert a MutablePlayerStats record to an immutable PlayerGameStats */
function toPlayerGameStats(mps: MutablePlayerStats): PlayerGameStats {
  return {
    player: mps.player,
    passingYards: mps.passingYards,
    passingTDs: mps.passingTDs,
    interceptions: mps.interceptions,
    completions: mps.completions,
    attempts: mps.attempts,
    rushingYards: mps.rushingYards,
    rushingTDs: mps.rushingTDs,
    carries: mps.carries,
    receivingYards: mps.receivingYards,
    receivingTDs: mps.receivingTDs,
    receptions: mps.receptions,
    targets: mps.targets,
    sacks: mps.sacks,
    tackles: mps.tackles,
    forcedFumbles: mps.forcedFumbles,
    fumblesLost: mps.fumblesLost,
    fieldGoalsMade: mps.fieldGoalsMade,
    fieldGoalsAttempted: mps.fieldGoalsAttempted,
    puntYards: mps.puntYards,
    punts: mps.punts,
  };
}

/** Convert MutableTeamStats to an immutable TeamGameStats */
function toTeamGameStats(mts: MutableTeamStats): TeamGameStats {
  return {
    totalYards: mts.totalYards,
    passingYards: mts.passingYards,
    rushingYards: mts.rushingYards,
    firstDowns: mts.firstDowns,
    thirdDownConversions: mts.thirdDownConversions,
    thirdDownAttempts: mts.thirdDownAttempts,
    fourthDownConversions: mts.fourthDownConversions,
    fourthDownAttempts: mts.fourthDownAttempts,
    turnovers: mts.turnovers,
    penalties: mts.penalties,
    penaltyYards: mts.penaltyYards,
    timeOfPossession: mts.timeOfPossession,
    sacks: mts.sacks,
    sacksAllowed: mts.sacksAllowed,
    redZoneAttempts: mts.redZoneAttempts,
    redZoneTDs: mts.redZoneTDs,
  };
}

/**
 * Filter player stats to only include players who actually participated
 * (have at least one non-zero stat). Sort by most impactful first.
 */
function filterAndSortPlayerStats(
  playerMap: Map<string, MutablePlayerStats>,
): PlayerGameStats[] {
  const active: PlayerGameStats[] = [];

  for (const mps of playerMap.values()) {
    const hasStats =
      mps.attempts > 0 ||
      mps.carries > 0 ||
      mps.targets > 0 ||
      mps.sacks > 0 ||
      mps.tackles > 0 ||
      mps.forcedFumbles > 0 ||
      mps.fieldGoalsAttempted > 0 ||
      mps.punts > 0;

    if (hasStats) {
      active.push(toPlayerGameStats(mps));
    }
  }

  // Sort by total yardage contribution descending
  active.sort((a, b) => {
    const aTotal =
      a.passingYards + a.rushingYards + a.receivingYards + a.sacks * 7;
    const bTotal =
      b.passingYards + b.rushingYards + b.receivingYards + b.sacks * 7;
    return bTotal - aTotal;
  });

  return active;
}

/** Convert accumulator to final immutable BoxScore */
export function finalizeBoxScore(acc: StatsAccumulator): BoxScore {
  // Split drives by team
  const homeDrives = acc.drives.filter((d) => d.team === 'home');
  const awayDrives = acc.drives.filter((d) => d.team === 'away');

  return {
    homeStats: toTeamGameStats(acc.homeTeam),
    awayStats: toTeamGameStats(acc.awayTeam),
    homePlayerStats: filterAndSortPlayerStats(acc.homePlayers),
    awayPlayerStats: filterAndSortPlayerStats(acc.awayPlayers),
    homeDrives,
    awayDrives,
    scoringPlays: [...acc.scoringPlays],
  };
}

// ============================================================================
// MVP DETERMINATION
// ============================================================================

/**
 * Calculate a "game score" for a player based on their position and stats.
 *
 * Scoring formulae:
 *   QB:    (passingTDs * 4) + (passingYards / 25) - (interceptions * 3)
 *            + (rushingYards / 10) + (rushingTDs * 6)
 *   RB:    (rushingTDs * 6) + (rushingYards / 10) + (receivingYards / 10)
 *            + (receivingTDs * 6)
 *   WR/TE: (receivingTDs * 6) + (receivingYards / 10) + (receptions * 0.5)
 *   DEF:   (sacks * 3) + (tackles * 0.5) + (forcedFumbles * 3) + (interceptions * 5)
 *   K:     (fieldGoalsMade * 3)
 */
function calculateGameScore(stats: MutablePlayerStats): number {
  const pos = stats.player.position;

  switch (pos) {
    case 'QB':
      return (
        stats.passingTDs * 4 +
        stats.passingYards / 25 -
        stats.interceptions * 3 +
        stats.rushingYards / 10 +
        stats.rushingTDs * 6
      );

    case 'RB':
      return (
        stats.rushingTDs * 6 +
        stats.rushingYards / 10 +
        stats.receivingYards / 10 +
        stats.receivingTDs * 6
      );

    case 'WR':
    case 'TE':
      return (
        stats.receivingTDs * 6 +
        stats.receivingYards / 10 +
        stats.receptions * 0.5
      );

    case 'DL':
    case 'LB':
    case 'CB':
    case 'S':
      return (
        stats.sacks * 3 +
        stats.tackles * 0.5 +
        stats.forcedFumbles * 3 +
        stats.interceptions * 5
      );

    case 'K':
      return stats.fieldGoalsMade * 3;

    // Punters, OL, and other positions rarely win MVP
    default:
      return 0;
  }
}

/**
 * Determine the game MVP based on stats.
 *
 * Evaluates every player from both teams using the game score formula.
 * When two players have equal scores, preference is given to players
 * from the winning team (determined by comparing the accumulated
 * scoring play totals).
 */
export function determineMVP(acc: StatsAccumulator): PlayerGameStats {
  let bestScore = -Infinity;
  let bestStats: MutablePlayerStats | null = null;
  let bestTeam: 'home' | 'away' = 'home';

  // Determine which team is winning based on scoring plays
  let homePoints = 0;
  let awayPoints = 0;
  for (const event of acc.scoringPlays) {
    if (event.playResult.scoring) {
      if (event.playResult.scoring.team === 'home') {
        homePoints += event.playResult.scoring.points;
      } else {
        awayPoints += event.playResult.scoring.points;
      }
    }
  }
  const winningTeam: 'home' | 'away' = homePoints >= awayPoints ? 'home' : 'away';

  // Evaluate home players
  for (const stats of acc.homePlayers.values()) {
    const score = calculateGameScore(stats);
    const isWinningTeam = winningTeam === 'home';
    // Prefer winning team: add a small tiebreaker bonus
    const adjustedScore = isWinningTeam ? score + 0.001 : score;

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestStats = stats;
      bestTeam = 'home';
    }
  }

  // Evaluate away players
  for (const stats of acc.awayPlayers.values()) {
    const score = calculateGameScore(stats);
    const isWinningTeam = winningTeam === 'away';
    const adjustedScore = isWinningTeam ? score + 0.001 : score;

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestStats = stats;
      bestTeam = 'away';
    }
  }

  // Fallback: if somehow no player has any stats, return the first home player
  if (!bestStats) {
    const firstEntry = acc.homePlayers.values().next();
    if (!firstEntry.done) {
      bestStats = firstEntry.value ?? null;
    } else {
      // Absolute last resort: should never happen in a real game
      const awayEntry = acc.awayPlayers.values().next();
      bestStats = awayEntry.value ?? null;
    }
  }

  return toPlayerGameStats(bestStats!);
}
