'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayResult, PlayType } from '@/lib/simulation/types';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

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
  /** Team abbreviation for the animated ball logo */
  teamAbbreviation?: string;
  /** Team primary color for the animated ball border */
  teamColor?: string;
}

// ── Timing ───────────────────────────────────────────────────
const PRE_SNAP_MS = 500;
const SNAP_MS = 150;
const DEVELOPMENT_MS = 1800;
const RESULT_MS = 600;
const POST_PLAY_MS = 400;
const TOTAL_MS = PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS + POST_PLAY_MS;

type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

// ── Easing ───────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

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
  teamAbbreviation,
  teamColor,
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballPos, setBallPos] = useState({ x: 0, y: 50 });

  const fromToRef = useRef({ from: prevBallLeftPercent, to: ballLeftPercent });

  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const updatePhase = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChangeRef.current?.(newPhase);
  }, []);

  // ── Detect new play → start animation ──────────────────────
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    if (
      lastPlay.type === 'kneel' || lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' || lastPlay.type === 'coin_toss'
    ) return;

    const isKickPlay = lastPlay.type === 'extra_point' || lastPlay.type === 'field_goal';
    fromToRef.current = {
      from: isKickPlay ? ballLeftPercent : prevBallLeftPercent,
      to: ballLeftPercent,
    };
    const fromX = isKickPlay ? ballLeftPercent : prevBallLeftPercent;
    const toX = ballLeftPercent;

    onAnimatingRef.current(true);
    updatePhase('pre_snap');
    setBallPos({ x: fromX, y: 50 });
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), PRE_SNAP_MS);
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
    const t4 = setTimeout(() => updatePhase('post_play'), PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS);
    const t5 = setTimeout(() => {
      updatePhase('idle');
      onAnimatingRef.current(false);
    }, TOTAL_MS);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase]);

  // ── RAF loop ───────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult) {
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / DEVELOPMENT_MS, 1);
      setAnimProgress(t);
      setBallPos(calculateBallPosition(play, fromX, toX, t, possession));
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Render: only during active plays ──────────────────────
  const isPlaying = phase !== 'idle';
  if (!isPlaying || !lastPlay) return null;

  const fromX = fromToRef.current.from;
  const toX = fromToRef.current.to;
  const playType = lastPlay.type;
  const isSuccess = !isFailedPlay(lastPlay);

  const opacity = phase === 'post_play' ? 0.85 : 1;
  const isHuddlePlay = playType !== 'kickoff' && playType !== 'punt' &&
    playType !== 'field_goal' && playType !== 'extra_point';
  const offDir = possession === 'away' ? -1 : 1;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{
        opacity,
        transition: 'opacity 300ms ease-out',
      }}
    >
      {/* ─── SVG layer for trajectory lines ─── */}
      {(phase === 'development' || phase === 'result' || phase === 'post_play') && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <PlayTrajectory
            playType={playType}
            fromX={fromX}
            toX={toX}
            possession={possession}
            progress={animProgress}
            success={isSuccess}
          />
        </svg>
      )}

      {/* ─── Pre-snap huddle dots ─── */}
      {(phase === 'pre_snap' || phase === 'snap') && isHuddlePlay && (
        <HuddleDots
          fromX={fromX}
          offenseColor={offenseColor}
          defenseColor={defenseColor}
          possession={possession}
          fading={phase === 'snap'}
        />
      )}

      {/* ─── Pass target indicator during QB dropback ─── */}
      {phase === 'development' && animProgress < 0.4 &&
        (playType === 'pass_complete' || playType === 'pass_incomplete') && (
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            left: `${clamp(playType === 'pass_complete' ? toX : fromX - offDir * 12, 5, 95)}%`,
            top: '50%',
            width: 16,
            height: 16,
            transform: 'translate(-50%, -50%)',
            border: `2px solid ${playType === 'pass_complete' ? '#3b82f6' : '#ef4444'}`,
            backgroundColor: `${playType === 'pass_complete' ? '#3b82f6' : '#ef4444'}20`,
            opacity: 0.7 * (1 - animProgress / 0.4),
            zIndex: 4,
          }}
        />
      )}

      {/* ─── Trailing dots for run plays ─── */}
      {phase === 'development' && (playType === 'run' || playType === 'scramble' || playType === 'two_point') &&
        animProgress > 0.1 && (
        <>
          {[0.06, 0.12, 0.18].map((offset, i) => {
            const trailT = Math.max(0, animProgress - offset);
            const pos = calculateBallPosition(lastPlay, fromX, toX, trailT, possession);
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${clamp(pos.x, 2, 98)}%`,
                  top: `${clamp(pos.y, 5, 95)}%`,
                  width: 6 - i * 1.5,
                  height: 6 - i * 1.5,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: offenseColor,
                  opacity: 0.5 - i * 0.15,
                  zIndex: 5,
                }}
              />
            );
          })}
        </>
      )}

      {/* ─── Animated ball with team logo (all active phases) ─── */}
      <div
        className="absolute"
        style={{
          left: `${clamp(ballPos.x, 2, 98)}%`,
          top: `${clamp(ballPos.y, 5, 95)}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 6,
        }}
      >
        {teamAbbreviation ? (
          <div
            className="rounded-full overflow-hidden flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              backgroundColor: '#1a1a2e',
              border: `2px solid ${teamColor || offenseColor}`,
              boxShadow: `0 0 10px ${(teamColor || offenseColor)}50, 0 2px 6px rgba(0,0,0,0.5)`,
            }}
          >
            <img
              src={getTeamLogoUrl(teamAbbreviation)}
              alt=""
              className="w-[18px] h-[18px] object-contain"
              draggable={false}
            />
          </div>
        ) : (
          /* Fallback football shape */
          <div
            style={{
              width: 14,
              height: 9,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
              border: '1px solid #5C2D06',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}
          />
        )}
      </div>

      {/* ─── Outcome markers ─── */}
      {(phase === 'result' || phase === 'post_play') && (
        <OutcomeMarker
          lastPlay={lastPlay}
          fromX={fromX}
          toX={toX}
          possession={possession}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OUTCOME MARKERS (HTML — clean, undistorted text)
// ══════════════════════════════════════════════════════════════

function OutcomeMarker({
  lastPlay, fromX, toX, possession,
}: {
  lastPlay: PlayResult; fromX: number; toX: number;
  possession: 'home' | 'away';
}) {
  const offDir = possession === 'away' ? -1 : 1;

  let text = '';
  let color = '';
  let x = toX;
  let size: 'lg' | 'md' | 'sm' = 'md';
  let icon: 'x' | 'burst' | 'circle' | null = null;

  if (lastPlay.isTouchdown) {
    text = 'TOUCHDOWN!';
    color = '#22c55e';
    size = 'lg';
  } else if (lastPlay.type === 'pass_incomplete') {
    text = 'INCOMPLETE';
    color = '#ef4444';
    x = fromX - offDir * 10;
    icon = 'x';
  } else if (lastPlay.type === 'sack') {
    text = 'SACK';
    color = '#ef4444';
    icon = 'burst';
  } else if (lastPlay.turnover) {
    text = lastPlay.turnover.type === 'interception' ? 'INTERCEPTION!'
      : lastPlay.turnover.type === 'fumble' ? 'FUMBLE!' : 'TURNOVER!';
    color = '#f59e0b';
    size = 'lg';
  } else if (lastPlay.isSafety) {
    text = 'SAFETY!';
    color = '#ef4444';
    size = 'lg';
  } else if (lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point') {
    const goalPostX = possession === 'away' ? 91.66 : 8.33;
    text = lastPlay.scoring ? 'GOOD!' : 'NO GOOD';
    color = lastPlay.scoring ? '#22c55e' : '#ef4444';
    x = goalPostX;
    icon = 'circle';
  } else if (lastPlay.type === 'run' || lastPlay.type === 'scramble') {
    const yards = lastPlay.yardsGained;
    text = yards >= 0 ? `+${yards} YDS` : `${yards} YDS`;
    color = yards > 0 ? '#22c55e' : '#ef4444';
    size = 'sm';
  } else if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
    text = `+${lastPlay.yardsGained} YDS`;
    color = '#3b82f6';
    size = 'sm';
  }

  if (!text) return null;

  const fontSize = size === 'lg' ? 18 : size === 'md' ? 14 : 12;

  return (
    <div
      className="outcome-marker-anim absolute"
      style={{
        left: `${clamp(x, 5, 95)}%`,
        top: '33%',
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
        textAlign: 'center',
      }}
    >
      {/* Icon: X mark */}
      {icon === 'x' && (
        <div className="relative mx-auto mb-1" style={{ width: 16, height: 16 }}>
          <div
            className="absolute rounded-full"
            style={{
              top: '50%', left: '50%',
              width: 14, height: 2,
              background: color,
              transform: 'translate(-50%, -50%) rotate(45deg)',
              borderRadius: 1,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: '50%', left: '50%',
              width: 14, height: 2,
              background: color,
              transform: 'translate(-50%, -50%) rotate(-45deg)',
              borderRadius: 1,
            }}
          />
        </div>
      )}

      {/* Icon: Burst (sack) */}
      {icon === 'burst' && (
        <div className="relative mx-auto mb-1" style={{ width: 20, height: 20 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                top: '50%', left: '50%',
                width: 2, height: 10,
                background: color,
                borderRadius: 1,
                transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Icon: Circle glow (field goal) */}
      {icon === 'circle' && (
        <div
          className="mx-auto mb-1 rounded-full"
          style={{
            width: 20, height: 20,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
      )}

      {/* Text label */}
      <div
        className="font-black tracking-wider whitespace-nowrap"
        style={{
          color,
          fontSize,
          textShadow: `0 2px 6px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5), 0 0 20px ${color}40`,
          letterSpacing: '0.08em',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// BALL TRAJECTORY
// ══════════════════════════════════════════════════════════════

function calculateBallPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): { x: number; y: number } {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'scramble': case 'two_point': {
      const eased = easeOutCubic(t);
      const x = fromX + (toX - fromX) * eased;
      const weaveAmt = play.type === 'scramble' ? 5 : 3;
      const weave = Math.sin(t * Math.PI * 3) * weaveAmt * (1 - t);
      return { x, y: 50 + weave };
    }
    case 'pass_complete': {
      if (t < 0.15) {
        return { x: fromX + offDir * 3 * easeOutCubic(t / 0.15), y: 50 };
      } else if (t < 0.4) {
        const qbX = fromX + offDir * 3;
        return { x: qbX + Math.sin((t - 0.15) * 12) * 0.5, y: 50 };
      } else if (t < 0.85) {
        const throwT = easeInOutQuad((t - 0.4) / 0.45);
        const qbX = fromX + offDir * 3;
        const dist = Math.abs(toX - qbX);
        const arcHeight = Math.min(dist * 0.5, 25);
        const x = qbX + (toX - qbX) * throwT;
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        const lateral = play.yardsGained > 15
          ? Math.sin(throwT * Math.PI * 0.5) * 8
          : Math.sin(throwT * Math.PI * 0.5) * 3;
        return { x, y: y + lateral };
      } else {
        return { x: toX, y: 50 };
      }
    }
    case 'pass_incomplete': {
      if (t < 0.15) return { x: fromX + offDir * 3 * easeOutCubic(t / 0.15), y: 50 };
      if (t < 0.4) return { x: fromX + offDir * 3, y: 50 };
      if (t < 0.7) {
        const throwT = (t - 0.4) / 0.3;
        const qbX = fromX + offDir * 3;
        const targetX = fromX - offDir * 12;
        const dist = Math.abs(targetX - qbX);
        const arcHeight = Math.min(dist * 0.4, 18);
        return {
          x: qbX + (targetX - qbX) * easeInOutQuad(throwT),
          y: 50 - arcHeight * Math.sin(throwT * Math.PI),
        };
      }
      const dropT = (t - 0.7) / 0.3;
      const qbX = fromX + offDir * 3;
      const targetX = fromX - offDir * 12;
      const endX = qbX + (targetX - qbX) * 0.9;
      return { x: endX + (targetX - endX) * dropT * 0.3, y: 50 + dropT * 15 };
    }
    case 'sack': {
      if (t < 0.2) return { x: fromX + offDir * 2 * easeOutCubic(t / 0.2), y: 50 };
      if (t < 0.5) return { x: fromX + offDir * 2 + Math.sin((t - 0.2) * 15) * 0.8, y: 50 };
      const sackT = easeOutCubic((t - 0.5) / 0.5);
      const qbX2 = fromX + offDir * 2;
      const x = qbX2 + (toX - qbX2) * sackT;
      const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * 1.5 * (1 - t) : 0;
      return { x: x + jolt, y: 50 + jolt * 0.5 };
    }
    case 'punt': {
      const eased = easeInOutQuad(t);
      const dist = Math.abs(toX - fromX);
      return { x: fromX + (toX - fromX) * eased, y: 50 - Math.min(dist * 0.9, 38) * Math.sin(t * Math.PI) };
    }
    case 'kickoff': {
      const eased = easeInOutQuad(t);
      const dist = Math.abs(toX - fromX);
      return { x: fromX + (toX - fromX) * eased, y: 50 - Math.min(dist * 0.7, 35) * Math.sin(t * Math.PI) };
    }
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const eased = easeInOutQuad(t);
      const arcHeight = play.type === 'extra_point' ? 20 : 28;
      return { x: fromX + (goalPostX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
    }
    case 'touchback': return { x: toX, y: 50 };
    default: return { x: fromX + (toX - fromX) * easeOutCubic(t), y: 50 };
  }
}

// ══════════════════════════════════════════════════════════════
// PLAY TRAJECTORY TRAIL (SVG)
// ══════════════════════════════════════════════════════════════

function PlayTrajectory({
  playType, fromX, toX, possession, progress, success,
}: {
  playType: PlayType; fromX: number; toX: number;
  possession: 'home' | 'away'; progress: number; success: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (playType) {
    case 'run': case 'scramble': case 'two_point': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      if (Math.abs(currentX - fromX) < 0.3) return null;
      const color = playType === 'scramble' ? '#4ade80' : '#22c55e';
      return (
        <g>
          {/* Glow line */}
          <line x1={fromX} y1={50} x2={currentX} y2={50}
            stroke={color} strokeWidth="6" strokeLinecap="round" opacity="0.15" />
          {/* Main line */}
          <line x1={fromX} y1={50} x2={currentX} y2={50}
            stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          {progress > 0.3 && (
            <polygon
              points={toX > fromX
                ? `${currentX},50 ${currentX - 2},47 ${currentX - 2},53`
                : `${currentX},50 ${currentX + 2},47 ${currentX + 2},53`}
              fill={color} opacity="0.7" />
          )}
        </g>
      );
    }
    case 'pass_complete': case 'pass_incomplete': {
      const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
      const qbX = fromX + offDir * 3;
      const targetX = playType === 'pass_complete' ? toX : fromX - offDir * 12;
      const dist = Math.abs(targetX - qbX);
      const arcHeight = Math.min(dist * 0.5, 25);
      const midX = (qbX + targetX) / 2;
      return (
        <g>
          <path d={`M ${qbX} 50 Q ${midX} ${50 - arcHeight} ${targetX} 50`}
            stroke={color} strokeWidth="2" fill="none"
            strokeDasharray="5 3" strokeLinecap="round" opacity="0.5" />
          {progress > 0.7 && playType === 'pass_complete' && (
            <>
              <circle cx={toX} cy={50} r="2.5" fill="none" stroke={color} strokeWidth="0.5" opacity="0.5" />
              <circle cx={toX} cy={50} r="1.5" fill={color} opacity="0.7" />
            </>
          )}
        </g>
      );
    }
    case 'sack': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      return <line x1={fromX} y1={50} x2={currentX} y2={50}
        stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" strokeDasharray="2 2" />;
    }
    case 'punt': case 'kickoff': {
      const dist = Math.abs(toX - fromX);
      const arcH = playType === 'punt' ? Math.min(dist * 0.9, 38) : Math.min(dist * 0.7, 35);
      const midX = (fromX + toX) / 2;
      return <path d={`M ${fromX} 50 Q ${midX} ${50 - arcH} ${toX} 50`}
        stroke="#fbbf24" strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.4" />;
    }
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const arcH = playType === 'extra_point' ? 20 : 28;
      const midX = (fromX + goalPostX) / 2;
      const color = success ? '#22c55e' : '#ef4444';
      return (
        <g>
          <path d={`M ${fromX} 50 Q ${midX} ${50 - arcH} ${goalPostX} 50`}
            stroke={color} strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.5" />
          <line x1={goalPostX} y1={25} x2={goalPostX} y2={75} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
          <line x1={goalPostX - 3} y1={25} x2={goalPostX} y2={25} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
          <line x1={goalPostX} y1={25} x2={goalPostX + 3} y2={25} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
        </g>
      );
    }
    default: return null;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
// HUDDLE DOTS (pre-snap formation preview)
// ══════════════════════════════════════════════════════════════

function HuddleDots({
  fromX, offenseColor, defenseColor, possession, fading,
}: {
  fromX: number; offenseColor: string; defenseColor: string;
  possession: 'home' | 'away'; fading: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;
  const dotSize = 8;

  // Deterministic spread based on fromX to avoid Math.random
  const seed = Math.round(fromX * 100);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 200ms ease-out',
      }}
    >
      {/* Offense huddle — clustered behind LOS */}
      {Array.from({ length: 7 }, (_, i) => {
        const xSpread = ((seed + i * 17) % 15) / 10; // 0–1.5
        const ySpread = ((seed + i * 31) % 20) - 10; // -10 to +10
        return (
          <div
            key={`off-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${clamp(fromX - offDir * (2 + xSpread), 3, 97)}%`,
              top: `${clamp(50 + ySpread * 0.8, 25, 75)}%`,
              width: dotSize,
              height: dotSize,
              backgroundColor: offenseColor,
              opacity: 0.6,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 4px ${offenseColor}60`,
              zIndex: 3,
            }}
          />
        );
      })}
      {/* Defense huddle — clustered ahead of LOS */}
      {Array.from({ length: 7 }, (_, i) => {
        const xSpread = ((seed + i * 23) % 15) / 10;
        const ySpread = ((seed + i * 37) % 20) - 10;
        return (
          <div
            key={`def-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${clamp(fromX + offDir * (2.5 + xSpread), 3, 97)}%`,
              top: `${clamp(50 + ySpread * 0.8, 25, 75)}%`,
              width: dotSize,
              height: dotSize,
              backgroundColor: defenseColor,
              opacity: 0.6,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 4px ${defenseColor}60`,
              zIndex: 3,
            }}
          />
        );
      })}
    </div>
  );
}
