import { describe, it, expect } from 'vitest';
import {
  advanceClock,
  checkTwoMinuteWarning,
  advanceQuarter,
} from '@/lib/simulation/clock-manager';
import {
  createTestGameState,
  createTestRNG,
  createTestPlayResult,
} from '../../helpers/test-utils';

describe('Clock Manager', () => {
  // -----------------------------------------------------------------------
  // 1. Clock never goes negative
  // -----------------------------------------------------------------------
  describe('clock never goes negative', () => {
    it('returns clock >= 0 after advancing on a run play', () => {
      const rng = createTestRNG();
      const state = createTestGameState({ clock: 30 });
      const play = createTestPlayResult({ type: 'run', clockElapsed: 0 });

      const update = advanceClock(state, play, rng);
      expect(update.clock).toBeGreaterThanOrEqual(0);
    });

    it('returns clock >= 0 when clock is at 1 second', () => {
      const rng = createTestRNG();
      const state = createTestGameState({ clock: 1 });
      const play = createTestPlayResult({ type: 'run', clockElapsed: 0 });

      const update = advanceClock(state, play, rng);
      expect(update.clock).toBeGreaterThanOrEqual(0);
    });

    it('returns clock >= 0 when clock is already at 0', () => {
      const rng = createTestRNG();
      const state = createTestGameState({ clock: 0 });
      const play = createTestPlayResult({ type: 'run', clockElapsed: 0 });

      const update = advanceClock(state, play, rng);
      expect(update.clock).toBeGreaterThanOrEqual(0);
    });

    it('never produces a negative clock over many random plays', () => {
      for (let i = 0; i < 100; i++) {
        const rng = createTestRNG(`clock-neg-${i}-aabbccdd11223344`);
        const clockValue = Math.floor(Math.random() * 900);
        const state = createTestGameState({ clock: clockValue });
        const play = createTestPlayResult({ clockElapsed: 0 });

        const update = advanceClock(state, play, rng);
        expect(update.clock).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Quarter transitions
  // -----------------------------------------------------------------------
  describe('quarter transitions', () => {
    it('transitions from Q1 to Q2', () => {
      const result = advanceQuarter(createTestGameState({ quarter: 1 }));
      expect(result.quarter).toBe(2);
      expect(result.clock).toBe(900);
      expect(result.isHalftime).toBe(false);
      expect(result.isGameOver).toBe(false);
    });

    it('transitions from Q2 to Q3 (halftime)', () => {
      const result = advanceQuarter(createTestGameState({ quarter: 2 }));
      expect(result.quarter).toBe(3);
      expect(result.clock).toBe(900);
      expect(result.isHalftime).toBe(true);
      expect(result.isGameOver).toBe(false);
    });

    it('transitions from Q3 to Q4', () => {
      const result = advanceQuarter(createTestGameState({ quarter: 3 }));
      expect(result.quarter).toBe(4);
      expect(result.clock).toBe(900);
      expect(result.isHalftime).toBe(false);
      expect(result.isGameOver).toBe(false);
    });

    it('ends the game at end of Q4 when scores differ', () => {
      const state = createTestGameState({
        quarter: 4,
        homeScore: 21,
        awayScore: 14,
      });
      const result = advanceQuarter(state);
      expect(result.isGameOver).toBe(true);
    });

    it('goes to overtime at end of Q4 when scores are tied', () => {
      const state = createTestGameState({
        quarter: 4,
        homeScore: 17,
        awayScore: 17,
      });
      const result = advanceQuarter(state);
      expect(result.quarter).toBe('OT');
      expect(result.isGameOver).toBe(false);
      expect(result.clock).toBe(600); // 10-minute OT period
    });

    it('ends the game at end of OT', () => {
      const state = createTestGameState({ quarter: 'OT' });
      const result = advanceQuarter(state);
      expect(result.isGameOver).toBe(true);
    });

    it('resets clock to 900 on quarter transition via advanceClock', () => {
      const rng = createTestRNG();
      const state = createTestGameState({ quarter: 1, clock: 5 });
      // A play that takes more time than remaining should trigger quarter end
      const play = createTestPlayResult({ clockElapsed: 10 });

      const update = advanceClock(state, play, rng);

      // Should have transitioned to Q2 with a fresh clock
      expect(update.quarter).toBe(2);
      expect(update.clock).toBe(900);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Two-minute warning
  // -----------------------------------------------------------------------
  describe('two-minute warning', () => {
    it('fires when clock crosses 120 seconds in Q2', () => {
      const triggered = checkTwoMinuteWarning(125, 115, 2);
      expect(triggered).toBe(true);
    });

    it('fires when clock crosses 120 seconds in Q4', () => {
      const triggered = checkTwoMinuteWarning(130, 118, 4);
      expect(triggered).toBe(true);
    });

    it('does not fire in Q1', () => {
      const triggered = checkTwoMinuteWarning(125, 115, 1);
      expect(triggered).toBe(false);
    });

    it('does not fire in Q3', () => {
      const triggered = checkTwoMinuteWarning(125, 115, 3);
      expect(triggered).toBe(false);
    });

    it('does not fire in OT', () => {
      const triggered = checkTwoMinuteWarning(125, 115, 'OT');
      expect(triggered).toBe(false);
    });

    it('does not fire when clock was already below 120', () => {
      const triggered = checkTwoMinuteWarning(100, 90, 2);
      expect(triggered).toBe(false);
    });

    it('does not fire when clock stays above 120', () => {
      const triggered = checkTwoMinuteWarning(500, 450, 4);
      expect(triggered).toBe(false);
    });

    it('fires when clock crosses exactly to 120', () => {
      const triggered = checkTwoMinuteWarning(121, 120, 2);
      expect(triggered).toBe(true);
    });

    it('sets twoMinuteWarning flag via advanceClock when crossing 120', () => {
      const rng = createTestRNG();
      const state = createTestGameState({
        quarter: 4,
        clock: 125,
        twoMinuteWarning: false,
      });
      // A play that uses ~10 seconds, crossing below 120
      const play = createTestPlayResult({ clockElapsed: 10 });

      const update = advanceClock(state, play, rng);

      // The clock should be at or below 120 and the two-minute warning should fire
      expect(update.twoMinuteWarning).toBe(true);
    });
  });
});
