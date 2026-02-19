/**
 * GridIron Live - Shared Test Utilities
 *
 * Provides factory functions for creating test fixtures with sensible
 * defaults. All functions accept optional overrides so individual tests
 * can customize only the fields they care about.
 */

import type {
  Team,
  Player,
  GameState,
  PlayResult,
  SeededRNG,
} from '@/lib/simulation/types';
import { createSeededRNG } from '@/lib/simulation/rng';

// ---------------------------------------------------------------------------
// Fixed seeds for deterministic test runs
// ---------------------------------------------------------------------------

export const TEST_SERVER_SEED =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
export const TEST_CLIENT_SEED = 'test-client-seed-12345';

// ---------------------------------------------------------------------------
// createTestTeam
// ---------------------------------------------------------------------------

export function createTestTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-home',
    name: 'Test Eagles',
    abbreviation: 'TST',
    city: 'Testville',
    mascot: 'Eagles',
    conference: 'NFC',
    division: 'East',
    primaryColor: '#004C54',
    secondaryColor: '#A5ACAF',
    offenseRating: 85,
    defenseRating: 82,
    specialTeamsRating: 80,
    playStyle: 'balanced',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTestPlayer
// ---------------------------------------------------------------------------

let playerIdCounter = 0;

export function createTestPlayer(overrides: Partial<Player> = {}): Player {
  playerIdCounter++;
  return {
    id: `player-${playerIdCounter}`,
    teamId: 'team-home',
    name: `Test Player ${playerIdCounter}`,
    position: 'QB',
    number: playerIdCounter,
    rating: 82,
    speed: 78,
    strength: 76,
    awareness: 80,
    clutchRating: 78,
    injuryProne: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTestRoster - Full 11-position roster for simulation
// ---------------------------------------------------------------------------

export function createTestRoster(teamId: string): Player[] {
  return [
    createTestPlayer({ teamId, name: 'Joe Montana', position: 'QB', number: 16, rating: 92 }),
    createTestPlayer({ teamId, name: 'Barry Sanders', position: 'RB', number: 20, rating: 90 }),
    createTestPlayer({ teamId, name: 'Jerry Rice', position: 'WR', number: 80, rating: 94 }),
    createTestPlayer({ teamId, name: 'Calvin Johnson', position: 'WR', number: 81, rating: 88 }),
    createTestPlayer({ teamId, name: 'Tony Gonzalez', position: 'TE', number: 88, rating: 86 }),
    createTestPlayer({ teamId, name: 'Anthony Munoz', position: 'OL', number: 78, rating: 84 }),
    createTestPlayer({ teamId, name: 'Reggie White', position: 'DL', number: 92, rating: 90 }),
    createTestPlayer({ teamId, name: 'Lawrence Taylor', position: 'LB', number: 56, rating: 92 }),
    createTestPlayer({ teamId, name: 'Deion Sanders', position: 'CB', number: 21, rating: 91 }),
    createTestPlayer({ teamId, name: 'Ed Reed', position: 'S', number: 20, rating: 89 }),
    createTestPlayer({ teamId, name: 'Adam Vinatieri', position: 'K', number: 4, rating: 85 }),
    createTestPlayer({ teamId, name: 'Ray Guy', position: 'P', number: 8, rating: 82 }),
  ];
}

// ---------------------------------------------------------------------------
// createTestGameState
// ---------------------------------------------------------------------------

export function createTestGameState(overrides: Partial<GameState> = {}): GameState {
  const homeTeam = createTestTeam({ id: 'team-home', name: 'Home Eagles', abbreviation: 'HME' });
  const awayTeam = createTestTeam({ id: 'team-away', name: 'Away Falcons', abbreviation: 'AWY' });

  return {
    id: 'game-test-001',
    homeTeam,
    awayTeam,
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    clock: 900,
    playClock: 40,
    possession: 'home',
    down: 1,
    yardsToGo: 10,
    ballPosition: 25,
    homeTimeouts: 3,
    awayTimeouts: 3,
    isClockRunning: false,
    twoMinuteWarning: false,
    isHalftime: false,
    kickoff: false,
    patAttempt: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTestRNG
// ---------------------------------------------------------------------------

export function createTestRNG(
  seed: string = TEST_SERVER_SEED,
  clientSeed: string = TEST_CLIENT_SEED,
): SeededRNG {
  return createSeededRNG(seed, clientSeed);
}

// ---------------------------------------------------------------------------
// createTestPlayResult - a minimal PlayResult for testing downstream systems
// ---------------------------------------------------------------------------

export function createTestPlayResult(overrides: Partial<PlayResult> = {}): PlayResult {
  return {
    type: 'run',
    call: 'run_inside',
    description: 'Test run play for 5 yards.',
    yardsGained: 5,
    passer: null,
    rusher: null,
    receiver: null,
    defender: null,
    turnover: null,
    penalty: null,
    injury: null,
    scoring: null,
    clockElapsed: 30,
    isClockStopped: false,
    isFirstDown: false,
    isTouchdown: false,
    isSafety: false,
    ...overrides,
  };
}
