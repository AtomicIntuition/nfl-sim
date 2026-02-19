import { describe, it, expect } from 'vitest';
import {
  resolveKickoff,
  resolveFieldGoal,
  resolveExtraPoint,
  fieldGoalDistance,
} from '@/lib/simulation/special-teams';
import { getFieldGoalAccuracy } from '@/lib/simulation/constants';
import {
  createTestGameState,
  createTestRNG,
  createTestPlayer,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const kicker = createTestPlayer({
  name: 'Adam Vinatieri',
  position: 'K',
  rating: 85,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Special Teams', () => {
  // -----------------------------------------------------------------------
  // 1. Field goal accuracy curve
  // -----------------------------------------------------------------------
  describe('field goal accuracy curve', () => {
    it('returns high accuracy for chip shots (< 30 yards)', () => {
      const accuracy = getFieldGoalAccuracy(25);
      expect(accuracy).toBeGreaterThanOrEqual(0.90);
    });

    it('returns moderate accuracy for mid-range (40-49 yards)', () => {
      const accuracy = getFieldGoalAccuracy(45);
      expect(accuracy).toBeGreaterThan(0.70);
      expect(accuracy).toBeLessThan(0.85);
    });

    it('returns lower accuracy for long kicks (50-54 yards)', () => {
      const accuracy = getFieldGoalAccuracy(52);
      expect(accuracy).toBeGreaterThan(0.40);
      expect(accuracy).toBeLessThan(0.70);
    });

    it('returns very low accuracy for extreme distance (55+ yards)', () => {
      const accuracy = getFieldGoalAccuracy(60);
      expect(accuracy).toBeLessThan(0.45);
    });

    it('returns 0 for impossible kicks (70+ yards)', () => {
      const accuracy = getFieldGoalAccuracy(70);
      expect(accuracy).toBe(0);
    });

    it('accuracy decreases monotonically with distance', () => {
      let prevAccuracy = 1.0;
      for (const dist of [15, 25, 35, 45, 52, 60]) {
        const accuracy = getFieldGoalAccuracy(dist);
        expect(accuracy).toBeLessThanOrEqual(prevAccuracy);
        prevAccuracy = accuracy;
      }
    });

    it('computes field goal distance correctly from ball position', () => {
      // FG distance = (100 - ballPosition) + 17
      expect(fieldGoalDistance(77)).toBe(40); // opponent's 23-yard line = 40-yard FG
      expect(fieldGoalDistance(50)).toBe(67); // midfield = 67-yard FG
      expect(fieldGoalDistance(83)).toBe(34); // opponent's 17 = 34-yard FG
    });

    it('made field goals over a sample match the accuracy curve', () => {
      // Simulate field goals from the 30-yard line (37-yard FG: 100-83+17=34... use 70)
      // Ball position 70 = (100-70)+17 = 47-yard FG
      const trials = 500;
      let made = 0;

      for (let i = 0; i < trials; i++) {
        const rng = createTestRNG(`fg-curve-${i}-aabbccdd11223344`);
        const state = createTestGameState({ ballPosition: 70, possession: 'home' });
        const result = resolveFieldGoal(state, rng, kicker);

        if (result.scoring && result.scoring.type === 'field_goal') {
          made++;
        }
      }

      const madeRate = made / trials;
      // For a 47-yard FG, base accuracy is ~78%; with kicker bonus, expect 75-85%
      expect(madeRate).toBeGreaterThan(0.65);
      expect(madeRate).toBeLessThan(0.90);
    });

    it('made field goal scores 3 points', () => {
      // Use enough seeds to find at least one made FG
      for (let i = 0; i < 50; i++) {
        const rng = createTestRNG(`fg-3pts-${i}-aabbccdd11223344`);
        const state = createTestGameState({ ballPosition: 83, possession: 'home' });
        const result = resolveFieldGoal(state, rng, kicker);

        if (result.scoring) {
          expect(result.scoring.points).toBe(3);
          expect(result.scoring.type).toBe('field_goal');
          break;
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Touchback rate on kickoffs
  // -----------------------------------------------------------------------
  describe('touchback rate', () => {
    it('touchback rate is approximately 62% (50-75% range)', () => {
      const trials = 1000;
      let touchbacks = 0;

      for (let i = 0; i < trials; i++) {
        const rng = createTestRNG(`tb-rate-${i}-aabbccdd11223344`);
        const state = createTestGameState({ kickoff: true });
        const result = resolveKickoff(state, rng, kicker);

        if (result.type === 'touchback') {
          touchbacks++;
        }
      }

      const rate = touchbacks / trials;
      // TOUCHBACK_RATE constant is 0.62; allow statistical variance
      expect(rate).toBeGreaterThan(0.50);
      expect(rate).toBeLessThan(0.75);
    });

    it('non-touchback kickoffs produce return yards in a valid range', () => {
      const returns = [];

      for (let i = 0; i < 500; i++) {
        const rng = createTestRNG(`tb-ret-${i}-aabbccdd11223344`);
        const state = createTestGameState({ kickoff: true });
        const result = resolveKickoff(state, rng, kicker);

        if (result.type !== 'touchback') {
          returns.push(result.yardsGained);
        }
      }

      // Should have gotten at least some non-touchback returns
      expect(returns.length).toBeGreaterThan(50);

      for (const yards of returns) {
        // Return yards should be in the gaussian-clamped range [10, 50]
        expect(yards).toBeGreaterThanOrEqual(10);
        expect(yards).toBeLessThanOrEqual(50);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. Extra point success rate
  // -----------------------------------------------------------------------
  describe('extra point success rate', () => {
    it('extra points succeed at approximately 94% (88-98% range)', () => {
      const trials = 1000;
      let made = 0;

      for (let i = 0; i < trials; i++) {
        const rng = createTestRNG(`xp-rate-${i}-aabbccdd11223344`);
        const state = createTestGameState({ patAttempt: true, possession: 'home' });
        const result = resolveExtraPoint(state, rng, kicker);

        if (result.scoring && result.scoring.type === 'extra_point') {
          made++;
        }
      }

      const rate = made / trials;
      // EXTRA_POINT_RATE is 0.94; allow variance
      expect(rate).toBeGreaterThan(0.88);
      expect(rate).toBeLessThan(0.98);
    });

    it('made extra points score exactly 1 point', () => {
      for (let i = 0; i < 50; i++) {
        const rng = createTestRNG(`xp-1pt-${i}-aabbccdd11223344`);
        const state = createTestGameState({ patAttempt: true, possession: 'home' });
        const result = resolveExtraPoint(state, rng, kicker);

        if (result.scoring) {
          expect(result.scoring.points).toBe(1);
          expect(result.scoring.type).toBe('extra_point');
          break;
        }
      }
    });

    it('missed extra points produce no scoring result', () => {
      let foundMiss = false;

      for (let i = 0; i < 200; i++) {
        const rng = createTestRNG(`xp-miss-${i}-aabbccdd11223344`);
        const state = createTestGameState({ patAttempt: true, possession: 'home' });
        const result = resolveExtraPoint(state, rng, kicker);

        if (!result.scoring) {
          foundMiss = true;
          expect(result.scoring).toBeNull();
          break;
        }
      }

      // With 94% success rate, in 200 trials we should find at least one miss
      expect(foundMiss).toBe(true);
    });
  });
});
