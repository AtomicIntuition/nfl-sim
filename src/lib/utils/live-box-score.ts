import type {
  GameEvent,
  BoxScore,
  TeamGameStats,
  PlayerGameStats,
  Player,
} from '@/lib/simulation/types';

/**
 * Build a running box score from accumulated game events.
 * Used client-side during live broadcast to show stats progressively.
 */
export function buildLiveBoxScore(events: GameEvent[]): BoxScore | null {
  if (events.length === 0) return null;

  const homeTeamId = events[0].gameState.homeTeam.id;

  const homeStats = emptyTeamStats();
  const awayStats = emptyTeamStats();
  const playerMap = new Map<string, PlayerGameStats>();

  for (let i = 0; i < events.length; i++) {
    const { playResult, gameState } = events[i];
    const { type } = playResult;

    // Skip non-scrimmage plays
    if (type === 'kickoff' || type === 'touchback') continue;

    // Determine who was on offense during this play.
    // Use previous event's post-play state to get possession going into this play.
    // For the first scrimmage play, use the current gameState.possession
    // (only wrong if there's a turnover on the literal first play — very rare).
    let offense: 'home' | 'away';
    let prevDown: 1 | 2 | 3 | 4 = 1;
    let prevBallPos = 25;

    if (i > 0) {
      const prev = events[i - 1].gameState;
      offense = prev.possession;
      prevDown = prev.down;
      prevBallPos = prev.ballPosition;
    } else {
      // First play — if turnover flipped possession, this will be slightly off
      offense = playResult.turnover
        ? (gameState.possession === 'home' ? 'away' : 'home')
        : gameState.possession;
    }

    const offStats = offense === 'home' ? homeStats : awayStats;
    const defStats = offense === 'home' ? awayStats : homeStats;

    // ── Yardage ──
    if (type !== 'punt' && type !== 'field_goal' && type !== 'extra_point' && type !== 'two_point') {
      offStats.totalYards += playResult.yardsGained;

      if (type === 'pass_complete' || type === 'pass_incomplete') {
        if (type === 'pass_complete') {
          offStats.passingYards += playResult.yardsGained;
        }
      } else if (type === 'sack') {
        // NFL counts sack yardage as passing yards lost
        offStats.passingYards += playResult.yardsGained;
        defStats.sacks++;
        offStats.sacksAllowed++;
      } else {
        // run, scramble, kneel, spike
        offStats.rushingYards += playResult.yardsGained;
      }
    }

    // ── First downs ──
    if (playResult.isFirstDown) offStats.firstDowns++;

    // ── Down conversion tracking ──
    if (prevDown === 3 && type !== 'punt' && type !== 'field_goal') {
      offStats.thirdDownAttempts++;
      if (playResult.isFirstDown || playResult.isTouchdown) {
        offStats.thirdDownConversions++;
      }
    }
    if (prevDown === 4 && type !== 'punt' && type !== 'field_goal') {
      offStats.fourthDownAttempts++;
      if (playResult.isFirstDown || playResult.isTouchdown) {
        offStats.fourthDownConversions++;
      }
    }

    // ── Turnovers ──
    if (playResult.turnover) offStats.turnovers++;

    // ── Penalties ──
    if (playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting) {
      offStats.penalties++;
      offStats.penaltyYards += playResult.penalty.yards;
    }

    // ── Time of possession ──
    offStats.timeOfPossession += playResult.clockElapsed;

    // ── Red zone ──
    if (prevBallPos >= 80 && playResult.isTouchdown) {
      offStats.redZoneTDs++;
    }
    // Track red zone attempts on first play entering red zone for each drive
    // (simplified: count any TD from red zone)

    // ── Player stats ──
    if (playResult.passer) {
      const ps = getOrCreate(playerMap, playResult.passer);
      ps.attempts++;
      if (type === 'pass_complete') {
        ps.completions++;
        ps.passingYards += playResult.yardsGained;
        if (playResult.isTouchdown) ps.passingTDs++;
      }
      if (playResult.turnover?.type === 'interception') ps.interceptions++;
    }

    if (playResult.rusher && (type === 'run' || type === 'scramble')) {
      const rs = getOrCreate(playerMap, playResult.rusher);
      rs.carries++;
      rs.rushingYards += playResult.yardsGained;
      if (playResult.isTouchdown) rs.rushingTDs++;
    }

    if (playResult.receiver) {
      const rc = getOrCreate(playerMap, playResult.receiver);
      rc.targets++;
      if (type === 'pass_complete') {
        rc.receptions++;
        rc.receivingYards += playResult.yardsGained;
        if (playResult.isTouchdown) rc.receivingTDs++;
      }
    }

    if (playResult.defender) {
      const dc = getOrCreate(playerMap, playResult.defender);
      dc.tackles++;
      if (type === 'sack') dc.sacks++;
      if (playResult.turnover?.type === 'fumble') dc.forcedFumbles++;
    }
  }

  // Split player stats by team
  const homePlayerStats: PlayerGameStats[] = [];
  const awayPlayerStats: PlayerGameStats[] = [];

  for (const ps of playerMap.values()) {
    if (ps.player.teamId === homeTeamId) {
      homePlayerStats.push(ps);
    } else {
      awayPlayerStats.push(ps);
    }
  }

  return {
    homeStats,
    awayStats,
    homePlayerStats,
    awayPlayerStats,
    homeDrives: [],
    awayDrives: [],
    scoringPlays: events.filter((e) => e.playResult.scoring),
  };
}

function emptyTeamStats(): TeamGameStats {
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

function emptyPlayerStats(player: Player): PlayerGameStats {
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

function getOrCreate(map: Map<string, PlayerGameStats>, player: Player): PlayerGameStats {
  let stats = map.get(player.id);
  if (!stats) {
    stats = emptyPlayerStats(player);
    map.set(player.id, stats);
  }
  return stats;
}
