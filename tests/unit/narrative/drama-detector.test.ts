import { describe, it, expect } from 'vitest';
import { detectDrama } from '@/lib/narrative/drama-detector';
import type { DramaFlags } from '@/lib/narrative/drama-detector';
import {
  createTestGameState,
  createTestPlayResult,
} from '../../helpers/test-utils';

describe('Drama Detector', () => {
  // -----------------------------------------------------------------------
  // 1. Clutch moment detection
  // -----------------------------------------------------------------------
  describe('clutch moment detection', () => {
    it('detects clutch moment: Q4, < 2:00, within 8 points', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 90,     // 1:30 remaining
        homeScore: 21,
        awayScore: 17,
        possession: 'away',
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(true);
    });

    it('detects clutch moment: OT, < 2:00, tied', () => {
      const state = createTestGameState({
        quarter: 'OT',
        clock: 60,
        homeScore: 24,
        awayScore: 24,
        possession: 'home',
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(true);
    });

    it('does not detect clutch in Q1', () => {
      const state = createTestGameState({
        quarter: 1,
        clock: 90,
        homeScore: 7,
        awayScore: 3,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(false);
    });

    it('does not detect clutch when score diff > 8', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 90,
        homeScore: 28,
        awayScore: 14,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(false);
    });

    it('does not detect clutch when clock > 2:00', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 300,
        homeScore: 21,
        awayScore: 20,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(false);
    });

    it('detects clutch at exactly 120 seconds (boundary)', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 120,
        homeScore: 17,
        awayScore: 14,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(true);
    });

    it('detects clutch at exactly 8-point differential (boundary)', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 100,
        homeScore: 22,
        awayScore: 14,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isClutchMoment).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Comeback detection
  // -----------------------------------------------------------------------
  describe('comeback detection', () => {
    it('detects comeback: was down 14+, now within 7', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 300,
        homeScore: 21,
        awayScore: 24,
        possession: 'home',
      });
      const play = createTestPlayResult();

      // Build scoring history that shows home was once down 0-14
      const previousPlays = [
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'away', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'away', points: 7, scorer: null },
        }),
        // Home scores to come back
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'home', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'home', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'home', points: 7, scorer: null },
        }),
        // Away adds another score
        createTestPlayResult({
          scoring: { type: 'field_goal', team: 'away', points: 3, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'field_goal', team: 'away', points: 7, scorer: null },
        }),
      ];

      const flags = detectDrama(state, play, 0, previousPlays);
      expect(flags.isComebackBrewing).toBe(true);
    });

    it('does not detect comeback when never trailed by 14+', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 300,
        homeScore: 14,
        awayScore: 17,
      });

      // Scoring history shows a close game throughout
      const previousPlays = [
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'away', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'home', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'field_goal', team: 'away', points: 3, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'home', points: 7, scorer: null },
        }),
        createTestPlayResult({
          scoring: { type: 'touchdown', team: 'away', points: 7, scorer: null },
        }),
      ];

      const flags = detectDrama(state, createTestPlayResult(), 0, previousPlays);
      expect(flags.isComebackBrewing).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Blowout detection
  // -----------------------------------------------------------------------
  describe('blowout detection', () => {
    it('detects blowout when point differential >= 21', () => {
      const state = createTestGameState({
        homeScore: 35,
        awayScore: 7,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isBlowout).toBe(true);
    });

    it('does not detect blowout when differential < 21', () => {
      const state = createTestGameState({
        homeScore: 21,
        awayScore: 7,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isBlowout).toBe(false);
    });

    it('blowout reduces drama level to low values', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 60,
        homeScore: 42,
        awayScore: 7,
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isBlowout).toBe(true);
      // Even in Q4 < 2:00, a blowout should have low drama
      expect(flags.dramaLevel).toBeLessThanOrEqual(20);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Two-minute drill detection
  // -----------------------------------------------------------------------
  describe('two-minute drill detection', () => {
    it('detects two-minute drill: Q4, < 2:00, trailing team has ball', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 100,
        homeScore: 14,
        awayScore: 17,
        possession: 'home', // home is trailing and has ball
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isTwoMinuteDrill).toBe(true);
    });

    it('does not detect two-minute drill when leading team has ball', () => {
      const state = createTestGameState({
        quarter: 4,
        clock: 100,
        homeScore: 21,
        awayScore: 14,
        possession: 'home', // home is leading
      });
      const play = createTestPlayResult();

      const flags = detectDrama(state, play, 0, []);
      expect(flags.isTwoMinuteDrill).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Red zone detection
  // -----------------------------------------------------------------------
  describe('red zone detection', () => {
    it('detects red zone when ball position >= 80', () => {
      const state = createTestGameState({ ballPosition: 85 });
      const flags = detectDrama(state, createTestPlayResult(), 0, []);
      expect(flags.isRedZone).toBe(true);
    });

    it('does not detect red zone when ball position < 80', () => {
      const state = createTestGameState({ ballPosition: 70 });
      const flags = detectDrama(state, createTestPlayResult(), 0, []);
      expect(flags.isRedZone).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Drama level range
  // -----------------------------------------------------------------------
  describe('drama level range', () => {
    it('drama level is always between 0 and 100', () => {
      const scenarios = [
        // Low drama
        createTestGameState({ quarter: 1, clock: 800, homeScore: 0, awayScore: 0 }),
        // Medium drama
        createTestGameState({ quarter: 3, clock: 400, homeScore: 14, awayScore: 17 }),
        // High drama
        createTestGameState({ quarter: 4, clock: 30, homeScore: 24, awayScore: 24 }),
        // Blowout
        createTestGameState({ quarter: 4, clock: 60, homeScore: 42, awayScore: 7 }),
        // OT
        createTestGameState({ quarter: 'OT', clock: 100, homeScore: 27, awayScore: 27 }),
      ];

      for (const state of scenarios) {
        const flags = detectDrama(state, createTestPlayResult(), 0, []);
        expect(flags.dramaLevel).toBeGreaterThanOrEqual(0);
        expect(flags.dramaLevel).toBeLessThanOrEqual(100);
      }
    });

    it('close Q4 game has higher drama than Q1 blowout', () => {
      const closeQ4 = createTestGameState({
        quarter: 4,
        clock: 100,
        homeScore: 21,
        awayScore: 24,
        possession: 'home',
      });
      const blowoutQ1 = createTestGameState({
        quarter: 1,
        clock: 500,
        homeScore: 28,
        awayScore: 0,
      });

      const closeFlags = detectDrama(closeQ4, createTestPlayResult(), 0, []);
      const blowoutFlags = detectDrama(blowoutQ1, createTestPlayResult(), 0, []);

      expect(closeFlags.dramaLevel).toBeGreaterThan(blowoutFlags.dramaLevel);
    });
  });
});
