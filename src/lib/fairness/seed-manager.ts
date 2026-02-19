// ============================================================================
// GridIron Live - Provably Fair Seed Manager
// ============================================================================
// Server-side seed management for game integrity.
// Implements the commit-reveal scheme:
//   1. Before game: publish serverSeedHash (SHA-256 of serverSeed)
//   2. During game: use serverSeed + clientSeed + nonce for all RNG
//   3. After game: reveal serverSeed so anyone can verify
// ============================================================================

import {
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  verifyServerSeed,
} from '../simulation/rng';

// ============================================================================
// TYPES
// ============================================================================

export interface GameSeeds {
  /** The secret server seed (32 bytes hex). Only revealed after game completes. */
  serverSeed: string;
  /** The public client seed (16 bytes hex). Known before game starts. */
  clientSeed: string;
  /** SHA-256 hash of the server seed. Published before game starts as a commitment. */
  serverSeedHash: string;
  /** Starting nonce value. Increments with each random draw during simulation. */
  nonce: number;
}

// ============================================================================
// PUBLIC API: generateGameSeeds
// ============================================================================

/**
 * Generate fresh cryptographically secure seeds for a new game.
 *
 * The server seed is generated using crypto.randomBytes (32 bytes)
 * and its SHA-256 hash is precomputed for the commit phase.
 *
 * The client seed is independently generated (16 bytes) and can
 * optionally be replaced by a user-provided seed before simulation.
 *
 * @returns A complete GameSeeds object ready for simulation
 */
export function generateGameSeeds(): GameSeeds {
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const serverSeedHash = hashServerSeed(serverSeed);

  return {
    serverSeed,
    clientSeed,
    serverSeedHash,
    nonce: 0,
  };
}

// ============================================================================
// PUBLIC API: getPublicSeeds
// ============================================================================

/**
 * Prepare seeds for public display before and during a game.
 * Returns only the hash (commitment) and client seed -- the actual
 * server seed is NEVER exposed until the game is complete.
 *
 * This is what gets published in the UI and stored in the game record
 * before simulation begins.
 *
 * @param seeds - The full GameSeeds object
 * @returns Public-safe subset: hash, client seed, and nonce
 */
export function getPublicSeeds(
  seeds: GameSeeds,
): { serverSeedHash: string; clientSeed: string; nonce: number } {
  return {
    serverSeedHash: seeds.serverSeedHash,
    clientSeed: seeds.clientSeed,
    nonce: seeds.nonce,
  };
}

// ============================================================================
// PUBLIC API: revealSeeds
// ============================================================================

/**
 * Reveal the full seed set after a game has completed.
 * This allows anyone to independently verify every random outcome
 * in the simulation by replaying the HMAC-SHA256 chain.
 *
 * Should only be called AFTER the game simulation is finished and
 * all events have been broadcast.
 *
 * @param seeds - The full GameSeeds object
 * @returns The complete GameSeeds (including serverSeed) for public disclosure
 */
export function revealSeeds(seeds: GameSeeds): GameSeeds {
  // Return a copy to prevent mutation of the original
  return {
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    serverSeedHash: seeds.serverSeedHash,
    nonce: seeds.nonce,
  };
}

// ============================================================================
// PUBLIC API: verifyGame
// ============================================================================

/**
 * Verify that a revealed server seed matches the hash that was
 * committed before the game started.
 *
 * This is the core fairness check: if the hash matches, the server
 * could not have changed the seed after seeing the client seed,
 * which means all random outcomes were predetermined.
 *
 * @param serverSeed - The revealed server seed (hex string)
 * @param serverSeedHash - The hash that was committed before the game
 * @returns true if the seed produces the given hash
 */
export function verifyGame(
  serverSeed: string,
  serverSeedHash: string,
): boolean {
  if (!serverSeed || !serverSeedHash) {
    return false;
  }

  // Validate that both inputs look like hex strings
  if (!/^[0-9a-f]+$/i.test(serverSeed)) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(serverSeedHash)) {
    return false;
  }

  return verifyServerSeed(serverSeed, serverSeedHash);
}
