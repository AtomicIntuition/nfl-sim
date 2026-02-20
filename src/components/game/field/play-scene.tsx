'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { PlayResult, PlayType, Formation, DefensivePersonnel } from '@/lib/simulation/types';
import { OFFENSIVE_FORMATIONS, DEFENSIVE_FORMATIONS } from './formation-layouts';
import type { FormationPosition } from './formation-layouts';

interface PlaySceneProps {
  ballLeftPercent: number;
  prevBallLeftPercent: number;
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  onAnimating: (animating: boolean) => void;
  onPhaseChange?: (phase: Phase) => void;
}

// ── Enhanced Timing ──────────────────────────────────────────
const PRE_SNAP_MS = 500;
const SNAP_MS = 150;
const DEVELOPMENT_MS = 1800;
const RESULT_MS = 600;
const POST_PLAY_MS = 400;
const TOTAL_MS = PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS + POST_PLAY_MS;

type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

// ── Easing helpers ──────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Main component ──────────────────────────────────────────
export function PlayScene({
  ballLeftPercent,
  prevBallLeftPercent,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  onAnimating,
  onPhaseChange,
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballPos, setBallPos] = useState({ x: 0, y: 50 });

  // Capture from/to at the moment we detect a new play
  const fromToRef = useRef({ from: prevBallLeftPercent, to: ballLeftPercent });

  // Phase change callback
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const updatePhase = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChangeRef.current?.(newPhase);
  }, []);

  // ── Formation dots ──────────────────────────────────────
  const formation = useMemo(() => {
    const losX = fromToRef.current.from;
    const playType = lastPlay?.type ?? null;
    return getFormationDots(
      losX,
      possession,
      playType,
      lastPlay?.formation ?? null,
      lastPlay?.defensiveCall?.personnel ?? null,
      lastPlay,
    );
  }, [possession, lastPlay, playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect new play → start animation ───────────────────
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    // Skip non-visual plays
    if (
      lastPlay.type === 'kneel' ||
      lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' ||
      lastPlay.type === 'coin_toss'
    ) {
      return;
    }

    // Capture positions right now
    fromToRef.current = { from: prevBallLeftPercent, to: ballLeftPercent };
    const fromX = prevBallLeftPercent;
    const toX = ballLeftPercent;

    onAnimatingRef.current(true);
    updatePhase('pre_snap');
    setBallPos({ x: fromX, y: 50 });
    setAnimProgress(0);

    // Phase timers
    const t1 = setTimeout(() => {
      updatePhase('snap');
    }, PRE_SNAP_MS);

    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay);
    }, PRE_SNAP_MS + SNAP_MS);

    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      setBallPos({ x: toX, y: 50 });
      setAnimProgress(1);
    }, PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS);

    const t4 = setTimeout(() => {
      updatePhase('post_play');
    }, PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS);

    const t5 = setTimeout(() => {
      updatePhase('idle');
      onAnimatingRef.current(false);
    }, TOTAL_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase]);

  // ── RAF loop ─────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult) {
    const startTime = performance.now();

    function tick(now: number) {
      const t = Math.min((now - startTime) / DEVELOPMENT_MS, 1);
      setAnimProgress(t);
      const pos = calculateBallPosition(play, fromX, toX, t, possession);
      setBallPos(pos);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Render nothing when idle ─────────────────────────────
  if (phase === 'idle' || !lastPlay) return null;

  const fromX = fromToRef.current.from;
  const toX = fromToRef.current.to;
  const playType = lastPlay.type;
  const isSuccess = !isFailedPlay(lastPlay);
  const offDir = possession === 'away' ? -1 : 1;

  const opacity =
    phase === 'pre_snap' ? 0.85 :
    phase === 'snap' ? 0.9 :
    phase === 'development' ? 1 :
    phase === 'result' ? 0.9 :
    0;

  // Determine if this is a pass play for route rendering
  const isPassPlay = playType === 'pass_complete' || playType === 'pass_incomplete' ||
    lastPlay.call?.startsWith('pass_') || lastPlay.call?.startsWith('play_action') ||
    lastPlay.call === 'screen_pass' || lastPlay.call === 'pass_rpo';

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{
        opacity,
        transition: phase === 'post_play' ? 'opacity 400ms ease-out' : 'opacity 200ms ease-in',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* ─── Route lines for pass plays (behind dots) ─── */}
        {isPassPlay && (phase === 'development' || phase === 'result') && (
          <RouteLines
            formation={formation}
            fromX={fromX}
            offDir={offDir}
            offenseColor={offenseColor}
            playCall={lastPlay.call}
            progress={animProgress}
          />
        )}

        {/* ─── Player formation dots with labels ─── */}
        {formation.map((dot, i) => {
          const dotX = clamp(dot.x, 1, 99);
          const dotY = clamp(dot.y, 3, 97);
          const isQB = dot.role === 'QB';
          const isKeyPlayer = dot.isKeyPlayer;
          const dotR = isQB ? 2.5 : 2.0;
          const isOffense = dot.team === 'offense';

          // During snap/development, animate OL push and QB dropback
          let animX = dotX;
          let animY = dotY;
          if ((phase === 'snap' || phase === 'development') && isOffense) {
            if (dot.role === 'OL') {
              animX = dotX - offDir * 1.0; // OL push forward
            } else if (isQB && !lastPlay.call?.startsWith('run_') && phase === 'development') {
              animX = dotX + offDir * 2 * Math.min(animProgress * 2, 1); // QB drops back
            }
          }

          // During development, defenders converge toward ball
          if (phase === 'development' && !isOffense) {
            const convergeFactor = Math.min(animProgress * 0.3, 0.15);
            animX = dotX + (ballPos.x - dotX) * convergeFactor;
            animY = dotY + (ballPos.y - dotY) * convergeFactor * 0.5;
          }

          return (
            <g key={i}>
              {/* Player dot */}
              <circle
                cx={animX}
                cy={animY}
                r={dotR}
                fill={isOffense ? offenseColor : defenseColor}
                opacity={isOffense ? 0.85 : 0.55}
                stroke={isOffense ? 'white' : 'rgba(255,255,255,0.3)'}
                strokeWidth={isOffense ? '0.4' : '0.3'}
                strokeDasharray={isOffense ? 'none' : '1 0.5'}
                className="play-scene-dot"
              />
              {/* Position label */}
              <text
                x={animX}
                y={animY - dotR - 0.8}
                textAnchor="middle"
                fill="white"
                fontSize="2.2"
                fontWeight="bold"
                fontFamily="system-ui"
                opacity={isKeyPlayer ? 0.9 : 0.6}
              >
                {isKeyPlayer && dot.number ? `#${dot.number}` : dot.role}
              </text>
            </g>
          );
        })}

        {/* ─── Play trajectory trail ─── */}
        {(phase === 'development' || phase === 'result') && (
          <PlayTrajectory
            playType={playType}
            fromX={fromX}
            toX={toX}
            possession={possession}
            progress={animProgress}
            success={isSuccess}
          />
        )}

        {/* ─── Animated ball ─── */}
        {phase === 'development' && (
          <g>
            {/* Glow */}
            <ellipse
              cx={clamp(ballPos.x, 2, 98)}
              cy={clamp(ballPos.y, 5, 95)}
              rx="2.5"
              ry="1.8"
              fill="rgba(212, 175, 55, 0.35)"
            />
            {/* Ball body */}
            <ellipse
              cx={clamp(ballPos.x, 2, 98)}
              cy={clamp(ballPos.y, 5, 95)}
              rx="1.6"
              ry="1"
              fill="#8B4513"
              stroke="#5C2D06"
              strokeWidth="0.3"
            />
            {/* Lace */}
            <line
              x1={clamp(ballPos.x, 2, 98) - 0.8}
              y1={clamp(ballPos.y, 5, 95)}
              x2={clamp(ballPos.x, 2, 98) + 0.8}
              y2={clamp(ballPos.y, 5, 95)}
              stroke="white"
              strokeWidth="0.25"
              opacity="0.7"
            />
          </g>
        )}

        {/* ─── Ball carrier dot (highlighted during run/scramble) ─── */}
        {phase === 'development' &&
          (playType === 'run' || playType === 'scramble' || playType === 'two_point') && (
          <circle
            cx={clamp(ballPos.x, 2, 98)}
            cy={clamp(ballPos.y, 5, 95)}
            r="2.0"
            fill={offenseColor}
            stroke="white"
            strokeWidth="0.5"
            opacity="0.9"
          />
        )}

        {/* ─── Outcome markers ─── */}
        {(phase === 'result' || phase === 'post_play') && (
          <OutcomeMarker
            lastPlay={lastPlay}
            fromX={fromX}
            toX={toX}
            possession={possession}
          />
        )}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ROUTE LINES (for pass plays)
// ════════════════════════════════════════════════════════════

function RouteLines({
  formation,
  fromX,
  offDir,
  offenseColor,
  playCall,
  progress,
}: {
  formation: PlayerDot[];
  fromX: number;
  offDir: number;
  offenseColor: string;
  playCall: string;
  progress: number;
}) {
  // Get WR/TE positions
  const receivers = formation.filter(
    d => d.team === 'offense' && (d.role === 'WR' || d.role === 'TE')
  );

  // Route depth based on play call
  let routeDepth = 8;
  if (playCall?.includes('quick')) routeDepth = 4;
  else if (playCall?.includes('short') || playCall?.includes('screen')) routeDepth = 6;
  else if (playCall?.includes('medium')) routeDepth = 12;
  else if (playCall?.includes('deep')) routeDepth = 18;

  return (
    <g>
      {receivers.map((wr, i) => {
        const startX = clamp(wr.x, 1, 99);
        const startY = clamp(wr.y, 3, 97);
        // Route goes toward opponent end zone
        const endX = startX - offDir * routeDepth * (0.8 + i * 0.15);
        // Lateral break: alternate in/out
        const lateralBreak = (i % 2 === 0 ? -1 : 1) * 5;
        const midX = (startX + endX) / 2;
        const midY = startY;
        const endY = startY + lateralBreak;

        const pathD = `M ${startX} ${startY} L ${midX} ${midY} L ${clamp(endX, 2, 98)} ${clamp(endY, 5, 95)}`;

        // First receiver gets highlighted (targeted)
        const isTargeted = i === 0;
        const routeOpacity = isTargeted ? 0.5 * progress : 0.2 * progress;

        return (
          <path
            key={i}
            d={pathD}
            stroke={offenseColor}
            strokeWidth={isTargeted ? '1.0' : '0.6'}
            fill="none"
            strokeDasharray="2 2"
            opacity={routeOpacity}
          />
        );
      })}
    </g>
  );
}

// ════════════════════════════════════════════════════════════
// FORMATION GENERATION
// ════════════════════════════════════════════════════════════

interface PlayerDot {
  x: number;
  y: number;
  role: string;
  team: 'offense' | 'defense';
  isKeyPlayer?: boolean;
  number?: number;
}

function getFormationDots(
  losX: number,
  possession: 'home' | 'away',
  playType: PlayType | null,
  formationType: Formation | null,
  defensivePersonnel: DefensivePersonnel | null,
  lastPlay: PlayResult | null,
): PlayerDot[] {
  const offDir = possession === 'away' ? -1 : 1;

  // Special teams formations (unchanged from original)
  if (playType === 'punt') return getPuntFormation(losX, offDir);
  if (playType === 'kickoff') return getKickoffFormation(losX, offDir);
  if (playType === 'field_goal' || playType === 'extra_point') {
    return getFieldGoalFormation(losX, offDir);
  }

  // Use formation-accurate layouts when available
  const offenseLayout = formationType
    ? OFFENSIVE_FORMATIONS[formationType]
    : OFFENSIVE_FORMATIONS.shotgun; // fallback

  const defenseLayout = defensivePersonnel
    ? DEFENSIVE_FORMATIONS[defensivePersonnel]
    : DEFENSIVE_FORMATIONS.base_4_3; // fallback

  // Convert layout positions to field coordinates
  const offense = convertLayout(offenseLayout, losX, offDir, 'offense', lastPlay);
  const defense = convertLayout(defenseLayout, losX, offDir, 'defense', lastPlay);

  return [...offense, ...defense];
}

function convertLayout(
  layout: FormationPosition[],
  losX: number,
  offDir: number,
  team: 'offense' | 'defense',
  lastPlay: PlayResult | null,
): PlayerDot[] {
  return layout.map((pos) => {
    const x = losX + offDir * pos.x;
    const y = pos.y;

    // Mark key players from the play result
    let isKeyPlayer = false;
    let number: number | undefined;

    if (lastPlay && team === 'offense') {
      if (pos.role === 'QB' && lastPlay.passer) {
        isKeyPlayer = true;
        number = lastPlay.passer.number;
      } else if ((pos.role === 'RB' || pos.role === 'FB') && lastPlay.rusher) {
        isKeyPlayer = true;
        number = lastPlay.rusher.number;
      } else if (pos.role === 'WR' && lastPlay.receiver) {
        // Only mark the first WR as the targeted receiver
        if (!lastPlay.rusher || lastPlay.type === 'pass_complete' || lastPlay.type === 'pass_incomplete') {
          isKeyPlayer = true;
          number = lastPlay.receiver.number;
        }
      }
    }

    if (lastPlay && team === 'defense') {
      if ((pos.role === 'LB' || pos.role === 'DL' || pos.role === 'CB' || pos.role === 'S') && lastPlay.defender) {
        // Only mark one defensive player
        if (pos.role === 'LB' || pos.role === 'CB') {
          isKeyPlayer = true;
          number = lastPlay.defender.number;
        }
      }
    }

    return {
      x,
      y,
      role: pos.role,
      team,
      isKeyPlayer,
      number,
    };
  });
}

function getPuntFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    { x: losX, y: 35, role: 'OL', team: 'offense' },
    { x: losX, y: 42, role: 'OL', team: 'offense' },
    { x: losX, y: 48, role: 'OL', team: 'offense' },
    { x: losX, y: 52, role: 'OL', team: 'offense' },
    { x: losX, y: 58, role: 'OL', team: 'offense' },
    { x: losX, y: 65, role: 'OL', team: 'offense' },
    { x: losX + offDir * 1, y: 30, role: 'WG', team: 'offense' },
    { x: losX + offDir * 1, y: 70, role: 'WG', team: 'offense' },
    { x: losX + offDir * 0.5, y: 10, role: 'GN', team: 'offense' },
    { x: losX + offDir * 0.5, y: 90, role: 'GN', team: 'offense' },
    { x: losX + offDir * 12, y: 50, role: 'P', team: 'offense' },
  ];
  const defense: PlayerDot[] = [
    { x: losX - offDir * 1, y: 38, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 45, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 55, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 62, role: 'DL', team: 'defense' },
    { x: losX - offDir * 5, y: 35, role: 'LB', team: 'defense' },
    { x: losX - offDir * 5, y: 50, role: 'LB', team: 'defense' },
    { x: losX - offDir * 5, y: 65, role: 'LB', team: 'defense' },
    { x: losX - offDir * 12, y: 30, role: 'CB', team: 'defense' },
    { x: losX - offDir * 12, y: 70, role: 'CB', team: 'defense' },
    { x: losX - offDir * 20, y: 50, role: 'PR', team: 'defense' },
    { x: losX - offDir * 18, y: 40, role: 'S', team: 'defense' },
  ];
  return [...offense, ...defense];
}

function getKickoffFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    { x: losX + offDir * 2, y: 50, role: 'K', team: 'offense' },
    { x: losX, y: 10, role: 'CV', team: 'offense' },
    { x: losX, y: 20, role: 'CV', team: 'offense' },
    { x: losX, y: 30, role: 'CV', team: 'offense' },
    { x: losX, y: 38, role: 'CV', team: 'offense' },
    { x: losX, y: 45, role: 'CV', team: 'offense' },
    { x: losX, y: 55, role: 'CV', team: 'offense' },
    { x: losX, y: 62, role: 'CV', team: 'offense' },
    { x: losX, y: 70, role: 'CV', team: 'offense' },
    { x: losX, y: 80, role: 'CV', team: 'offense' },
    { x: losX, y: 90, role: 'CV', team: 'offense' },
  ];
  const defense: PlayerDot[] = [
    { x: losX - offDir * 15, y: 35, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 45, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 55, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 65, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 30, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 42, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 58, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 70, role: 'BK', team: 'defense' },
    { x: losX - offDir * 22, y: 40, role: 'BK', team: 'defense' },
    { x: losX - offDir * 22, y: 60, role: 'BK', team: 'defense' },
    { x: losX - offDir * 30, y: 50, role: 'KR', team: 'defense' },
  ];
  return [...offense, ...defense];
}

function getFieldGoalFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    { x: losX, y: 40, role: 'OL', team: 'offense' },
    { x: losX, y: 44, role: 'OL', team: 'offense' },
    { x: losX, y: 48, role: 'OL', team: 'offense' },
    { x: losX, y: 50, role: 'OL', team: 'offense' },
    { x: losX, y: 52, role: 'OL', team: 'offense' },
    { x: losX, y: 56, role: 'OL', team: 'offense' },
    { x: losX, y: 60, role: 'OL', team: 'offense' },
    { x: losX + offDir * 0.5, y: 36, role: 'WG', team: 'offense' },
    { x: losX + offDir * 0.5, y: 64, role: 'WG', team: 'offense' },
    { x: losX + offDir * 6, y: 50, role: 'H', team: 'offense' },
    { x: losX + offDir * 9, y: 50, role: 'K', team: 'offense' },
  ];
  const defense: PlayerDot[] = [
    { x: losX - offDir * 1, y: 40, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 44, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 48, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 52, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 56, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 60, role: 'DL', team: 'defense' },
    { x: losX - offDir * 3, y: 35, role: 'LB', team: 'defense' },
    { x: losX - offDir * 3, y: 50, role: 'LB', team: 'defense' },
    { x: losX - offDir * 3, y: 65, role: 'LB', team: 'defense' },
    { x: losX - offDir * 8, y: 30, role: 'CB', team: 'defense' },
    { x: losX - offDir * 8, y: 70, role: 'CB', team: 'defense' },
  ];
  return [...offense, ...defense];
}

// ════════════════════════════════════════════════════════════
// BALL TRAJECTORY CALCULATION
// ════════════════════════════════════════════════════════════

function calculateBallPosition(
  play: PlayResult,
  fromX: number,
  toX: number,
  t: number,
  possession: 'home' | 'away',
): { x: number; y: number } {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run':
    case 'scramble':
    case 'two_point': {
      const eased = easeOutCubic(t);
      const x = fromX + (toX - fromX) * eased;
      const weaveAmt = play.type === 'scramble' ? 5 : 3;
      const weave = Math.sin(t * Math.PI * 3) * weaveAmt * (1 - t);
      return { x, y: 50 + weave };
    }

    case 'pass_complete': {
      if (t < 0.15) {
        const dropT = easeOutCubic(t / 0.15);
        const qbX = fromX + offDir * 3 * dropT;
        return { x: qbX, y: 50 };
      } else if (t < 0.4) {
        // Ball in QB's hands, surveying
        const qbX = fromX + offDir * 3;
        const sway = Math.sin((t - 0.15) * 12) * 0.5;
        return { x: qbX + sway, y: 50 };
      } else if (t < 0.85) {
        const throwT = easeInOutQuad((t - 0.4) / 0.45);
        const qbX = fromX + offDir * 3;
        const dist = Math.abs(toX - qbX);
        const arcHeight = Math.min(dist * 0.5, 25);
        const x = qbX + (toX - qbX) * throwT;
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        const lateral =
          play.yardsGained > 15
            ? Math.sin(throwT * Math.PI * 0.5) * 8
            : Math.sin(throwT * Math.PI * 0.5) * 3;
        return { x, y: y + lateral };
      } else {
        const yacT = easeOutCubic((t - 0.85) / 0.15);
        const yacExtra = (toX - fromX) * 0.05 * yacT;
        return { x: toX + yacExtra * 0, y: 50 };
      }
    }

    case 'pass_incomplete': {
      if (t < 0.15) {
        const dropT = easeOutCubic(t / 0.15);
        return { x: fromX + offDir * 3 * dropT, y: 50 };
      } else if (t < 0.4) {
        const qbX = fromX + offDir * 3;
        return { x: qbX, y: 50 };
      } else if (t < 0.7) {
        const throwT = (t - 0.4) / 0.3;
        const qbX = fromX + offDir * 3;
        const targetX = fromX - offDir * 12;
        const dist = Math.abs(targetX - qbX);
        const arcHeight = Math.min(dist * 0.4, 18);
        const x = qbX + (targetX - qbX) * easeInOutQuad(throwT);
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        return { x, y };
      } else {
        const dropT = (t - 0.7) / 0.3;
        const qbX = fromX + offDir * 3;
        const targetX = fromX - offDir * 12;
        const endX = qbX + (targetX - qbX) * 0.9;
        const dropY = 50 + dropT * 15;
        return { x: endX + (targetX - endX) * dropT * 0.3, y: dropY };
      }
    }

    case 'sack': {
      if (t < 0.2) {
        const dropT = easeOutCubic(t / 0.2);
        return { x: fromX + offDir * 2 * dropT, y: 50 };
      } else if (t < 0.5) {
        // QB in pocket, defender closing
        const qbX = fromX + offDir * 2;
        const sway = Math.sin((t - 0.2) * 15) * 0.8;
        return { x: qbX + sway, y: 50 };
      } else {
        const sackT = easeOutCubic((t - 0.5) / 0.5);
        const qbX = fromX + offDir * 2;
        const x = qbX + (toX - qbX) * sackT;
        const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * 1.5 * (1 - t) : 0;
        return { x: x + jolt, y: 50 + jolt * 0.5 };
      }
    }

    case 'punt': {
      const eased = easeInOutQuad(t);
      const x = fromX + (toX - fromX) * eased;
      const dist = Math.abs(toX - fromX);
      const arcHeight = Math.min(dist * 0.9, 38);
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'kickoff': {
      const eased = easeInOutQuad(t);
      const x = fromX + (toX - fromX) * eased;
      const dist = Math.abs(toX - fromX);
      const arcHeight = Math.min(dist * 0.7, 35);
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'field_goal':
    case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const eased = easeInOutQuad(t);
      const x = fromX + (goalPostX - fromX) * eased;
      const arcHeight = play.type === 'extra_point' ? 20 : 28;
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'touchback': {
      return { x: toX, y: 50 };
    }

    default: {
      const eased = easeOutCubic(t);
      return { x: fromX + (toX - fromX) * eased, y: 50 };
    }
  }
}

// ════════════════════════════════════════════════════════════
// PLAY TRAJECTORY TRAIL
// ════════════════════════════════════════════════════════════

function PlayTrajectory({
  playType,
  fromX,
  toX,
  possession,
  progress,
  success,
}: {
  playType: PlayType;
  fromX: number;
  toX: number;
  possession: 'home' | 'away';
  progress: number;
  success: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (playType) {
    case 'run':
    case 'scramble':
    case 'two_point': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      if (Math.abs(currentX - fromX) < 0.3) return null;
      const color = playType === 'scramble' ? '#4ade80' : '#22c55e';
      return (
        <g>
          <line
            x1={fromX} y1={50}
            x2={currentX} y2={50}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          {progress > 0.3 && (
            <polygon
              points={
                toX > fromX
                  ? `${currentX},50 ${currentX - 2},47 ${currentX - 2},53`
                  : `${currentX},50 ${currentX + 2},47 ${currentX + 2},53`
              }
              fill={color}
              opacity="0.7"
            />
          )}
        </g>
      );
    }

    case 'pass_complete':
    case 'pass_incomplete': {
      const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
      const qbX = fromX + offDir * 3;
      const targetX = playType === 'pass_complete' ? toX : fromX - offDir * 12;
      const dist = Math.abs(targetX - qbX);
      const arcHeight = Math.min(dist * 0.5, 25);
      const midX = (qbX + targetX) / 2;

      return (
        <g>
          <path
            d={`M ${qbX} 50 Q ${midX} ${50 - arcHeight} ${targetX} 50`}
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="3 3"
            strokeLinecap="round"
            opacity="0.5"
          />
          {progress > 0.7 && playType === 'pass_complete' && (
            <circle cx={toX} cy={50} r="2" fill={color} opacity="0.7">
              <animate attributeName="r" values="1.5;2.5;2" dur="0.4s" fill="freeze" />
            </circle>
          )}
        </g>
      );
    }

    case 'sack': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      return (
        <line
          x1={fromX} y1={50}
          x2={currentX} y2={50}
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
          strokeDasharray="2 2"
        />
      );
    }

    case 'punt':
    case 'kickoff': {
      const dist = Math.abs(toX - fromX);
      const arcHeight = playType === 'punt'
        ? Math.min(dist * 0.9, 38)
        : Math.min(dist * 0.7, 35);
      const midX = (fromX + toX) / 2;
      return (
        <path
          d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${toX} 50`}
          stroke="#fbbf24"
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="3 4"
          strokeLinecap="round"
          opacity="0.4"
        />
      );
    }

    case 'field_goal':
    case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const arcHeight = playType === 'extra_point' ? 20 : 28;
      const midX = (fromX + goalPostX) / 2;
      const color = success ? '#22c55e' : '#ef4444';
      return (
        <g>
          <path
            d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${goalPostX} 50`}
            stroke={color}
            strokeWidth="1.2"
            fill="none"
            strokeDasharray="3 4"
            strokeLinecap="round"
            opacity="0.5"
          />
          <line
            x1={goalPostX} y1={25} x2={goalPostX} y2={75}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
          <line
            x1={goalPostX - 3} y1={25} x2={goalPostX} y2={25}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
          <line
            x1={goalPostX} y1={25} x2={goalPostX + 3} y2={25}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
        </g>
      );
    }

    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════
// OUTCOME MARKERS
// ════════════════════════════════════════════════════════════

function OutcomeMarker({
  lastPlay,
  fromX,
  toX,
  possession,
}: {
  lastPlay: PlayResult;
  fromX: number;
  toX: number;
  possession: 'home' | 'away';
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (lastPlay.type) {
    case 'pass_incomplete': {
      const dropX = fromX - offDir * 10;
      return (
        <g className="outcome-marker-anim">
          <line
            x1={dropX - 3} y1={47}
            x2={dropX + 3} y2={53}
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round"
          />
          <line
            x1={dropX + 3} y1={47}
            x2={dropX - 3} y2={53}
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round"
          />
          <text
            x={dropX} y={40}
            textAnchor="middle"
            fill="#ef4444"
            fontSize="3.5"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            INCOMPLETE
          </text>
        </g>
      );
    }

    case 'field_goal':
    case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      if (lastPlay.scoring) {
        return (
          <g className="outcome-marker-anim">
            <circle cx={goalPostX} cy={50} r={4} fill="#22c55e" opacity="0.3" />
            <text
              x={goalPostX} y={18}
              textAnchor="middle" fill="#22c55e"
              fontSize="4" fontWeight="bold" fontFamily="system-ui"
            >
              GOOD!
            </text>
          </g>
        );
      } else {
        return (
          <g className="outcome-marker-anim">
            <circle cx={goalPostX} cy={50} r={3} fill="#ef4444" opacity="0.3" />
            <text
              x={goalPostX} y={18}
              textAnchor="middle" fill="#ef4444"
              fontSize="4" fontWeight="bold" fontFamily="system-ui"
            >
              NO GOOD
            </text>
          </g>
        );
      }
    }

    case 'sack': {
      return (
        <g className="outcome-marker-anim">
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * 45 * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={toX + Math.cos(angle) * 1.5}
                y1={50 + Math.sin(angle) * 1.5}
                x2={toX + Math.cos(angle) * 4.5}
                y2={50 + Math.sin(angle) * 4.5}
                stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"
              />
            );
          })}
          <text
            x={toX} y={40}
            textAnchor="middle" fill="#ef4444"
            fontSize="3.5" fontWeight="bold" fontFamily="system-ui"
          >
            SACK
          </text>
        </g>
      );
    }

    default: {
      if (lastPlay.isTouchdown) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle" fill="#22c55e"
              fontSize="5" fontWeight="bold" fontFamily="system-ui"
            >
              TOUCHDOWN!
            </text>
          </g>
        );
      }

      if (lastPlay.turnover) {
        const label =
          lastPlay.turnover.type === 'interception' ? 'INTERCEPTION!' :
          lastPlay.turnover.type === 'fumble' ? 'FUMBLE!' :
          'TURNOVER!';
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle" fill="#f59e0b"
              fontSize="4" fontWeight="bold" fontFamily="system-ui"
            >
              {label}
            </text>
          </g>
        );
      }

      if (lastPlay.isSafety) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle" fill="#ef4444"
              fontSize="4" fontWeight="bold" fontFamily="system-ui"
            >
              SAFETY!
            </text>
          </g>
        );
      }

      if (
        (lastPlay.type === 'run' || lastPlay.type === 'scramble') &&
        lastPlay.yardsGained > 15
      ) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={40}
              textAnchor="middle" fill="#22c55e"
              fontSize="3.5" fontWeight="bold" fontFamily="system-ui" opacity="0.8"
            >
              +{lastPlay.yardsGained} YDS
            </text>
          </g>
        );
      }

      if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={40}
              textAnchor="middle" fill="#3b82f6"
              fontSize="3.5" fontWeight="bold" fontFamily="system-ui" opacity="0.8"
            >
              +{lastPlay.yardsGained} YDS
            </text>
          </g>
        );
      }

      return null;
    }
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function isFailedPlay(play: PlayResult): boolean {
  if (play.type === 'pass_incomplete') return true;
  if (play.type === 'sack') return true;
  if (play.type === 'field_goal' && !play.scoring) return true;
  if (play.type === 'extra_point' && !play.scoring) return true;
  if (play.turnover) return true;
  return false;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
