'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
import type { Phase } from './play-timing';
import { YARD_PCT } from './yard-grid';

interface SnakeTrailProps {
  phase: Phase;
  ballLeftPercent: number;
  prevBallLeftPercent: number;
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
}

interface TrailCell {
  x: number;
  y: number;
  age: number;
}

const MAX_CELLS = 50;
/** Minimum distance (in field %) between trail cells — roughly 1 yard */
const CELL_SPACING = YARD_PCT * 0.9;

/**
 * Snake-game-style trail behind the ball carrier during play animation.
 * Head cell glows, older cells fade out.
 */
export function SnakeTrail({
  phase,
  ballLeftPercent,
  prevBallLeftPercent,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
}: SnakeTrailProps) {
  const [cells, setCells] = useState<TrailCell[]>([]);
  const cellsRef = useRef<TrailCell[]>([]);
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const startTimeRef = useRef(0);

  // Clear trail on new play
  useEffect(() => {
    if (playKey !== prevKeyRef.current) {
      prevKeyRef.current = playKey;
      cellsRef.current = [];
      setCells([]);
    }
  }, [playKey]);

  // Animate during development phase
  useEffect(() => {
    if (phase !== 'development' || !lastPlay) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const playType = lastPlay.type;
    // Skip non-visual play types
    if (
      playType === 'kneel' || playType === 'spike' ||
      playType === 'pregame' || playType === 'coin_toss'
    ) return;

    const fromX = prevBallLeftPercent;
    const toX = ballLeftPercent;
    const offDir = possession === 'away' ? -1 : 1;
    const isPass = playType === 'pass_complete' || playType === 'pass_incomplete';
    const isSack = playType === 'sack';
    const isRun = playType === 'run' || playType === 'scramble' || playType === 'two_point';
    const isKick = playType === 'kickoff' || playType === 'punt' ||
                   playType === 'field_goal' || playType === 'extra_point';

    // For passes, trail starts after throw
    const trailStartT = isPass ? 0.32 : 0;
    let lastAddedX = -999;

    startTimeRef.current = performance.now();
    cellsRef.current = [];

    const devDurationMs = 2400; // matches DEVELOPMENT_MS

    function tick(now: number) {
      const t = Math.min((now - startTimeRef.current) / devDurationMs, 1);

      // Don't add trail cells before trail start
      if (t < trailStartT) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Compute current ball position
      const progressT = (t - trailStartT) / (1 - trailStartT);
      const eased = 1 - Math.pow(1 - progressT, 3);

      let x: number;
      let y = 50; // center by default

      if (isRun) {
        x = fromX + (toX - fromX) * eased;
        // Slight wobble
        y = 50 + Math.sin(progressT * Math.PI * 3) * YARD_PCT * 2 * (1 - progressT);
      } else if (isPass) {
        // QB position → target
        const qbX = fromX + offDir * 3 * YARD_PCT;
        x = qbX + (toX - qbX) * eased;
        const lateralScale = Math.abs(toX - fromX) * 0.4;
        y = 50 + Math.sin(progressT * Math.PI * 0.8) * lateralScale * 0.3;
      } else if (isSack) {
        x = fromX + (toX - fromX) * eased;
        y = 50 + Math.sin(progressT * 8) * 1.5;
      } else if (isKick) {
        x = fromX + (toX - fromX) * eased;
      } else {
        x = fromX + (toX - fromX) * eased;
      }

      // Add cell if moved enough
      if (Math.abs(x - lastAddedX) >= CELL_SPACING) {
        lastAddedX = x;
        const trail = cellsRef.current;
        trail.push({ x, y, age: trail.length });
        if (trail.length > MAX_CELLS) trail.shift();
        // Batch DOM updates at ~30fps
        setCells([...trail]);
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, lastPlay, ballLeftPercent, prevBallLeftPercent, possession, offenseColor]);

  // Only visible during development and result phases
  const visible = phase === 'development' || phase === 'result';
  if (!visible || cells.length === 0) return null;

  const isSack = lastPlay?.type === 'sack';
  const isKick = lastPlay?.type === 'kickoff' || lastPlay?.type === 'punt' ||
                 lastPlay?.type === 'field_goal' || lastPlay?.type === 'extra_point';
  const color = isSack ? defenseColor : isKick ? '#fbbf24' : offenseColor;

  return (
    <div className="absolute inset-0 pointer-events-none z-[8]">
      {cells.map((cell, i) => {
        const isHead = i === cells.length - 1;
        const normalizedAge = cells.length > 1 ? i / (cells.length - 1) : 1;
        const opacity = isHead ? 0.9 : 0.1 + normalizedAge * 0.4;
        const size = isHead ? 12 : 6 + normalizedAge * 3;

        return (
          <div
            key={`snake-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${cell.x}%`,
              top: `${cell.y}%`,
              width: size,
              height: size,
              transform: 'translate(-50%, -50%)',
              backgroundColor: color,
              opacity,
              boxShadow: isHead
                ? `0 0 8px ${color}, 0 0 4px ${color}`
                : 'none',
              transition: phase === 'result' ? 'opacity 300ms ease-out' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
