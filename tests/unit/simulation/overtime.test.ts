import { describe, it, expect } from 'vitest';
import {
  initializeOvertime,
  checkOvertimeEnd,
  updateOvertimeState,
  createOvertimeGameState,
} from '@/lib/simulation/overtime';
import type { OvertimeState } from '@/lib/simulation/overtime';
import { createTestGameState, createTestRNG } from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBaseOTState(overrides: Partial<OvertimeState> = {}): OvertimeState {
  return {
    coinTossWinner: 'home',
    coinTossChoice: 'receive',
    homePossessed: false,
    awayPossessed: false,
    firstPossessionResult: null,
    isComplete: false,
    isSuddenDeath: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Overtime Engine', () => {
  // -----------------------------------------------------------------------
  // 1. Both teams get at least one possession
  // -----------------------------------------------------------------------
  describe('guaranteed possessions', () => {
    it('does not end the game if only one team has possessed', () => {
      // Home scored a TD on first possession, but away has not possessed yet
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
        firstPossessionResult: 'touchdown',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 400,
        homeScore: 27,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('does not end the game when first team scores a FG and second has not possessed', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
        firstPossessionResult: 'field_goal',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 500,
        homeScore: 23,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
    });

    it('ends the game once both teams possess and scores differ', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        firstPossessionResult: 'touchdown',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 300,
        homeScore: 27,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('home');
    });

    it('updates possession tracking correctly', () => {
      const otState = createBaseOTState();

      // Home possession ends with a FG
      const afterHome = updateOvertimeState(otState, 'home', 'field_goal');
      expect(afterHome.homePossessed).toBe(true);
      expect(afterHome.awayPossessed).toBe(false);
      expect(afterHome.firstPossessionResult).toBe('field_goal');

      // Away possession ends with a touchdown
      const afterAway = updateOvertimeState(afterHome, 'away', 'touchdown');
      expect(afterAway.homePossessed).toBe(true);
      expect(afterAway.awayPossessed).toBe(true);
      expect(afterAway.isSuddenDeath).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Sudden death after both teams possess
  // -----------------------------------------------------------------------
  describe('sudden death', () => {
    it('enters sudden death when both teams have possessed and score is tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
      });

      // Away finishes their possession (tied scores)
      const updated = updateOvertimeState(otState, 'away', 'field_goal');
      expect(updated.isSuddenDeath).toBe(true);
    });

    it('ends the game on any score in sudden death', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 200,
        homeScore: 30,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('home');
    });

    it('game continues in sudden death while scores remain tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 200,
        homeScore: 27,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Time expiration
  // -----------------------------------------------------------------------
  describe('time expiration', () => {
    it('regular season ends in a tie when clock expires with tied score', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('tie');
    });

    it('playoff game does not end in a tie when clock expires tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'wild_card');
      expect(result.isOver).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('determines winner at time expiration when scores differ', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 23,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('away');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Initialization and game state creation
  // -----------------------------------------------------------------------
  describe('initialization', () => {
    it('initializes OT state with coin toss winner', () => {
      const rng = createTestRNG();
      const otState = initializeOvertime('home', rng);

      expect(otState.coinTossWinner).toBe('home');
      expect(['receive', 'defer']).toContain(otState.coinTossChoice);
      expect(otState.homePossessed).toBe(false);
      expect(otState.awayPossessed).toBe(false);
      expect(otState.isComplete).toBe(false);
      expect(otState.isSuddenDeath).toBe(false);
    });

    it('creates OT game state with correct clock and timeouts', () => {
      const rng = createTestRNG();
      const otState = initializeOvertime('home', rng);
      const baseState = createTestGameState({
        quarter: 4,
        clock: 0,
        homeScore: 17,
        awayScore: 17,
      });

      const otGameState = createOvertimeGameState(baseState, otState);

      expect(otGameState.quarter).toBe('OT');
      expect(otGameState.clock).toBe(600); // 10-minute OT period
      expect(otGameState.homeTimeouts).toBe(2); // 2 timeouts per team in OT
      expect(otGameState.awayTimeouts).toBe(2);
      expect(otGameState.kickoff).toBe(true);
      expect(otGameState.ballPosition).toBe(35); // kickoff from 35
      expect(otGameState.twoMinuteWarning).toBe(true); // disabled in OT
    });
  });

  // -----------------------------------------------------------------------
  // 5. Game terminates (integration-style via the full simulation)
  // -----------------------------------------------------------------------
  describe('game termination', () => {
    it('OT always produces a final result via checkOvertimeEnd', () => {
      // Simulate the logic: both teams possess, then score differs
      const otState = createBaseOTState();

      // First team possesses and scores FG
      const after1 = updateOvertimeState(otState, 'home', 'field_goal');

      // Second team possesses and scores TD
      const after2 = updateOvertimeState(after1, 'away', 'touchdown');

      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 250,
        homeScore: 23,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(after2, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('away');
    });
  });
});
