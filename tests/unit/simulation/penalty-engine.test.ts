import { describe, it, expect } from 'vitest';
import { checkForPenalty, enforcePenalty } from '@/lib/simulation/penalty-engine';
import type { PenaltyResult } from '@/lib/simulation/types';
import {
  createTestGameState,
  createTestRNG,
  createTestPlayResult,
  createTestRoster,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const homeRoster = createTestRoster('team-home');
const awayRoster = createTestRoster('team-away');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Penalty Engine', () => {
  // -----------------------------------------------------------------------
  // 1. Penalty rate over a large sample
  // -----------------------------------------------------------------------
  describe('penalty rate', () => {
    it('produces penalties at roughly 7.5% of plays (5-12% range)', () => {
      const trials = 2000;
      let penaltyCount = 0;

      for (let i = 0; i < trials; i++) {
        const rng = createTestRNG(`pen-rate-${i}-aabbccdd11223344`);
        const state = createTestGameState({ ballPosition: 40, down: 1 });
        const play = createTestPlayResult({
          type: 'pass_complete',
          call: 'pass_short',
          yardsGained: 8,
        });

        const result = checkForPenalty(state, play, homeRoster, awayRoster, rng);
        if (result !== null) {
          penaltyCount++;
        }
      }

      const rate = penaltyCount / trials;
      // PENALTY_RATE is 0.075 -- allow a statistical range around it
      expect(rate).toBeGreaterThan(0.05);
      expect(rate).toBeLessThan(0.12);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Penalty structure
  // -----------------------------------------------------------------------
  describe('penalty result structure', () => {
    it('returns null when no penalty occurs', () => {
      // Use a large sample; at least some should be null
      let foundNull = false;

      for (let i = 0; i < 100; i++) {
        const rng = createTestRNG(`pen-null-${i}-aabbccdd11223344`);
        const state = createTestGameState({ ballPosition: 50 });
        const play = createTestPlayResult({ type: 'run', call: 'run_inside' });

        const result = checkForPenalty(state, play, homeRoster, awayRoster, rng);
        if (result === null) {
          foundNull = true;
          break;
        }
      }

      expect(foundNull).toBe(true);
    });

    it('returns a valid PenaltyResult when a penalty occurs', () => {
      // Keep trying seeds until we get a penalty
      let penalty: PenaltyResult | null = null;

      for (let i = 0; i < 200; i++) {
        const rng = createTestRNG(`pen-valid-${i}-aabbccdd11223344`);
        const state = createTestGameState({ ballPosition: 50 });
        const play = createTestPlayResult({
          type: 'pass_complete',
          call: 'pass_short',
          yardsGained: 5,
        });

        penalty = checkForPenalty(state, play, homeRoster, awayRoster, rng);
        if (penalty !== null) break;
      }

      expect(penalty).not.toBeNull();
      if (penalty) {
        expect(penalty.type).toBeTypeOf('string');
        expect(['home', 'away']).toContain(penalty.on);
        expect(penalty.yards).toBeTypeOf('number');
        expect(penalty.yards).toBeGreaterThanOrEqual(0);
        expect(penalty.isAutoFirstDown).toBeTypeOf('boolean');
        expect(penalty.description).toBeTypeOf('string');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. Penalty enforcement: yards applied correctly
  // -----------------------------------------------------------------------
  describe('penalty enforcement', () => {
    it('moves ball backward for an offensive penalty (holding, 10 yards)', () => {
      const state = createTestGameState({
        ballPosition: 50,
        down: 2,
        yardsToGo: 7,
        possession: 'home',
      });

      const penalty: PenaltyResult = {
        type: 'holding_offense',
        on: 'home', // offense committed the penalty
        player: null,
        yards: 10,
        isAutoFirstDown: false,
        isSpotFoul: false,
        declined: false,
        offsetting: false,
        description: 'Offensive holding',
      };

      const result = enforcePenalty(state, penalty);

      // Ball should move backward by 10 yards
      expect(result.ballPosition).toBe(40);
      // Yards to go should increase by the penalty yardage
      expect(result.yardsToGo).toBe(17); // 7 + 10
    });

    it('moves ball forward for a defensive penalty (offsides, 5 yards)', () => {
      const state = createTestGameState({
        ballPosition: 30,
        down: 1,
        yardsToGo: 10,
        possession: 'home',
      });

      const penalty: PenaltyResult = {
        type: 'offsides',
        on: 'away', // defense committed the penalty
        player: null,
        yards: 5,
        isAutoFirstDown: false,
        isSpotFoul: false,
        declined: false,
        offsetting: false,
        description: 'Offsides',
      };

      const result = enforcePenalty(state, penalty);

      // Ball should advance 5 yards
      expect(result.ballPosition).toBe(35);
      // Yards to go reduced by 5
      expect(result.yardsToGo).toBe(5);
    });

    it('applies automatic first down for defensive holding', () => {
      const state = createTestGameState({
        ballPosition: 40,
        down: 3,
        yardsToGo: 8,
        possession: 'home',
      });

      const penalty: PenaltyResult = {
        type: 'holding_defense',
        on: 'away',
        player: null,
        yards: 5,
        isAutoFirstDown: true,
        isSpotFoul: false,
        declined: false,
        offsetting: false,
        description: 'Defensive holding',
      };

      const result = enforcePenalty(state, penalty);

      expect(result.isFirstDown).toBe(true);
      expect(result.down).toBe(1);
    });

    it('does not enforce a declined penalty', () => {
      const state = createTestGameState({
        ballPosition: 50,
        down: 2,
        yardsToGo: 7,
      });

      const penalty: PenaltyResult = {
        type: 'holding_offense',
        on: 'home',
        player: null,
        yards: 10,
        isAutoFirstDown: false,
        isSpotFoul: false,
        declined: true,
        offsetting: false,
        description: 'Declined',
      };

      const result = enforcePenalty(state, penalty);

      // Position and situation should be unchanged
      expect(result.ballPosition).toBe(50);
      expect(result.down).toBe(2);
      expect(result.yardsToGo).toBe(7);
    });

    it('does not enforce offsetting penalties', () => {
      const state = createTestGameState({
        ballPosition: 50,
        down: 1,
        yardsToGo: 10,
      });

      const penalty: PenaltyResult = {
        type: 'holding_offense',
        on: 'home',
        player: null,
        yards: 10,
        isAutoFirstDown: false,
        isSpotFoul: false,
        declined: false,
        offsetting: true,
        description: 'Offsetting',
      };

      const result = enforcePenalty(state, penalty);

      expect(result.ballPosition).toBe(50);
    });

    it('enforces half the distance to the goal when ball is near own goal', () => {
      const state = createTestGameState({
        ballPosition: 6, // own 6-yard line
        down: 1,
        yardsToGo: 10,
        possession: 'home',
      });

      const penalty: PenaltyResult = {
        type: 'holding_offense',
        on: 'home',
        player: null,
        yards: 10,
        isAutoFirstDown: false,
        isSpotFoul: false,
        declined: false,
        offsetting: false,
        description: 'Holding at own 6',
      };

      const result = enforcePenalty(state, penalty);

      // Half the distance to goal from the 6 = 3 yards back, ball at 3
      // The ball should never go to 0 (safety) or negative
      expect(result.ballPosition).toBeGreaterThanOrEqual(1);
      expect(result.ballPosition).toBeLessThan(6);
    });
  });
});
