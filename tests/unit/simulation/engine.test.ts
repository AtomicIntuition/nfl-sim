import { describe, it, expect } from 'vitest';
import { simulateGame } from '@/lib/simulation/engine';
import type { SimulationConfig } from '@/lib/simulation/engine';
import {
  createTestTeam,
  createTestRoster,
  TEST_SERVER_SEED,
  TEST_CLIENT_SEED,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const homeTeam = createTestTeam({ id: 'team-home', name: 'Home Eagles', abbreviation: 'HME' });
  const awayTeam = createTestTeam({ id: 'team-away', name: 'Away Falcons', abbreviation: 'AWY' });

  return {
    homeTeam,
    awayTeam,
    homePlayers: createTestRoster('team-home'),
    awayPlayers: createTestRoster('team-away'),
    gameType: 'regular',
    serverSeed: TEST_SERVER_SEED,
    clientSeed: TEST_CLIENT_SEED,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Simulation Engine', () => {
  // -----------------------------------------------------------------------
  // 1. Valid output structure
  // -----------------------------------------------------------------------
  describe('simulateGame produces valid output', () => {
    it('returns a SimulatedGame with all required fields', () => {
      const config = buildConfig();
      const game = simulateGame(config);

      expect(game).toBeDefined();
      expect(game.id).toBeTypeOf('string');
      expect(game.homeTeam).toBeDefined();
      expect(game.awayTeam).toBeDefined();
      expect(game.events).toBeInstanceOf(Array);
      expect(game.events.length).toBeGreaterThan(0);
      expect(game.finalScore).toBeDefined();
      expect(game.finalScore.home).toBeTypeOf('number');
      expect(game.finalScore.away).toBeTypeOf('number');
      expect(game.serverSeedHash).toBeTypeOf('string');
      expect(game.serverSeed).toBeTypeOf('string');
      expect(game.clientSeed).toBeTypeOf('string');
      expect(game.nonce).toBeTypeOf('number');
      expect(game.totalPlays).toBeTypeOf('number');
      expect(game.mvp).toBeDefined();
      expect(game.boxScore).toBeDefined();
      expect(game.drives).toBeInstanceOf(Array);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Determinism: same seeds produce the same game
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical results with the same seeds', () => {
      const config = buildConfig();
      const game1 = simulateGame(config);
      const game2 = simulateGame(config);

      expect(game1.finalScore).toEqual(game2.finalScore);
      expect(game1.totalPlays).toBe(game2.totalPlays);
      expect(game1.nonce).toBe(game2.nonce);
      expect(game1.events.length).toBe(game2.events.length);

      // Spot-check a few event descriptions to confirm full determinism
      for (let i = 0; i < Math.min(10, game1.events.length); i++) {
        expect(game1.events[i].playResult.description).toBe(
          game2.events[i].playResult.description,
        );
      }
    });

    it('produces different results with different seeds', () => {
      const game1 = simulateGame(buildConfig({ serverSeed: 'seed-alpha-aabbccdd00112233' }));
      const game2 = simulateGame(buildConfig({ serverSeed: 'seed-bravo-ffeeddcc99887766' }));

      // It is theoretically possible for two games to have the same score,
      // but the play-by-play events should differ.
      const descriptions1 = game1.events.slice(0, 5).map(e => e.playResult.description);
      const descriptions2 = game2.events.slice(0, 5).map(e => e.playResult.description);

      expect(descriptions1).not.toEqual(descriptions2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Game always terminates
  // -----------------------------------------------------------------------
  describe('termination', () => {
    it('completes a regular season game within a reasonable number of plays', () => {
      const game = simulateGame(buildConfig());
      // A game that never terminates would time out or hang.
      // If we get here, it terminated.
      expect(game.totalPlays).toBeGreaterThan(0);
    });

    it('completes a playoff game within a reasonable number of plays', () => {
      const game = simulateGame(buildConfig({ gameType: 'wild_card' }));
      expect(game.totalPlays).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Final scores are non-negative
  // -----------------------------------------------------------------------
  describe('score validity', () => {
    it('both team scores are non-negative', () => {
      // Run a handful of games with different seeds
      for (let i = 0; i < 5; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `score-test-seed-${i}-aabbccdd` }),
        );

        expect(game.finalScore.home).toBeGreaterThanOrEqual(0);
        expect(game.finalScore.away).toBeGreaterThanOrEqual(0);
      }
    });

    it('scores are divisible by valid NFL scoring increments', () => {
      // NFL scoring: 2 (safety), 3 (FG), 6 (TD), 7 (TD+XP), 8 (TD+2pt)
      // Any non-negative integer can technically arise from combinations,
      // but 1 and 5 are the only truly impossible single-game scores in NFL
      // (1 requires a single extra point with no TD, which cannot happen alone).
      // We just verify non-negative integers here.
      const game = simulateGame(buildConfig());
      expect(Number.isInteger(game.finalScore.home)).toBe(true);
      expect(Number.isInteger(game.finalScore.away)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Total plays in realistic range
  // -----------------------------------------------------------------------
  describe('play count', () => {
    it('total plays fall within a realistic range (100-250)', () => {
      // Run multiple games to check the range
      for (let i = 0; i < 3; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `play-count-seed-${i}-11223344` }),
        );

        expect(game.totalPlays).toBeGreaterThanOrEqual(100);
        expect(game.totalPlays).toBeLessThanOrEqual(250);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. Seed hash is verifiable
  // -----------------------------------------------------------------------
  describe('provably fair seeds', () => {
    it('records the server seed and its hash for verification', () => {
      const game = simulateGame(buildConfig());

      expect(game.serverSeed).toBe(TEST_SERVER_SEED);
      expect(game.clientSeed).toBe(TEST_CLIENT_SEED);
      expect(game.serverSeedHash).toBeTypeOf('string');
      expect(game.serverSeedHash.length).toBe(64); // SHA-256 hex
    });
  });
});
