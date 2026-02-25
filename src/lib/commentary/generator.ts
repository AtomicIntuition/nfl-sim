// ============================================================================
// GridBlitz - Commentary Generator
// ============================================================================
// Claude API integration for generating broadcast-quality commentary.
// Falls back to deterministic templates when the API is unavailable.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  PlayResult,
  GameState,
  PlayCommentary,
  NarrativeSnapshot,
  CrowdReaction,
} from '../simulation/types';
import { buildSystemPrompt, buildBatchPrompt, buildPlayPrompt } from './prompt-builder';
import { getTemplate, fillTemplate, buildTemplateVars } from './templates';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Claude model to use for commentary (Sonnet for cost efficiency). */
const COMMENTARY_MODEL = 'claude-sonnet-4-20250514';

/** Maximum plays per batch request. */
const MAX_BATCH_SIZE = 15;

/** Temperature for creative commentary output. */
const TEMPERATURE = 0.8;

/** Maximum tokens for a batch response. */
const MAX_TOKENS_BATCH = 4096;

/** Maximum tokens for a single-play response. */
const MAX_TOKENS_SINGLE = 1024;

/** Rate limiting: max requests per minute. */
const MAX_REQUESTS_PER_MINUTE = 10;

/** Rate limiting: minimum ms between requests. */
const MIN_REQUEST_INTERVAL_MS = Math.ceil(60_000 / MAX_REQUESTS_PER_MINUTE);

// ============================================================================
// RATE LIMITER
// ============================================================================

/** Tracks timestamps of recent API calls for rate limiting. */
const requestTimestamps: number[] = [];

/**
 * Wait if necessary to respect the rate limit before making an API call.
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  // Prune timestamps older than one minute
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    // Need to wait until the oldest request in the window expires
    const waitUntil = requestTimestamps[0] + 60_000;
    const waitMs = waitUntil - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // Also enforce minimum interval between consecutive requests
  if (requestTimestamps.length > 0) {
    const lastRequest = requestTimestamps[requestTimestamps.length - 1];
    const elapsed = now - lastRequest;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
      );
    }
  }

  requestTimestamps.push(Date.now());
}

// ============================================================================
// ANTHROPIC CLIENT (lazy-initialized)
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;

  // Only initialize if the API key is available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

const VALID_CROWD_REACTIONS = new Set<CrowdReaction>([
  'roar', 'cheer', 'groan', 'gasp', 'silence', 'murmur', 'boo', 'chant',
]);

interface RawCommentaryResponse {
  playByPlay: string;
  colorAnalysis: string;
  crowdReaction: string;
  excitement: number;
}

/**
 * Parse and validate the Claude API response into PlayCommentary objects.
 */
function parseCommentaryResponse(
  responseText: string,
  expectedCount: number,
): PlayCommentary[] | null {
  try {
    // Strip markdown fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed: RawCommentaryResponse[] = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== expectedCount) return null;

    return parsed.map((item) => ({
      playByPlay: typeof item.playByPlay === 'string' ? item.playByPlay : '',
      colorAnalysis: typeof item.colorAnalysis === 'string' ? item.colorAnalysis : '',
      crowdReaction: VALID_CROWD_REACTIONS.has(item.crowdReaction as CrowdReaction)
        ? (item.crowdReaction as CrowdReaction)
        : 'murmur',
      excitement: typeof item.excitement === 'number'
        ? Math.max(0, Math.min(100, Math.round(item.excitement)))
        : 50,
    }));
  } catch {
    return null;
  }
}

// ============================================================================
// TEMPLATE-BASED FALLBACK
// ============================================================================

/** Simple deterministic RNG for template selection when no SeededRNG is available. */
function createSimpleRng(seed: number): { randomInt: (min: number, max: number) => number } {
  let state = seed;
  return {
    randomInt(min: number, max: number): number {
      // xorshift32
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      const normalized = ((state >>> 0) % (max - min + 1));
      return min + normalized;
    },
  };
}

/**
 * Generate commentary for a single play using templates only.
 * Deterministic and instant -- the reliable fallback path.
 */
export function generateTemplateCommentary(
  play: PlayResult,
  state: GameState,
  excitement: number,
): PlayCommentary {
  // Derive a seed from game state for deterministic template selection
  const seed =
    state.clock * 1000 +
    state.homeScore * 100 +
    state.awayScore * 10 +
    state.down +
    state.ballPosition;
  const rng = createSimpleRng(seed);

  const template = getTemplate(play, state, excitement, rng);
  const vars = buildTemplateVars(play, state);
  const filled = fillTemplate(template, vars);

  return {
    playByPlay: filled.playByPlay,
    colorAnalysis: filled.colorAnalysis,
    crowdReaction: filled.crowdReaction,
    excitement: Math.max(0, Math.min(100, Math.round(excitement))),
  };
}

// ============================================================================
// PUBLIC API: generateCommentaryBatch
// ============================================================================

/**
 * Generate commentary for a batch of plays using the Claude API.
 * Automatically splits into sub-batches of MAX_BATCH_SIZE if needed.
 * Falls back to templates if the API is unavailable or returns errors.
 */
export async function generateCommentaryBatch(
  plays: Array<{
    play: PlayResult;
    state: GameState;
    narrative: NarrativeSnapshot;
    excitement: number;
  }>,
  homeTeam: { name: string; abbreviation: string },
  awayTeam: { name: string; abbreviation: string },
): Promise<PlayCommentary[]> {
  if (plays.length === 0) return [];

  const client = getClient();

  // If no API client, fall back to templates for all plays
  if (!client) {
    return plays.map(({ play, state, excitement }) =>
      generateTemplateCommentary(play, state, excitement),
    );
  }

  // Split into sub-batches
  const results: PlayCommentary[] = [];
  const systemPrompt = buildSystemPrompt();

  for (let offset = 0; offset < plays.length; offset += MAX_BATCH_SIZE) {
    const batch = plays.slice(offset, offset + MAX_BATCH_SIZE);

    try {
      await waitForRateLimit();

      const userPrompt = buildBatchPrompt(batch, homeTeam, awayTeam);

      const response = await client.messages.create({
        model: COMMENTARY_MODEL,
        max_tokens: MAX_TOKENS_BATCH,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract text from the response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in API response');
      }

      const parsed = parseCommentaryResponse(textBlock.text, batch.length);

      if (parsed) {
        results.push(...parsed);
      } else {
        // Parse failed — fall back to templates for this batch
        console.warn(
          `[Commentary] Failed to parse API response for batch at offset ${offset}. Falling back to templates.`,
        );
        results.push(
          ...batch.map(({ play, state, excitement }) =>
            generateTemplateCommentary(play, state, excitement),
          ),
        );
      }
    } catch (error) {
      // API error — fall back to templates for this batch
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Commentary] API error for batch at offset ${offset}: ${errorMessage}. Falling back to templates.`,
      );
      results.push(
        ...batch.map(({ play, state, excitement }) =>
          generateTemplateCommentary(play, state, excitement),
        ),
      );
    }
  }

  return results;
}

// ============================================================================
// PUBLIC API: generateCommentary (single play)
// ============================================================================

/**
 * Generate commentary for a single play using the Claude API.
 * Falls back to templates if the API is unavailable.
 */
export async function generateCommentary(
  play: PlayResult,
  state: GameState,
  narrative: NarrativeSnapshot,
  excitement: number,
  homeTeam: { name: string; abbreviation: string },
  awayTeam: { name: string; abbreviation: string },
): Promise<PlayCommentary> {
  const client = getClient();

  if (!client) {
    return generateTemplateCommentary(play, state, excitement);
  }

  try {
    await waitForRateLimit();

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildPlayPrompt(
      play,
      state,
      narrative,
      [], // No recent plays context for single-play calls
      excitement,
      homeTeam,
      awayTeam,
    );

    const response = await client.messages.create({
      model: COMMENTARY_MODEL,
      max_tokens: MAX_TOKENS_SINGLE,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in API response');
    }

    const parsed = parseCommentaryResponse(textBlock.text, 1);

    if (parsed && parsed.length === 1) {
      return parsed[0];
    }

    console.warn('[Commentary] Failed to parse single-play API response. Falling back to templates.');
    return generateTemplateCommentary(play, state, excitement);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Commentary] API error for single play: ${errorMessage}. Falling back to templates.`);
    return generateTemplateCommentary(play, state, excitement);
  }
}
