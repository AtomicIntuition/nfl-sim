'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
import { YARD_PCT, YARDS, yardsToPercent } from './yard-grid';

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

// ── Timing (exported for PlayersOverlay) ─────────────────────
export const PRE_SNAP_MS = 400;
export const SNAP_MS = 200;
export const DEVELOPMENT_MS = 1800;
export const RESULT_MS = 400;
export const POST_PLAY_MS = 100;
const TOTAL_MS = PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS + POST_PLAY_MS;

// ── Kickoff-specific timing ─────────────────────────────────
const KICKOFF_PRE_SNAP_MS = 500;
const KICKOFF_SNAP_MS = 200;
const KICKOFF_RESULT_MS = 400;
const KICKOFF_POST_PLAY_MS = 100;

/** Get the development phase duration for kickoffs based on play outcome */
export function getKickoffDevMs(play: PlayResult | null): number {
  if (!play || play.type !== 'kickoff') return DEVELOPMENT_MS;
  if (play.yardsGained === 0) return 1400; // touchback — quick
  if (play.isTouchdown) return 2400;       // TD return — dramatic
  if (play.yardsGained >= 35) return 2000;  // big return
  return 1800;                              // normal return
}

export type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

/** Kickoff flight phase fraction (when ball lands) — shared with PlayersOverlay */
export const KICKOFF_PHASE_END = 0.45;

// ── Easing ───────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// ══════════════════════════════════════════════════════════════
// ROUTE SHAPE SYSTEM (pass play visual paths)
// ══════════════════════════════════════════════════════════════

type RoutePoint = { dx: number; dy: number };

// ── Concept-specific route shapes (Arians playbook) ──────────
const CONCEPT_ROUTES: Record<string, RoutePoint[]> = {
  // Short concepts
  hitch:  [{ dx: 0, dy: 0 }, { dx: 0.6, dy: 0.05 }, { dx: 0.85, dy: 0.03 }, { dx: 1, dy: -0.05 }],       // Comeback at 8yds
  curl:   [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.9, dy: -0.1 }, { dx: 1, dy: -0.15 }],           // Deep comeback, settle
  shake:  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.3 }, { dx: 0.5, dy: 0.15 }, { dx: 1, dy: -0.4 }],           // Inside-outside break
  angle:  [{ dx: 0, dy: 0 }, { dx: 0.2, dy: -0.3 }, { dx: 0.45, dy: -0.2 }, { dx: 1, dy: 0.4 }],          // Flat then angle upfield
  stick:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],             // Straight then sit in zone

  // Medium concepts
  semi:   [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.1 }, { dx: 0.6, dy: 0.3 }, { dx: 1, dy: 0.5 }],             // Skinny post
  bench:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0 }, { dx: 0.65, dy: 0.15 }, { dx: 1, dy: 0.8 }],             // Out to sideline
  drive:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: -0.15 }, { dx: 0.7, dy: 0 }, { dx: 1, dy: 0.6 }],             // Deep cross
  cross:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],               // Shallow cross
  blinky: [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.1 }, { dx: 0.55, dy: -0.1 }, { dx: 1, dy: 0.4 }],          // Hesitation move

  // Deep concepts
  go:     [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],           // Straight vertical
  cab:    [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.45 }],              // Corner-and-back
  pylon:  [{ dx: 0, dy: 0 }, { dx: 0.45, dy: -0.1 }, { dx: 0.7, dy: 0.2 }, { dx: 1, dy: 0.75 }],          // Corner/flag to pylon
  x_ray:  [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.3 }, { dx: 0.55, dy: 0.15 }, { dx: 1, dy: 0.5 }],          // Post double-move
  delta:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.05 }, { dx: 0.6, dy: 0.15 }, { dx: 1, dy: 0.3 }],           // Seam split

  // Special
  screen: [{ dx: -0.15, dy: 0.5 }, { dx: -0.1, dy: 0.6 }, { dx: 0.2, dy: 0.55 }, { dx: 1, dy: 0.3 }],
  waggle: [{ dx: 0, dy: 0 }, { dx: -0.1, dy: 0.4 }, { dx: 0.3, dy: 0.5 }, { dx: 1, dy: 0.35 }],
};

/** Route waypoints: dx = forward progress 0→1, dy = lateral offset -1 to +1 */
function getRouteShape(call: string, yardsGained: number, routeConcept?: string): RoutePoint[] {
  // Check concept-specific shape first
  if (routeConcept && CONCEPT_ROUTES[routeConcept]) {
    return CONCEPT_ROUTES[routeConcept];
  }

  // Fall back to call-based shapes
  switch (call) {
    case 'pass_quick':
    case 'pass_rpo':
      // Slant: short diagonal across middle
      return [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0 }, { dx: 1, dy: 0.6 }];
    case 'pass_short':
    case 'play_action_short':
      // Curl: upfield → overshoot → settle back to catch point
      return [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.85, dy: -0.15 }, { dx: 1.0, dy: -0.05 }];
    case 'pass_medium':
      // Dig/In: upfield → sharp break across
      return [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.65, dy: 0.1 }, { dx: 1, dy: 0.7 }];
    case 'pass_deep':
    case 'play_action_deep':
      if (yardsGained > 30) {
        // Go: straight deep
        return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.05 }, { dx: 1, dy: 0.1 }];
      }
      // Post: upfield → angle inside
      return [{ dx: 0, dy: 0 }, { dx: 0.5, dy: -0.1 }, { dx: 0.7, dy: 0.05 }, { dx: 1, dy: 0.5 }];
    case 'screen_pass':
      // Screen: drift back/lateral → turn upfield
      return [{ dx: -0.15, dy: 0.5 }, { dx: -0.1, dy: 0.6 }, { dx: 0.2, dy: 0.55 }, { dx: 1, dy: 0.3 }];
    default:
      // Generic short route
      return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.15 }, { dx: 1, dy: 0.3 }];
  }
}

/** Smoothly interpolate between route waypoints */
function interpolateRoute(points: RoutePoint[], t: number): { dx: number; dy: number } {
  if (points.length < 2) return points[0] || { dx: 0, dy: 0 };
  const clamped = Math.max(0, Math.min(1, t));
  const segCount = points.length - 1;
  const rawIdx = clamped * segCount;
  const idx = Math.min(Math.floor(rawIdx), segCount - 1);
  const localT = rawIdx - idx;
  const smooth = easeInOutQuad(localT);
  const a = points[idx];
  const b = points[idx + 1];
  return {
    dx: a.dx + (b.dx - a.dx) * smooth,
    dy: a.dy + (b.dy - a.dy) * smooth,
  };
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

    // For kick plays, compute the correct origin:
    // - Extra point: PAT snaps from ~15 yards out from the goal post the team is kicking toward
    // - Field goal: snaps from the LOS (prevBallLeftPercent)
    // Note: for XP, ballLeftPercent is already the POST-play kickoff position (own 35), not the snap spot
    let fromX: number;
    if (lastPlay.type === 'extra_point') {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      // PAT snap is ~15 yards from goal post (12.5% of field width)
      fromX = goalPostX + (goalPostX < 50 ? 12.5 : -12.5);
    } else if (lastPlay.type === 'field_goal') {
      fromX = prevBallLeftPercent;
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
    setBallPos({ x: fromX, y: 50 });
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), preMs);
    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay, devMs);
    }, preMs + snapMs);
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      setBallPos({ x: toX, y: 50 });
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
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase]);

  // ── RAF loop ───────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult, durationMs: number = DEVELOPMENT_MS) {
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
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
            lastPlay={lastPlay}
            fromX={fromX}
            toX={toX}
            possession={possession}
            progress={animProgress}
            success={isSuccess}
          />
        </svg>
      )}

      {/* ─── Pass target indicator (route-aware position) ─── */}
      {phase === 'development' && animProgress < 0.4 &&
        (playType === 'pass_complete' || playType === 'pass_incomplete') && (() => {
        const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
        const isPA = lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep';
        const qbDrop = isPA ? YARDS.PA_DROP : YARDS.SHORT_DROP;
        const qbX = fromX + offDir * qbDrop;
        const targetX = playType === 'pass_complete' ? toX : fromX - offDir * yardsToPercent(10);
        const route = getRouteShape(lastPlay.call, lastPlay.yardsGained, lastPlay.routeConcept);
        const endPt = interpolateRoute(route, 1);
        const totalTravel = Math.abs(toX - fromX);
        const lateralScale = totalTravel * 0.4;
        const targetY = 50 + endPt.dy * lateralScale;
        const targetFieldX = qbX + (targetX - qbX) * endPt.dx;
        return (
          <div
            className="absolute rounded-full animate-pulse"
            style={{
              left: `${clamp(targetFieldX, 5, 95)}%`,
              top: `${clamp(targetY, 10, 90)}%`,
              width: 16,
              height: 16,
              transform: 'translate(-50%, -50%)',
              border: `2px solid ${color}`,
              backgroundColor: `${color}20`,
              opacity: 0.7 * (1 - animProgress / 0.4),
              zIndex: 4,
            }}
          />
        );
      })()}

      {/* ─── Trailing dots for runs, scrambles, and kick returns ─── */}
      {phase === 'development' && (() => {
        const isRunType = playType === 'run' || playType === 'scramble' || playType === 'two_point';
        const isKickReturn = (playType === 'kickoff' || playType === 'punt') && animProgress > 0.5;
        if (!isRunType && !isKickReturn) return null;
        if (isRunType && animProgress <= 0.1) return null;
        return (
          <>
            {[0.04, 0.08, 0.12].map((offset, i) => {
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
                    backgroundColor: isKickReturn ? '#fbbf24' : offenseColor,
                    opacity: 0.5 - i * 0.15,
                    zIndex: 5,
                  }}
                />
              );
            })}
          </>
        );
      })()}

      {/* ─── Animated football ─── */}
      {(() => {
        const isPass = playType === 'pass_complete' || playType === 'pass_incomplete';
        const isRun = playType === 'run' || playType === 'scramble' || playType === 'two_point';
        const isKickoffFlight = playType === 'kickoff' && animProgress <= KICKOFF_PHASE_END;
        const isKickoffTouchback = playType === 'kickoff' && lastPlay.yardsGained === 0;

        // During pass flight: 3D football with spiral and arc
        if (isPass && phase === 'development') {
          const isPlayAction = lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep';
          const holdEnd = isPlayAction ? 0.42 : 0.32;
          const throwEnd = 0.82;
          const isInFlight = animProgress >= holdEnd && animProgress < throwEnd;
          const isDeepPass = lastPlay.call === 'pass_deep' || lastPlay.call === 'play_action_deep' || lastPlay.yardsGained > 20;
          const isIncomplete = playType === 'pass_incomplete';
          const incompleteDropStart = 0.72;
          const isPostDrop = isIncomplete && animProgress >= incompleteDropStart;

          if (isInFlight || isPostDrop) {
            // Flight phase: 3D spinning football
            const flightDuration = isIncomplete ? (incompleteDropStart - holdEnd) : (throwEnd - holdEnd);
            const flightT = isPostDrop
              ? 1.0 // flight complete, now tumbling
              : Math.min((animProgress - holdEnd) / flightDuration, 1);

            // Ball size — deep passes are larger
            const ballW = isDeepPass ? 72 : 60;
            const ballH = isDeepPass ? 46 : 38;

            // Spiral rotation
            const spiralDeg = flightT * 720;

            // Perspective scale: ball grows as it arcs high, shrinks as it arrives
            const peakScale = isDeepPass ? 1.6 : 1.4;
            const arcT = Math.sin(flightT * Math.PI); // 0→1→0 parabolic
            const perspScale = isPostDrop
              ? 1.0 - ((animProgress - incompleteDropStart) / (1 - incompleteDropStart)) * 0.4
              : 1.0 + (peakScale - 1.0) * arcT;

            // Drop shadow: shrinks at peak (ball high up), grows at landing
            const shadowScale = isPostDrop ? 0.8 : 0.3 + 0.7 * (1 - arcT);
            const shadowDist = isPostDrop
              ? 12 + ((animProgress - incompleteDropStart) / (1 - incompleteDropStart)) * 15
              : 15 + arcT * 10;

            // Tumble for incomplete passes after drop
            const tumbleX = isPostDrop
              ? ((animProgress - incompleteDropStart) / (1 - incompleteDropStart)) * 540
              : 0;
            const tumbleOpacity = isPostDrop
              ? 1 - ((animProgress - incompleteDropStart) / (1 - incompleteDropStart)) * 0.7
              : 1;

            return (
              <div
                className="absolute"
                style={{
                  left: `${clamp(ballPos.x, 2, 98)}%`,
                  top: `${clamp(ballPos.y, 5, 95)}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 8,
                  perspective: '200px',
                }}
              >
                {/* Drop shadow below ball */}
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 24 * shadowScale,
                    height: 8 * shadowScale,
                    left: '50%',
                    top: `${shadowDist}px`,
                    transform: 'translateX(-50%)',
                    background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)',
                    opacity: 0.4,
                  }}
                />
                {/* 3D Football */}
                <div
                  style={{
                    width: ballW,
                    height: ballH,
                    transformStyle: 'preserve-3d',
                    transform: `scale(${perspScale}) rotateY(${spiralDeg}deg) rotateX(${15 + tumbleX}deg)`,
                    opacity: tumbleOpacity,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #C4703C 0%, #A0522D 30%, #8B4513 60%, #6B3410 100%)',
                      border: '1.5px solid #5C2D06',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), 0 0 10px rgba(255,255,255,0.2)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Laces */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '30%',
                        width: '40%',
                        height: '2px',
                        background: 'rgba(255,255,255,0.7)',
                        transform: 'translateY(-50%)',
                        borderRadius: '1px',
                      }}
                    />
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          top: 'calc(50% - 4px)',
                          left: `${33 + i * 9}%`,
                          width: '1.5px',
                          height: '8px',
                          background: 'rgba(255,255,255,0.6)',
                          borderRadius: '1px',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // Before throw (dropback/hold) or after catch (RAC): small flat oval
          const isRAC = playType === 'pass_complete' && animProgress >= throwEnd;
          return (
            <div
              className="absolute"
              style={{
                left: `${clamp(ballPos.x, 2, 98)}%`,
                top: `${clamp(ballPos.y, 5, 95)}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 6,
                opacity: isRAC ? 0.4 : 1,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 22,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
                  border: '1px solid #5C2D06',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              />
            </div>
          );
        }

        // During kickoff flight phase: large 3D football with spiral
        if (isKickoffFlight || (isKickoffTouchback && phase === 'development')) {
          const flightProgress = isKickoffTouchback ? animProgress : animProgress / KICKOFF_PHASE_END;
          // Scale: starts elevated (coming at viewer), shrinks as it lands
          const scale = 1.5 - flightProgress * 0.7;
          // Shadow grows as ball descends (simulates altitude)
          const shadowScale = 0.3 + flightProgress * 0.7;
          const shadowOpacity = 0.15 + flightProgress * 0.35;
          // Spiral animation progress
          const spiralDeg = flightProgress * 1080;
          // Opacity: start visible, reach full quickly
          const opacity = Math.min(1, 0.7 + flightProgress * 3);

          return (
            <div
              className="absolute"
              style={{
                left: `${clamp(ballPos.x, 2, 98)}%`,
                top: `${clamp(ballPos.y, 5, 95)}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 8,
                perspective: '200px',
              }}
            >
              {/* Drop shadow below ball */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 30 * shadowScale,
                  height: 10 * shadowScale,
                  left: '50%',
                  top: `${20 + flightProgress * 10}px`,
                  transform: 'translateX(-50%)',
                  background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)',
                  opacity: shadowOpacity,
                }}
              />
              {/* 3D Football */}
              <div
                style={{
                  width: 80,
                  height: 50,
                  transformStyle: 'preserve-3d',
                  transform: `scale(${scale}) rotateY(${spiralDeg}deg) rotateX(15deg)`,
                  opacity,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #C4703C 0%, #A0522D 30%, #8B4513 60%, #6B3410 100%)',
                    border: '1.5px solid #5C2D06',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), 0 0 12px rgba(255,255,255,0.3)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Laces */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '30%',
                      width: '40%',
                      height: '2px',
                      background: 'rgba(255,255,255,0.7)',
                      transform: 'translateY(-50%)',
                      borderRadius: '1px',
                    }}
                  />
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        top: 'calc(50% - 4px)',
                        left: `${33 + i * 9}%`,
                        width: '1.5px',
                        height: '8px',
                        background: 'rgba(255,255,255,0.6)',
                        borderRadius: '1px',
                      }}
                    />
                  ))}
                </div>
              </div>
              {/* Landing flash when ball arrives */}
              {flightProgress > 0.92 && (
                <div
                  className="absolute rounded-full kickoff-land-flash-anim"
                  style={{
                    width: 20,
                    height: 20,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)',
                  }}
                />
              )}
            </div>
          );
        }

        // After kickoff flight phase: normal small ball during return, or hide on touchback
        if (playType === 'kickoff' && animProgress > KICKOFF_PHASE_END) {
          // Normal return ball (smaller, no spiral)
          return (
            <div
              className="absolute"
              style={{
                left: `${clamp(ballPos.x, 2, 98)}%`,
                top: `${clamp(ballPos.y, 5, 95)}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 6,
                opacity: 0.5,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 22,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
                  border: '1px solid #5C2D06',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              />
            </div>
          );
        }

        // Reduce opacity on runs (carrier logo is the main visual)
        const ballOpacity = isRun ? 0.5 : 1;
        return (
          <div
            className="absolute"
            style={{
              left: `${clamp(ballPos.x, 2, 98)}%`,
              top: `${clamp(ballPos.y, 5, 95)}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 6,
              opacity: ballOpacity,
            }}
          >
            <div
              style={{
                width: 32,
                height: 20,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
                border: '1px solid #5C2D06',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                transform: 'none',
              }}
            />
          </div>
        );
      })()}

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
    x = fromX - offDir * yardsToPercent(10);
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
    case 'run': case 'two_point':
      return calculateRunPosition(play, fromX, toX, t, offDir);
    case 'scramble':
      return calculateScramblePosition(fromX, toX, t, offDir);
    case 'pass_complete':
      return calculatePassPosition(play, fromX, toX, t, offDir);
    case 'pass_incomplete':
      return calculateIncompletePassPosition(play, fromX, toX, t, offDir);
    case 'sack': {
      const sackDrop = YARDS.SHORT_DROP;
      if (t < 0.2) return { x: fromX + offDir * sackDrop * easeOutCubic(t / 0.2), y: 50 };
      if (t < 0.5) return { x: fromX + offDir * sackDrop + Math.sin((t - 0.2) * 15) * 0.8, y: 50 };
      const sackT = easeOutCubic((t - 0.5) / 0.5);
      const qbX = fromX + offDir * sackDrop;
      const x = qbX + (toX - qbX) * sackT;
      const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * (1 * YARD_PCT) * (1 - t) : 0;
      return { x: x + jolt, y: 50 + jolt * 0.7 };
    }
    case 'kickoff':
      return calculateKickoffPosition(play, fromX, toX, t, offDir);
    case 'punt':
      return calculatePuntPosition(play, fromX, toX, t, offDir);
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

// ── Run Position (play-call aware) ──────────────────────────

function calculateRunPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const call = play.call;
  const travel = toX - fromX;

  switch (call) {
    case 'run_power': case 'run_zone': case 'run_inside': {
      // Inside runs: forward to exact toX, capped lateral drift + juke
      const eased = easeOutQuad(t);
      const x = fromX + travel * eased;
      const drift = Math.sin(t * Math.PI * 2) * YARDS.MAX_WEAVE * (1 - t);
      const juke = t > 0.35 && t < 0.5 ? Math.sin((t - 0.35) * Math.PI / 0.15) * YARDS.MAX_JUKE : 0;
      return { x, y: 50 + drift + juke };
    }
    case 'run_outside_zone': case 'run_sweep': case 'run_outside': {
      // Wide lateral sweep, turn corner at 35%, sprint upfield
      if (t < 0.35) {
        const sweepT = easeOutQuad(t / 0.35);
        const x = fromX + travel * 0.1 * sweepT;
        const y = 50 + offDir * YARDS.SWEEP_LATERAL * sweepT;
        return { x, y };
      }
      const sprintPhaseT = (t - 0.35) / 0.65;
      const cornerX = fromX + travel * 0.1;
      const eased = easeOutQuad(sprintPhaseT);
      const x = cornerX + (toX - cornerX) * eased;
      const cornerY = 50 + offDir * YARDS.SWEEP_LATERAL;
      const y = cornerY + (50 - cornerY) * easeOutCubic(sprintPhaseT);
      return { x, y };
    }
    case 'run_draw': {
      // Step back like a pass, pause, then burst forward
      if (t < 0.25) {
        const backT = easeOutQuad(t / 0.25);
        return { x: fromX + offDir * YARDS.SHORT_DROP * backT, y: 50 };
      }
      if (t < 0.45) {
        const qbX = fromX + offDir * YARDS.SHORT_DROP;
        const jitter = Math.sin((t - 0.25) * 30) * 0.5;
        return { x: qbX + jitter, y: 50 };
      }
      const burstPhase = (t - 0.45) / 0.55;
      const startX = fromX + offDir * YARDS.SHORT_DROP;
      const eased = easeOutCubic(burstPhase);
      const x = startX + (toX - startX) * eased;
      const weave = Math.sin(burstPhase * Math.PI * 2) * YARDS.MAX_WEAVE * (1 - burstPhase);
      return { x, y: 50 + weave };
    }
    case 'run_counter': {
      // Fake one direction, plant at 30%, cut back opposite
      if (t < 0.30) {
        const fakeT = easeOutQuad(t / 0.30);
        const x = fromX + travel * 0.05 * fakeT;
        return { x, y: 50 - offDir * YARDS.COUNTER_FAKE * fakeT };
      }
      if (t < 0.45) {
        const cutT = (t - 0.30) / 0.15;
        const fakeX = fromX + travel * 0.05;
        const x = fakeX + travel * 0.1 * cutT;
        const fakeY = 50 - offDir * YARDS.COUNTER_FAKE;
        return { x, y: fakeY + offDir * YARDS.COUNTER_FAKE * 2 * easeInOutQuad(cutT) };
      }
      const sprintPhase = (t - 0.45) / 0.55;
      const cutX = fromX + travel * 0.15;
      const cutY = 50 + offDir * YARDS.COUNTER_FAKE;
      const eased = easeOutQuad(sprintPhase);
      const x = cutX + (toX - cutX) * eased;
      const y = cutY + (50 - cutY) * sprintPhase;
      return { x, y };
    }
    case 'run_option': {
      // Mesh point delay, read, commit
      if (t < 0.20) {
        const meshT = t / 0.20;
        return { x: fromX, y: 50 + offDir * YARDS.OPTION_MESH * meshT };
      }
      if (t < 0.40) {
        const readT = (t - 0.20) / 0.20;
        const x = fromX + travel * 0.1 * readT;
        return { x, y: 50 + offDir * YARDS.OPTION_MESH };
      }
      const burstPhase = (t - 0.40) / 0.60;
      const startX = fromX + travel * 0.1;
      const eased = easeOutQuad(burstPhase);
      const x = startX + (toX - startX) * eased;
      const y = 50 + offDir * YARDS.OPTION_MESH * (1 - burstPhase);
      return { x, y };
    }
    case 'run_qb_sneak': {
      // Fast straight burst, half-yard wobble
      const eased = easeOutCubic(t);
      const x = fromX + travel * eased;
      const wobble = Math.sin(t * Math.PI * 5) * (0.5 * YARD_PCT) * (1 - t);
      return { x, y: 50 + wobble };
    }
    default: {
      // Default run: forward with moderate weave, no overshoot
      const eased = easeOutQuad(t);
      const x = fromX + travel * eased;
      const weave = Math.sin(t * Math.PI * 3) * YARDS.MAX_WEAVE * (1 - t);
      return { x, y: 50 + weave };
    }
  }
}

// ── Scramble Position ────────────────────────────────────────

function calculateScramblePosition(
  fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  // Direct to toX, no overshoot
  const travel = toX - fromX;
  const eased = easeOutCubic(t);
  const x = fromX + travel * eased;
  // Enhanced weave capped to real scramble range (4 yards)
  const weave = Math.sin(t * Math.PI * 4) * YARDS.MAX_SCRAMBLE_WEAVE * (1 - t * 0.7);
  const secondaryWeave = Math.cos(t * Math.PI * 2.5) * (1 * YARD_PCT) * (1 - t);
  return { x, y: 50 + weave + secondaryWeave };
}

// ── Pass Position (route-shape aware) ────────────────────────

function calculatePassPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const isScreen = play.call === 'screen_pass';
  const dropEnd = isPlayAction ? 0.22 : 0.12;
  const holdEnd = isPlayAction ? 0.42 : 0.32;
  const throwEnd = 0.82;

  // Yard-accurate QB drop
  const dropDist = isPlayAction ? YARDS.PA_DROP : YARDS.SHORT_DROP;
  // Lateral scale proportional to actual pass depth
  const totalTravel = Math.abs(toX - fromX);
  const lateralScale = totalTravel * 0.4;

  if (t < dropEnd) {
    const dropT = easeOutCubic(t / dropEnd);
    const x = fromX + offDir * dropDist * dropT;
    const fakeY = isPlayAction ? Math.sin(dropT * Math.PI) * YARDS.MAX_WEAVE : 0;
    return { x, y: 50 + fakeY };
  }
  if (t < holdEnd) {
    const qbX = fromX + offDir * dropDist;
    const jitter = Math.sin((t - dropEnd) * 25) * 0.4;
    return { x: qbX + jitter, y: 50 };
  }
  if (t < throwEnd) {
    const throwT = (t - holdEnd) / (throwEnd - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * dropDist;
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);

    const routeDistX = toX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const routeY = 50 + rPt.dy * lateralScale;

    const arcHeight = isScreen ? 0 : Math.min(Math.abs(routeDistX) * 0.35, 18);
    const arc = arcHeight * Math.sin(smoothT * Math.PI);

    return { x, y: routeY - arc };
  }
  // RAC: drift back toward y=50 from catch point
  const racT = (t - throwEnd) / (1 - throwEnd);
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const catchY = 50 + endPt.dy * lateralScale;
  return { x: toX, y: catchY + (50 - catchY) * easeOutQuad(racT) };
}

// ── Incomplete Pass Position ─────────────────────────────────

function calculateIncompletePassPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const dropEnd = isPlayAction ? 0.22 : 0.15;
  const holdEnd = isPlayAction ? 0.42 : 0.35;
  const dropDist = isPlayAction ? YARDS.PA_DROP : YARDS.SHORT_DROP;

  // Play-call-aware target depth
  let targetYards: number;
  if (play.call === 'pass_quick' || play.call === 'pass_rpo') targetYards = 6;
  else if (play.call === 'pass_short' || play.call === 'play_action_short') targetYards = 10;
  else if (play.call === 'pass_medium') targetYards = 16;
  else if (play.call === 'pass_deep' || play.call === 'play_action_deep') targetYards = 30;
  else targetYards = 10;

  const targetDist = yardsToPercent(targetYards);
  const targetX = fromX - offDir * targetDist;
  const lateralScale = targetDist * 0.4;

  if (t < dropEnd) {
    const dropT = easeOutCubic(t / dropEnd);
    return { x: fromX + offDir * dropDist * dropT, y: 50 };
  }
  if (t < holdEnd) {
    const qbX = fromX + offDir * dropDist;
    return { x: qbX + Math.sin((t - dropEnd) * 20) * 0.4, y: 50 };
  }
  if (t < 0.72) {
    const throwT = (t - holdEnd) / (0.72 - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * dropDist;
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);

    const routeDistX = targetX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const routeY = 50 + rPt.dy * lateralScale;
    const arcHeight = Math.min(Math.abs(routeDistX) * 0.4, 16);
    const arc = arcHeight * Math.sin(smoothT * Math.PI);
    return { x, y: routeY - arc };
  }
  // Ball falls to ground
  const dropT = (t - 0.72) / 0.28;
  const qbX = fromX + offDir * dropDist;
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const fallX = qbX + (targetX - qbX) * 0.9;
  const fallY = 50 + endPt.dy * lateralScale;
  return { x: fallX + (targetX - fallX) * dropT * 0.2, y: fallY + dropT * 15 };
}

// ── Kickoff Position (two-phase: arc + return) ──────────────

function calculateKickoffPosition(
  play: PlayResult, fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  const isTouchback = play.yardsGained === 0;
  const kickDir = toX < fromX ? -1 : 1;
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;

  // Use kickoffMeta.distance for exact kick distance, or fallback
  const meta = play.kickoffMeta;
  let landingX: number;
  if (meta?.distance) {
    landingX = fromX + kickDir * yardsToPercent(meta.distance);
  } else {
    const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
    landingX = fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
  }

  const kickDist = Math.abs(landingX - fromX);
  const arcHeight = Math.min(kickDist * 0.6, 40);

  if (isTouchback) {
    const eased = easeInOutQuad(t);
    const x = fromX + (receiverEndZone - fromX) * eased;
    return { x, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  const kickPhaseEnd = 0.45;

  if (t < kickPhaseEnd) {
    const kickT = t / kickPhaseEnd;
    const eased = easeInOutQuad(kickT);
    const x = fromX + (landingX - fromX) * eased;
    return { x, y: 50 - arcHeight * Math.sin(kickT * Math.PI) };
  }

  // Phase 2: Return run from landing spot to exact toX
  const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
  const isTdReturn = play.isTouchdown;

  if (isTdReturn) {
    let x: number;
    if (returnT < 0.6) {
      const jukeT = returnT / 0.6;
      const eased = easeOutQuad(jukeT);
      x = landingX + (toX - landingX) * 0.5 * eased;
      const amplitude = YARDS.MAX_SCRAMBLE_WEAVE * (1 - jukeT * 0.3);
      const cuts = Math.sin(jukeT * Math.PI * 5) * amplitude;
      return { x, y: 50 + cuts };
    }
    const sprintT = (returnT - 0.6) / 0.4;
    const midX = landingX + (toX - landingX) * 0.5;
    x = midX + (toX - midX) * easeOutCubic(sprintT);
    const wobble = Math.sin(sprintT * Math.PI * 2) * YARDS.MAX_WEAVE * (1 - sprintT);
    return { x, y: 50 + wobble };
  }

  // Normal return: capped juke amplitude
  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;
  const amplitude = YARDS.MAX_SCRAMBLE_WEAVE * (1 - returnT * 0.6);
  const juke = returnT > 0.35 && returnT < 0.5
    ? Math.sin((returnT - 0.35) * Math.PI / 0.15) * YARDS.MAX_JUKE
    : 0;
  const cuts = Math.sin(returnT * Math.PI * 3) * amplitude;
  return { x, y: 50 + cuts + juke };
}

// ── Punt Position (two-phase: arc + return) ──────────────────

function calculatePuntPosition(
  play: PlayResult, fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  const desc = (play.description || '').toLowerCase();
  const isFairCatch = desc.includes('fair catch');
  const isTouchback = play.yardsGained === 0 || desc.includes('touchback');

  if (isTouchback) {
    const puntDir = toX < fromX ? -1 : 1;
    const endZoneX = puntDir < 0 ? 8.33 : 91.66;
    const eased = easeInOutQuad(t);
    const dist = Math.abs(endZoneX - fromX);
    const arcHeight = Math.min(dist * 0.8, 38);
    return { x: fromX + (endZoneX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  if (isFairCatch) {
    const eased = easeInOutQuad(t);
    const dist = Math.abs(toX - fromX);
    const arcHeight = Math.min(dist * 0.9, 38);
    return { x: fromX + (toX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  const kickPhaseEnd = 0.45;
  // No overshoot — punt lands at exactly toX
  const landingX = toX;

  if (t < kickPhaseEnd) {
    const kickT = t / kickPhaseEnd;
    const eased = easeInOutQuad(kickT);
    const x = fromX + (landingX - fromX) * eased;
    const dist = Math.abs(landingX - fromX);
    const arcHeight = Math.min(dist * 0.9, 38);
    return { x, y: 50 - arcHeight * Math.sin(kickT * Math.PI) };
  }

  // Phase 2: Return run from landing spot — capped juke
  const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;
  const amplitude = play.isTouchdown ? YARDS.MAX_SCRAMBLE_WEAVE : YARDS.MAX_JUKE;
  const cuts = Math.sin(returnT * Math.PI * 3) * amplitude * (1 - returnT * 0.5);

  return { x, y: 50 + cuts };
}

// ══════════════════════════════════════════════════════════════
// PLAY TRAJECTORY TRAIL (SVG)
// ══════════════════════════════════════════════════════════════

function PlayTrajectory({
  lastPlay, fromX, toX, possession, progress, success,
}: {
  lastPlay: PlayResult; fromX: number; toX: number;
  possession: 'home' | 'away'; progress: number; success: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;
  const playType = lastPlay.type;

  switch (playType) {
    case 'run': case 'scramble': case 'two_point': {
      // Sample the actual path at 20 points to create a curved SVG path
      const samples = 20;
      const points: { x: number; y: number }[] = [];
      const progressCap = Math.min(progress, 1);
      for (let i = 0; i <= samples; i++) {
        const sampleT = (i / samples) * progressCap;
        const pos = playType === 'scramble'
          ? calculateScramblePosition(fromX, toX, sampleT, offDir)
          : calculateRunPosition(lastPlay, fromX, toX, sampleT, offDir);
        points.push(pos);
      }
      if (points.length < 2 || Math.abs(points[points.length - 1].x - points[0].x) < 0.3) return null;
      const color = playType === 'scramble' ? '#4ade80' : '#22c55e';
      const d = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      const lastPt = points[points.length - 1];
      return (
        <g>
          <path d={d} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.12" />
          <path d={d} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
          {progress > 0.3 && (
            <polygon
              points={toX > fromX
                ? `${lastPt.x},${lastPt.y} ${lastPt.x - 2},${lastPt.y - 3} ${lastPt.x - 2},${lastPt.y + 3}`
                : `${lastPt.x},${lastPt.y} ${lastPt.x + 2},${lastPt.y - 3} ${lastPt.x + 2},${lastPt.y + 3}`}
              fill={color} opacity="0.6" />
          )}
        </g>
      );
    }
    case 'pass_complete': case 'pass_incomplete': {
      const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
      const isPA = lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep';
      const qbDrop = isPA ? YARDS.PA_DROP : YARDS.SHORT_DROP;
      const qbX = fromX + offDir * qbDrop;
      const targetX = playType === 'pass_complete' ? toX : fromX - offDir * yardsToPercent(10);
      const route = getRouteShape(lastPlay.call, lastPlay.yardsGained, lastPlay.routeConcept);
      const routeSamples = 12;
      const routeDistX = targetX - qbX;
      const totalTravel = Math.abs(toX - fromX);
      const trajLateral = totalTravel * 0.4;
      const routePoints: { x: number; y: number }[] = [];
      for (let i = 0; i <= routeSamples; i++) {
        const sT = i / routeSamples;
        const rPt = interpolateRoute(route, sT);
        routePoints.push({
          x: qbX + routeDistX * rPt.dx,
          y: 50 + rPt.dy * trajLateral,
        });
      }
      const routeD = `M ${routePoints[0].x} ${routePoints[0].y} ` + routePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      return (
        <g>
          <path d={routeD} stroke={color} strokeWidth="1.8" fill="none"
            strokeDasharray="4 3" strokeLinecap="round" opacity="0.45" />
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
      // Two-phase trajectory: kick arc + return path
      const isKickoff = playType === 'kickoff';
      const desc = (lastPlay.description || '').toLowerCase();
      const isFairCatch = desc.includes('fair catch');
      const isTouchback = lastPlay.yardsGained === 0 || desc.includes('touchback');
      const kickPhaseEnd = isKickoff ? 0.45 : 0.45;

      // Calculate landing point using travel direction, not offDir
      let landingX: number;
      if (isKickoff) {
        const kickDir = toX < fromX ? -1 : 1;
        const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
        const meta = lastPlay.kickoffMeta;
        const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
        landingX = isTouchback
          ? fromX + (receiverEndZone - fromX) * 0.9
          : fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
      } else {
        landingX = toX; // No overshoot — punt lands at exact toX
      }

      const dist = Math.abs(landingX - fromX);
      const arcH = isKickoff ? Math.min(dist * 0.6, 40) : Math.min(dist * 0.9, 38);
      const midX = (fromX + landingX) / 2;

      // Kick arc (dashed gold)
      const arcD = `M ${fromX} 50 Q ${midX} ${50 - arcH} ${landingX} 50`;

      if (isFairCatch || isTouchback) {
        return <path d={arcD} stroke="#fbbf24" strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.4" />;
      }

      // Return path (solid green, only if in return phase)
      const showReturn = progress > kickPhaseEnd;
      let returnD = '';
      if (showReturn) {
        const returnSamples = 15;
        const returnPoints: { x: number; y: number }[] = [];
        const progressCap = Math.min(progress, 1);
        for (let i = 0; i <= returnSamples; i++) {
          const sT = kickPhaseEnd + (i / returnSamples) * (progressCap - kickPhaseEnd);
          const pos = isKickoff
            ? calculateKickoffPosition(lastPlay, fromX, toX, sT, offDir)
            : calculatePuntPosition(lastPlay, fromX, toX, sT, offDir);
          returnPoints.push(pos);
        }
        if (returnPoints.length >= 2) {
          returnD = `M ${returnPoints[0].x} ${returnPoints[0].y} ` + returnPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        }
      }

      return (
        <g>
          <path d={arcD} stroke="#fbbf24" strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.4" />
          {returnD && <path d={returnD} stroke="#22c55e" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.45" />}
        </g>
      );
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

