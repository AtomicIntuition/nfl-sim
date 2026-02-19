import { describe, it, expect } from 'vitest';
import {
  createSeededRNG,
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  verifyServerSeed,
} from '@/lib/simulation/rng';

// Fixed seeds for deterministic tests
const SERVER_SEED = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
const CLIENT_SEED = 'test-client-seed-12345';

describe('Seeded PRNG', () => {
  // -----------------------------------------------------------------------
  // 1. Determinism: same seeds produce the same sequence
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('produces the same sequence with identical seeds and nonce', () => {
      const rng1 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const rng2 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);

      const sequence1 = Array.from({ length: 100 }, () => rng1.random());
      const sequence2 = Array.from({ length: 100 }, () => rng2.random());

      expect(sequence1).toEqual(sequence2);
    });

    it('produces the same sequence when started from the same nonce offset', () => {
      const rng1 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 50);
      const rng2 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 50);

      const sequence1 = Array.from({ length: 20 }, () => rng1.random());
      const sequence2 = Array.from({ length: 20 }, () => rng2.random());

      expect(sequence1).toEqual(sequence2);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Different seeds produce different sequences
  // -----------------------------------------------------------------------
  describe('different seeds', () => {
    it('produces different sequences with different server seeds', () => {
      const rng1 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const rng2 = createSeededRNG('different-server-seed-ffffffff', CLIENT_SEED, 0);

      const sequence1 = Array.from({ length: 20 }, () => rng1.random());
      const sequence2 = Array.from({ length: 20 }, () => rng2.random());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('produces different sequences with different client seeds', () => {
      const rng1 = createSeededRNG(SERVER_SEED, 'client-seed-A', 0);
      const rng2 = createSeededRNG(SERVER_SEED, 'client-seed-B', 0);

      const sequence1 = Array.from({ length: 20 }, () => rng1.random());
      const sequence2 = Array.from({ length: 20 }, () => rng2.random());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('produces different sequences with different starting nonces', () => {
      const rng1 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const rng2 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 1);

      const val1 = rng1.random();
      const val2 = rng2.random();

      expect(val1).not.toEqual(val2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. randomInt produces values in the correct range
  // -----------------------------------------------------------------------
  describe('randomInt', () => {
    it('produces values within [min, max] inclusive', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const min = 1;
      const max = 6;

      for (let i = 0; i < 1000; i++) {
        const value = rng.randomInt(min, max);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('returns the only value when min equals max', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      for (let i = 0; i < 100; i++) {
        expect(rng.randomInt(5, 5)).toBe(5);
      }
    });

    it('covers all values in a small range', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const seen = new Set<number>();

      for (let i = 0; i < 1000; i++) {
        seen.add(rng.randomInt(1, 6));
      }

      expect(seen.size).toBe(6);
      for (let v = 1; v <= 6; v++) {
        expect(seen.has(v)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. probability(0) always false, probability(1) always true
  // -----------------------------------------------------------------------
  describe('probability', () => {
    it('returns false for probability 0', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      for (let i = 0; i < 1000; i++) {
        expect(rng.probability(0)).toBe(false);
      }
    });

    it('returns true for probability 1', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      for (let i = 0; i < 1000; i++) {
        expect(rng.probability(1)).toBe(true);
      }
    });

    it('returns roughly correct proportion for probability 0.5', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      let trueCount = 0;
      const trials = 10000;

      for (let i = 0; i < trials; i++) {
        if (rng.probability(0.5)) trueCount++;
      }

      const ratio = trueCount / trials;
      expect(ratio).toBeGreaterThan(0.45);
      expect(ratio).toBeLessThan(0.55);
    });
  });

  // -----------------------------------------------------------------------
  // 5. weightedChoice respects weights
  // -----------------------------------------------------------------------
  describe('weightedChoice', () => {
    it('heavily weighted option is chosen most often', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const options = [
        { value: 'rare', weight: 1 },
        { value: 'common', weight: 99 },
      ];

      const counts: Record<string, number> = { rare: 0, common: 0 };
      const trials = 10000;

      for (let i = 0; i < trials; i++) {
        const choice = rng.weightedChoice(options);
        counts[choice]++;
      }

      // 'common' has 99% weight — it should appear far more often
      expect(counts['common']).toBeGreaterThan(counts['rare'] * 10);
      // More specifically, common should be ~99% of trials
      expect(counts['common'] / trials).toBeGreaterThan(0.95);
    });

    it('single option is always chosen', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const options = [{ value: 'only', weight: 1 }];

      for (let i = 0; i < 100; i++) {
        expect(rng.weightedChoice(options)).toBe('only');
      }
    });

    it('throws on empty options array', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      expect(() => rng.weightedChoice([])).toThrow('at least one option');
    });

    it('equal weights produce roughly equal distribution', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const options = [
        { value: 'a', weight: 1 },
        { value: 'b', weight: 1 },
        { value: 'c', weight: 1 },
      ];

      const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
      const trials = 10000;

      for (let i = 0; i < trials; i++) {
        counts[rng.weightedChoice(options)]++;
      }

      // Each should be roughly 33%
      for (const key of ['a', 'b', 'c']) {
        expect(counts[key] / trials).toBeGreaterThan(0.28);
        expect(counts[key] / trials).toBeLessThan(0.38);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. gaussian produces values with approximately correct mean and stdDev
  // -----------------------------------------------------------------------
  describe('gaussian', () => {
    it('produces values with approximately correct mean and standard deviation', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const targetMean = 50;
      const targetStdDev = 10;
      const samples = 10000;

      const values: number[] = [];
      for (let i = 0; i < samples; i++) {
        values.push(rng.gaussian(targetMean, targetStdDev));
      }

      const actualMean = values.reduce((a, b) => a + b, 0) / samples;
      const variance =
        values.reduce((sum, v) => sum + (v - actualMean) ** 2, 0) / samples;
      const actualStdDev = Math.sqrt(variance);

      // Mean should be within 1 of target
      expect(Math.abs(actualMean - targetMean)).toBeLessThan(1);
      // StdDev should be within 1 of target
      expect(Math.abs(actualStdDev - targetStdDev)).toBeLessThan(1);
    });

    it('clamps values to min and max when provided', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const samples = 10000;

      for (let i = 0; i < samples; i++) {
        const value = rng.gaussian(50, 20, 30, 70);
        expect(value).toBeGreaterThanOrEqual(30);
        expect(value).toBeLessThanOrEqual(70);
      }
    });

    it('respects only min when max is not provided', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);

      for (let i = 0; i < 1000; i++) {
        const value = rng.gaussian(0, 5, -10);
        expect(value).toBeGreaterThanOrEqual(-10);
      }
    });

    it('respects only max when min is not provided', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);

      for (let i = 0; i < 1000; i++) {
        const value = rng.gaussian(0, 5, undefined, 10);
        expect(value).toBeLessThanOrEqual(10);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 7. shuffle preserves all elements (no loss)
  // -----------------------------------------------------------------------
  describe('shuffle', () => {
    it('preserves all elements', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = rng.shuffle(original);

      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.sort((a, b) => a - b)).toEqual(original);
    });

    it('does not mutate the original array', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      rng.shuffle(original);

      expect(original).toEqual(copy);
    });

    it('produces a deterministic shuffle', () => {
      const rng1 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const rng2 = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const array = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

      const shuffled1 = rng1.shuffle(array);
      const shuffled2 = rng2.shuffle(array);

      expect(shuffled1).toEqual(shuffled2);
    });

    it('handles empty array', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      expect(rng.shuffle([])).toEqual([]);
    });

    it('handles single-element array', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      expect(rng.shuffle([42])).toEqual([42]);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Server seed verification
  // -----------------------------------------------------------------------
  describe('server seed verification', () => {
    it('hash matches the original seed', () => {
      const seed = 'my-secret-server-seed-abc123';
      const hash = hashServerSeed(seed);

      expect(verifyServerSeed(seed, hash)).toBe(true);
    });

    it('different seed does not match the hash', () => {
      const seed = 'my-secret-server-seed-abc123';
      const hash = hashServerSeed(seed);

      expect(verifyServerSeed('different-seed', hash)).toBe(false);
    });

    it('generated server seed can be verified', () => {
      const seed = generateServerSeed();
      const hash = hashServerSeed(seed);

      expect(verifyServerSeed(seed, hash)).toBe(true);
    });

    it('generated server seed is 64 hex characters (32 bytes)', () => {
      const seed = generateServerSeed();
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generated client seed is 32 hex characters (16 bytes)', () => {
      const seed = generateClientSeed();
      expect(seed).toMatch(/^[0-9a-f]{32}$/);
    });

    it('hash is a 64-character hex string (SHA-256)', () => {
      const hash = hashServerSeed('any-seed');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Nonce increments correctly
  // -----------------------------------------------------------------------
  describe('nonce tracking', () => {
    it('starts at the provided start nonce', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 42);
      expect(rng.getNonce()).toBe(42);
    });

    it('defaults to nonce 0', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED);
      expect(rng.getNonce()).toBe(0);
    });

    it('increments by 1 for each random() call', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      expect(rng.getNonce()).toBe(0);

      rng.random();
      expect(rng.getNonce()).toBe(1);

      rng.random();
      expect(rng.getNonce()).toBe(2);

      rng.random();
      expect(rng.getNonce()).toBe(3);
    });

    it('increments by 1 for randomInt (which calls random once)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.randomInt(1, 10);
      expect(rng.getNonce()).toBe(1);
    });

    it('increments by 1 for randomFloat (which calls random once)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.randomFloat(0, 1);
      expect(rng.getNonce()).toBe(1);
    });

    it('increments by 1 for weightedChoice (which calls random once)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.weightedChoice([{ value: 'a', weight: 1 }]);
      expect(rng.getNonce()).toBe(1);
    });

    it('increments by 1 for probability with value between 0 and 1', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.probability(0.5);
      expect(rng.getNonce()).toBe(1);
    });

    it('does not increment for probability(0) or probability(1)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.probability(0);
      expect(rng.getNonce()).toBe(0);
      rng.probability(1);
      expect(rng.getNonce()).toBe(0);
    });

    it('increments by 2 for gaussian (Box-Muller uses two random values)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.gaussian(0, 1);
      expect(rng.getNonce()).toBe(2);
    });

    it('increments by (n-1) for shuffle of n elements', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      rng.shuffle([1, 2, 3, 4, 5]);
      // Fisher-Yates iterates from index 4 down to 1, that's 4 swaps = 4 random() calls
      expect(rng.getNonce()).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // Additional: random() output is in [0, 1)
  // -----------------------------------------------------------------------
  describe('random() range', () => {
    it('always returns values in [0, 1)', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      for (let i = 0; i < 10000; i++) {
        const value = rng.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Additional: getSeed returns the server seed
  // -----------------------------------------------------------------------
  describe('getSeed', () => {
    it('returns the server seed', () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      expect(rng.getSeed()).toBe(SERVER_SEED);
    });
  });
});
