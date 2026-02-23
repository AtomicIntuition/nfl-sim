'use client';

import { useEffect, useRef, useState, useCallback, type SyntheticEvent } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import {
  PRE_SNAP_MS,
  SNAP_MS,
  DEVELOPMENT_MS,
  RESULT_MS,
  POST_PLAY_MS,
  KICKOFF_PRE_SNAP_MS,
  KICKOFF_SNAP_MS,
  KICKOFF_RESULT_MS,
  KICKOFF_POST_PLAY_MS,
  KICKOFF_PHASE_END,
  getKickoffDevMs,
} from './play-timing';
import type { Phase } from './play-timing';
import { YARD_PCT, YARDS, yardsToPercent } from './yard-grid';

// Re-export Phase for consumers
export type { Phase };
// Re-export timing constants for PlayersOverlay compatibility
export {
  PRE_SNAP_MS,
  SNAP_MS,
  DEVELOPMENT_MS,
  RESULT_MS,
  POST_PLAY_MS,
  KICKOFF_PHASE_END,
  getKickoffDevMs,
};

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
  teamAbbreviation: string;
  opposingTeamAbbreviation: string;
  teamColor: string;
  teamSecondaryColor: string;
  isKickoff: boolean;
  isPatAttempt: boolean;
}

// ── Logo Ball Size ────────────────────────────────────────────
const BALL_SIZE = 44;

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
  opposingTeamAbbreviation,
  teamColor,
  teamSecondaryColor,
  isKickoff,
  isPatAttempt,
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballX, setBallX] = useState(ballLeftPercent);

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

    // Compute correct origin for kick plays
    let fromX: number;
    if (lastPlay.type === 'extra_point') {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      fromX = goalPostX + (goalPostX < 50 ? 12.5 : -12.5);
    } else {
      fromX = prevBallLeftPercent;
    }
    const toX = ballLeftPercent;
    fromToRef.current = { from: fromX, to: toX };

    // Use kickoff-specific timing for kickoff plays
    const isKickoffPlay = lastPlay.type === 'kickoff';
    const preMs = isKickoffPlay ? KICKOFF_PRE_SNAP_MS : PRE_SNAP_MS;
    const snapMs = isKickoffPlay ? KICKOFF_SNAP_MS : SNAP_MS;
    const devMs = isKickoffPlay ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;
    const resMs = isKickoffPlay ? KICKOFF_RESULT_MS : RESULT_MS;
    const postMs = isKickoffPlay ? KICKOFF_POST_PLAY_MS : POST_PLAY_MS;
    const totalMs = preMs + snapMs + devMs + resMs + postMs;

    onAnimatingRef.current(true);
    updatePhase('pre_snap');
    setBallX(fromX);
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), preMs);
    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay, devMs);
    }, preMs + snapMs);
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      setBallX(toX);
      setAnimProgress(1);
    }, preMs + snapMs + devMs);
    const t4 = setTimeout(() => updatePhase('post_play'), preMs + snapMs + devMs + resMs);
    const t5 = setTimeout(() => {
      updatePhase('idle');
      onAnimatingRef.current(false);
    }, totalMs);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase, possession]);

  // ── RAF loop ───────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult, durationMs: number) {
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      setAnimProgress(t);
      setBallX(calculateSimpleBallX(play, fromX, toX, t, possession));
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Determine which team logo to show ──────────────────────
  // After a turnover, swap the logo. For kickoffs, show kicking team.
  const isPostTurnover = lastPlay?.turnover != null;
  const activeLogo = isPostTurnover ? opposingTeamAbbreviation : teamAbbreviation;
  const activeColor = isPostTurnover ? defenseColor : teamColor;

  // ── Determine visual effects for current play ──────────────
  const playType = lastPlay?.type ?? null;
  const isPlaying = phase !== 'idle';
  const inDev = phase === 'development';
  const inResult = phase === 'result' || phase === 'post_play';

  const isRun = playType === 'run' || playType === 'scramble' || playType === 'two_point';
  const isPass = playType === 'pass_complete' || playType === 'pass_incomplete';
  const isSack = playType === 'sack';
  const isKick = playType === 'punt' || playType === 'kickoff' || playType === 'field_goal' || playType === 'extra_point';
  const isTurnover = lastPlay?.turnover != null;
  const isTD = lastPlay?.isTouchdown ?? false;
  const isBigPlay = (lastPlay?.yardsGained ?? 0) > 20 || isTD;
  const isDeepPass = isPass && (lastPlay?.yardsGained ?? 0) > 20;

  // ── Logo Ball is ALWAYS visible ────────────────────────────
  // During idle: shows at ball position with gentle breathe animation
  // During play: animates along straight line

  const displayX = isPlaying ? ballX : ballLeftPercent;

  return (
    <div className="absolute inset-0 pointer-events-none z-[15] overflow-hidden">
      {/* ─── Speed Trail (runs/scrambles) ─── */}
      {isPlaying && inDev && isRun && animProgress > 0.1 && (
        <>
          {[0.06, 0.12, 0.18, 0.24, 0.30, 0.36].map((offset, i) => {
            const trailT = Math.max(0, animProgress - offset);
            const trailX = calculateSimpleBallX(lastPlay!, fromToRef.current.from, fromToRef.current.to, trailT, possession);
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${clamp(trailX, 2, 98)}%`,
                  top: '50%',
                  width: BALL_SIZE * (0.6 - i * 0.08),
                  height: BALL_SIZE * (0.6 - i * 0.08),
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: activeColor,
                  opacity: 0.35 - i * 0.05,
                  borderRadius: '50%',
                  animation: 'speed-trail-fade 0.4s ease-out forwards',
                }}
              />
            );
          })}
        </>
      )}

      {/* ─── Decorative Pass/Kick Arc (SVG) ─── */}
      {isPlaying && (inDev || inResult) && (isPass || isKick) && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <DecorativeArc
            fromX={fromToRef.current.from}
            toX={fromToRef.current.to}
            playType={playType!}
            isSuccess={!isFailedPlay(lastPlay!)}
            progress={animProgress}
          />
        </svg>
      )}

      {/* ─── Impact Burst (sacks, TFL) ─── */}
      {isPlaying && inResult && isSack && (
        <ImpactBurst x={fromToRef.current.to} />
      )}

      {/* ─── Turnover Shock Rings ─── */}
      {isPlaying && inResult && isTurnover && (
        <TurnoverShock x={fromToRef.current.to} />
      )}

      {/* ─── Touchdown Burst ─── */}
      {isPlaying && inResult && isTD && (
        <TouchdownBurst x={fromToRef.current.to} teamColor={activeColor} />
      )}

      {/* ─── Deep Pass Spiral Lines ─── */}
      {isPlaying && inDev && isDeepPass && animProgress > 0.3 && (
        <SpiralLines x={displayX} />
      )}

      {/* ─── Kick Altitude Ghost ─── */}
      {isPlaying && inDev && isKick && (
        <KickAltitudeGhost
          x={displayX}
          progress={animProgress}
          logoUrl={getTeamLogoUrl(activeLogo, 100)}
          borderColor={activeColor}
        />
      )}

      {/* ─── Logo Ball ─── */}
      <div
        className={!isPlaying ? 'logo-ball-breathe' : ''}
        style={{
          position: 'absolute',
          left: `${clamp(displayX, 2, 98)}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          transition: !isPlaying
            ? 'left 600ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            : undefined,
        }}
      >
        {/* Big play glow ring */}
        {isPlaying && isBigPlay && inDev && (
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 20,
              height: BALL_SIZE + 20,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'big-play-glow 0.8s ease-in-out infinite',
              boxShadow: `0 0 20px ${isTD ? '#22c55e' : '#d4af37'}, 0 0 40px ${isTD ? '#22c55e50' : '#d4af3750'}`,
              borderRadius: '50%',
            }}
          />
        )}

        {/* Outer glow */}
        <div
          className="absolute rounded-full"
          style={{
            width: BALL_SIZE + 10,
            height: BALL_SIZE + 10,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${activeColor}40 0%, transparent 70%)`,
            opacity: isPlaying ? 0.8 : 0.5,
          }}
        />

        {/* Main ball circle with logo */}
        <div
          style={{
            width: BALL_SIZE,
            height: BALL_SIZE,
            borderRadius: '50%',
            border: `3px solid ${activeColor}`,
            backgroundColor: '#111827',
            boxShadow: `0 0 12px ${activeColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={getTeamLogoUrl(activeLogo, 100)}
            alt=""
            width={BALL_SIZE - 10}
            height={BALL_SIZE - 10}
            style={{
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
            onError={handleLogoError}
          />
        </div>
      </div>

      {/* ─── Outcome markers ─── */}
      {isPlaying && inResult && lastPlay && (
        <OutcomeMarker
          lastPlay={lastPlay}
          fromX={fromToRef.current.from}
          toX={fromToRef.current.to}
          possession={possession}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SIMPLE BALL POSITION (straight line, y=50 always)
// ══════════════════════════════════════════════════════════════

function calculateSimpleBallX(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'scramble': case 'two_point': {
      // Slight hold at start (handoff), then accelerate
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // QB holds, then ball travels to catch point
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      const throwEnd = 0.8;
      if (t < holdEnd) {
        // QB dropback — slight backward movement
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      if (t < throwEnd) {
        const throwT = (t - holdEnd) / (throwEnd - holdEnd);
        const qbX = fromX + offDir * YARDS.SHORT_DROP;
        return qbX + (toX - qbX) * easeInOutQuad(throwT);
      }
      // After catch — already at toX
      return toX;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      // Ball travels toward target area but stops short
      const throwT = (t - holdEnd) / (1 - holdEnd);
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      const targetX = fromX - offDir * yardsToPercent(12);
      return qbX + (targetX - qbX) * easeInOutQuad(throwT);
    }
    case 'sack': {
      // QB drops back, then gets driven back
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    case 'kickoff': {
      // Two phases: kick flight, then return
      if (t < KICKOFF_PHASE_END) {
        const kickT = t / KICKOFF_PHASE_END;
        const kickDir = toX < fromX ? -1 : 1;
        const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
        const meta = play.kickoffMeta;
        let landingX: number;
        if (meta?.distance) {
          landingX = fromX + kickDir * yardsToPercent(meta.distance);
        } else {
          const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
          landingX = fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
        }
        return fromX + (landingX - fromX) * easeInOutQuad(kickT);
      }
      // Return phase
      const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
      const kickDir = toX < fromX ? -1 : 1;
      const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
      const meta = play.kickoffMeta;
      let landingX: number;
      if (meta?.distance) {
        landingX = fromX + kickDir * yardsToPercent(meta.distance);
      } else {
        const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
        landingX = fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
      }
      return landingX + (toX - landingX) * easeOutCubic(returnT);
    }
    case 'punt': {
      // Punt arc then possible return
      const isFairCatch = (play.description || '').toLowerCase().includes('fair catch');
      const isTouchback = play.yardsGained === 0;
      if (isFairCatch || isTouchback) {
        return fromX + (toX - fromX) * easeInOutQuad(t);
      }
      // Flight to landing, then return
      if (t < 0.6) {
        return fromX + (toX - fromX) * easeInOutQuad(t / 0.6);
      }
      return toX;
    }
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      return fromX + (goalPostX - fromX) * easeInOutQuad(t);
    }
    case 'touchback':
      return toX;
    default:
      return fromX + (toX - fromX) * easeOutCubic(t);
  }
}

// ══════════════════════════════════════════════════════════════
// DECORATIVE ARC (visual only — ball still moves straight)
// ══════════════════════════════════════════════════════════════

function DecorativeArc({
  fromX, toX, playType, isSuccess, progress,
}: {
  fromX: number; toX: number; playType: string;
  isSuccess: boolean; progress: number;
}) {
  const midX = (fromX + toX) / 2;
  const dist = Math.abs(toX - fromX);

  if (playType === 'pass_complete' || playType === 'pass_incomplete') {
    const arcHeight = Math.min(dist * 0.5, 25);
    const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
    const endX = fromX + (toX - fromX) * Math.min(progress * 1.2, 1);
    const midArcX = (fromX + endX) / 2;
    return (
      <path
        d={`M ${fromX} 50 Q ${midArcX} ${50 - arcHeight * Math.min(progress * 1.5, 1)} ${endX} 50`}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="4 3"
        strokeLinecap="round"
        opacity={0.5 * Math.min(progress * 3, 1)}
      />
    );
  }

  if (playType === 'punt' || playType === 'kickoff') {
    const arcHeight = Math.min(dist * 0.7, 35);
    return (
      <path
        d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${toX} 50`}
        stroke="#fbbf24"
        strokeWidth="1.2"
        fill="none"
        strokeDasharray="3 4"
        strokeLinecap="round"
        opacity={0.4}
      />
    );
  }

  if (playType === 'field_goal' || playType === 'extra_point') {
    const goalX = toX > 50 ? 91.66 : 8.33;
    const arcH = playType === 'extra_point' ? 20 : 28;
    const midGoalX = (fromX + goalX) / 2;
    const color = isSuccess ? '#22c55e' : '#ef4444';
    return (
      <g>
        <path
          d={`M ${fromX} 50 Q ${midGoalX} ${50 - arcH} ${goalX} 50`}
          stroke={color}
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="3 4"
          opacity="0.5"
        />
        <line x1={goalX} y1={25} x2={goalX} y2={75} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
      </g>
    );
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// VISUAL EFFECTS
// ══════════════════════════════════════════════════════════════

function ImpactBurst({ x }: { x: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const len = 24;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${clamp(x, 5, 95)}%`,
              top: '50%',
              width: 3,
              height: len,
              backgroundColor: '#ef4444',
              borderRadius: 2,
              transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
              transformOrigin: 'center center',
              animation: 'impact-burst 0.4s ease-out forwards',
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}

function TurnoverShock({ x }: { x: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${clamp(x, 5, 95)}%`,
            top: '50%',
            width: 30 + i * 30,
            height: 30 + i * 30,
            transform: 'translate(-50%, -50%)',
            border: '2px solid #f59e0b',
            animation: `shock-ring 0.6s ease-out ${i * 0.12}s forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

function TouchdownBurst({ x, teamColor }: { x: number; teamColor: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Green radial */}
      <div
        className="absolute rounded-full"
        style={{
          left: `${clamp(x, 5, 95)}%`,
          top: '50%',
          width: 80,
          height: 80,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 70%)',
          animation: 'td-radial-burst 0.6s ease-out forwards',
        }}
      />
      {/* Gold expanding ring */}
      <div
        className="absolute rounded-full"
        style={{
          left: `${clamp(x, 5, 95)}%`,
          top: '50%',
          width: 50,
          height: 50,
          transform: 'translate(-50%, -50%)',
          border: `3px solid ${teamColor}`,
          animation: 'shock-ring 0.8s ease-out forwards',
          opacity: 0,
        }}
      />
    </div>
  );
}

function SpiralLines({ x }: { x: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: `${clamp(x, 5, 95)}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: BALL_SIZE + 24,
        height: BALL_SIZE + 24,
        animation: 'spiral-rotate 0.6s linear infinite',
      }}
    >
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          className="absolute"
          style={{
            width: 2,
            height: 14,
            background: 'linear-gradient(to bottom, rgba(59,130,246,0.6), transparent)',
            top: 0,
            left: '50%',
            transformOrigin: `50% ${(BALL_SIZE + 24) / 2}px`,
            transform: `translateX(-50%) rotate(${deg}deg)`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function KickAltitudeGhost({
  x, progress, logoUrl, borderColor,
}: {
  x: number; progress: number; logoUrl: string; borderColor: string;
}) {
  // Ghost rises up on a parabolic arc: peak at t=0.5
  const altitude = Math.sin(progress * Math.PI);
  const ghostOpacity = 0.3 * altitude;
  const ghostY = 50 - altitude * 25; // rises up to 25% above center

  if (altitude < 0.1) return null;

  return (
    <div
      className="absolute"
      style={{
        left: `${clamp(x, 2, 98)}%`,
        top: `${ghostY}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 18,
        opacity: ghostOpacity,
      }}
    >
      <div
        style={{
          width: BALL_SIZE * 0.8,
          height: BALL_SIZE * 0.8,
          borderRadius: '50%',
          border: `2px solid ${borderColor}80`,
          backgroundColor: '#11182780',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={logoUrl}
          alt=""
          width={BALL_SIZE * 0.8 - 8}
          height={BALL_SIZE * 0.8 - 8}
          style={{ objectFit: 'contain', opacity: 0.5 }}
          draggable={false}
          onError={handleLogoError}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// OUTCOME MARKERS
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

  if (lastPlay.isTouchdown) {
    text = 'TOUCHDOWN!';
    color = '#22c55e';
    size = 'lg';
  } else if (lastPlay.type === 'pass_incomplete') {
    text = 'INCOMPLETE';
    color = '#ef4444';
    x = fromX - offDir * yardsToPercent(10);
  } else if (lastPlay.type === 'sack') {
    text = 'SACK';
    color = '#ef4444';
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
        top: '28%',
        transform: 'translate(-50%, -50%)',
        zIndex: 25,
        textAlign: 'center',
      }}
    >
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
// HELPERS
// ══════════════════════════════════════════════════════════════

/** Replace broken logo img with football emoji */
function handleLogoError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const parent = img.parentElement;
  if (parent) {
    const span = document.createElement('span');
    span.textContent = '\u{1F3C8}';
    span.style.fontSize = `${img.width * 0.7}px`;
    span.style.lineHeight = '1';
    parent.replaceChild(span, img);
  }
}

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
