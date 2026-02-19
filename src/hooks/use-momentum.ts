'use client';

import { useMemo } from 'react';
import type { GameEvent } from '@/lib/simulation/types';

interface MomentumState {
  /** Range: -100 (away dominating) to 100 (home dominating). */
  momentum: number;
  direction: 'home' | 'away' | 'neutral';
  intensity: 'low' | 'medium' | 'high' | 'extreme';
}

/**
 * Derive client-side momentum from game events.
 *
 * The algorithm weights recent plays more heavily and considers:
 * - Scoring plays (big swings)
 * - Turnovers (major momentum shifts)
 * - Big plays (15+ yards)
 * - Sacks (defensive momentum)
 * - 3rd/4th down conversions and stops
 * - Consecutive positive/negative plays
 */
export function useMomentum(events: GameEvent[]): MomentumState {
  return useMemo(() => {
    if (events.length === 0) {
      return { momentum: 0, direction: 'neutral', intensity: 'low' };
    }

    // Only consider the most recent plays for momentum calculation
    const WINDOW = 12;
    const recentEvents = events.slice(-WINDOW);
    let rawMomentum = 0;

    recentEvents.forEach((event, index) => {
      const { playResult, gameState } = event;
      // More recent plays carry more weight (linear ramp from 0.5 to 1.0)
      const recencyWeight = 0.5 + (index / (recentEvents.length - 1 || 1)) * 0.5;
      // Positive values favor home, negative favor away
      const teamMultiplier = gameState.possession === 'home' ? 1 : -1;
      let playImpact = 0;

      // Touchdowns
      if (playResult.isTouchdown) {
        const scoringTeam = playResult.scoring?.team;
        playImpact = scoringTeam === 'home' ? 30 : -30;
      }
      // Field goals
      else if (playResult.scoring?.type === 'field_goal') {
        playImpact = playResult.scoring.team === 'home' ? 15 : -15;
      }
      // Turnovers (massive swing toward recovering team)
      else if (playResult.turnover) {
        const recoverer = playResult.turnover.recoveredBy;
        playImpact = recoverer === 'home' ? 25 : -25;
        if (playResult.turnover.returnedForTD) {
          playImpact *= 1.5;
        }
      }
      // Sacks (defensive momentum)
      else if (playResult.type === 'sack') {
        // Sack is good for the defense, bad for the offense
        playImpact = teamMultiplier * -12;
      }
      // Big plays (15+ yards)
      else if (playResult.yardsGained >= 15) {
        playImpact = teamMultiplier * (8 + Math.min(playResult.yardsGained / 5, 10));
      }
      // Solid gains
      else if (playResult.yardsGained >= 5) {
        playImpact = teamMultiplier * 4;
      }
      // Short gains
      else if (playResult.yardsGained > 0) {
        playImpact = teamMultiplier * 1;
      }
      // Negative plays
      else if (playResult.yardsGained < 0) {
        playImpact = teamMultiplier * -5;
      }
      // Incomplete passes
      else if (playResult.type === 'pass_incomplete') {
        playImpact = teamMultiplier * -2;
      }

      // First down bonus
      if (playResult.isFirstDown) {
        playImpact += teamMultiplier * 4;
      }

      // Penalty impact
      if (playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting) {
        const penaltyAgainst = playResult.penalty.on;
        const penaltyImpact = Math.min(playResult.penalty.yards / 3, 8);
        playImpact += penaltyAgainst === 'home' ? -penaltyImpact : penaltyImpact;
      }

      // Safety
      if (playResult.isSafety) {
        const safetyTeam = playResult.scoring?.team;
        playImpact = safetyTeam === 'home' ? 20 : -20;
      }

      rawMomentum += playImpact * recencyWeight;
    });

    // Also factor in score differential (mild effect)
    if (events.length > 0) {
      const latestState = events[events.length - 1].gameState;
      const scoreDiff = latestState.homeScore - latestState.awayScore;
      // Small nudge toward the leading team (capped to prevent dominating the calculation)
      rawMomentum += Math.sign(scoreDiff) * Math.min(Math.abs(scoreDiff) * 0.5, 8);
    }

    // Clamp to [-100, 100]
    const momentum = Math.max(-100, Math.min(100, Math.round(rawMomentum)));

    const absMomentum = Math.abs(momentum);
    const direction: MomentumState['direction'] =
      absMomentum < 10 ? 'neutral' : momentum > 0 ? 'home' : 'away';

    let intensity: MomentumState['intensity'];
    if (absMomentum < 20) intensity = 'low';
    else if (absMomentum < 45) intensity = 'medium';
    else if (absMomentum < 75) intensity = 'high';
    else intensity = 'extreme';

    return { momentum, direction, intensity };
  }, [events]);
}
