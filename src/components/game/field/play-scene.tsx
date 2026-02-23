'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
// LOGO IMAGE WITH REACT-BASED FALLBACK
// ══════════════════════════════════════════════════════════════
// Safari can fire img.onerror on initial load due to CORS/cache timing,
// but succeed moments later. Instead of permanently replacing the DOM node
// (which React can't recover), we track failures in state and retry on
// each new play (when playKey changes).

function LogoImg({
  src, size, flip, playKey, opacity,
}: {
  src: string; size: number; flip?: boolean; playKey?: number; opacity?: number;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const MAX_RETRIES = 2;

  // Reset retry state when playKey changes so the logo gets fresh retries
  const prevKeyRef = useRef(playKey);
  if (playKey !== prevKeyRef.current) {
    prevKeyRef.current = playKey;
    if (exhausted) { setExhausted(false); setRetryCount(0); }
  }

  // Cleanup timer on unmount
  useEffect(() => () => { clearTimeout(retryTimerRef.current); }, []);

  if (exhausted) {
    return (
      <span style={{ fontSize: size * 0.7, lineHeight: '1', opacity }}>{'\u{1F3C8}'}</span>
    );
  }

  const handleError = () => {
    if (retryCount < MAX_RETRIES) {
      // Delay retry to let Safari CORS/cache settle
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((c) => c + 1);
      }, 500);
    } else {
      setExhausted(true);
    }
  };

  // Cache-busting param on retries to bypass cached failures
  const imgSrc = retryCount > 0 ? `${src}${src.includes('?') ? '&' : '?'}r=${retryCount}` : src;

  return (
    <img
      key={retryCount}
      src={imgSrc}
      alt=""
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        pointerEvents: 'none',
        userSelect: 'none',
        transform: flip ? 'scaleX(-1)' : undefined,
        opacity,
      }}
      draggable={false}
      onError={handleError}
    />
  );
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
  const [qbX, setQbX] = useState(ballLeftPercent);

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
    setQbX(fromX);
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), preMs);
    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay, devMs);
    }, preMs + snapMs);
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      if (isSplitPlay(lastPlay.type)) {
        setBallX(calculateBallPosition(lastPlay, fromX, toX, 1, possession));
        setQbX(calculateQBPosition(lastPlay, fromX, toX, 1, possession));
      } else {
        setBallX(toX);
        setQbX(toX);
      }
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
    const split = isSplitPlay(play.type);
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      setAnimProgress(t);
      if (split) {
        setBallX(calculateBallPosition(play, fromX, toX, t, possession));
        setQbX(calculateQBPosition(play, fromX, toX, t, possession));
      } else {
        const x = calculateSimpleBallX(play, fromX, toX, t, possession);
        setBallX(x);
        setQbX(x);
      }
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Determine which team logo to show ──────────────────────
  // After a turnover, swap the logo. For kickoffs, show kicking team.
  const isPostTurnover = lastPlay?.turnover != null;
  const activeLogo = isPostTurnover ? opposingTeamAbbreviation : teamAbbreviation;
  const activeColor = isPostTurnover ? defenseColor : teamColor;

  // Home team logos face left (toward opponent) — flip when home has the ball
  const flipLogo = (possession === 'home' && !isPostTurnover) || (possession === 'away' && isPostTurnover);

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
  // During play: QB logo follows qbX, traveling ball follows ballX

  const displayQbX = isPlaying ? qbX : ballLeftPercent;
  const displayBallX = isPlaying ? ballX : ballLeftPercent;
  const isKickoffPlay = playType === 'kickoff';
  const split = isSplitPlay(playType ?? undefined);
  const showBallDot = isPlaying && split && (inDev || inResult) && showTravelingBall(playType ?? undefined, animProgress, lastPlay);

  // ── Kickoff scene data ──────────────────────────────────────
  // IMPORTANT: gameState is captured AFTER the kickoff is resolved, so
  // possession is already flipped to the RECEIVING team by the time we see it.
  // Therefore: teamAbbreviation = receiver, opposingTeamAbbreviation = kicker.
  // The kicking team is the OPPOSITE of current possession.
  const kickingTeam = possession === 'home' ? 'away' : 'home';
  const kickoffLandingX = (isKickoffPlay && lastPlay)
    ? getKickoffLandingX(lastPlay, fromToRef.current.from, kickingTeam)
    : 0;
  const kickoffIsTouchback = isKickoffPlay && (lastPlay?.yardsGained === 0);
  // Home kicks right-to-left (faces right, no flip), Away kicks left-to-right (faces left, flip)
  const kickerFlip = kickingTeam === 'away';
  const receiverFlip = possession === 'away';

  return (
    <div className="absolute inset-0 pointer-events-none z-[15] overflow-hidden">
      {/* ─── Speed Trail (runs/scrambles) ─── */}
      {isPlaying && inDev && isRun && animProgress > 0.1 && (
        <>
          {[0.06, 0.12, 0.18, 0.24, 0.30, 0.36].map((offset, i) => {
            const trailT = Math.max(0, animProgress - offset);
            const trailX = calculateBallPosition(lastPlay!, fromToRef.current.from, fromToRef.current.to, trailT, possession);
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
        <SpiralLines x={displayBallX} />
      )}

      {/* ─── Kick Altitude Ghost (non-kickoff kicks only) ─── */}
      {isPlaying && inDev && isKick && !isKickoffPlay && (
        <KickAltitudeGhost
          x={displayBallX}
          progress={animProgress}
          logoUrl={getTeamLogoUrl(activeLogo, 100)}
          borderColor={activeColor}
          flipLogo={flipLogo}
          playKey={playKey}
        />
      )}

      {/* ─── Kickoff Scene (two-logo cinematic) ─── */}
      {/* Note: possession is already flipped to receiver, so opposingTeam = kicker */}
      {isKickoffPlay && isPlaying && lastPlay && (
        <KickoffScene
          kickerAbbrev={opposingTeamAbbreviation}
          kickerColor={defenseColor}
          receiverAbbrev={teamAbbreviation}
          receiverColor={teamColor}
          fromX={fromToRef.current.from}
          toX={fromToRef.current.to}
          landingX={kickoffLandingX}
          animProgress={animProgress}
          phase={phase}
          isTouchback={kickoffIsTouchback}
          isTD={isTD}
          playKey={playKey}
          flipKicker={kickerFlip}
          flipReceiver={receiverFlip}
        />
      )}

      {/* ─── Scrimmage Travel Line ─── */}
      {isPlaying && (inDev || inResult) && !isKickoffPlay && split && (
        (() => {
          const from = fromToRef.current.from;
          const to = fromToRef.current.to;
          const lineLeft = Math.min(from, to);
          const lineWidth = Math.abs(to - from);
          return (
            <div
              style={{
                position: 'absolute',
                left: `${lineLeft}%`,
                width: `${lineWidth}%`,
                top: '50%',
                height: 0,
                borderTop: '1.5px dashed rgba(255, 255, 255, 0.12)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          );
        })()
      )}

      {/* ─── Traveling Ball Dot (golden circle, separates from QB) ─── */}
      {showBallDot && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(displayBallX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 21,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#d4af37',
              boxShadow: '0 0 8px #d4af3780, 0 0 16px #d4af3740',
            }}
          />
        </div>
      )}

      {/* ─── Logo Ball (hidden during kickoff animation) ─── */}
      {!(isKickoffPlay && isPlaying) && (
        <div
          className={!isPlaying ? 'logo-ball-breathe' : ''}
          style={{
            position: 'absolute',
            left: `${clamp(displayQbX, 2, 98)}%`,
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
            <LogoImg
              src={getTeamLogoUrl(activeLogo, 100)}
              size={BALL_SIZE - 10}
              flip={flipLogo}
              playKey={playKey}
            />
          </div>
        </div>
      )}

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
// KICKOFF LANDING X (shared by calculateSimpleBallX + KickoffScene)
// ══════════════════════════════════════════════════════════════

function getKickoffLandingX(play: PlayResult, fromX: number, kickingTeam: 'home' | 'away'): number {
  const kickDir = kickingTeam === 'home' ? -1 : 1; // home kicks right-to-left, away kicks left-to-right
  const meta = play.kickoffMeta;

  // Short kick: ball doesn't reach landing zone — lands around the 25-30 area
  if (meta?.touchbackType === 'short') {
    // Ball lands roughly 40 yards from kicker (at ~own 25-30)
    return fromX + kickDir * yardsToPercent(meta.distance || 42);
  }

  if (meta?.distance) {
    return fromX + kickDir * yardsToPercent(meta.distance);
  }
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
  const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
  return fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
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
      // possession = receiving team (already flipped), so kicker is the opposite
      const kicker = possession === 'home' ? 'away' : 'home';
      const landingX = getKickoffLandingX(play, fromX, kicker);
      if (t < KICKOFF_PHASE_END) {
        const kickT = t / KICKOFF_PHASE_END;
        return fromX + (landingX - fromX) * easeInOutQuad(kickT);
      }
      const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
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
      // For missed FGs, possession has flipped — kicker is opposite of current possession
      const kicker = (play.type === 'field_goal' && !play.scoring)
        ? (possession === 'home' ? 'away' : 'home')
        : possession;
      const goalPostX = kicker === 'away' ? 91.66 : 8.33;
      return fromX + (goalPostX - fromX) * easeInOutQuad(t);
    }
    case 'touchback':
      return toX;
    default:
      return fromX + (toX - fromX) * easeOutCubic(t);
  }
}

// ══════════════════════════════════════════════════════════════
// QB POSITION (where team logo stays) — split plays only
// ══════════════════════════════════════════════════════════════

function calculateQBPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'two_point': {
      // Slight backward motion during handoff, then return to LOS and stay
      if (t < 0.1) {
        const dropT = t / 0.1;
        return fromX + offDir * YARDS.SHORT_DROP * 0.3 * easeOutCubic(dropT);
      }
      if (t < 0.2) {
        const returnT = (t - 0.1) / 0.1;
        return fromX + offDir * YARDS.SHORT_DROP * 0.3 * (1 - easeOutCubic(returnT));
      }
      return fromX;
    }
    case 'scramble': {
      // QB carries the ball — same as current run behavior
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // Dropback, then stay in pocket
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      return fromX + offDir * YARDS.SHORT_DROP;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      return fromX + offDir * YARDS.SHORT_DROP;
    }
    case 'sack': {
      // Dropback then driven back to toX
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    default:
      return calculateSimpleBallX(play, fromX, toX, t, possession);
  }
}

// ══════════════════════════════════════════════════════════════
// BALL POSITION (where the golden ball dot goes) — split plays
// ══════════════════════════════════════════════════════════════

function calculateBallPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'two_point': {
      // Stays at LOS during handoff, then moves to toX
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'scramble': {
      // Tracks QB (QB carries ball)
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // Tracks QB during dropback, then flies from QB to catch point
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      const throwEnd = 0.8;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      if (t < throwEnd) {
        const throwT = (t - holdEnd) / (throwEnd - holdEnd);
        const qbX = fromX + offDir * YARDS.SHORT_DROP;
        return qbX + (toX - qbX) * easeInOutQuad(throwT);
      }
      return toX;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      const throwT = (t - holdEnd) / (1 - holdEnd);
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      const targetX = fromX - offDir * yardsToPercent(12);
      return qbX + (targetX - qbX) * easeInOutQuad(throwT);
    }
    case 'sack': {
      // Ball tracks QB exactly
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    default:
      return calculateSimpleBallX(play, fromX, toX, t, possession);
  }
}

/** Returns true for play types where QB and ball should be separate elements */
function isSplitPlay(type: string | undefined): boolean {
  return type === 'run' || type === 'pass_complete' || type === 'pass_incomplete'
    || type === 'sack' || type === 'scramble' || type === 'two_point';
}

/** Returns true when the golden ball dot should be visible (ball separates from QB) */
function showTravelingBall(type: string | undefined, animProgress: number, play: PlayResult | null): boolean {
  if (!type || !play) return false;
  if (type === 'run' || type === 'two_point') return animProgress > 0.1;
  if (type === 'pass_complete') {
    const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
    return animProgress > (isPA ? 0.4 : 0.3);
  }
  if (type === 'pass_incomplete') return animProgress > 0.35;
  // scramble / sack: ball stays with QB, no separate dot
  return false;
}

// ══════════════════════════════════════════════════════════════
// KICKOFF SCENE — Two-logo cinematic kickoff visualization
// ══════════════════════════════════════════════════════════════

const KICKOFF_BALL_SIZE = 14;

function KickoffScene({
  kickerAbbrev,
  kickerColor,
  receiverAbbrev,
  receiverColor,
  fromX,
  toX,
  landingX,
  animProgress,
  phase,
  isTouchback,
  isTD,
  playKey,
  flipKicker,
  flipReceiver,
}: {
  kickerAbbrev: string;
  kickerColor: string;
  receiverAbbrev: string;
  receiverColor: string;
  fromX: number;
  toX: number;
  landingX: number;
  animProgress: number;
  phase: Phase;
  isTouchback: boolean;
  isTD: boolean;
  playKey: number;
  flipKicker: boolean;
  flipReceiver: boolean;
}) {
  const inDev = phase === 'development';
  const inResult = phase === 'result' || phase === 'post_play';

  // ── Receiver starting position: near end zone where ball is headed ──
  // Home kicks right-to-left (toward 8.33), receiver waits near 8.33
  // Away kicks left-to-right (toward 91.66), receiver waits near 91.66
  // flipKicker is true when away is kicking (kicks toward 91.66)
  const receiverEndZone = flipKicker ? (91.66 - 5) : (8.33 + 5);

  // ── Phase breakpoints (within 0→1 animProgress during development) ──
  const CATCH_T = KICKOFF_PHASE_END; // 0.45

  // ── Kicker logo ──
  let kickerOpacity = 1;
  let kickerX = fromX;
  if (inDev) {
    if (animProgress < CATCH_T) {
      kickerOpacity = 1 - animProgress * (0.5 / CATCH_T); // 1 → 0.5
    } else {
      const fadeT = (animProgress - CATCH_T) / (1 - CATCH_T);
      kickerOpacity = 0.5 * (1 - fadeT); // 0.5 → 0
    }
  } else if (inResult) {
    kickerOpacity = 0;
  }

  // ── Receiver logo ──
  let receiverX = receiverEndZone;
  let receiverOpacity = 1;
  if (inDev) {
    if (animProgress < 0.3) {
      // Holds position
      receiverX = receiverEndZone;
    } else if (animProgress < CATCH_T) {
      // Drifts toward landing spot
      const driftT = (animProgress - 0.3) / (CATCH_T - 0.3);
      receiverX = receiverEndZone + (landingX - receiverEndZone) * easeOutCubic(driftT);
    } else if (isTouchback) {
      // Touchback: stays at landing position (end zone area)
      receiverX = landingX;
    } else {
      // Return phase: runs from landing to final position
      const returnT = (animProgress - CATCH_T) / (1 - CATCH_T);
      receiverX = landingX + (toX - landingX) * easeOutCubic(returnT);
    }
  } else if (inResult) {
    receiverX = toX;
  }

  // ── Kicked ball (golden circle) ──
  let ballVisible = false;
  let ballPosX = fromX;
  let ballPosY = 50;
  if (inDev && animProgress < CATCH_T) {
    ballVisible = true;
    const kickT = animProgress / CATCH_T;
    ballPosX = fromX + (landingX - fromX) * easeInOutQuad(kickT);
    // Parabolic arc — peaks at midpoint
    const altitude = Math.sin(kickT * Math.PI);
    ballPosY = 50 - altitude * 25;
  }

  // ── Speed trails on receiver during return ──
  const showSpeedTrails = inDev && animProgress > CATCH_T && !isTouchback;

  return (
    <>
      {/* ─── Kicker Logo ─── */}
      {kickerOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(kickerX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 19,
            opacity: kickerOpacity,
            transition: inResult ? 'opacity 300ms ease-out' : undefined,
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 10,
              height: BALL_SIZE + 10,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${kickerColor}40 0%, transparent 70%)`,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: '50%',
              border: `3px solid ${kickerColor}`,
              backgroundColor: '#111827',
              boxShadow: `0 0 12px ${kickerColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogoImg
              src={getTeamLogoUrl(kickerAbbrev, 100)}
              size={BALL_SIZE - 10}
              flip={flipKicker}
              playKey={playKey}
            />
          </div>
        </div>
      )}

      {/* ─── Kicked Ball (golden circle in flight) ─── */}
      {ballVisible && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(ballPosX, 2, 98)}%`,
            top: `${ballPosY}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 21,
          }}
        >
          <div
            style={{
              width: KICKOFF_BALL_SIZE,
              height: KICKOFF_BALL_SIZE,
              borderRadius: '50%',
              backgroundColor: '#d4af37',
              boxShadow: '0 0 8px #d4af3780, 0 0 16px #d4af3740',
            }}
          />
        </div>
      )}

      {/* ─── Speed Trails (receiver return) ─── */}
      {showSpeedTrails && (
        <>
          {[0.06, 0.12, 0.18, 0.24, 0.30, 0.36].map((offset, i) => {
            const trailT = Math.max(CATCH_T, animProgress - offset);
            const returnT = (trailT - CATCH_T) / (1 - CATCH_T);
            const trailX = landingX + (toX - landingX) * easeOutCubic(returnT);
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
                  backgroundColor: receiverColor,
                  opacity: 0.35 - i * 0.05,
                  borderRadius: '50%',
                  animation: 'speed-trail-fade 0.4s ease-out forwards',
                }}
              />
            );
          })}
        </>
      )}

      {/* ─── Receiver Logo ─── */}
      <div
        style={{
          position: 'absolute',
          left: `${clamp(receiverX, 2, 98)}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          opacity: receiverOpacity,
        }}
      >
        {/* Big play glow for TD return */}
        {isTD && inDev && animProgress > CATCH_T && (
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 20,
              height: BALL_SIZE + 20,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'big-play-glow 0.8s ease-in-out infinite',
              boxShadow: '0 0 20px #22c55e, 0 0 40px #22c55e50',
              borderRadius: '50%',
            }}
          />
        )}

        <div
          className="absolute rounded-full"
          style={{
            width: BALL_SIZE + 10,
            height: BALL_SIZE + 10,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${receiverColor}40 0%, transparent 70%)`,
            opacity: 0.8,
          }}
        />
        <div
          style={{
            width: BALL_SIZE,
            height: BALL_SIZE,
            borderRadius: '50%',
            border: `3px solid ${receiverColor}`,
            backgroundColor: '#111827',
            boxShadow: `0 0 12px ${receiverColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LogoImg
            src={getTeamLogoUrl(receiverAbbrev, 100)}
            size={BALL_SIZE - 10}
            flip={flipReceiver}
            playKey={playKey}
          />
        </div>
      </div>
    </>
  );
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
    // Kick goes toward the opposite end zone from where the kicker stands
    const goalX = fromX > 50 ? 8.33 : 91.66;
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
  x, progress, logoUrl, borderColor, flipLogo, playKey,
}: {
  x: number; progress: number; logoUrl: string; borderColor: string; flipLogo?: boolean; playKey?: number;
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
        <LogoImg
          src={logoUrl}
          size={BALL_SIZE * 0.8 - 8}
          flip={flipLogo}
          playKey={playKey}
          opacity={0.5}
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
  } else if (lastPlay.type === 'kickoff') {
    if (lastPlay.yardsGained === 0) {
      // Dynamic Kickoff tiered touchback labels
      const tbType = lastPlay.kickoffMeta?.touchbackType;
      if (tbType === 'endzone') {
        text = 'TOUCHBACK (35)';
      } else if (tbType === 'bounce') {
        text = 'TOUCHBACK (20)';
      } else if (tbType === 'short') {
        text = 'SHORT KICK — B40';
      } else {
        text = 'TOUCHBACK';
      }
      color = tbType === 'short' ? '#f59e0b' : '#94a3b8';
      size = 'md';
    } else {
      text = `+${lastPlay.yardsGained} YDS`;
      color = '#22c55e';
      size = 'sm';
    }
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
    // For missed FGs, possession has flipped — kicker is opposite of current possession
    const kicker = (lastPlay.type === 'field_goal' && !lastPlay.scoring)
      ? (possession === 'home' ? 'away' : 'home')
      : possession;
    const goalPostX = kicker === 'away' ? 91.66 : 8.33;
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
