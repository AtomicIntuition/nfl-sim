// ============================================================================
// GridIron Live - Master Simulation Engine
// ============================================================================
// The heart of the entire platform. Orchestrates a complete NFL game from
// coin toss through final whistle by coordinating every subsystem: play
// calling, play resolution, clock management, penalties, turnovers,
// special teams, overtime, injuries, stats, narrative, and commentary.
//
// The primary export -- simulateGame() -- is fully synchronous and
// deterministic: given the same seeds and rosters, it always produces
// the identical game. An async wrapper (simulateGameWithCommentary) is
// provided for post-hoc AI commentary replacement.
// ============================================================================

import type {
  Team,
  Player,
  GameState,
  GameEvent,
  SimulatedGame,
  PlayResult,
  GameType,
  NarrativeSnapshot,
  Drive,
  DriveResult,
  PossessionTeam,
  BoxScore,
  CrowdReaction,
  PlayerGameStats,
  PlayCommentary,
} from './types';

// --- RNG ---
import {
  createSeededRNG,
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
} from './rng';

// --- Play calling & resolution ---
import { selectPlay } from './play-caller';
import { resolvePlay } from './play-generator';
import { selectFormation } from './formations';
import { callDefense } from './defensive-coordinator';
import { selectPersonnelGrouping, selectFormationWithPersonnel } from './personnel';
import { selectRouteConcept } from './route-concepts';
import type { PlayCall } from './types';

// --- Clock ---
import {
  advanceClock,
  getHalftimeTimeoutReset,
  getPlayClockReset,
  checkTenSecondRunoff,
  shouldCallTimeout,
  type ClockUpdate,
} from './clock-manager';

// --- Penalties ---
import {
  checkForPenalty,
  enforcePenalty,
} from './penalty-engine';

// --- Turnovers ---
import { flipPossession } from './turnover-engine';

// --- Special teams ---
import {
  resolveKickoff,
  resolveOnsideKick,
  resolvePunt,
  resolveFieldGoal,
  resolveExtraPoint,
  resolveTwoPoint,
  calculateKickoffReturnPosition,
  calculateMissedFieldGoalPosition,
} from './special-teams';

// --- Overtime ---
import {
  initializeOvertime,
  checkOvertimeEnd,
  updateOvertimeState,
  createOvertimeGameState,
} from './overtime';
import type { OvertimeState } from './overtime';

// --- Injuries ---
import {
  createInjuryTracker,
  checkForInjury,
  getAvailablePlayers,
} from './injury-engine';

// --- Stats ---
import {
  createStatsAccumulator,
  updateStats,
  startDrive,
  endDrive,
  finalizeBoxScore,
  determineMVP,
} from './stats-tracker';

// --- Narrative ---
import {
  calculateMomentumShift,
  applyMomentumDecay,
  createInitialMomentum,
} from '../narrative/momentum';
import { detectDrama } from '../narrative/drama-detector';
import { scoreExcitement, getReactionFromExcitement } from '../narrative/excitement-scorer';
import { createStoryState, updateStoryState, getActiveThreads } from '../narrative/story-tracker';

// --- Commentary ---
import {
  getTemplate,
  fillTemplate,
  buildTemplateVars,
} from '../commentary/templates';
import { generateCommentaryBatch } from '../commentary/generator';

// --- Constants ---
import {
  QUARTER_LENGTH,
  TOUCHBACK_POSITION,
  PUNT_TOUCHBACK_POSITION,
  KICKOFF_OOB_POSITION,
  REALTIME_PLAY_CLOCK_DELAY_MS,
  REALTIME_TWO_MINUTE_PLAY_CLOCK_MS,
  REALTIME_QUARTER_BREAK_MS,
  REALTIME_HALFTIME_MS,
  REALTIME_TWO_MINUTE_WARNING_MS,
  REALTIME_TOUCHDOWN_BONUS_MS,
  REALTIME_TURNOVER_BONUS_MS,
} from './constants';

// ============================================================================
// PUBLIC INTERFACE
// ============================================================================

export interface SimulationConfig {
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  gameType: GameType;
  serverSeed?: string;
  clientSeed?: string;
  generateCommentary?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Generate a unique game ID from the two seeds. */
function generateGameId(serverSeed: string, clientSeed: string): string {
  // Simple hash-like ID from the first 8 chars of each seed
  return `game_${serverSeed.substring(0, 8)}_${clientSeed.substring(0, 8)}`;
}

/** Get the players on offense for the current possession. */
function getOffensePlayers(
  state: GameState,
  homePlayers: Player[],
  awayPlayers: Player[]
): Player[] {
  return state.possession === 'home' ? homePlayers : awayPlayers;
}

/** Get the players on defense for the current possession. */
function getDefensePlayers(
  state: GameState,
  homePlayers: Player[],
  awayPlayers: Player[]
): Player[] {
  return state.possession === 'home' ? awayPlayers : homePlayers;
}

/** Check if a play call is a pass play that could use a route concept. */
function isPassPlayCall(call: PlayCall): boolean {
  return call.startsWith('pass_') || call.startsWith('play_action') || call === 'screen_pass';
}

/** Find a player by position from a roster. */
function findPlayerByPosition(players: Player[], position: string): Player | null {
  const candidates = players.filter(p => p.position === position);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => (p.rating > best.rating ? p : best));
}

/**
 * Build broadcast-quality commentary using the rich template system.
 * Uses hundreds of Tony Romo / Jim Nantz-style templates organized by
 * play type, excitement level, and game situation.
 */
function buildRichCommentary(
  play: PlayResult,
  state: GameState,
  excitement: number,
  crowdReaction: CrowdReaction,
  rng: { randomInt: (min: number, max: number) => number },
): PlayCommentary {
  // Get the best template for this play type + excitement + situation
  const template = getTemplate(play, state, excitement, rng);
  const vars = buildTemplateVars(play, state);
  const filled = fillTemplate(template, vars);

  return {
    playByPlay: filled.playByPlay,
    colorAnalysis: filled.colorAnalysis,
    crowdReaction: filled.crowdReaction || crowdReaction,
    excitement,
  };
}

/**
 * Calculate the real-time playback delay for a play event.
 *
 * Instead of fixed 2-6 second delays, this maps actual game clock
 * consumption to real broadcast time, producing ~60-80 minute games.
 *
 * Logic:
 *   - Halftime → 5 minutes
 *   - Quarter break → 1 minute
 *   - Clock running → play.clockElapsed seconds (converted to ms)
 *   - Clock stopped → 20s huddle/lineup delay (12s in two-minute drill)
 *   - Bonus: +5s for TDs, +3s for turnovers
 */
function calculatePlayDelay(
  play: PlayResult,
  state: GameState,
  drama: { isClutchMoment: boolean; isTwoMinuteDrill: boolean },
  isQuarterChange: boolean,
  isHalftime: boolean,
  clockUpdate: { isClockRunning: boolean; twoMinuteWarning: boolean } | null,
): number {
  // Structural pauses take priority
  if (isHalftime) return REALTIME_HALFTIME_MS;
  if (isQuarterChange) return REALTIME_QUARTER_BREAK_MS;

  // Base delay: use the actual game-clock time the play consumed
  let delay: number;

  if (clockUpdate?.isClockRunning && play.clockElapsed && play.clockElapsed > 0) {
    // Clock is running: 1:1 real-time (1 game second = 1 wall-clock second)
    delay = play.clockElapsed * 1000;
  } else if (drama.isTwoMinuteDrill) {
    // Hurry-up / two-minute drill: faster play clock
    delay = REALTIME_TWO_MINUTE_PLAY_CLOCK_MS;
  } else {
    // Clock stopped (incomplete pass, penalty, etc.): huddle time
    delay = REALTIME_PLAY_CLOCK_DELAY_MS;
  }

  // Bonus delays for dramatic moments
  if (play.isTouchdown) delay += REALTIME_TOUCHDOWN_BONUS_MS;
  if (play.turnover) delay += REALTIME_TURNOVER_BONUS_MS;

  // Two-minute warning pause
  if (clockUpdate?.twoMinuteWarning) delay += REALTIME_TWO_MINUTE_WARNING_MS;

  return delay;
}

// ============================================================================
// MAIN SIMULATION FUNCTION
// ============================================================================

/**
 * Simulate a complete NFL game from kickoff to final whistle.
 *
 * This function is fully synchronous and deterministic. Given the same
 * seeds and rosters it always produces the identical game. Every random
 * draw flows through the provably-fair seeded PRNG.
 */
export function simulateGame(config: SimulationConfig): SimulatedGame {
  // ========================================================================
  // 1. SEED GENERATION
  // ========================================================================
  const serverSeed = config.serverSeed ?? generateServerSeed();
  const clientSeed = config.clientSeed ?? generateClientSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const rng = createSeededRNG(serverSeed, clientSeed);
  const gameId = generateGameId(serverSeed, clientSeed);

  // ========================================================================
  // 2. INITIALIZE GAME STATE
  // ========================================================================
  // The away team receives the opening kickoff in standard NFL convention.
  // Possession during kickoff belongs to the kicking team (home kicks off).
  const initialState: GameState = {
    id: gameId,
    homeTeam: config.homeTeam,
    awayTeam: config.awayTeam,
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    clock: QUARTER_LENGTH,
    playClock: 40,
    possession: 'home', // home team kicks off first (has "possession" for kickoff)
    down: 1,
    yardsToGo: 10,
    ballPosition: 35, // kickoff from the 35-yard line
    homeTimeouts: 3,
    awayTimeouts: 3,
    isClockRunning: false,
    twoMinuteWarning: false,
    isHalftime: false,
    kickoff: true,
    patAttempt: false,
  };

  // ========================================================================
  // 3. INITIALIZE SUBSYSTEMS
  // ========================================================================
  const statsAccumulator = createStatsAccumulator(config.homePlayers, config.awayPlayers);
  const injuryTracker = createInjuryTracker();
  let momentum = createInitialMomentum();
  let storyState = createStoryState();
  const events: GameEvent[] = [];
  const previousPlays: PlayResult[] = [];
  let driveNumber = 0;
  let timestamp = 0;
  let gameOver = false;
  let state = { ...initialState };
  let overtimeState: OvertimeState | null = null;

  // ========================================================================
  // 3b. PREGAME EVENTS (intro + coin toss)
  // ========================================================================
  // Coin toss determines who receives the opening kickoff.
  const coinTossWinnerReceives: PossessionTeam = rng.probability(0.5) ? 'home' : 'away';
  // The losing team kicks off (has "possession" during kickoff).
  const openingKicker: PossessionTeam = coinTossWinnerReceives === 'home' ? 'away' : 'home';
  state.possession = openingKicker;

  // Track which team received the opening kickoff to determine 2nd half.
  const openingKickReceiver: PossessionTeam = coinTossWinnerReceives;

  // Pregame intro event
  const pregameIntro: GameEvent = {
    eventNumber: 1,
    playResult: {
      type: 'pregame',
      call: 'kickoff',
      description: `Welcome to ${config.homeTeam.city}! The ${config.awayTeam.name} visit the ${config.homeTeam.name} in this ${config.gameType === 'regular' ? 'regular season' : config.gameType.replace('_', ' ')} matchup.`,
      yardsGained: 0,
      passer: null,
      rusher: null,
      receiver: null,
      defender: null,
      turnover: null,
      penalty: null,
      injury: null,
      scoring: null,
      clockElapsed: 0,
      isClockStopped: true,
      isFirstDown: false,
      isTouchdown: false,
      isSafety: false,
    },
    commentary: {
      playByPlay: `Welcome to ${config.homeTeam.city}! The ${config.awayTeam.name} visit the ${config.homeTeam.name}.`,
      colorAnalysis: `It's a beautiful day for football. Both teams are ready to compete.`,
      crowdReaction: 'cheer',
      excitement: 40,
    },
    gameState: { ...state },
    narrativeContext: {
      momentum: 0,
      excitement: 40,
      activeThreads: [],
      isComebackBrewing: false,
      isClutchMoment: false,
      isBlowout: false,
      isDominatingPerformance: null,
    },
    timestamp: 0,
    driveNumber: 0,
  };
  events.push(pregameIntro);
  timestamp = 8000; // 8s for intro

  // Coin toss event
  const winningTeamName = coinTossWinnerReceives === 'home'
    ? config.homeTeam.name
    : config.awayTeam.name;
  const coinTossEvent: GameEvent = {
    eventNumber: 2,
    playResult: {
      type: 'coin_toss',
      call: 'kickoff',
      description: `${winningTeamName} wins the toss and will receive the opening kickoff.`,
      yardsGained: 0,
      passer: null,
      rusher: null,
      receiver: null,
      defender: null,
      turnover: null,
      penalty: null,
      injury: null,
      scoring: null,
      clockElapsed: 0,
      isClockStopped: true,
      isFirstDown: false,
      isTouchdown: false,
      isSafety: false,
    },
    commentary: {
      playByPlay: `${winningTeamName} wins the toss and elects to receive.`,
      colorAnalysis: `We're about ready to kick this one off.`,
      crowdReaction: 'cheer',
      excitement: 45,
    },
    gameState: { ...state },
    narrativeContext: {
      momentum: 0,
      excitement: 45,
      activeThreads: [],
      isComebackBrewing: false,
      isClutchMoment: false,
      isBlowout: false,
      isDominatingPerformance: null,
    },
    timestamp,
    driveNumber: 0,
  };
  events.push(coinTossEvent);
  timestamp += 5000; // 5s for coin toss

  // ========================================================================
  // 4. MAIN GAME LOOP
  // ========================================================================
  while (!gameOver) {
    // Save previous state for stat tracking
    const prevState = { ...state };
    const prevQuarter = state.quarter;

    // --- (a) Get available players after filtering out injured ones ---
    const availableHome = getAvailablePlayers(config.homePlayers, injuryTracker);
    const availableAway = getAvailablePlayers(config.awayPlayers, injuryTracker);
    const offensePlayers = getOffensePlayers(state, availableHome, availableAway);
    const defensePlayers = getDefensePlayers(state, availableHome, availableAway);

    // --- (b) Select personnel grouping, formation, and play call ---
    // Personnel grouping constrains which formations are available
    const personnelGrouping = (!state.kickoff && !state.patAttempt)
      ? selectPersonnelGrouping(state, rng)
      : undefined;

    // Formation selection: constrained by personnel if available
    const formation = (!state.kickoff && !state.patAttempt)
      ? (personnelGrouping
          ? selectFormationWithPersonnel(state, personnelGrouping, rng)
          : selectFormation(state, rng))
      : undefined;

    const playCall = selectPlay(state, rng, formation);

    // --- (b2) Defensive coordinator calls scheme based on offensive formation ---
    const defensiveCall = (formation && !state.kickoff && !state.patAttempt)
      ? callDefense(state, formation, rng)
      : undefined;

    // --- (b3) Route concept for pass plays ---
    const routeConcept = (isPassPlayCall(playCall) && defensiveCall)
      ? selectRouteConcept(playCall, defensiveCall, rng)
      : undefined;

    // --- (c) Resolve the play based on type ---
    let playResult: PlayResult;

    if (playCall === 'kickoff_normal' || playCall === 'kickoff') {
      const kicker = findPlayerByPosition(offensePlayers, 'K');
      playResult = resolveKickoff(state, rng, kicker);
    } else if (playCall === 'onside_kick') {
      const kicker = findPlayerByPosition(offensePlayers, 'K');
      playResult = resolveOnsideKick(state, rng, kicker);
    } else if (playCall === 'punt') {
      const punter = findPlayerByPosition(offensePlayers, 'P');
      playResult = resolvePunt(state, rng, punter);
    } else if (playCall === 'field_goal') {
      const kicker = findPlayerByPosition(offensePlayers, 'K');
      playResult = resolveFieldGoal(state, rng, kicker);
    } else if (playCall === 'extra_point') {
      const kicker = findPlayerByPosition(offensePlayers, 'K');
      playResult = resolveExtraPoint(state, rng, kicker);
    } else if (playCall === 'two_point_run' || playCall === 'two_point_pass') {
      playResult = resolveTwoPoint(playCall, state, rng, offensePlayers);
    } else {
      // Normal play: run, pass, kneel, spike, screen — with formation & defense context
      playResult = resolvePlay(
        playCall,
        state,
        offensePlayers,
        defensePlayers,
        rng,
        momentum / 100, // normalize momentum to -1..1 range for play generator
        formation,
        defensiveCall,
        routeConcept,
      );

      // Attach formation & defense data to PlayResult for UI rendering
      if (formation) playResult.formation = formation;
      if (defensiveCall) playResult.defensiveCall = defensiveCall;
      if (personnelGrouping) playResult.personnelGrouping = personnelGrouping;
      if (routeConcept) playResult.routeConcept = routeConcept;
    }

    // --- (d) Check for penalty ---
    // Do not check penalties on kickoffs, PATs, kneels, or spikes
    const skipPenaltyCheck =
      state.kickoff || state.patAttempt ||
      playCall === 'kneel' || playCall === 'spike';

    if (!skipPenaltyCheck) {
      const penalty = checkForPenalty(
        state,
        playResult,
        offensePlayers,
        defensePlayers,
        rng,
      );

      if (penalty && !penalty.declined && !penalty.offsetting) {
        // Attach penalty to the play result
        playResult.penalty = penalty;

        // Pre-snap penalties: the play never happened, replay the down
        const isPreSnap = [
          'false_start', 'delay_of_game', 'too_many_men',
          'offsides', 'encroachment', 'neutral_zone_infraction',
          'illegal_formation',
        ].includes(penalty.type);

        if (isPreSnap) {
          // Override the play result -- nothing happened on the field
          playResult.yardsGained = 0;
          playResult.isTouchdown = false;
          playResult.isSafety = false;
          playResult.isFirstDown = false;
          playResult.turnover = null;
          playResult.scoring = null;
          playResult.description = penalty.description;
        }

        // Enforce the penalty to get new ball position and down/distance
        const enforcement = enforcePenalty(state, penalty);
        state.ballPosition = enforcement.ballPosition;
        state.down = enforcement.down;
        state.yardsToGo = enforcement.yardsToGo;

        if (enforcement.isFirstDown) {
          playResult.isFirstDown = true;
        }

        // Intentional grounding in the end zone = safety (NFL Rule 8-2-1)
        // If the passer was in or very near the end zone when grounding occurred
        if (penalty.type === 'intentional_grounding' && prevState.ballPosition <= 10) {
          const defensiveTeam = flipPossession(state.possession);
          playResult.isSafety = true;
          playResult.isTouchdown = false;
          playResult.isFirstDown = false;
          playResult.scoring = {
            type: 'safety',
            team: defensiveTeam,
            points: 2,
            scorer: null,
          };
          playResult.description = 'Intentional grounding in the end zone - Safety!';
        }

        // If pre-snap penalty, skip the rest of play processing
        // (no scoring, no possession change, no clock advance for the play)
        if (isPreSnap) {
          // Advance clock (pre-snap penalties don't consume clock -- handled by clock manager)
          const clockUpdate = advanceClock(state, playResult, rng);
          state.clock = clockUpdate.clock;
          state.quarter = clockUpdate.quarter;
          state.isClockRunning = clockUpdate.isClockRunning;
          state.twoMinuteWarning = state.twoMinuteWarning || clockUpdate.twoMinuteWarning;

          // 10-second runoff: offensive penalty with running clock in last 2 minutes
          const runoff = checkTenSecondRunoff(prevState, playResult);
          if (runoff.runoffSeconds > 0) {
            state.clock = Math.max(0, state.clock - runoff.runoffSeconds);
            if (runoff.halfEnds) {
              gameOver = state.quarter === 4 && state.homeScore !== state.awayScore;
              if (state.quarter === 2 || state.quarter === 4) {
                state.clock = 0;
              }
            }
          }

          // Update play clock
          state.playClock = getPlayClockReset(playResult, state);

          // Update narrative
          momentum = applyMomentumDecay(momentum);
          const drama = detectDrama(state, playResult, momentum, previousPlays);
          const excitement = scoreExcitement(playResult, state, drama, momentum);
          const crowdReaction = getReactionFromExcitement(excitement, playResult, state.possession);
          storyState = updateStoryState(storyState, playResult, state, events.length + 1);
          const activeThreads = getActiveThreads(storyState);

          const narrative: NarrativeSnapshot = {
            momentum,
            excitement,
            activeThreads,
            isComebackBrewing: drama.isComebackBrewing,
            isClutchMoment: drama.isClutchMoment,
            isBlowout: drama.isBlowout,
            isDominatingPerformance: null,
          };

          const commentary = buildRichCommentary(playResult, state, excitement, crowdReaction, rng);
          const delay = calculatePlayDelay(playResult, state, drama, false, false, clockUpdate);
          timestamp += delay;

          // Update stats
          updateStats(statsAccumulator, playResult, prevState, state);

          // Update drive
          if (statsAccumulator.currentDrive) {
            statsAccumulator.currentDrive.plays += 0; // penalty plays handled in updateStats
          }

          previousPlays.push(playResult);

          const event: GameEvent = {
            eventNumber: events.length + 1,
            playResult,
            commentary,
            gameState: { ...state },
            narrativeContext: narrative,
            timestamp,
            driveNumber: driveNumber || 1,
          };
          events.push(event);

          // Check for scoring play in updateStats
          if (playResult.scoring) {
            statsAccumulator.scoringPlays.push(event);
          }

          // Safety check
          if (events.length > 300) {
            gameOver = true;
          }

          continue;
        }
      } else if (penalty && penalty.declined) {
        // Attach declined penalty for reference
        playResult.penalty = penalty;
      }
    }

    // --- (e) Apply the play result to game state ---

    // Track if this is a kickoff or PAT so we handle transitions correctly
    const wasKickoff = state.kickoff;
    const wasPAT = state.patAttempt;
    let needsNewDrive = false;
    let driveEndResult: DriveResult | null = null;
    let possessionChanged = false;

    // ------------------------------------------------------------------
    // Handle KICKOFF results
    // ------------------------------------------------------------------
    if (wasKickoff) {
      state.kickoff = false;
      state.patAttempt = false;

      if (playCall === 'onside_kick') {
        // Onside kick: check if kicking team recovered
        // The play description indicates recovery. We detect from isFirstDown flag.
        if (playResult.isFirstDown) {
          // Kicking team recovers -- they keep possession
          state.ballPosition = playResult.yardsGained;
          state.down = 1;
          state.yardsToGo = 10;
          // Possession stays with the kicking team
          needsNewDrive = true;
        } else {
          // Receiving team gets the ball
          const receivingTeam = flipPossession(state.possession);
          state.possession = receivingTeam;
          state.ballPosition = 100 - playResult.yardsGained; // flip perspective
          state.down = 1;
          state.yardsToGo = 10;
          possessionChanged = true;
          needsNewDrive = true;
        }
      } else {
        // Normal kickoff
        const receivingTeam = flipPossession(state.possession);
        state.possession = receivingTeam;

        // Check for kickoff out of bounds or fair catch
        const isKickoffOOB = (playResult as PlayResult & { kickoffOOB?: boolean }).kickoffOOB;
        const isKickoffFairCatch = (playResult as PlayResult & { kickoffFairCatch?: boolean }).kickoffFairCatch;

        if (isKickoffOOB) {
          // Kickoff OOB: receiving team gets ball at their 40
          state.ballPosition = KICKOFF_OOB_POSITION;
        } else if (isKickoffFairCatch) {
          // Fair catch on kickoff: ball dead at catch spot
          state.ballPosition = playResult.yardsGained;
        } else if (playResult.type === 'touchback' || playResult.yardsGained === 0) {
          // Touchback: ball at the 25
          state.ballPosition = TOUCHBACK_POSITION;
        } else if (playResult.isTouchdown) {
          // Kickoff return TD
          state.ballPosition = 100;
        } else {
          // Kickoff return: yardsGained is the return distance
          state.ballPosition = calculateKickoffReturnPosition(playResult.yardsGained);
        }

        state.down = 1;
        state.yardsToGo = 10;
        possessionChanged = true;
        needsNewDrive = true;

        // Handle kickoff return touchdown
        if (playResult.isTouchdown && playResult.scoring) {
          const scoringTeam = receivingTeam;
          if (scoringTeam === 'home') {
            state.homeScore += playResult.scoring.points;
          } else {
            state.awayScore += playResult.scoring.points;
          }
          // Fix scoring team (resolveKickoff uses getOpposingPossession
          // which was the kicking team's "away" -- but we already flipped)
          playResult.scoring.team = scoringTeam;
          state.patAttempt = true;
          state.ballPosition = 85; // PAT from the opponent's 15 (85 from own end zone)
          driveEndResult = 'touchdown';
        }
      }
    }
    // ------------------------------------------------------------------
    // Handle PAT / Two-Point results
    // ------------------------------------------------------------------
    else if (wasPAT) {
      state.patAttempt = false;

      if (playResult.scoring) {
        if (playResult.scoring.team === 'home') {
          state.homeScore += playResult.scoring.points;
        } else {
          state.awayScore += playResult.scoring.points;
        }
      }

      // Defensive scoring on PAT: if defense intercepts/recovers fumble
      // and returns it, they score 2 points (NFL Rule 11-3-2-a)
      if (playResult.turnover && playResult.turnover.returnedForTD && !playResult.scoring) {
        const defensiveTeam = playResult.turnover.recoveredBy;
        if (defensiveTeam === 'home') {
          state.homeScore += 2;
        } else {
          state.awayScore += 2;
        }
        playResult.scoring = {
          type: 'two_point_conversion',
          team: defensiveTeam,
          points: 2,
          scorer: null,
        };
      }

      // After PAT/2pt, set up for kickoff by the scoring team
      state.kickoff = true;
      state.down = 1;
      state.yardsToGo = 10;
      state.ballPosition = 35; // kickoff from the 35
      // Possession stays with the scoring team (they kick off)
    }
    // ------------------------------------------------------------------
    // Handle PUNT results
    // ------------------------------------------------------------------
    else if (playResult.type === 'punt') {
      // End the current drive
      driveEndResult = 'punt';

      // Handle muffed punt (kicking team recovers)
      if (playResult.turnover && playResult.turnover.type === 'muffed_punt') {
        // Kicking team (current possession) recovers at the landing spot
        const landingSpot = state.ballPosition + playResult.yardsGained;
        state.ballPosition = Math.min(99, Math.max(1, landingSpot));
        state.down = 1;
        state.yardsToGo = 10;
        // Possession stays, but start a new drive
        needsNewDrive = true;
        driveEndResult = 'turnover'; // From the receiving team's perspective
      } else {
        // Normal punt: flip possession
        const puntDistance = playResult.yardsGained;
        const landingSpot = state.ballPosition + puntDistance;

        // Calculate new ball position from receiving team's perspective
        let newBallPosition: number;
        if (landingSpot >= 100) {
          // Punt touchback: ball at the 20 (NFL rule)
          newBallPosition = PUNT_TOUCHBACK_POSITION;
        } else {
          newBallPosition = 100 - landingSpot;
          // If return yards were factored in (net punt), adjust
          // The yardsGained for punt is the net punt distance
          if (newBallPosition < 1) newBallPosition = 1;
          if (newBallPosition > 99) newBallPosition = 99;
        }

        state.possession = flipPossession(state.possession);
        state.ballPosition = newBallPosition;
        state.down = 1;
        state.yardsToGo = 10;
        possessionChanged = true;
        needsNewDrive = true;
      }
    }
    // ------------------------------------------------------------------
    // Handle FIELD GOAL results
    // ------------------------------------------------------------------
    else if (playResult.type === 'field_goal') {
      if (playResult.scoring) {
        // Field goal is GOOD
        driveEndResult = 'field_goal';

        if (playResult.scoring.team === 'home') {
          state.homeScore += playResult.scoring.points;
        } else {
          state.awayScore += playResult.scoring.points;
        }

        // Set up for kickoff by the scoring team
        state.kickoff = true;
        state.down = 1;
        state.yardsToGo = 10;
        state.ballPosition = 35;
        needsNewDrive = true;
      } else {
        // Field goal MISSED: other team gets ball at spot of kick or their 20
        driveEndResult = 'turnover'; // Treat missed FG as end of drive
        const newPos = calculateMissedFieldGoalPosition(state.ballPosition);
        state.possession = flipPossession(state.possession);
        state.ballPosition = newPos;
        state.down = 1;
        state.yardsToGo = 10;
        possessionChanged = true;
        needsNewDrive = true;
      }
    }
    // ------------------------------------------------------------------
    // Handle NORMAL PLAY results (run, pass, sack, scramble, kneel, spike)
    // ------------------------------------------------------------------
    else {
      // Apply yards gained to ball position
      const newBallPosition = state.ballPosition + playResult.yardsGained;

      // --- Touchdown ---
      if (playResult.isTouchdown && playResult.scoring) {
        driveEndResult = 'touchdown';

        if (playResult.scoring.team === 'home') {
          state.homeScore += playResult.scoring.points;
        } else {
          state.awayScore += playResult.scoring.points;
        }

        state.patAttempt = true;
        state.ballPosition = 85; // PAT from the opponent's 15 (85 from own end zone)
        state.down = 1;
        state.yardsToGo = 10;
        needsNewDrive = true;
      }
      // --- Safety ---
      else if (playResult.isSafety && playResult.scoring) {
        driveEndResult = 'safety';

        if (playResult.scoring.team === 'home') {
          state.homeScore += playResult.scoring.points;
        } else {
          state.awayScore += playResult.scoring.points;
        }

        // After safety, the team that committed the safety kicks off
        // (the team that was on offense -- they gave up the safety)
        // Free kick from the 20-yard line
        state.kickoff = true;
        state.ballPosition = 20; // free kick from own 20
        // Possession stays with the team that committed the safety (they kick)
        state.down = 1;
        state.yardsToGo = 10;
        needsNewDrive = true;
      }
      // --- Fumble out of bounds (offense keeps ball) ---
      else if (playResult.turnover && playResult.turnover.type === 'fumble_oob') {
        // Ball stays with offense at the fumble spot — treat like a normal play
        state.ballPosition = Math.max(1, Math.min(99, newBallPosition));

        if (playResult.isFirstDown) {
          state.down = 1;
          state.yardsToGo = Math.min(10, 100 - state.ballPosition);
        } else {
          const nextDown = state.down + 1;
          if (nextDown > 4) {
            // Turnover on downs (unlikely but possible if fumble OOB on 4th down)
            state.possession = flipPossession(state.possession);
            state.ballPosition = 100 - state.ballPosition;
            state.down = 1;
            state.yardsToGo = 10;
            possessionChanged = true;
            needsNewDrive = true;
            driveEndResult = 'turnover';
          } else {
            state.down = nextDown as 1 | 2 | 3 | 4;
            state.yardsToGo = Math.max(1, state.yardsToGo - playResult.yardsGained);
          }
        }
      }
      // --- Turnover (fumble, interception, etc.) ---
      else if (playResult.turnover) {
        driveEndResult = 'turnover';
        const turnover = playResult.turnover;

        if (turnover.returnedForTD && playResult.scoring) {
          // Defensive/turnover TD
          if (playResult.scoring.team === 'home') {
            state.homeScore += playResult.scoring.points;
          } else {
            state.awayScore += playResult.scoring.points;
          }

          // The team that scored the defensive TD now gets a PAT
          state.possession = turnover.recoveredBy;
          state.patAttempt = true;
          state.ballPosition = 85; // PAT from the opponent's 15 (85 from own end zone)
          state.down = 1;
          state.yardsToGo = 10;
          possessionChanged = true;
          needsNewDrive = true;
        } else {
          // Normal turnover: flip possession
          // First, apply the play's yards to get the turnover spot
          const turnoverSpot = Math.max(1, Math.min(99, newBallPosition));
          // Invert for the recovering team's perspective
          const invertedPosition = 100 - turnoverSpot;
          // Add return yards
          const finalPosition = Math.min(99, Math.max(1, invertedPosition + turnover.returnYards));

          state.possession = turnover.recoveredBy;
          state.ballPosition = finalPosition;
          state.down = 1;
          state.yardsToGo = 10;
          possessionChanged = true;
          needsNewDrive = true;
        }
      }
      // --- Normal play (no score, no turnover) ---
      else {
        state.ballPosition = Math.max(1, Math.min(99, newBallPosition));

        if (playResult.isFirstDown) {
          // First down: reset downs
          state.down = 1;
          state.yardsToGo = Math.min(10, 100 - state.ballPosition);
        } else {
          // Advance the down
          const nextDown = state.down + 1;

          if (nextDown > 4) {
            // Turnover on downs
            driveEndResult = 'turnover_on_downs';
            const invertedPosition = 100 - state.ballPosition;
            state.possession = flipPossession(state.possession);
            state.ballPosition = Math.max(1, Math.min(99, invertedPosition));
            state.down = 1;
            state.yardsToGo = Math.min(10, 100 - state.ballPosition);
            possessionChanged = true;
            needsNewDrive = true;

            // Augment the play result with turnover on downs info
            playResult.turnover = {
              type: 'turnover_on_downs',
              recoveredBy: state.possession,
              returnYards: 0,
              returnedForTD: false,
            };
          } else {
            state.down = nextDown as 1 | 2 | 3 | 4;
            state.yardsToGo = Math.max(1, state.yardsToGo - playResult.yardsGained);
          }
        }
      }
    }

    // --- (h) Advance the clock ---
    // Skip clock advance for PAT plays (they don't consume game clock)
    // clockUpdate is hoisted so calculatePlayDelay can access it
    let clockUpdate: ClockUpdate | null = null;
    if (!wasPAT) {
      clockUpdate = advanceClock(prevState, playResult, rng);
      state.clock = clockUpdate.clock;
      state.isClockRunning = clockUpdate.isClockRunning;

      // Update play clock (25s after penalties/turnovers/scores, 40s otherwise)
      state.playClock = getPlayClockReset(playResult, state);

      // Handle two-minute warning
      if (clockUpdate.twoMinuteWarning && !state.twoMinuteWarning) {
        state.twoMinuteWarning = true;
      }

      // Handle quarter transitions
      if (clockUpdate.quarter !== prevQuarter) {
        state.quarter = clockUpdate.quarter;

        // Reset two-minute warning for new quarter
        if (clockUpdate.quarter !== prevQuarter) {
          state.twoMinuteWarning = false;
        }

        // Halftime handling
        if (clockUpdate.isHalftime) {
          state.isHalftime = true;

          // End current drive as end_of_half
          if (statsAccumulator.currentDrive && !driveEndResult) {
            endDrive(statsAccumulator, 'end_of_half', state);
            driveEndResult = null; // Already handled
          }

          // Reset timeouts for both teams
          const timeouts = getHalftimeTimeoutReset();
          state.homeTimeouts = timeouts.homeTimeouts;
          state.awayTimeouts = timeouts.awayTimeouts;

          // Set up second-half kickoff
          // The team that received the opening kickoff now kicks off
          state.kickoff = true;
          state.ballPosition = 35;
          state.down = 1;
          state.yardsToGo = 10;
          // The opener was home kicks, away receives.
          // Second half: away kicks, home receives.
          state.possession = openingKickReceiver; // away kicks off second half
          needsNewDrive = true;
        }

        // End of Q1/Q3: same drive continues, teams switch sides
        // (This is handled by the field position system -- no explicit action needed
        // since we use 0-100 from the possessing team's perspective)

        // End of Q4: check for overtime or game end
        if (clockUpdate.isGameOver) {
          if (state.homeScore === state.awayScore && state.quarter !== 'OT') {
            // Tie at end of Q4: go to overtime
            const coinTossWinner: PossessionTeam = rng.probability(0.5) ? 'home' : 'away';
            overtimeState = initializeOvertime(coinTossWinner, rng);
            state = createOvertimeGameState(state, overtimeState);
            needsNewDrive = true;

            // End current drive
            if (statsAccumulator.currentDrive && !driveEndResult) {
              endDrive(statsAccumulator, 'end_of_half', state);
            }
          } else {
            // Game is over
            gameOver = true;

            // End current drive if still active
            if (statsAccumulator.currentDrive) {
              endDrive(statsAccumulator, driveEndResult || 'end_of_half', state);
            }
          }
        }
      }

      // Check if OT game is over after a scoring play
      if (state.quarter === 'OT' && overtimeState && playResult.scoring) {
        const otCheck = checkOvertimeEnd(overtimeState, state, config.gameType);
        if (otCheck.isOver) {
          gameOver = true;
          if (statsAccumulator.currentDrive) {
            endDrive(statsAccumulator, driveEndResult || 'end_of_half', state);
          }
        }
      }
    } else {
      // PAT: don't advance clock but check for OT end
      if (state.quarter === 'OT' && overtimeState && playResult.scoring) {
        const otCheck = checkOvertimeEnd(overtimeState, state, config.gameType);
        if (otCheck.isOver) {
          gameOver = true;
          if (statsAccumulator.currentDrive) {
            endDrive(statsAccumulator, driveEndResult || 'end_of_half', state);
          }
        }
      }
    }

    // --- (i) Manage drives ---
    // End the previous drive if needed
    if (driveEndResult && statsAccumulator.currentDrive) {
      endDrive(statsAccumulator, driveEndResult, state);
    }

    // Start a new drive when possession changes or after scoring + kickoff setup
    if (needsNewDrive && !state.patAttempt && !gameOver) {
      driveNumber++;
      startDrive(statsAccumulator, state);
    }

    // If there is no current drive and we are not in a special state, start one
    if (!statsAccumulator.currentDrive && !state.kickoff && !state.patAttempt && !gameOver) {
      driveNumber++;
      startDrive(statsAccumulator, state);
    }

    // --- Update OT possession tracking ---
    if (state.quarter === 'OT' && overtimeState && possessionChanged) {
      // The team that just lost possession has completed a possession
      const teamThatHadBall = flipPossession(state.possession);

      // Determine drive result for OT tracking
      let otResult: 'touchdown' | 'field_goal' | 'turnover' | 'punt' | 'safety';
      if (driveEndResult === 'touchdown') otResult = 'touchdown';
      else if (driveEndResult === 'field_goal') otResult = 'field_goal';
      else if (driveEndResult === 'safety') otResult = 'safety';
      else if (driveEndResult === 'punt') otResult = 'punt';
      else otResult = 'turnover';

      overtimeState = updateOvertimeState(overtimeState, teamThatHadBall, otResult);

      // Re-check OT end after updating state
      const otRecheck = checkOvertimeEnd(overtimeState, state, config.gameType);
      if (otRecheck.isOver) {
        gameOver = true;
        if (statsAccumulator.currentDrive) {
          endDrive(statsAccumulator, driveEndResult || 'end_of_half', state);
        }
      }
    }

    // --- (i2) Timeout strategy ---
    // Check if either team should call a timeout after this play
    if (!gameOver && !state.kickoff && !state.patAttempt && clockUpdate) {
      const timeoutCall = shouldCallTimeout(state, playResult, rng);
      if (timeoutCall) {
        // Apply the timeout: decrement the calling team's timeouts and stop the clock
        if (timeoutCall.team === 'home' && state.homeTimeouts > 0) {
          state.homeTimeouts--;
          state.isClockRunning = false;
        } else if (timeoutCall.team === 'away' && state.awayTimeouts > 0) {
          state.awayTimeouts--;
          state.isClockRunning = false;
        }
      }
    }

    // --- (j) Update stats ---
    // Build the event first (needed for scoring play tracking)
    // We create a partial event here, then complete it after narrative/commentary
    updateStats(statsAccumulator, playResult, prevState, state);

    // --- (k) Update narrative ---
    const momentumShift = calculateMomentumShift(playResult, prevState, momentum);
    momentum = applyMomentumDecay(momentum + momentumShift);
    momentum = Math.max(-100, Math.min(100, momentum));

    const drama = detectDrama(state, playResult, momentum, previousPlays);
    const excitement = scoreExcitement(playResult, state, drama, momentum);
    storyState = updateStoryState(storyState, playResult, state, events.length + 1);
    const activeThreads = getActiveThreads(storyState);

    const narrative: NarrativeSnapshot = {
      momentum,
      excitement,
      activeThreads,
      isComebackBrewing: drama.isComebackBrewing,
      isClutchMoment: drama.isClutchMoment,
      isBlowout: drama.isBlowout,
      isDominatingPerformance: null,
    };

    // --- (l) Generate commentary ---
    const crowdReaction = getReactionFromExcitement(excitement, playResult, state.possession);
    const commentary = buildRichCommentary(playResult, state, excitement, crowdReaction, rng);

    // Annotate two-minute warning in the broadcast text
    if (clockUpdate?.twoMinuteWarning) {
      commentary.playByPlay = `Two-minute warning. ${commentary.playByPlay}`;
      commentary.colorAnalysis = `We've hit the two-minute warning. ${commentary.colorAnalysis ?? ''}`.trim();
    }

    // --- (m) Calculate playback timestamp ---
    const isQuarterChange = state.quarter !== prevQuarter;
    const isHalftime = state.isHalftime;
    if (isHalftime) {
      state.isHalftime = false; // Reset after noting it
    }
    const delay = calculatePlayDelay(playResult, state, drama, isQuarterChange, isHalftime, clockUpdate);
    timestamp += delay;

    // --- (n) Build GameEvent and push to events array ---
    const event: GameEvent = {
      eventNumber: events.length + 1,
      playResult,
      commentary,
      gameState: { ...state },
      narrativeContext: narrative,
      timestamp,
      driveNumber: driveNumber || 1,
    };
    events.push(event);

    // Track scoring plays in the accumulator
    if (playResult.scoring) {
      statsAccumulator.scoringPlays.push(event);
    }

    previousPlays.push(playResult);

    // --- (o) Check for injury ---
    const injury = checkForInjury(
      playResult,
      state,
      offensePlayers,
      defensePlayers,
      injuryTracker,
      rng,
    );
    if (injury) {
      playResult.injury = injury;
    }

    // --- (p) Safety check: prevent infinite loops ---
    if (events.length > 300) {
      gameOver = true;
      // Close out any active drive
      if (statsAccumulator.currentDrive) {
        endDrive(statsAccumulator, 'end_of_half', state);
      }
    }

    // Also check for end-of-regulation game over from scores
    if (!gameOver && state.quarter === 4 && state.clock <= 0 && state.homeScore !== state.awayScore) {
      gameOver = true;
      if (statsAccumulator.currentDrive) {
        endDrive(statsAccumulator, 'end_of_half', state);
      }
    }

    // Check for OT clock expiration
    if (!gameOver && state.quarter === 'OT' && state.clock <= 0) {
      if (state.homeScore === state.awayScore && config.gameType !== 'regular') {
        // Playoff OT: still tied — start another OT period
        // Reset with a new coin toss; loser of previous toss kicks
        if (overtimeState) {
          const newCoinWinner: PossessionTeam = rng.probability(0.5) ? 'home' : 'away';
          overtimeState = initializeOvertime(newCoinWinner, rng);
          state = createOvertimeGameState(state, overtimeState);
          needsNewDrive = true;

          if (statsAccumulator.currentDrive) {
            endDrive(statsAccumulator, 'end_of_half', state);
          }
        }
      } else {
        // Regular season tie or someone is winning
        gameOver = true;
        if (statsAccumulator.currentDrive) {
          endDrive(statsAccumulator, 'end_of_half', state);
        }
      }
    }
  }

  // ========================================================================
  // 5. FINALIZE THE GAME
  // ========================================================================
  const boxScore: BoxScore = finalizeBoxScore(statsAccumulator);
  const mvp: PlayerGameStats = determineMVP(statsAccumulator);

  // Collect all drives from the accumulator
  const allDrives: Drive[] = statsAccumulator.drives;

  const simulatedGame: SimulatedGame = {
    id: gameId,
    homeTeam: config.homeTeam,
    awayTeam: config.awayTeam,
    gameType: config.gameType,
    events,
    finalScore: {
      home: state.homeScore,
      away: state.awayScore,
    },
    serverSeedHash,
    serverSeed,
    clientSeed,
    nonce: rng.getNonce(),
    totalPlays: events.length,
    mvp,
    boxScore,
    drives: allDrives,
  };

  return simulatedGame;
}

// ============================================================================
// ASYNC WRAPPER (for AI-generated commentary)
// ============================================================================

/**
 * Simulate a game and then optionally replace template commentary with
 * AI-generated commentary via the Claude API.
 *
 * The simulation itself runs synchronously for determinism. The async
 * step only replaces the commentary strings -- it does not alter game
 * outcomes, stats, or seeds.
 */
export async function simulateGameWithCommentary(
  config: SimulationConfig,
): Promise<SimulatedGame> {
  // Run the deterministic simulation first
  const game = simulateGame(config);

  // If commentary generation is not requested, return as-is
  if (!config.generateCommentary) {
    return game;
  }

  // Batch-replace commentary with AI-generated versions.
  // Skip pregame/coin_toss events (indices 0 and 1) — keep their hardcoded text.
  const playEvents = game.events.slice(2);

  if (playEvents.length === 0) {
    return game;
  }

  const batchInput = playEvents.map((event) => ({
    play: event.playResult,
    state: event.gameState,
    narrative: event.narrativeContext,
    excitement: event.narrativeContext.excitement,
  }));

  try {
    const aiCommentary = await generateCommentaryBatch(
      batchInput,
      { name: config.homeTeam.name, abbreviation: config.homeTeam.abbreviation },
      { name: config.awayTeam.name, abbreviation: config.awayTeam.abbreviation },
    );

    // Replace template commentary with AI-generated commentary
    for (let i = 0; i < aiCommentary.length; i++) {
      game.events[i + 2].commentary = aiCommentary[i];
    }

    // Re-apply two-minute warning annotations (since AI commentary overwrote them)
    for (let i = 2; i < game.events.length; i++) {
      const event = game.events[i];
      const prevEvent = game.events[i - 1];
      // Detect two-minute warning: clock crossed below 120 between events
      if (prevEvent && prevEvent.gameState.clock > 120 && event.gameState.clock <= 120) {
        const q = event.gameState.quarter;
        if (q === 2 || q === 4) {
          event.commentary.playByPlay = `Two-minute warning. ${event.commentary.playByPlay}`;
        }
      }
    }
  } catch (error) {
    // If AI commentary fails entirely, template commentary remains intact
    console.warn('[Commentary] AI commentary generation failed, using templates:', error);
  }

  return game;
}
