import { describe, it, expect } from 'vitest';
import {
  verifyServerSeedBrowser,
  verifyGameReplay,
  computeValueAtNonce,
} from '@/lib/fairness/verifier';
import {
  hashServerSeed,
  createSeededRNG,
} from '@/lib/simulation/rng';

// ---------------------------------------------------------------------------
// Fixed test seeds
// ---------------------------------------------------------------------------

const SERVER_SEED = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
const CLIENT_SEED = 'test-client-seed-12345';

describe('Fairness Verifier', () => {
  // -----------------------------------------------------------------------
  // 1. Server seed hashing and verification
  // -----------------------------------------------------------------------
  describe('seed hashing and verification', () => {
    it('verifies a correct server seed against its hash', async () => {
      const hash = hashServerSeed(SERVER_SEED);
      const isValid = await verifyServerSeedBrowser(SERVER_SEED, hash);
      expect(isValid).toBe(true);
    });

    it('rejects an incorrect server seed', async () => {
      const hash = hashServerSeed(SERVER_SEED);
      const isValid = await verifyServerSeedBrowser('wrong-seed-ffffffff', hash);
      expect(isValid).toBe(false);
    });

    it('rejects when hash is wrong', async () => {
      const wrongHash = 'ff'.repeat(32); // 64 hex chars
      const isValid = await verifyServerSeedBrowser(SERVER_SEED, wrongHash);
      expect(isValid).toBe(false);
    });

    it('returns false for empty seed', async () => {
      const hash = hashServerSeed(SERVER_SEED);
      const isValid = await verifyServerSeedBrowser('', hash);
      expect(isValid).toBe(false);
    });

    it('returns false for empty hash', async () => {
      const isValid = await verifyServerSeedBrowser(SERVER_SEED, '');
      expect(isValid).toBe(false);
    });

    it('returns false for non-hex seed', async () => {
      const hash = hashServerSeed(SERVER_SEED);
      const isValid = await verifyServerSeedBrowser('not-valid-hex!@#$', hash);
      expect(isValid).toBe(false);
    });

    it('returns false for non-hex hash', async () => {
      const isValid = await verifyServerSeedBrowser(SERVER_SEED, 'zzzz-not-hex!');
      expect(isValid).toBe(false);
    });

    it('hash is case-insensitive', async () => {
      const hash = hashServerSeed(SERVER_SEED);
      const isValid = await verifyServerSeedBrowser(SERVER_SEED, hash.toUpperCase());
      expect(isValid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Game replay verification
  // -----------------------------------------------------------------------
  describe('game replay verification', () => {
    it('verifies a replay with the correct event count', async () => {
      const eventCount = 10;
      const result = await verifyGameReplay(SERVER_SEED, CLIENT_SEED, 0, eventCount);

      expect(result.verified).toBe(true);
      expect(result.totalEvents).toBe(eventCount);
    });

    it('verifies an empty game (0 events)', async () => {
      const result = await verifyGameReplay(SERVER_SEED, CLIENT_SEED, 0, 0);
      expect(result.verified).toBe(true);
      expect(result.totalEvents).toBe(0);
    });

    it('returns false for empty server seed', async () => {
      const result = await verifyGameReplay('', CLIENT_SEED, 0, 10);
      expect(result.verified).toBe(false);
    });

    it('returns false for empty client seed', async () => {
      const result = await verifyGameReplay(SERVER_SEED, '', 0, 10);
      expect(result.verified).toBe(false);
    });

    it('returns false for negative event count', async () => {
      const result = await verifyGameReplay(SERVER_SEED, CLIENT_SEED, 0, -5);
      expect(result.verified).toBe(false);
    });

    it('returns false for non-integer event count', async () => {
      const result = await verifyGameReplay(SERVER_SEED, CLIENT_SEED, 0, 5.5);
      expect(result.verified).toBe(false);
    });

    it('verifies a larger batch of events', async () => {
      const result = await verifyGameReplay(SERVER_SEED, CLIENT_SEED, 0, 200);
      expect(result.verified).toBe(true);
      expect(result.totalEvents).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Spot-check value at nonce
  // -----------------------------------------------------------------------
  describe('computeValueAtNonce', () => {
    it('produces a value in [0, 1)', async () => {
      const value = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, 0);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });

    it('produces the same value as the server-side RNG at the same nonce', async () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);
      const serverValue = rng.random();

      const browserValue = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, 0);

      // Both use the same HMAC(serverSeed, clientSeed:0) derivation
      expect(browserValue).toBeCloseTo(serverValue, 10);
    });

    it('different nonces produce different values', async () => {
      const v0 = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, 0);
      const v1 = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, 1);
      const v2 = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, 2);

      expect(v0).not.toBe(v1);
      expect(v1).not.toBe(v2);
    });

    it('matches server RNG values for several nonces', async () => {
      const rng = createSeededRNG(SERVER_SEED, CLIENT_SEED, 0);

      for (let nonce = 0; nonce < 10; nonce++) {
        const serverValue = rng.random();
        const browserValue = await computeValueAtNonce(SERVER_SEED, CLIENT_SEED, nonce);
        expect(browserValue).toBeCloseTo(serverValue, 10);
      }
    });
  });
});
