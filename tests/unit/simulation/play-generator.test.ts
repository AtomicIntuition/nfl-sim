import { describe, it, expect } from 'vitest';
import { resolvePlay } from '@/lib/simulation/play-generator';
import {
  createTestGameState,
  createTestRNG,
  createTestRoster,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const homeRoster = createTestRoster('team-home');
const awayRoster = createTestRoster('team-away');

function resolveMany(
  call: Parameters<typeof resolvePlay>[0],
  count: number,
  stateOverrides: Parameters<typeof createTestGameState>[0] = {},
) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const rng = createTestRNG(`play-gen-seed-${i}-aabbccdd00112233`);
    const state = createTestGameState(stateOverrides);
    results.push(resolvePlay(call, state, homeRoster, awayRoster, rng, 0));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Play Generator', () => {
  // -----------------------------------------------------------------------
  // 1. Run plays produce yards in a valid range
  // -----------------------------------------------------------------------
  describe('run plays', () => {
    it('produces yards within a valid range for run_inside', () => {
      const plays = resolveMany('run_inside', 200);

      for (const play of plays) {
        // Run yards should be between -5 (loss/safety) and 100 (maximum endzone)
        expect(play.yardsGained).toBeGreaterThanOrEqual(-5);
        expect(play.yardsGained).toBeLessThanOrEqual(100);
      }
    });

    it('produces yards within a valid range for run_outside', () => {
      const plays = resolveMany('run_outside', 200);

      for (const play of plays) {
        expect(play.yardsGained).toBeGreaterThanOrEqual(-5);
        expect(play.yardsGained).toBeLessThanOrEqual(100);
      }
    });

    it('average run yards are in a realistic range (2-8 yards)', () => {
      const plays = resolveMany('run_inside', 500);

      // Filter out touchdowns and turnovers which skew the average
      const normalPlays = plays.filter(
        p => !p.isTouchdown && !p.isSafety && !p.turnover,
      );

      const avgYards =
        normalPlays.reduce((sum, p) => sum + p.yardsGained, 0) / normalPlays.length;

      expect(avgYards).toBeGreaterThan(2);
      expect(avgYards).toBeLessThan(8);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Pass completion rates are reasonable
  // -----------------------------------------------------------------------
  describe('pass plays', () => {
    it('short passes have a reasonable completion rate (55-85%)', () => {
      const plays = resolveMany('pass_short', 500);

      const completions = plays.filter(p => p.type === 'pass_complete').length;
      // Exclude sacks from the denominator
      const nonSacks = plays.filter(p => p.type !== 'sack').length;
      const rate = completions / nonSacks;

      expect(rate).toBeGreaterThan(0.55);
      expect(rate).toBeLessThan(0.85);
    });

    it('deep passes have a lower completion rate than short passes', () => {
      const shortPlays = resolveMany('pass_short', 500);
      const deepPlays = resolveMany('pass_deep', 500);

      const shortCompletions = shortPlays.filter(p => p.type === 'pass_complete').length;
      const shortNonSacks = shortPlays.filter(p => p.type !== 'sack').length;
      const shortRate = shortCompletions / shortNonSacks;

      const deepCompletions = deepPlays.filter(p => p.type === 'pass_complete').length;
      const deepNonSacks = deepPlays.filter(p => p.type !== 'sack').length;
      const deepRate = deepCompletions / deepNonSacks;

      expect(deepRate).toBeLessThan(shortRate);
    });

    it('incomplete passes gain 0 yards', () => {
      const plays = resolveMany('pass_short', 300);
      const incompletes = plays.filter(p => p.type === 'pass_incomplete');

      for (const play of incompletes) {
        expect(play.yardsGained).toBe(0);
      }
    });

    it('completed passes set the passer and receiver fields', () => {
      const plays = resolveMany('pass_short', 300);
      const completions = plays.filter(p => p.type === 'pass_complete');

      for (const play of completions) {
        expect(play.passer).not.toBeNull();
        expect(play.receiver).not.toBeNull();
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. Big play frequency over many plays
  // -----------------------------------------------------------------------
  describe('big play frequency', () => {
    it('big plays (20+ yards) occur at a realistic frequency (2-12%)', () => {
      const allPlays = [
        ...resolveMany('run_inside', 300),
        ...resolveMany('pass_short', 300),
        ...resolveMany('pass_medium', 200),
        ...resolveMany('pass_deep', 200),
      ];

      const bigPlays = allPlays.filter(
        p => p.yardsGained >= 20 && !p.turnover,
      );

      const rate = bigPlays.length / allPlays.length;

      // NFL average big play rate is ~5%, allow 2-12% range
      // for statistical variation across 1000 plays
      expect(rate).toBeGreaterThan(0.02);
      expect(rate).toBeLessThan(0.12);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Play result type matches the call
  // -----------------------------------------------------------------------
  describe('play result types', () => {
    it('run calls produce run, sack, or scoring types', () => {
      const plays = resolveMany('run_inside', 200);

      for (const play of plays) {
        const validTypes = ['run', 'sack', 'scramble', 'touchback'];
        // If there is a turnover with a TD, the type may still be 'run'
        expect(
          validTypes.includes(play.type) || play.isTouchdown || play.isSafety || play.turnover !== null,
        ).toBe(true);
      }
    });

    it('pass calls produce pass_complete, pass_incomplete, sack, or scoring types', () => {
      const plays = resolveMany('pass_short', 200);

      for (const play of plays) {
        const validTypes = ['pass_complete', 'pass_incomplete', 'sack', 'scramble'];
        expect(
          validTypes.includes(play.type) || play.isTouchdown || play.isSafety || play.turnover !== null,
        ).toBe(true);
      }
    });
  });
});
