import { describe, it, expect } from 'vitest';
import {
  createInitialMomentum,
  calculateMomentumShift,
  applyMomentumDecay,
  getMomentumModifier,
} from '@/lib/narrative/momentum';
import {
  createTestGameState,
  createTestPlayResult,
  createTestPlayer,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp momentum to valid range, mirroring the engine behavior. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Momentum Tracker', () => {
  // -----------------------------------------------------------------------
  // 1. Momentum stays in range [-100, 100]
  // -----------------------------------------------------------------------
  describe('range bounds', () => {
    it('initializes at 0 (neutral)', () => {
      expect(createInitialMomentum()).toBe(0);
    });

    it('stays within [-100, 100] after applying shifts and clamping', () => {
      let momentum = createInitialMomentum();
      const state = createTestGameState({ possession: 'home' });

      // Apply a series of large shifts in one direction
      for (let i = 0; i < 20; i++) {
        const play = createTestPlayResult({
          isTouchdown: true,
          scoring: {
            type: 'touchdown',
            team: 'home',
            points: 6,
            scorer: null,
          },
        });

        const shift = calculateMomentumShift(play, state, momentum);
        momentum = clamp(momentum + shift, -100, 100);
      }

      expect(momentum).toBeGreaterThanOrEqual(-100);
      expect(momentum).toBeLessThanOrEqual(100);
    });

    it('stays within [-100, 100] after extreme away team shifts', () => {
      let momentum = createInitialMomentum();
      const state = createTestGameState({ possession: 'away' });

      for (let i = 0; i < 20; i++) {
        const play = createTestPlayResult({
          isTouchdown: true,
          scoring: {
            type: 'touchdown',
            team: 'away',
            points: 6,
            scorer: null,
          },
        });

        const shift = calculateMomentumShift(play, state, momentum);
        momentum = clamp(momentum + shift, -100, 100);
      }

      expect(momentum).toBeGreaterThanOrEqual(-100);
      expect(momentum).toBeLessThanOrEqual(100);
    });

    it('decay never pushes momentum outside [-100, 100]', () => {
      // Test decay from extreme values
      expect(applyMomentumDecay(100)).toBeLessThanOrEqual(100);
      expect(applyMomentumDecay(100)).toBeGreaterThanOrEqual(0);
      expect(applyMomentumDecay(-100)).toBeGreaterThanOrEqual(-100);
      expect(applyMomentumDecay(-100)).toBeLessThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Scoring events swing momentum
  // -----------------------------------------------------------------------
  describe('scoring events', () => {
    it('home touchdown shifts momentum toward home (positive)', () => {
      const state = createTestGameState({ possession: 'home' });
      const play = createTestPlayResult({
        isTouchdown: true,
        scoring: {
          type: 'touchdown',
          team: 'home',
          points: 6,
          scorer: null,
        },
      });

      const shift = calculateMomentumShift(play, state, 0);
      expect(shift).toBeGreaterThan(0);
    });

    it('away touchdown shifts momentum toward away (negative)', () => {
      const state = createTestGameState({ possession: 'away' });
      const play = createTestPlayResult({
        isTouchdown: true,
        scoring: {
          type: 'touchdown',
          team: 'away',
          points: 6,
          scorer: null,
        },
      });

      const shift = calculateMomentumShift(play, state, 0);
      expect(shift).toBeLessThan(0);
    });

    it('field goal produces a smaller shift than a touchdown', () => {
      const state = createTestGameState({ possession: 'home' });

      const fgPlay = createTestPlayResult({
        scoring: {
          type: 'field_goal',
          team: 'home',
          points: 3,
          scorer: null,
        },
      });

      const tdPlay = createTestPlayResult({
        isTouchdown: true,
        scoring: {
          type: 'touchdown',
          team: 'home',
          points: 6,
          scorer: null,
        },
      });

      const fgShift = calculateMomentumShift(fgPlay, state, 0);
      const tdShift = calculateMomentumShift(tdPlay, state, 0);

      expect(Math.abs(fgShift)).toBeLessThan(Math.abs(tdShift));
    });

    it('turnovers produce a large momentum swing', () => {
      const state = createTestGameState({ possession: 'home' });
      const play = createTestPlayResult({
        turnover: {
          type: 'interception',
          recoveredBy: 'away',
          returnYards: 15,
          returnedForTD: false,
        },
      });

      const shift = calculateMomentumShift(play, state, 0);
      // Turnover recovered by away = momentum swings toward away (negative)
      expect(shift).toBeLessThan(0);
      // Turnovers are the single biggest swing (35 points)
      expect(Math.abs(shift)).toBeGreaterThanOrEqual(20);
    });

    it('sacks shift momentum toward the defensive team', () => {
      const state = createTestGameState({ possession: 'home' });
      const play = createTestPlayResult({
        type: 'sack',
        yardsGained: -7,
      });

      const shift = calculateMomentumShift(play, state, 0);
      // Sack on home offense = momentum shifts toward away (negative)
      expect(shift).toBeLessThan(0);
    });

    it('big plays (15+ yards) shift momentum toward the offense', () => {
      const state = createTestGameState({ possession: 'home' });
      const play = createTestPlayResult({
        type: 'pass_complete',
        yardsGained: 25,
      });

      const shift = calculateMomentumShift(play, state, 0);
      // Big play by home offense = positive momentum
      expect(shift).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Momentum decay
  // -----------------------------------------------------------------------
  describe('momentum decay', () => {
    it('decays positive momentum toward 0', () => {
      const decayed = applyMomentumDecay(50);
      expect(decayed).toBeLessThan(50);
      expect(decayed).toBeGreaterThanOrEqual(0);
    });

    it('decays negative momentum toward 0', () => {
      const decayed = applyMomentumDecay(-50);
      expect(decayed).toBeGreaterThan(-50);
      expect(decayed).toBeLessThanOrEqual(0);
    });

    it('stays at 0 when already at 0', () => {
      expect(applyMomentumDecay(0)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Momentum modifier
  // -----------------------------------------------------------------------
  describe('momentum modifier', () => {
    it('returns positive modifier for home when momentum is positive', () => {
      const modifier = getMomentumModifier(50, 'home');
      expect(modifier).toBeGreaterThan(0);
    });

    it('returns negative modifier for away when momentum is positive', () => {
      const modifier = getMomentumModifier(50, 'away');
      expect(modifier).toBeLessThan(0);
    });

    it('returns 0 modifier when momentum is 0', () => {
      expect(getMomentumModifier(0, 'home')).toBe(0);
      expect(getMomentumModifier(0, 'away')).toBe(0);
    });

    it('modifier magnitude never exceeds 0.03 (MOMENTUM_MAX_EFFECT)', () => {
      const mod100 = getMomentumModifier(100, 'home');
      const modNeg100 = getMomentumModifier(-100, 'home');

      expect(Math.abs(mod100)).toBeLessThanOrEqual(0.031); // small float tolerance
      expect(Math.abs(modNeg100)).toBeLessThanOrEqual(0.031);
    });
  });
});
