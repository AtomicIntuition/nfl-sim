/**
 * GridBlitz - Provably Fair Seeded PRNG
 *
 * Deterministic pseudo-random number generator backed by HMAC-SHA256.
 * Given the same server seed, client seed, and starting nonce, the
 * generator will always produce the identical sequence of outputs.
 *
 * Provable fairness protocol:
 *   1. Before a simulation, the server commits to a server seed by
 *      publishing its SHA-256 hash.
 *   2. The client (or chain) supplies a client seed.
 *   3. Each random value is derived from:
 *        HMAC-SHA256(serverSeed, clientSeed + ':' + nonce)
 *   4. After the simulation, the server reveals the server seed.
 *      Anyone can recompute the HMAC chain and verify every outcome.
 */

import { createHmac, createHash, randomBytes } from 'crypto';
import type { SeededRNG, WeightedOption } from './types';

// ---------------------------------------------------------------------------
// Core RNG factory
// ---------------------------------------------------------------------------

/**
 * Creates a new seeded PRNG instance.
 *
 * @param serverSeed  - Secret seed held by the server (revealed after sim)
 * @param clientSeed  - Public seed contributed by the client
 * @param startNonce  - Starting nonce value (default 0)
 * @returns A SeededRNG instance
 */
export function createSeededRNG(
  serverSeed: string,
  clientSeed: string,
  startNonce: number = 0,
): SeededRNG {
  let nonce = startNonce;

  // -------------------------------------------------------------------
  // Internal: derive a float in [0, 1) from the HMAC output
  // -------------------------------------------------------------------
  function random(): number {
    const message = `${clientSeed}:${nonce}`;
    const hmac = createHmac('sha256', serverSeed).update(message).digest('hex');
    nonce++;

    // Take the first 8 hex characters (4 bytes / 32 bits) and convert
    // to a float in [0, 1).  2^32 = 4_294_967_296
    const intValue = parseInt(hmac.substring(0, 8), 16);
    return intValue / 4_294_967_296;
  }

  // -------------------------------------------------------------------
  // randomInt: integer in [min, max] (inclusive)
  // -------------------------------------------------------------------
  function randomInt(min: number, max: number): number {
    const range = max - min + 1;
    return Math.floor(random() * range) + min;
  }

  // -------------------------------------------------------------------
  // randomFloat: float in [min, max)
  // -------------------------------------------------------------------
  function randomFloat(min: number, max: number): number {
    return random() * (max - min) + min;
  }

  // -------------------------------------------------------------------
  // weightedChoice: cumulative-distribution selection
  // -------------------------------------------------------------------
  function weightedChoice<T>(options: WeightedOption<T>[]): T {
    if (options.length === 0) {
      throw new Error('weightedChoice requires at least one option');
    }

    const totalWeight = options.reduce((sum, opt) => sum + opt.weight, 0);

    if (totalWeight <= 0) {
      throw new Error('Total weight must be greater than zero');
    }

    const roll = random() * totalWeight;

    let cumulative = 0;
    for (const option of options) {
      cumulative += option.weight;
      if (roll < cumulative) {
        return option.value;
      }
    }

    // Floating-point edge case: return the last option
    return options[options.length - 1].value;
  }

  // -------------------------------------------------------------------
  // probability: returns true with probability p in [0, 1]
  // -------------------------------------------------------------------
  function probability(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return random() < p;
  }

  // -------------------------------------------------------------------
  // shuffle: Fisher-Yates (Knuth) shuffle — returns a new array
  // -------------------------------------------------------------------
  function shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  // -------------------------------------------------------------------
  // gaussian: Box-Muller transform with optional clamping
  // -------------------------------------------------------------------
  function gaussian(
    mean: number,
    stdDev: number,
    min?: number,
    max?: number,
  ): number {
    // Box-Muller requires two uniform random values
    let u1 = random();
    let u2 = random();

    // Guard against u1 === 0 (log(0) is -Infinity)
    while (u1 === 0) {
      u1 = random();
    }

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    let value = z0 * stdDev + mean;

    // Optional clamping
    if (min !== undefined && value < min) {
      value = min;
    }
    if (max !== undefined && value > max) {
      value = max;
    }

    return value;
  }

  // -------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------
  function getSeed(): string {
    return serverSeed;
  }

  function getNonce(): number {
    return nonce;
  }

  return {
    random,
    randomInt,
    randomFloat,
    weightedChoice,
    probability,
    shuffle,
    gaussian,
    getSeed,
    getNonce,
  };
}

// ---------------------------------------------------------------------------
// Utility functions for the provably-fair protocol
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure server seed (32 bytes, hex-encoded).
 */
export function generateServerSeed(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a cryptographically secure client seed (16 bytes, hex-encoded).
 */
export function generateClientSeed(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Compute the SHA-256 hash of a server seed.
 * This hash is published before the simulation so the server cannot
 * change the seed after the fact.
 */
export function hashServerSeed(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * Verify that a revealed server seed matches a previously committed hash.
 *
 * @param seed - The revealed server seed
 * @param hash - The hash that was committed before the simulation
 * @returns true if the seed produces the given hash
 */
export function verifyServerSeed(seed: string, hash: string): boolean {
  return hashServerSeed(seed) === hash;
}
