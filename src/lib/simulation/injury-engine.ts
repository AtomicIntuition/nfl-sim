// ============================================================================
// GridIron Live - Injury Engine
// ============================================================================
// Handles in-game injury generation. Injuries add drama and realism
// but are capped to avoid dominating the simulation.
// ============================================================================

import type { GameState, PlayResult, InjuryResult, InjurySeverity, Player, SeededRNG } from './types';
import { INJURY_RATE_PER_PLAY, MAX_INJURIES_PER_GAME, POSITION_INJURY_WEIGHTS } from './constants';

// ============================================================================
// INJURY DESCRIPTIONS
// ============================================================================
// ~20 common NFL in-game injuries. Each entry is a human-readable string
// that can be assigned to any player regardless of position.
// ============================================================================

const INJURY_DESCRIPTIONS: readonly string[] = [
  'left knee strain',
  'right knee strain',
  'left ankle sprain',
  'right ankle sprain',
  'left hamstring tightness',
  'right hamstring tightness',
  'shoulder contusion',
  'right shoulder sprain',
  'left shoulder sprain',
  'concussion protocol',
  'lower back tightness',
  'left calf strain',
  'right calf strain',
  'rib contusion',
  'left groin strain',
  'right groin strain',
  'neck stinger',
  'left quad contusion',
  'right quad contusion',
  'left wrist sprain',
  'right elbow hyperextension',
  'right foot sprain',
  'left foot sprain',
] as const;

// ============================================================================
// HIGH-IMPACT PLAY DETECTION
// ============================================================================
// Sacks, big hits (large negative or positive yardage), and turnovers
// carry a 1.5x injury multiplier because they involve harder collisions.
// ============================================================================

/** Play types that represent high-impact collisions */
const HIGH_IMPACT_PLAY_TYPES: ReadonlySet<string> = new Set([
  'sack',
  'run',
  'scramble',
]);

/**
 * Returns true if the play involves a high-impact collision scenario.
 * Sacks always count. Runs and scrambles count when yardage is large
 * (big hit on a ball carrier) or strongly negative (tackled for big loss).
 */
function isHighImpactPlay(play: PlayResult): boolean {
  if (play.type === 'sack') return true;
  if (HIGH_IMPACT_PLAY_TYPES.has(play.type) && Math.abs(play.yardsGained) >= 10) return true;
  if (play.turnover !== null) return true;
  return false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Track injuries during a game */
export interface InjuryTracker {
  injuries: InjuryResult[];
  injuredPlayerIds: Set<string>;
}

/** Create a fresh injury tracker */
export function createInjuryTracker(): InjuryTracker {
  return {
    injuries: [],
    injuredPlayerIds: new Set<string>(),
  };
}

/**
 * Check if an injury occurs on this play.
 *
 * Logic:
 * 1. Check the per-game cap (MAX_INJURIES_PER_GAME).
 * 2. Roll against INJURY_RATE_PER_PLAY (0.3%), with a 1.5x multiplier
 *    for high-impact plays (sacks, big hits, turnovers).
 * 3. Build a weighted candidate pool from both rosters, excluding
 *    already-injured players. Position weights come from POSITION_INJURY_WEIGHTS;
 *    injury-prone players receive a 2x multiplier on top of their position weight.
 * 4. If the roll succeeds and candidates exist, pick one and generate an injury.
 */
export function checkForInjury(
  play: PlayResult,
  state: GameState,
  offensePlayers: Player[],
  defensePlayers: Player[],
  tracker: InjuryTracker,
  rng: SeededRNG,
): InjuryResult | null {
  // Respect the per-game cap
  if (tracker.injuries.length >= MAX_INJURIES_PER_GAME) {
    return null;
  }

  // Determine effective injury probability for this play
  let injuryChance = INJURY_RATE_PER_PLAY;
  if (isHighImpactPlay(play)) {
    injuryChance *= 1.5;
  }

  // Roll the dice
  if (!rng.probability(injuryChance)) {
    return null;
  }

  // Build the candidate pool from both sides of the ball
  const allPlayers = [...offensePlayers, ...defensePlayers];
  const candidates = allPlayers.filter(
    (p) => !tracker.injuredPlayerIds.has(p.id),
  );

  if (candidates.length === 0) {
    return null;
  }

  // Build weighted options for player selection
  const weightedCandidates = candidates.map((player) => {
    const positionWeight = POSITION_INJURY_WEIGHTS[player.position] ?? 1.0;
    const injuryProneMultiplier = player.injuryProne ? 2.0 : 1.0;
    return {
      value: player,
      weight: positionWeight * injuryProneMultiplier,
    };
  });

  const selectedPlayer = rng.weightedChoice(weightedCandidates);
  const injury = generateInjury(selectedPlayer, rng);

  // Record the injury in the tracker
  tracker.injuries.push(injury);
  tracker.injuredPlayerIds.add(selectedPlayer.id);

  return injury;
}

/**
 * Generate an injury for a specific player.
 *
 * Severity distribution:
 *   - 70% chance "questionable" (may return)
 *   - 30% chance "out" (done for the game)
 *
 * Description is randomly selected from the INJURY_DESCRIPTIONS pool.
 */
export function generateInjury(
  player: Player,
  rng: SeededRNG,
): InjuryResult {
  // Determine severity: 70% questionable, 30% out
  const severity: InjurySeverity = rng.probability(0.70) ? 'questionable' : 'out';

  // Pick a random injury description
  const descriptionIndex = rng.randomInt(0, INJURY_DESCRIPTIONS.length - 1);
  const description = INJURY_DESCRIPTIONS[descriptionIndex];

  return {
    player,
    severity,
    description,
  };
}

/**
 * Get a list of available (non-injured) players for a team.
 * Filters out any player whose ID appears in the tracker's injured set.
 */
export function getAvailablePlayers(
  allPlayers: Player[],
  tracker: InjuryTracker,
): Player[] {
  return allPlayers.filter((p) => !tracker.injuredPlayerIds.has(p.id));
}
