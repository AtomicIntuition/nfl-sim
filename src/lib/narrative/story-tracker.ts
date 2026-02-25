// ============================================================================
// GridBlitz - Story Tracker
// ============================================================================
// Tracks emerging narrative threads throughout a game -- storylines that
// commentary can reference. Threads have types, descriptions, involved
// players, and an intensity score (0-100) that grows the longer a
// storyline persists. At most 5 threads are active at any time; when
// a new thread would exceed the limit, the lowest-intensity thread is
// evicted. Threads expire when their triggering condition no longer holds.
// ============================================================================

import {
  GameState,
  PlayResult,
  NarrativeThread,
  NarrativeThreadType,
  Player,
} from '../simulation/types';

// ============================================================================
// TYPES
// ============================================================================

export interface StoryState {
  /** Currently tracked narrative threads. */
  threads: NarrativeThread[];
  /** Per-player streaks for detecting hot/cold runs. */
  playerStreaks: Map<string, PlayerStreak>;
  /** Running count of three-and-outs per team this game. */
  consecutiveThreeAndOuts: { home: number; away: number };
  /** How many times the lead has changed hands. */
  leadChanges: number;
  /** The largest lead held by either team so far. */
  largestLead: { team: 'home' | 'away'; points: number };
  /** Plays since the last scoring play for each team. */
  scoringDrought: { home: number; away: number };
}

export interface PlayerStreak {
  player: Player;
  type: 'completions' | 'incompletions' | 'rushes_positive' | 'big_plays';
  count: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of concurrent active threads. */
const MAX_ACTIVE_THREADS = 5;

/** Intensity boost per play that a thread persists. */
const INTENSITY_PER_PLAY = 5;

/** Minimum intensity to keep a thread alive during pruning. */
const MIN_INTENSITY = 10;

// ============================================================================
// HELPERS
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Create a new narrative thread. Intensity starts at a base level
 * determined by the thread type.
 */
function createThread(
  type: NarrativeThreadType,
  description: string,
  involvedPlayers: Player[],
  startedAt: number,
  baseIntensity: number
): NarrativeThread {
  return {
    type,
    description,
    involvedPlayers,
    intensity: clamp(baseIntensity, 0, 100),
    startedAt,
  };
}

/**
 * Increase the intensity of an existing thread and update its description.
 */
function boostThread(
  thread: NarrativeThread,
  amount: number,
  newDescription?: string
): NarrativeThread {
  return {
    ...thread,
    intensity: clamp(thread.intensity + amount, 0, 100),
    description: newDescription ?? thread.description,
  };
}

/** Find an active thread by type. */
function findThread(
  threads: NarrativeThread[],
  type: NarrativeThreadType
): NarrativeThread | undefined {
  return threads.find((t) => t.type === type);
}

/** Remove a thread by type. */
function removeThread(
  threads: NarrativeThread[],
  type: NarrativeThreadType
): NarrativeThread[] {
  return threads.filter((t) => t.type !== type);
}

/**
 * Enforce the maximum thread count by evicting the lowest-intensity
 * threads when the limit is exceeded.
 */
function pruneThreads(threads: NarrativeThread[]): NarrativeThread[] {
  if (threads.length <= MAX_ACTIVE_THREADS) return threads;
  const sorted = [...threads].sort((a, b) => b.intensity - a.intensity);
  return sorted.slice(0, MAX_ACTIVE_THREADS);
}

/**
 * Upsert a thread: if a thread of this type already exists, boost its
 * intensity; otherwise create a new one.
 */
function upsertThread(
  threads: NarrativeThread[],
  type: NarrativeThreadType,
  description: string,
  involvedPlayers: Player[],
  eventNumber: number,
  baseIntensity: number
): NarrativeThread[] {
  const existing = findThread(threads, type);
  if (existing) {
    return threads.map((t) =>
      t.type === type
        ? boostThread(t, INTENSITY_PER_PLAY, description)
        : t
    );
  }
  return [
    ...threads,
    createThread(type, description, involvedPlayers, eventNumber, baseIntensity),
  ];
}

// ============================================================================
// STREAK TRACKING
// ============================================================================

/**
 * Update the player streak map based on the latest play result.
 * Returns the updated map and any streak that crossed a threshold.
 */
function updateStreaks(
  streaks: Map<string, PlayerStreak>,
  play: PlayResult
): {
  streaks: Map<string, PlayerStreak>;
  hotStreak: PlayerStreak | null;
  coldStreak: PlayerStreak | null;
} {
  const updated = new Map(streaks);
  let hotStreak: PlayerStreak | null = null;
  let coldStreak: PlayerStreak | null = null;

  // --- QB completion / incompletion streaks ---
  if (play.passer) {
    const passerId = play.passer.id;
    const currentStreak = updated.get(passerId);

    if (play.type === 'pass_complete') {
      if (currentStreak && currentStreak.type === 'completions') {
        const newStreak: PlayerStreak = {
          ...currentStreak,
          count: currentStreak.count + 1,
        };
        updated.set(passerId, newStreak);
        if (newStreak.count >= 4) hotStreak = newStreak;
      } else {
        updated.set(passerId, {
          player: play.passer,
          type: 'completions',
          count: 1,
        });
      }
    } else if (
      play.type === 'pass_incomplete' ||
      play.type === 'sack'
    ) {
      if (currentStreak && currentStreak.type === 'incompletions') {
        const newStreak: PlayerStreak = {
          ...currentStreak,
          count: currentStreak.count + 1,
        };
        updated.set(passerId, newStreak);
        if (newStreak.count >= 3) coldStreak = newStreak;
      } else {
        updated.set(passerId, {
          player: play.passer,
          type: 'incompletions',
          count: 1,
        });
      }
    }
  }

  // --- Receiver / rusher big play streaks ---
  const primaryPlayer = play.receiver ?? play.rusher;
  if (primaryPlayer && play.yardsGained >= 15) {
    const playerId = primaryPlayer.id;
    const currentStreak = updated.get(`${playerId}_big`);
    if (currentStreak && currentStreak.type === 'big_plays') {
      const newStreak: PlayerStreak = {
        ...currentStreak,
        count: currentStreak.count + 1,
      };
      updated.set(`${playerId}_big`, newStreak);
      if (newStreak.count >= 3) hotStreak = newStreak;
    } else {
      updated.set(`${playerId}_big`, {
        player: primaryPlayer,
        type: 'big_plays',
        count: 1,
      });
    }
  }

  return { streaks: updated, hotStreak, coldStreak };
}

// ============================================================================
// THREAD DETECTION
// ============================================================================

/**
 * Detect and manage narrative threads based on the current play,
 * game state, and accumulated story context.
 */
function detectThreads(
  storyState: StoryState,
  play: PlayResult,
  state: GameState,
  eventNumber: number,
  hotStreak: PlayerStreak | null,
  coldStreak: PlayerStreak | null
): NarrativeThread[] {
  let threads = [...storyState.threads];

  // --- Hot Streak ---
  if (hotStreak) {
    const desc =
      hotStreak.type === 'completions'
        ? `${hotStreak.player.name} has completed ${hotStreak.count} passes in a row`
        : `${hotStreak.player.name} has ${hotStreak.count} big plays and counting`;
    threads = upsertThread(
      threads,
      'hot_streak',
      desc,
      [hotStreak.player],
      eventNumber,
      40 + hotStreak.count * 10
    );
  } else {
    // Expire hot_streak if the streak was broken by a negative play
    // for the same player.
    const existingHot = findThread(threads, 'hot_streak');
    if (existingHot && coldStreak) {
      threads = removeThread(threads, 'hot_streak');
    }
  }

  // --- Cold Streak ---
  if (coldStreak) {
    const desc = `${coldStreak.player.name} is struggling - ${coldStreak.count} straight incompletions/sacks`;
    threads = upsertThread(
      threads,
      'cold_streak',
      desc,
      [coldStreak.player],
      eventNumber,
      30 + coldStreak.count * 10
    );
  } else {
    // Expire cold streak if the passer just completed a pass.
    if (play.type === 'pass_complete') {
      const existingCold = findThread(threads, 'cold_streak');
      if (
        existingCold &&
        play.passer &&
        existingCold.involvedPlayers.some((p) => p.id === play.passer!.id)
      ) {
        threads = removeThread(threads, 'cold_streak');
      }
    }
  }

  // --- Defensive Dominance ---
  // We track per-team three-and-outs; if one defense has forced 3+, it's dominant.
  const homeDefenseThreeAndOuts = storyState.consecutiveThreeAndOuts.away;
  const awayDefenseThreeAndOuts = storyState.consecutiveThreeAndOuts.home;
  if (homeDefenseThreeAndOuts >= 3 || awayDefenseThreeAndOuts >= 3) {
    const dominantSide =
      homeDefenseThreeAndOuts >= awayDefenseThreeAndOuts ? 'home' : 'away';
    const teamName =
      dominantSide === 'home'
        ? state.homeTeam.name
        : state.awayTeam.name;
    const count = Math.max(homeDefenseThreeAndOuts, awayDefenseThreeAndOuts);
    threads = upsertThread(
      threads,
      'defensive_dominance',
      `${teamName} defense has forced ${count} three-and-outs`,
      play.defender ? [play.defender] : [],
      eventNumber,
      45 + count * 5
    );
  } else {
    // Don't expire defensive dominance -- it persists for the whole game
    // once earned (a total count doesn't decrease).
  }

  // --- Comeback ---
  if (
    storyState.largestLead.points >= 14 &&
    Math.abs(state.homeScore - state.awayScore) <= 8
  ) {
    const comebackTeam =
      storyState.largestLead.team === 'home' ? 'away' : 'home';
    const teamName =
      comebackTeam === 'home'
        ? state.homeTeam.name
        : state.awayTeam.name;
    const deficit = storyState.largestLead.points;
    threads = upsertThread(
      threads,
      'comeback',
      `${teamName} has fought back from a ${deficit}-point deficit`,
      [],
      eventNumber,
      60
    );
  } else {
    // Expire comeback thread if the lead has blown back open.
    if (Math.abs(state.homeScore - state.awayScore) > 8) {
      threads = removeThread(threads, 'comeback');
    }
  }

  // --- Shootout ---
  const combinedScore = state.homeScore + state.awayScore;
  const isThirdOrEarlier =
    state.quarter === 1 || state.quarter === 2 || state.quarter === 3;
  if (combinedScore > 50 && isThirdOrEarlier) {
    threads = upsertThread(
      threads,
      'shootout',
      `A shootout is underway - ${state.homeScore}-${state.awayScore} combined ${combinedScore} points`,
      [],
      eventNumber,
      50 + Math.min(combinedScore - 50, 30)
    );
  } else {
    // Expire if it no longer qualifies (moved past 3rd quarter).
    if (!isThirdOrEarlier) {
      const existing = findThread(threads, 'shootout');
      if (existing) {
        // Let it persist but don't boost; it will be pruned naturally
        // if higher-priority threads emerge.
      }
    }
  }

  // --- Defensive Battle ---
  if (combinedScore < 14 && state.quarter === 4) {
    threads = upsertThread(
      threads,
      'defensive_battle',
      `A defensive slugfest - only ${combinedScore} combined points heading into the 4th`,
      [],
      eventNumber,
      55
    );
  }

  // --- Record Chase ---
  // Estimate pace based on plays elapsed vs typical game length (~140 plays).
  // We use eventNumber as a proxy for plays elapsed.
  if (play.passer && eventNumber > 0) {
    // Check passing yards pace: extrapolate to full game.
    // We don't have cumulative stats here, so we track pace indirectly.
    // A QB who has thrown for a lot already by the halfway mark is noteworthy.
    // Since we don't have per-player stats accumulator, we detect this by
    // looking at individual big passing plays as signals.
    if (
      play.type === 'pass_complete' &&
      play.yardsGained >= 40
    ) {
      threads = upsertThread(
        threads,
        'record_chase',
        `${play.passer.name} is putting on an aerial show - ${play.yardsGained}-yard strike`,
        [play.passer, ...(play.receiver ? [play.receiver] : [])],
        eventNumber,
        45
      );
    }
  }

  if (play.rusher && play.yardsGained >= 30) {
    threads = upsertThread(
      threads,
      'record_chase',
      `${play.rusher.name} is having a monster game on the ground - ${play.yardsGained}-yard burst`,
      [play.rusher],
      eventNumber,
      45
    );
  }

  // --- Prune to max threads ---
  threads = pruneThreads(threads);

  return threads;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Create the initial empty story state. */
export function createStoryState(): StoryState {
  return {
    threads: [],
    playerStreaks: new Map(),
    consecutiveThreeAndOuts: { home: 0, away: 0 },
    leadChanges: 0,
    largestLead: { team: 'home', points: 0 },
    scoringDrought: { home: 0, away: 0 },
  };
}

/**
 * Update the story state after a play. Detects new narrative threads,
 * expires stale ones, and maintains all running tallies.
 *
 * Returns a new StoryState (immutable update pattern).
 */
export function updateStoryState(
  storyState: StoryState,
  play: PlayResult,
  state: GameState,
  eventNumber: number
): StoryState {
  // --- 1. Update streaks ---
  const { streaks, hotStreak, coldStreak } = updateStreaks(
    storyState.playerStreaks,
    play
  );

  // --- 2. Update three-and-out counts ---
  // A punt is our proxy for a three-and-out (possession stalled).
  let threeAndOuts = { ...storyState.consecutiveThreeAndOuts };
  if (play.type === 'punt') {
    // The punting team had a three-and-out. Possession at this point
    // is still the punting team before the change of possession.
    if (state.possession === 'home') {
      threeAndOuts = {
        ...threeAndOuts,
        home: threeAndOuts.home + 1,
      };
    } else {
      threeAndOuts = {
        ...threeAndOuts,
        away: threeAndOuts.away + 1,
      };
    }
  }

  // --- 3. Track lead changes ---
  let leadChanges = storyState.leadChanges;
  const prevLeader = storyState.largestLead.points > 0
    ? storyState.largestLead.team
    : null;
  let currentLeader: 'home' | 'away' | null = null;
  if (state.homeScore > state.awayScore) currentLeader = 'home';
  else if (state.awayScore > state.homeScore) currentLeader = 'away';

  if (
    play.scoring &&
    prevLeader !== null &&
    currentLeader !== null &&
    prevLeader !== currentLeader
  ) {
    leadChanges++;
  }

  // --- 4. Track largest lead ---
  let largestLead = { ...storyState.largestLead };
  const currentDiff = Math.abs(state.homeScore - state.awayScore);
  if (currentDiff > largestLead.points && currentLeader !== null) {
    largestLead = { team: currentLeader, points: currentDiff };
  }

  // --- 5. Track scoring drought ---
  let scoringDrought = {
    home: storyState.scoringDrought.home + 1,
    away: storyState.scoringDrought.away + 1,
  };
  if (play.scoring) {
    if (play.scoring.team === 'home') {
      scoringDrought.home = 0;
    } else {
      scoringDrought.away = 0;
    }
  }

  // --- 6. Build intermediate story state for thread detection ---
  const intermediateState: StoryState = {
    threads: storyState.threads,
    playerStreaks: streaks,
    consecutiveThreeAndOuts: threeAndOuts,
    leadChanges,
    largestLead,
    scoringDrought,
  };

  // --- 7. Detect and update threads ---
  const threads = detectThreads(
    intermediateState,
    play,
    state,
    eventNumber,
    hotStreak,
    coldStreak
  );

  return {
    ...intermediateState,
    threads,
  };
}

/**
 * Get the currently active narrative threads, sorted by intensity
 * (highest first).
 */
export function getActiveThreads(storyState: StoryState): NarrativeThread[] {
  return [...storyState.threads]
    .filter((t) => t.intensity >= MIN_INTENSITY)
    .sort((a, b) => b.intensity - a.intensity);
}
