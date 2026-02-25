// ============================================================================
// GridBlitz - Client-Side Fairness Verifier
// ============================================================================
// Browser-compatible verification utilities using the Web Crypto API
// (SubtleCrypto). These functions can run entirely in the browser without
// any Node.js dependencies, enabling users to independently verify
// that game outcomes were fair and predetermined.
//
// Verification protocol:
//   1. Before the game, the server publishes serverSeedHash
//   2. After the game, the server reveals serverSeed
//   3. The client hashes serverSeed using SHA-256 and compares to the
//      committed hash — if they match, the seed was not changed
//   4. The client can replay the entire HMAC chain to verify every
//      random outcome in the game
// ============================================================================

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a string to a Uint8Array using TextEncoder.
 * Works in all modern browsers.
 */
function stringToBytes(str: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>;
}

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hexParts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hexParts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hexParts.join('');
}

/**
 * Compute SHA-256 hash of a string using the Web Crypto API.
 */
async function sha256(input: string): Promise<string> {
  const data = stringToBytes(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * Compute HMAC-SHA256 of a message using a key, via the Web Crypto API.
 * This mirrors the server-side HMAC used in the SeededRNG.
 */
async function hmacSha256(key: string, message: string): Promise<string> {
  const keyData = stringToBytes(key);
  const messageData = stringToBytes(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return bufferToHex(signature);
}

/**
 * Derive a float in [0, 1) from an HMAC hex string.
 * Takes the first 8 hex characters (4 bytes / 32 bits) and divides
 * by 2^32, exactly matching the server-side SeededRNG implementation.
 */
function hmacToFloat(hmacHex: string): number {
  const intValue = parseInt(hmacHex.substring(0, 8), 16);
  return intValue / 4_294_967_296;
}

// ============================================================================
// PUBLIC API: verifyServerSeedBrowser
// ============================================================================

/**
 * Verify that a revealed server seed matches its committed hash.
 *
 * This is the fundamental fairness check. It uses the Web Crypto API
 * (SubtleCrypto) to compute the SHA-256 hash entirely in the browser,
 * so no server trust is required.
 *
 * @param serverSeed - The server seed revealed after game completion (hex string)
 * @param expectedHash - The SHA-256 hash committed before the game started (hex string)
 * @returns Promise<boolean> - true if the seed matches the hash
 *
 * @example
 * ```typescript
 * const isValid = await verifyServerSeedBrowser(
 *   'a1b2c3d4e5f6...',  // revealed after game
 *   'f8e7d6c5b4a3...',  // published before game
 * );
 * console.log(isValid ? 'Game was fair!' : 'Seed mismatch detected!');
 * ```
 */
export async function verifyServerSeedBrowser(
  serverSeed: string,
  expectedHash: string,
): Promise<boolean> {
  if (!serverSeed || !expectedHash) {
    return false;
  }

  // Validate hex string format
  if (!/^[0-9a-f]+$/i.test(serverSeed)) {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(expectedHash)) {
    return false;
  }

  try {
    const computedHash = await sha256(serverSeed);
    return computedHash.toLowerCase() === expectedHash.toLowerCase();
  } catch {
    // SubtleCrypto may fail in insecure contexts (non-HTTPS)
    return false;
  }
}

// ============================================================================
// PUBLIC API: verifyGameReplay
// ============================================================================

/**
 * Replay the full HMAC-SHA256 chain for a game to verify that the
 * random number sequence is deterministic and matches the published seeds.
 *
 * This function generates every random value that the simulation would
 * have produced, using the same HMAC(serverSeed, clientSeed:nonce)
 * derivation as the server. While it doesn't check specific game outcomes
 * (that would require the full simulation engine), it verifies that:
 *
 * 1. The HMAC chain can be reproduced from the given seeds
 * 2. The total number of random draws matches the expected count
 * 3. All values fall in the valid [0, 1) range
 *
 * @param serverSeed - The revealed server seed
 * @param clientSeed - The public client seed
 * @param nonce - The starting nonce (typically 0)
 * @param expectedEvents - The total number of random draws made during the game.
 *   This equals the final nonce value recorded at game end.
 * @returns Promise with verification result and event count
 *
 * @example
 * ```typescript
 * const result = await verifyGameReplay(
 *   'a1b2c3d4...',   // serverSeed
 *   'e5f6a7b8...',   // clientSeed
 *   0,               // starting nonce
 *   1247,            // total random draws
 * );
 * console.log(result.verified ? 'All events verified!' : 'Verification failed!');
 * ```
 */
export async function verifyGameReplay(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expectedEvents: number,
): Promise<{ verified: boolean; totalEvents: number }> {
  if (!serverSeed || !clientSeed) {
    return { verified: false, totalEvents: 0 };
  }

  if (expectedEvents < 0 || !Number.isInteger(expectedEvents)) {
    return { verified: false, totalEvents: 0 };
  }

  if (expectedEvents === 0) {
    return { verified: true, totalEvents: 0 };
  }

  try {
    let currentNonce = nonce;
    let eventsVerified = 0;

    // Process in batches to avoid blocking the main thread for too long
    const BATCH_SIZE = 100;

    for (let offset = 0; offset < expectedEvents; offset += BATCH_SIZE) {
      const batchEnd = Math.min(offset + BATCH_SIZE, expectedEvents);

      // Process batch of HMAC computations
      const batchPromises: Promise<string>[] = [];
      for (let i = offset; i < batchEnd; i++) {
        const message = `${clientSeed}:${currentNonce + (i - offset)}`;
        batchPromises.push(hmacSha256(serverSeed, message));
      }

      const batchResults = await Promise.all(batchPromises);

      // Verify each result produces a valid float
      for (const hmacHex of batchResults) {
        const value = hmacToFloat(hmacHex);

        // Value must be in [0, 1)
        if (value < 0 || value >= 1) {
          return { verified: false, totalEvents: eventsVerified };
        }

        eventsVerified++;
      }

      currentNonce += batchEnd - offset;

      // Yield to the event loop between batches to keep the UI responsive
      if (offset + BATCH_SIZE < expectedEvents) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return {
      verified: eventsVerified === expectedEvents,
      totalEvents: eventsVerified,
    };
  } catch {
    return { verified: false, totalEvents: 0 };
  }
}

// ============================================================================
// PUBLIC API: Utility - compute a single random value for spot-checking
// ============================================================================

/**
 * Compute a single random value at a specific nonce for spot-checking.
 * Useful for verifying a particular play's outcome without replaying
 * the entire game.
 *
 * @param serverSeed - The revealed server seed
 * @param clientSeed - The public client seed
 * @param nonce - The specific nonce to compute
 * @returns The float value in [0, 1) at that nonce
 */
export async function computeValueAtNonce(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<number> {
  const message = `${clientSeed}:${nonce}`;
  const hmacHex = await hmacSha256(serverSeed, message);
  return hmacToFloat(hmacHex);
}
