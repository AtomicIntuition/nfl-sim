'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
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

// ── Timing (exported for PlayersOverlay) ─────────────────────
export const PRE_SNAP_MS = 500;
export const SNAP_MS = 150;
export const DEVELOPMENT_MS = 1800;
export const RESULT_MS = 600;
export const POST_PLAY_MS = 400;
const TOTAL_MS = PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS + POST_PLAY_MS;

export type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

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
        const qbX = fromX + offDir * (lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep' ? 4 : 3);
        const targetX = playType === 'pass_complete' ? toX : fromX - offDir * 12;
        const route = getRouteShape(lastPlay.call, lastPlay.yardsGained, lastPlay.routeConcept);
        const endPt = interpolateRoute(route, 1);
        const lateralScale = playType === 'pass_complete' ? 28 : 18;
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
        const isKickReturn = (playType === 'kickoff' || playType === 'punt') && animProgress > 0.35;
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
    case 'run': case 'two_point':
      return calculateRunPosition(play, fromX, toX, t, offDir);
    case 'scramble':
      return calculateScramblePosition(fromX, toX, t, offDir);
    case 'pass_complete':
      return calculatePassPosition(play, fromX, toX, t, offDir);
    case 'pass_incomplete':
      return calculateIncompletePassPosition(play, fromX, toX, t, offDir);
    case 'sack': {
      if (t < 0.2) return { x: fromX + offDir * 2 * easeOutCubic(t / 0.2), y: 50 };
      if (t < 0.5) return { x: fromX + offDir * 2 + Math.sin((t - 0.2) * 15) * 0.8, y: 50 };
      const sackT = easeOutCubic((t - 0.5) / 0.5);
      const qbX = fromX + offDir * 2;
      const x = qbX + (toX - qbX) * sackT;
      const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * 2 * (1 - t) : 0;
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

  switch (call) {
    case 'run_power': case 'run_zone': case 'run_inside': {
      // Inside runs: mostly forward, larger lateral drift, juke at 40%, overshoot-then-settle
      const travel = toX - fromX;
      const overshootX = travel * 0.10; // 10% overshoot
      let x: number;
      if (t < 0.85) {
        const eased = easeOutQuad(t / 0.85);
        x = fromX + (travel + overshootX) * eased;
      } else {
        // Settle back from overshoot
        const settleT = (t - 0.85) / 0.15;
        x = fromX + travel + overshootX * (1 - easeOutQuad(settleT));
      }
      const drift = Math.sin(t * Math.PI * 2) * 10 * (1 - t);
      const juke = t > 0.35 && t < 0.5 ? Math.sin((t - 0.35) * Math.PI / 0.15) * 8 : 0;
      return { x, y: 50 + drift + juke };
    }
    case 'run_outside_zone': case 'run_sweep': case 'run_outside': {
      // Wide lateral sweep, turn corner at 35%, sprint upfield with overshoot
      const travel = toX - fromX;
      const overshootX = travel * 0.10;
      if (t < 0.35) {
        // Lateral sweep phase
        const sweepT = easeOutQuad(t / 0.35);
        const x = fromX + travel * 0.1 * sweepT;
        const y = 50 + offDir * 28 * sweepT;
        return { x, y };
      }
      // Turn corner and sprint upfield with overshoot-then-settle
      const sprintPhaseT = (t - 0.35) / 0.65;
      const cornerX = fromX + travel * 0.1;
      let x: number;
      if (sprintPhaseT < 0.85) {
        const eased = easeOutQuad(sprintPhaseT / 0.85);
        x = cornerX + (toX + overshootX - cornerX) * eased;
      } else {
        const settleT = (sprintPhaseT - 0.85) / 0.15;
        x = toX + overshootX * (1 - easeOutQuad(settleT));
      }
      const cornerY = 50 + offDir * 28;
      const y = cornerY + (50 - cornerY) * easeOutCubic(sprintPhaseT);
      return { x, y };
    }
    case 'run_draw': {
      // Step back like a pass, pause, then burst forward with overshoot
      if (t < 0.25) {
        // Fake pass dropback
        const backT = easeOutQuad(t / 0.25);
        return { x: fromX + offDir * 3 * backT, y: 50 };
      }
      if (t < 0.45) {
        // Hesitation / read
        const qbX = fromX + offDir * 3;
        const jitter = Math.sin((t - 0.25) * 30) * 0.5;
        return { x: qbX + jitter, y: 50 };
      }
      // Burst forward with overshoot
      const burstPhase = (t - 0.45) / 0.55;
      const startX = fromX + offDir * 3;
      const travel = toX - startX;
      const overshootX = travel * 0.10;
      let x: number;
      if (burstPhase < 0.85) {
        const eased = easeOutCubic(burstPhase / 0.85);
        x = startX + (travel + overshootX) * eased;
      } else {
        const settleT = (burstPhase - 0.85) / 0.15;
        x = startX + travel + overshootX * (1 - easeOutQuad(settleT));
      }
      const weave = Math.sin(burstPhase * Math.PI * 2) * 10 * (1 - burstPhase);
      return { x, y: 50 + weave };
    }
    case 'run_counter': {
      // Fake one direction, plant at 30%, cut back opposite with overshoot
      const travel = toX - fromX;
      const overshootX = travel * 0.10;
      if (t < 0.30) {
        const fakeT = easeOutQuad(t / 0.30);
        const x = fromX + travel * 0.05 * fakeT;
        return { x, y: 50 - offDir * 24 * fakeT };
      }
      if (t < 0.45) {
        // Plant and cut
        const cutT = (t - 0.30) / 0.15;
        const fakeX = fromX + travel * 0.05;
        const x = fakeX + travel * 0.1 * cutT;
        const fakeY = 50 - offDir * 24;
        return { x, y: fakeY + offDir * 40 * easeInOutQuad(cutT) };
      }
      // Sprint to destination with overshoot
      const sprintPhase = (t - 0.45) / 0.55;
      const cutX = fromX + travel * 0.15;
      const cutY = 50 + offDir * 16;
      let x: number;
      if (sprintPhase < 0.85) {
        const eased = easeOutQuad(sprintPhase / 0.85);
        x = cutX + (toX + overshootX - cutX) * eased;
      } else {
        const settleT = (sprintPhase - 0.85) / 0.15;
        x = toX + overshootX * (1 - easeOutQuad(settleT));
      }
      const y = cutY + (50 - cutY) * sprintPhase;
      return { x, y };
    }
    case 'run_option': {
      // Mesh point delay, read, commit with overshoot
      const travel = toX - fromX;
      const overshootX = travel * 0.10;
      if (t < 0.20) {
        // Mesh point — move laterally along LOS
        const meshT = t / 0.20;
        return { x: fromX, y: 50 + offDir * 14 * meshT };
      }
      if (t < 0.40) {
        // Read phase — slight forward movement
        const readT = (t - 0.20) / 0.20;
        const x = fromX + travel * 0.1 * readT;
        return { x, y: 50 + offDir * 14 };
      }
      // Commit burst with overshoot
      const burstPhase = (t - 0.40) / 0.60;
      const startX = fromX + travel * 0.1;
      let x: number;
      if (burstPhase < 0.85) {
        const eased = easeOutQuad(burstPhase / 0.85);
        x = startX + (toX + overshootX - startX) * eased;
      } else {
        const settleT = (burstPhase - 0.85) / 0.15;
        x = toX + overshootX * (1 - easeOutQuad(settleT));
      }
      const y = 50 + offDir * 14 * (1 - burstPhase);
      return { x, y };
    }
    case 'run_qb_sneak': {
      // Fast straight burst, minimal lateral
      const eased = easeOutCubic(t);
      const x = fromX + (toX - fromX) * eased;
      const wobble = Math.sin(t * Math.PI * 5) * 1.5 * (1 - t);
      return { x, y: 50 + wobble };
    }
    default: {
      // Default run: forward with moderate weave and overshoot
      const travel = toX - fromX;
      const overshootX = travel * 0.08;
      let x: number;
      if (t < 0.85) {
        const eased = easeOutQuad(t / 0.85);
        x = fromX + (travel + overshootX) * eased;
      } else {
        const settleT = (t - 0.85) / 0.15;
        x = fromX + travel + overshootX * (1 - easeOutQuad(settleT));
      }
      const weave = Math.sin(t * Math.PI * 3) * 10 * (1 - t);
      return { x, y: 50 + weave };
    }
  }
}

// ── Scramble Position ────────────────────────────────────────

function calculateScramblePosition(
  fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  // Overshoot-then-settle for scrambles
  const travel = toX - fromX;
  const overshootX = travel * 0.12;
  let x: number;
  if (t < 0.85) {
    const eased = easeOutCubic(t / 0.85);
    x = fromX + (travel + overshootX) * eased;
  } else {
    const settleT = (t - 0.85) / 0.15;
    x = fromX + travel + overshootX * (1 - easeOutQuad(settleT));
  }
  // Enhanced weave: 4 direction changes with ±18 amplitude
  const weave = Math.sin(t * Math.PI * 4) * 18 * (1 - t * 0.7);
  const secondaryWeave = Math.cos(t * Math.PI * 2.5) * 6 * (1 - t);
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

  if (t < dropEnd) {
    // QB dropback (extended for play-action with fake handoff movement)
    const dropT = easeOutCubic(t / dropEnd);
    const dropDist = isPlayAction ? 4 : 3;
    const x = fromX + offDir * dropDist * dropT;
    // Play-action: slight lateral fake before dropping back
    const fakeY = isPlayAction ? Math.sin(dropT * Math.PI) * 3 : 0;
    return { x, y: 50 + fakeY };
  }
  if (t < holdEnd) {
    // Hold/read in pocket with jitter
    const qbX = fromX + offDir * (isPlayAction ? 4 : 3);
    const jitter = Math.sin((t - dropEnd) * 25) * 0.4;
    return { x: qbX + jitter, y: 50 };
  }
  if (t < throwEnd) {
    // Ball in air: trace route shape
    const throwT = (t - holdEnd) / (throwEnd - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * (isPlayAction ? 4 : 3);
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);

    // Map route dx/dy to field coordinates
    const routeDistX = toX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const lateralScale = 28;
    const routeY = 50 + rPt.dy * lateralScale;

    // Add arc height for "ball in air" feel (not for screens)
    const arcHeight = isScreen ? 0 : Math.min(Math.abs(routeDistX) * 0.35, 18);
    const arc = arcHeight * Math.sin(smoothT * Math.PI);

    return { x, y: routeY - arc };
  }
  // RAC: drift back toward y=50 from catch point
  const racT = (t - throwEnd) / (1 - throwEnd);
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const catchY = 50 + endPt.dy * 28;
  return { x: toX, y: catchY + (50 - catchY) * easeOutQuad(racT) };
}

// ── Incomplete Pass Position ─────────────────────────────────

function calculateIncompletePassPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const dropEnd = isPlayAction ? 0.22 : 0.15;
  const holdEnd = isPlayAction ? 0.42 : 0.35;

  if (t < dropEnd) {
    const dropT = easeOutCubic(t / dropEnd);
    return { x: fromX + offDir * 3 * dropT, y: 50 };
  }
  if (t < holdEnd) {
    const qbX = fromX + offDir * 3;
    return { x: qbX + Math.sin((t - dropEnd) * 20) * 0.4, y: 50 };
  }
  if (t < 0.72) {
    // Ball traces route shape toward target area
    const throwT = (t - holdEnd) / (0.72 - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * 3;
    const targetX = fromX - offDir * 12;
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);

    const routeDistX = targetX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const routeY = 50 + rPt.dy * 18;
    const arcHeight = Math.min(Math.abs(routeDistX) * 0.4, 16);
    const arc = arcHeight * Math.sin(smoothT * Math.PI);
    return { x, y: routeY - arc };
  }
  // Ball falls to ground
  const dropT = (t - 0.72) / 0.28;
  const qbX = fromX + offDir * 3;
  const targetX = fromX - offDir * 12;
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const fallX = qbX + (targetX - qbX) * 0.9;
  const fallY = 50 + endPt.dy * 18;
  return { x: fallX + (targetX - fallX) * dropT * 0.2, y: fallY + dropT * 15 };
}

// ── Kickoff Position (two-phase: arc + return) ──────────────

function calculateKickoffPosition(
  play: PlayResult, fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  const isTouchback = play.yardsGained === 0;
  // Direction based on actual ball travel, not offensive direction
  const kickDir = toX < fromX ? -1 : 1;
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
  const landingX = fromX + (receiverEndZone - fromX) * 0.85;

  if (isTouchback) {
    // Single phase: arc into end zone, ball stops
    const eased = easeInOutQuad(t);
    const x = fromX + (receiverEndZone - fromX) * 0.9 * eased;
    const arcHeight = 42;
    return { x, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  const kickPhaseEnd = 0.32;

  if (t < kickPhaseEnd) {
    // Phase 1: Kick arc from kicker to landing spot
    const kickT = t / kickPhaseEnd;
    const eased = easeInOutQuad(kickT);
    const x = fromX + (landingX - fromX) * eased;
    const arcHeight = 42;
    return { x, y: 50 - arcHeight * Math.sin(kickT * Math.PI) };
  }

  // Phase 2: Return run from landing spot back to final position
  const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;

  // Lateral cuts during return
  const isTdReturn = play.isTouchdown;
  const numCuts = isTdReturn ? 4 : 3;
  const amplitude = isTdReturn ? 22 : 16;
  const decay = 1 - returnT * 0.4;
  const cuts = Math.sin(returnT * Math.PI * numCuts) * amplitude * decay;

  return { x, y: 50 + cuts };
}

// ── Punt Position (two-phase: arc + return) ──────────────────

function calculatePuntPosition(
  play: PlayResult, fromX: number, toX: number, t: number, _offDir: number,
): { x: number; y: number } {
  const desc = (play.description || '').toLowerCase();
  const isFairCatch = desc.includes('fair catch');
  const isTouchback = play.yardsGained === 0 || desc.includes('touchback');

  if (isFairCatch || isTouchback) {
    // Single phase: arc to destination
    const eased = easeInOutQuad(t);
    const dist = Math.abs(toX - fromX);
    const arcHeight = Math.min(dist * 0.9, 38);
    return { x: fromX + (toX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  const kickPhaseEnd = 0.45; // Punt hangs longer
  // Overshoot direction-aware: punt travels fromX → toX, overshoot goes further in that direction
  const travelDist = toX - fromX;
  const overshoot = travelDist * 0.2;
  const landingX = toX + overshoot;

  if (t < kickPhaseEnd) {
    // Phase 1: Punt arc
    const kickT = t / kickPhaseEnd;
    const eased = easeInOutQuad(kickT);
    const x = fromX + (landingX - fromX) * eased;
    const dist = Math.abs(landingX - fromX);
    const arcHeight = Math.min(dist * 0.9, 38);
    return { x, y: 50 - arcHeight * Math.sin(kickT * Math.PI) };
  }

  // Phase 2: Return run from landing back toward toX
  const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;
  const amplitude = play.isTouchdown ? 18 : 14;
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
      const qbX = fromX + offDir * (lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep' ? 4 : 3);
      const targetX = playType === 'pass_complete' ? toX : fromX - offDir * 12;
      // Draw route shape as dashed line
      const route = getRouteShape(lastPlay.call, lastPlay.yardsGained, lastPlay.routeConcept);
      const routeSamples = 12;
      const routeDistX = targetX - qbX;
      const routePoints: { x: number; y: number }[] = [];
      for (let i = 0; i <= routeSamples; i++) {
        const sT = i / routeSamples;
        const rPt = interpolateRoute(route, sT);
        routePoints.push({
          x: qbX + routeDistX * rPt.dx,
          y: 50 + rPt.dy * (playType === 'pass_complete' ? 28 : 18),
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
      const kickPhaseEnd = isKickoff ? 0.32 : 0.45;

      // Calculate landing point using travel direction, not offDir
      let landingX: number;
      if (isKickoff) {
        const kickDir = toX < fromX ? -1 : 1;
        const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
        landingX = isTouchback ? fromX + (receiverEndZone - fromX) * 0.9 : fromX + (receiverEndZone - fromX) * 0.85;
      } else {
        const travelDist = toX - fromX;
        const overshoot = travelDist * 0.2;
        landingX = (isFairCatch || isTouchback) ? toX : toX + overshoot;
      }

      const dist = Math.abs(landingX - fromX);
      const arcH = isKickoff ? 42 : Math.min(dist * 0.9, 38);
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

