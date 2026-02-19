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

// --- Clock ---
import {
  advanceClock,
  getHalftimeTimeoutReset,
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

// --- Constants ---
import {
  QUARTER_LENGTH,
  TOUCHBACK_POSITION,
  PLAY_DELAY_NORMAL,
  PLAY_DELAY_TWO_MINUTE,
  PLAY_DELAY_AFTER_TOUCHDOWN,
  PLAY_DELAY_AFTER_TURNOVER,
  PLAY_DELAY_CLUTCH,
  PLAY_DELAY_BETWEEN_QUARTERS,
  PLAY_DELAY_HALFTIME,
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

/** Find a player by position from a roster. */
function findPlayerByPosition(players: Player[], position: string): Player | null {
  const candidates = players.filter(p => p.position === position);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => (p.rating > best.rating ? p : best));
}

/** Build a basic template-based commentary for a play. */
function buildTemplateCommentary(
  play: PlayResult,
  state: GameState,
  excitement: number,
  crowdReaction: CrowdReaction,
): PlayCommentary {
  // Play-by-play comes from the play description
  const playByPlay = play.description || 'The play develops...';

  // Color analysis based on game situation
  let colorAnalysis = '';
  if (play.isTouchdown) {
    colorAnalysis = `That puts ${state.possession === 'home' ? state.homeTeam.name : state.awayTeam.name} on the board with a touchdown.`;
  } else if (play.turnover) {
    colorAnalysis = 'That turnover could be a game-changer. Momentum shifts.';
  } else if (play.type === 'sack') {
    colorAnalysis = 'The pass rush gets home. That will bring up a longer down and distance.';
  } else if (play.isFirstDown) {
    colorAnalysis = 'Moving the chains. The offense keeps the drive alive.';
  } else if (play.type === 'punt') {
    colorAnalysis = 'The offense stalls and has to give the ball back.';
  } else if (play.scoring && play.scoring.type === 'field_goal') {
    colorAnalysis = 'Points on the board. Every point matters in a game like this.';
  } else if (play.scoring && play.scoring.type === 'safety') {
    colorAnalysis = 'A safety! Two points for the defense and they get the ball back.';
  } else if (play.yardsGained >= 15) {
    colorAnalysis = 'A chunk play that moves them into better territory.';
  } else if (play.yardsGained <= 0 && play.type !== 'pass_incomplete') {
    colorAnalysis = 'No gain on that play. The defense did its job.';
  } else {
    colorAnalysis = `${state.down === 3 ? 'A crucial third down coming up.' : 'Standard play from the offense.'}`;
  }

  return {
    playByPlay,
    colorAnalysis,
    crowdReaction,
    excitement,
  };
}

/** Calculate the playback timestamp delay for a play. */
function calculatePlayDelay(
  play: PlayResult,
  state: GameState,
  drama: { isClutchMoment: boolean; isTwoMinuteDrill: boolean },
  isQuarterChange: boolean,
  isHalftime: boolean,
): number {
  if (isHalftime) return PLAY_DELAY_HALFTIME;
  if (isQuarterChange) return PLAY_DELAY_BETWEEN_QUARTERS;
  if (play.isTouchdown) return PLAY_DELAY_AFTER_TOUCHDOWN;
  if (play.turnover) return PLAY_DELAY_AFTER_TURNOVER;
  if (drama.isClutchMoment) return PLAY_DELAY_CLUTCH;
  if (drama.isTwoMinuteDrill) return PLAY_DELAY_TWO_MINUTE;
  return PLAY_DELAY_NORMAL;
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

  // Track which team received the opening kickoff to determine 2nd half.
  // The home team kicks off first, so the away team is the opening receiver.
  // At halftime, the opening receiver kicks off the second half.
  const openingKickReceiver: PossessionTeam = 'away';

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

    // --- (b) Select the play call ---
    const playCall = selectPlay(state, rng);

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
      // Normal play: run, pass, kneel, spike, screen
      playResult = resolvePlay(
        playCall,
        state,
        offensePlayers,
        defensePlayers,
        rng,
        momentum / 100, // normalize momentum to -1..1 range for play generator
      );
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

        // If pre-snap penalty, skip the rest of play processing
        // (no scoring, no possession change, no clock advance for the play)
        if (isPreSnap) {
          // Advance clock (pre-snap penalties don't consume clock -- handled by clock manager)
          const clockUpdate = advanceClock(state, playResult, rng);
          state.clock = clockUpdate.clock;
          state.quarter = clockUpdate.quarter;
          state.isClockRunning = clockUpdate.isClockRunning;
          state.twoMinuteWarning = state.twoMinuteWarning || clockUpdate.twoMinuteWarning;

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

          const commentary = buildTemplateCommentary(playResult, state, excitement, crowdReaction);
          const delay = PLAY_DELAY_NORMAL;
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

        if (playResult.type === 'touchback' || playResult.yardsGained === 0) {
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
          state.ballPosition = 15; // PAT from the 15
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
          // Touchback
          newBallPosition = TOUCHBACK_POSITION;
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
        state.ballPosition = 15; // PAT from the 15
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
      // --- Turnover (fumble, interception, etc.) ---
      else if (playResult.turnover) {
        driveEndResult = 'turnover';

        // Calculate new ball position after turnover
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
          state.ballPosition = 15;
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
    if (!wasPAT) {
      const clockUpdate = advanceClock(prevState, playResult, rng);
      state.clock = clockUpdate.clock;
      state.isClockRunning = clockUpdate.isClockRunning;

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
    const commentary = buildTemplateCommentary(playResult, state, excitement, crowdReaction);

    // --- (m) Calculate playback timestamp ---
    const isQuarterChange = state.quarter !== prevQuarter;
    const isHalftime = state.isHalftime;
    if (isHalftime) {
      state.isHalftime = false; // Reset after noting it
    }
    const delay = calculatePlayDelay(playResult, state, drama, isQuarterChange, isHalftime);
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
      gameOver = true;
      if (statsAccumulator.currentDrive) {
        endDrive(statsAccumulator, 'end_of_half', state);
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
  // This is a placeholder for the actual Claude API integration.
  // Each event's commentary would be sent to the API with game context,
  // and the response would replace the template commentary.
  //
  // For now, the template commentary is used as the final output.
  // The actual implementation would:
  //   1. Batch events into groups of ~10 for efficient API calls
  //   2. Send play descriptions, game state, and narrative context
  //   3. Receive rich play-by-play and color analysis text
  //   4. Replace commentary fields on each event
  //
  // Example (when API is integrated):
  // const enhancedEvents = await batchGenerateCommentary(game.events);
  // game.events = enhancedEvents;

  return game;
}
