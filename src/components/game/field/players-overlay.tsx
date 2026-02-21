'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { PlayResult, Formation, DefensivePersonnel } from '@/lib/simulation/types';
import {
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  SPECIAL_TEAMS,
  getAbsolutePositions,
  getIdlePositions,
} from './formation-data';
import {
  PRE_SNAP_MS,
  SNAP_MS,
  DEVELOPMENT_MS,
  RESULT_MS,
} from './play-scene';
import type { Phase } from './play-scene';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

// Re-export route shapes for WR animations
const CONCEPT_ROUTES: Record<string, { dx: number; dy: number }[]> = {
  hitch:  [{ dx: 0, dy: 0 }, { dx: 0.6, dy: 0.05 }, { dx: 0.85, dy: 0.03 }, { dx: 1, dy: -0.05 }],
  curl:   [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.9, dy: -0.1 }, { dx: 1, dy: -0.15 }],
  shake:  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.3 }, { dx: 0.5, dy: 0.15 }, { dx: 1, dy: -0.4 }],
  angle:  [{ dx: 0, dy: 0 }, { dx: 0.2, dy: -0.3 }, { dx: 0.45, dy: -0.2 }, { dx: 1, dy: 0.4 }],
  stick:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],
  semi:   [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.1 }, { dx: 0.6, dy: 0.3 }, { dx: 1, dy: 0.5 }],
  bench:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0 }, { dx: 0.65, dy: 0.15 }, { dx: 1, dy: 0.8 }],
  drive:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: -0.15 }, { dx: 0.7, dy: 0 }, { dx: 1, dy: 0.6 }],
  cross:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],
  blinky: [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.1 }, { dx: 0.55, dy: -0.1 }, { dx: 1, dy: 0.4 }],
  go:     [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],
  cab:    [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.45 }],
  pylon:  [{ dx: 0, dy: 0 }, { dx: 0.45, dy: -0.1 }, { dx: 0.7, dy: 0.2 }, { dx: 1, dy: 0.75 }],
  x_ray:  [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.3 }, { dx: 0.55, dy: 0.15 }, { dx: 1, dy: 0.5 }],
  delta:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.05 }, { dx: 0.6, dy: 0.15 }, { dx: 1, dy: 0.3 }],
  screen: [{ dx: -0.15, dy: 0.5 }, { dx: -0.1, dy: 0.6 }, { dx: 0.2, dy: 0.55 }, { dx: 1, dy: 0.3 }],
  waggle: [{ dx: 0, dy: 0 }, { dx: -0.1, dy: 0.4 }, { dx: 0.3, dy: 0.5 }, { dx: 1, dy: 0.35 }],
};

interface PlayersOverlayProps {
  phase: string;
  ballLeftPercent: number;
  prevBallLeftPercent: number;
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  isKickoff: boolean;
  isPatAttempt: boolean;
  gameStatus: 'pregame' | 'live' | 'halftime' | 'game_over';
  /** Team abbreviation for the QB/carrier logo */
  teamAbbreviation?: string;
  /** Team primary color for carrier logo border */
  teamColor?: string;
}

type CarrierMode = 'qb_keeps' | 'handoff' | 'pass' | 'scramble' | 'special';

interface BallCarrierState {
  /** Index of the current logo carrier in offense dots */
  currentCarrierIdx: number;
  /** Index of the receiver of the ball (after handoff/catch) */
  receiverIdx: number;
  /** The t-value (0-1) at which carrier switches */
  transferT: number;
  /** What kind of possession transfer */
  carrierMode: CarrierMode;
}

interface DotPos {
  x: number;
  y: number;
  role: string;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function interpolateRoute(
  points: { dx: number; dy: number }[],
  t: number,
): { dx: number; dy: number } {
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Get the route shape to use for WR animation */
function getRouteForConcept(routeConcept?: string, call?: string): { dx: number; dy: number }[] {
  if (routeConcept && CONCEPT_ROUTES[routeConcept]) {
    return CONCEPT_ROUTES[routeConcept];
  }
  // Fallback to a generic slant
  return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.15 }, { dx: 1, dy: 0.3 }];
}

/** Determine complementary routes for non-primary WRs */
const COMPLEMENT_ROUTES = [
  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0 }, { dx: 0.85, dy: -0.15 }, { dx: 1, dy: -0.05 }], // curl
  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],   // go
  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],        // cross
  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],      // stick
];

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════

export function PlayersOverlay({
  phase,
  ballLeftPercent,
  prevBallLeftPercent,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  isKickoff,
  isPatAttempt,
  gameStatus,
  teamAbbreviation,
  teamColor,
}: PlayersOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);
  const prevKeyRef = useRef(playKey);

  // Track positions in refs for RAF-based updates (no React re-renders at 60fps)
  const offDotsRef = useRef<DotPos[]>([]);
  const defDotsRef = useRef<DotPos[]>([]);

  // Snap positions (where players should be at pre-snap)
  const offSnapRef = useRef<DotPos[]>([]);
  const defSnapRef = useRef<DotPos[]>([]);

  // Ball carrier state — tracks who has the team logo
  const carrierStateRef = useRef<BallCarrierState>({
    currentCarrierIdx: -1,
    receiverIdx: -1,
    transferT: 1,
    carrierMode: 'special',
  });
  // React state mirror for rendering (only updated at key moments, not per-frame)
  const [ballCarrierIdx, setBallCarrierIdx] = useState(-1);
  // Track whether carrier has transferred (for RAF updates)
  const carrierTransferredRef = useRef(false);

  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallLeftPercent; // LOS at play start

  // ── Compute formation positions when play changes ───────────
  const computeFormationPositions = useCallback(() => {
    if (!lastPlay) return;

    const playType = lastPlay.type;
    const isSpecialTeams = playType === 'kickoff' || playType === 'punt' ||
      playType === 'field_goal' || playType === 'extra_point';

    let offPositions: DotPos[];
    let defPositions: DotPos[];

    if (playType === 'kickoff') {
      // Kickoff: kicking team at LOS, receiving team deep
      offPositions = getAbsolutePositions(SPECIAL_TEAMS.kickoff.kicking, losX, offDir, 'offense');
      defPositions = getAbsolutePositions(SPECIAL_TEAMS.kickoff.receiving, losX, offDir, 'defense');
    } else if (playType === 'punt') {
      offPositions = getAbsolutePositions(SPECIAL_TEAMS.punt.kicking, losX, offDir, 'offense');
      defPositions = getAbsolutePositions(SPECIAL_TEAMS.punt.receiving, losX, offDir, 'defense');
    } else if (playType === 'field_goal' || playType === 'extra_point') {
      offPositions = getAbsolutePositions(SPECIAL_TEAMS.field_goal.kicking, losX, offDir, 'offense');
      defPositions = getAbsolutePositions(SPECIAL_TEAMS.field_goal.blocking, losX, offDir, 'defense');
    } else {
      // Regular play — use formation data
      const formation: Formation = lastPlay.formation || 'shotgun';
      const defPersonnel: DefensivePersonnel = lastPlay.defensiveCall?.personnel || 'base_4_3';

      const offFormation = OFFENSIVE_FORMATIONS[formation] || OFFENSIVE_FORMATIONS.shotgun;
      const defFormation = DEFENSIVE_FORMATIONS[defPersonnel] || DEFENSIVE_FORMATIONS.base_4_3;

      offPositions = getAbsolutePositions(offFormation, losX, offDir, 'offense');
      defPositions = getAbsolutePositions(defFormation, losX, offDir, 'defense');
    }

    offSnapRef.current = offPositions;
    defSnapRef.current = defPositions;

    // Determine ball carrier state with transfer logic
    const qbIdx = offPositions.findIndex(p => p.role === 'QB');
    const rbIdx = offPositions.findIndex(p => p.role === 'RB' || p.role === 'FB');
    const wrIdx = offPositions.findIndex(p => p.role === 'WR');

    let carrierState: BallCarrierState;

    if (playType === 'run' || playType === 'two_point') {
      // QB hands off to RB at t=0.15
      carrierState = {
        currentCarrierIdx: qbIdx >= 0 ? qbIdx : (rbIdx >= 0 ? rbIdx : 0),
        receiverIdx: rbIdx >= 0 ? rbIdx : qbIdx,
        transferT: 0.15,
        carrierMode: 'handoff',
      };
    } else if (playType === 'scramble') {
      // QB keeps ball
      carrierState = {
        currentCarrierIdx: qbIdx >= 0 ? qbIdx : 0,
        receiverIdx: qbIdx >= 0 ? qbIdx : 0,
        transferT: 1,
        carrierMode: 'scramble',
      };
    } else if (playType === 'pass_complete') {
      // QB throws to WR at t=0.32
      carrierState = {
        currentCarrierIdx: qbIdx >= 0 ? qbIdx : 0,
        receiverIdx: wrIdx >= 0 ? wrIdx : qbIdx,
        transferT: 0.32,
        carrierMode: 'pass',
      };
    } else if (playType === 'pass_incomplete' || playType === 'sack') {
      // QB keeps ball throughout
      carrierState = {
        currentCarrierIdx: qbIdx >= 0 ? qbIdx : 0,
        receiverIdx: qbIdx >= 0 ? qbIdx : 0,
        transferT: 1,
        carrierMode: 'qb_keeps',
      };
    } else {
      // Special teams (kickoff, punt, FG, XP) — no carrier logo
      carrierState = {
        currentCarrierIdx: -1,
        receiverIdx: -1,
        transferT: 1,
        carrierMode: 'special',
      };
    }

    carrierStateRef.current = carrierState;
    carrierTransferredRef.current = false;
    setBallCarrierIdx(carrierState.currentCarrierIdx);
  }, [lastPlay, losX, offDir]);

  // ── Initialize idle positions ────────────────────────────────
  useEffect(() => {
    const offIdle = getIdlePositions(ballLeftPercent, offDir, 'offense');
    const defIdle = getIdlePositions(ballLeftPercent, offDir, 'defense');
    offDotsRef.current = offIdle;
    defDotsRef.current = defIdle;
    updateDom();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect new play → compute formation ─────────────────────
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;
    computeFormationPositions();
  }, [playKey, lastPlay, computeFormationPositions]);

  // ── Phase-driven animation ──────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);

    if (phase === 'idle') {
      // Move dots to idle positions near current ball
      const offIdle = getIdlePositions(ballLeftPercent, offDir, 'offense');
      const defIdle = getIdlePositions(ballLeftPercent, offDir, 'defense');
      offDotsRef.current = offIdle;
      defDotsRef.current = defIdle;
      updateDom();
      return;
    }

    if (phase === 'pre_snap') {
      // Transition to formation positions (CSS handles the transition)
      if (offSnapRef.current.length > 0) {
        offDotsRef.current = offSnapRef.current;
        defDotsRef.current = defSnapRef.current;
        updateDom();
      }
      return;
    }

    if (phase === 'snap') {
      // Quick movement: OL fires forward, QB starts action
      if (offSnapRef.current.length > 0) {
        const snapped = offSnapRef.current.map((p, i) => {
          if (p.role === 'C' || p.role === 'LG' || p.role === 'RG' || p.role === 'LT' || p.role === 'RT') {
            return { ...p, x: p.x - offDir * 1 };
          }
          return p;
        });
        offDotsRef.current = snapped;
        updateDom();
      }
      return;
    }

    if (phase === 'development') {
      // RAF-based animation for smooth play execution
      startDevelopmentAnimation();
      return;
    }

    if (phase === 'result') {
      // Players decelerate — stop RAF, keep current positions
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    if (phase === 'post_play') {
      // Transition toward new LOS
      const newLos = ballLeftPercent;
      const offIdle = getIdlePositions(newLos, offDir, 'offense');
      const defIdle = getIdlePositions(newLos, offDir, 'defense');
      offDotsRef.current = offIdle;
      defDotsRef.current = defIdle;
      updateDom();
      return;
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Development phase RAF animation ─────────────────────────
  const startDevelopmentAnimation = useCallback(() => {
    if (!lastPlay || offSnapRef.current.length === 0) return;

    const startTime = performance.now();
    const playType = lastPlay.type;
    const offStart = offSnapRef.current.map(p => ({ ...p }));
    const defStart = defSnapRef.current.map(p => ({ ...p }));
    const toX = ballLeftPercent;
    const fromX = prevBallLeftPercent;

    function tick(now: number) {
      const t = Math.min((now - startTime) / DEVELOPMENT_MS, 1);
      const eased = easeOutCubic(t);

      // Check carrier transfer
      const cs = carrierStateRef.current;
      if (!carrierTransferredRef.current && t >= cs.transferT && cs.currentCarrierIdx !== cs.receiverIdx) {
        carrierTransferredRef.current = true;
        setBallCarrierIdx(cs.receiverIdx);
      }

      // Animate offense
      const newOff = animateOffense(playType, offStart, t, eased, fromX, toX, lastPlay!);
      // Animate defense
      const newDef = animateDefense(playType, defStart, t, eased, fromX, toX);

      offDotsRef.current = newOff;
      defDotsRef.current = newDef;
      updateDom();

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [lastPlay, ballLeftPercent, prevBallLeftPercent, offDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Offensive animation by play type ────────────────────────
  function animateOffense(
    playType: string,
    startPositions: DotPos[],
    t: number,
    eased: number,
    fromX: number,
    toX: number,
    play: PlayResult,
  ): DotPos[] {
    return startPositions.map((p, i) => {
      const isOL = p.role === 'C' || p.role === 'LG' || p.role === 'RG' || p.role === 'LT' || p.role === 'RT';
      const isQB = p.role === 'QB';
      const isRB = p.role === 'RB' || p.role === 'FB';
      const isWR = p.role === 'WR';
      const isTE = p.role === 'TE';

      // ── Pass plays ──
      if (playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack') {
        if (isOL) {
          // OL slides back in pass protection
          return {
            ...p,
            x: clamp(p.x + offDir * (1.5 * eased), 2, 98),
            y: p.y + Math.sin(t * 3 + i) * 0.3,
            role: p.role,
          };
        }
        if (isQB) {
          if (playType === 'sack') {
            // QB drops back then gets sacked
            const dropDist = 3;
            if (t < 0.4) {
              return { ...p, x: clamp(p.x + offDir * dropDist * (t / 0.4), 2, 98), role: p.role };
            }
            // Collapse toward sack point
            const sackT = (t - 0.4) / 0.6;
            return {
              ...p,
              x: clamp(lerp(p.x + offDir * dropDist, toX, sackT), 2, 98),
              y: p.y + Math.sin(sackT * 10) * 1,
              role: p.role,
            };
          }
          // QB drops back
          const dropDist = play.call?.includes('play_action') ? 4 : 3;
          const dropT = Math.min(t / 0.3, 1);
          return {
            ...p,
            x: clamp(p.x + offDir * dropDist * easeOutCubic(dropT), 2, 98),
            role: p.role,
          };
        }
        if (isWR || isTE) {
          // Receivers run routes
          const routeIdx = startPositions.filter((pp, ii) => ii < i && (pp.role === 'WR' || pp.role === 'TE')).length;
          const isPrimary = routeIdx === 0;
          const route = isPrimary
            ? getRouteForConcept(play.routeConcept, play.call)
            : COMPLEMENT_ROUTES[routeIdx % COMPLEMENT_ROUTES.length];

          const routePt = interpolateRoute(route, t);
          const routeScale = isPrimary ? 12 : 8;
          const lateralScale = isPrimary ? 6 : 4;
          return {
            ...p,
            x: clamp(p.x - offDir * routeScale * routePt.dx, 2, 98),
            y: clamp(p.y + routePt.dy * lateralScale, 8, 92),
            role: p.role,
          };
        }
        if (isRB) {
          // RB pass protects or runs check-down route
          return {
            ...p,
            x: clamp(p.x + offDir * 1 * eased, 2, 98),
            y: p.y + Math.sin(t * 4) * 1.5,
            role: p.role,
          };
        }
      }

      // ── Run plays ──
      if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
        if (isOL) {
          // OL fires forward (run blocking)
          return {
            ...p,
            x: clamp(p.x - offDir * 2.5 * eased, 2, 98),
            y: p.y,
            role: p.role,
          };
        }
        if (isRB || (playType === 'scramble' && isQB)) {
          // Ball carrier follows the ball path
          const ballX = lerp(fromX, toX, eased);
          const weave = Math.sin(t * Math.PI * 3) * 3 * (1 - t);
          return {
            ...p,
            x: clamp(ballX, 2, 98),
            y: clamp(50 + weave, 8, 92),
            role: p.role,
          };
        }
        if (isQB && playType !== 'scramble') {
          // QB hands off — moves toward RB position then holds
          const handoffT = Math.min(t / 0.2, 1);
          return {
            ...p,
            x: clamp(p.x - offDir * 1 * easeOutCubic(handoffT), 2, 98),
            role: p.role,
          };
        }
        if (isWR) {
          // WRs block downfield
          return {
            ...p,
            x: clamp(p.x - offDir * 4 * eased, 2, 98),
            y: p.y + (p.y > 50 ? 2 : -2) * eased,
            role: p.role,
          };
        }
        if (isTE) {
          // TE blocks at LOS
          return {
            ...p,
            x: clamp(p.x - offDir * 2 * eased, 2, 98),
            role: p.role,
          };
        }
      }

      // ── Special teams ──
      if (playType === 'kickoff') {
        // Coverage team sprints downfield
        if (p.role === 'K') {
          // Kicker stays near original position
          return { ...p, x: clamp(p.x - offDir * 5 * eased, 2, 98), role: p.role };
        }
        // Coverage sprints
        return {
          ...p,
          x: clamp(p.x - offDir * 30 * eased, 2, 98),
          y: clamp(p.y + Math.sin(t * 4 + i * 0.7) * 2, 8, 92),
          role: p.role,
        };
      }

      if (playType === 'punt') {
        if (p.role === 'P') {
          // Punter: catch snap then kick
          const kickT = Math.min(t / 0.3, 1);
          return { ...p, x: clamp(p.x - offDir * 2 * kickT, 2, 98), role: p.role };
        }
        if (p.role === 'GUN') {
          // Gunners sprint downfield
          return {
            ...p,
            x: clamp(p.x - offDir * 35 * eased, 2, 98),
            y: clamp(p.y + (p.y > 50 ? -5 : 5) * eased, 8, 92),
            role: p.role,
          };
        }
        // Protection holds then releases
        return {
          ...p,
          x: clamp(p.x - offDir * (t > 0.3 ? 10 * ((t - 0.3) / 0.7) : 0), 2, 98),
          role: p.role,
        };
      }

      if (playType === 'field_goal' || playType === 'extra_point') {
        // FG/XP: line holds, snap/hold/kick sequence
        if (p.role === 'K' || p.role === 'H') {
          return p; // Stay in position
        }
        // OL holds firm
        return {
          ...p,
          x: clamp(p.x + Math.sin(t * 6 + i) * 0.3, 2, 98),
          role: p.role,
        };
      }

      return p;
    });
  }

  // ── Defensive animation ─────────────────────────────────────
  function animateDefense(
    playType: string,
    startPositions: DotPos[],
    t: number,
    eased: number,
    fromX: number,
    toX: number,
  ): DotPos[] {
    return startPositions.map((p, i) => {
      const isDL = p.role === 'DE' || p.role === 'DT' || p.role === 'NT';
      const isLB = p.role === 'LB' || p.role === 'ILB' || p.role === 'OLB';
      const isCB = p.role === 'CB' || p.role === 'NCB';
      const isS = p.role === 'S';

      // ── Pass plays — DL rushes, DBs cover ──
      if (playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack') {
        if (isDL) {
          // DL rushes toward QB
          const rushDist = playType === 'sack' ? 5 : 3.5;
          return {
            ...p,
            x: clamp(p.x + offDir * rushDist * eased, 2, 98),
            y: p.y + Math.sin(t * 5 + i) * 1,
            role: p.role,
          };
        }
        if (isLB) {
          // LBs drop into zone or spy
          return {
            ...p,
            x: clamp(p.x - offDir * 2 * eased, 2, 98),
            y: p.y + Math.sin(t * 3 + i * 2) * 1.5,
            role: p.role,
          };
        }
        if (isCB) {
          // CBs mirror WRs (move laterally and back)
          return {
            ...p,
            x: clamp(p.x - offDir * 3 * eased, 2, 98),
            y: p.y + Math.sin(t * 4 + i) * 2,
            role: p.role,
          };
        }
        if (isS) {
          // Safeties drop deep
          return {
            ...p,
            x: clamp(p.x - offDir * 4 * eased, 2, 98),
            role: p.role,
          };
        }
      }

      // ── Run plays — everyone pursues ──
      if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
        const ballX = lerp(fromX, toX, eased);
        const pursuitSpeed = isDL ? 0.4 : isLB ? 0.5 : isCB ? 0.35 : 0.3;

        return {
          ...p,
          x: clamp(lerp(p.x, ballX, pursuitSpeed * eased), 2, 98),
          y: clamp(lerp(p.y, 50, 0.3 * eased), 8, 92),
          role: p.role,
        };
      }

      // ── Kickoff return ──
      if (playType === 'kickoff') {
        if (p.role === 'KR') {
          // Returner catches then runs
          if (t < 0.3) {
            return p; // Waiting for ball
          }
          const returnT = (t - 0.3) / 0.7;
          const ballX = lerp(fromX, toX, easeOutCubic(returnT));
          return {
            ...p,
            x: clamp(ballX + offDir * 5, 2, 98),
            y: clamp(50 + Math.sin(returnT * Math.PI * 3) * 10, 8, 92),
            role: p.role,
          };
        }
        // Blockers engage coverage
        return {
          ...p,
          x: clamp(p.x + offDir * 15 * eased, 2, 98),
          y: clamp(p.y + (50 - p.y) * 0.3 * eased, 8, 92),
          role: p.role,
        };
      }

      // ── Punt return ──
      if (playType === 'punt') {
        if (p.role === 'PR') {
          if (t < 0.45) return p; // Waiting for ball
          const returnT = (t - 0.45) / 0.55;
          return {
            ...p,
            x: clamp(lerp(p.x, toX, easeOutCubic(returnT)), 2, 98),
            y: clamp(50 + Math.sin(returnT * Math.PI * 2) * 8, 8, 92),
            role: p.role,
          };
        }
        if (p.role === 'JAM') {
          // Jammers engage gunners
          return {
            ...p,
            x: clamp(p.x + offDir * 3 * eased, 2, 98),
            role: p.role,
          };
        }
        // Rushers/blockers
        return {
          ...p,
          x: clamp(p.x + offDir * 8 * eased, 2, 98),
          role: p.role,
        };
      }

      // ── FG/XP block attempt ──
      if (playType === 'field_goal' || playType === 'extra_point') {
        if (isDL || p.role === 'RSH') {
          return {
            ...p,
            x: clamp(p.x + offDir * 3 * eased, 2, 98),
            role: p.role,
          };
        }
        return p;
      }

      return p;
    });
  }

  // ── Direct DOM updates for performance ──────────────────────
  const updateDom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const offDots = container.querySelectorAll<HTMLDivElement>('.player-dot-off');
    const defDots = container.querySelectorAll<HTMLDivElement>('.player-dot-def');
    const cs = carrierStateRef.current;
    const activeCarrier = carrierTransferredRef.current ? cs.receiverIdx : cs.currentCarrierIdx;

    offDotsRef.current.forEach((pos, i) => {
      const el = offDots[i];
      if (el) {
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
        // Toggle logo vs dot visibility
        const logo = el.querySelector<HTMLDivElement>('.carrier-logo');
        const dot = el.querySelector<HTMLDivElement>('.carrier-dot');
        if (logo && dot) {
          if (i === activeCarrier && cs.carrierMode !== 'special') {
            logo.style.display = 'block';
            dot.style.display = 'none';
          } else {
            logo.style.display = 'none';
            dot.style.display = 'block';
          }
        }
      }
    });

    defDotsRef.current.forEach((pos, i) => {
      const el = defDots[i];
      if (el) {
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
      }
    });
  }, []);

  // ── Cleanup RAF on unmount ──────────────────────────────────
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Don't render during pregame or when no game data
  if (gameStatus === 'pregame' || gameStatus === 'game_over') return null;

  // Use CSS transitions for non-RAF phases
  const useTransition = phase === 'pre_snap' || phase === 'snap' || phase === 'post_play' || phase === 'idle';
  const transitionStyle = useTransition ? 'left 400ms ease-out, top 400ms ease-out' : 'none';

  const logoUrl = teamAbbreviation ? getTeamLogoUrl(teamAbbreviation) : null;
  const borderColor = teamColor || offenseColor;
  const cs = carrierStateRef.current;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-[11]"
    >
      {/* Offense dots (11) — dual-element: hidden logo carrier + visible dot */}
      {Array.from({ length: 11 }, (_, i) => {
        const isCarrier = i === ballCarrierIdx && cs.carrierMode !== 'special';
        const showLogo = isCarrier && (phase === 'development' || phase === 'result' || phase === 'pre_snap' || phase === 'snap');
        const pos = offDotsRef.current[i] || { x: 50, y: 50 };
        return (
          <div
            key={`off-${i}`}
            className="player-dot-off absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: showLogo ? 6 : 3,
              transition: transitionStyle,
            }}
          >
            {/* Team logo carrier (shown on QB/ball carrier) */}
            <div
              className="carrier-logo logo-carrier-glow"
              style={{
                display: showLogo && logoUrl ? 'block' : 'none',
                width: 26,
                height: 26,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: '#1a1a2e',
                border: `2px solid ${borderColor}`,
                boxShadow: `0 0 10px ${borderColor}50, 0 2px 6px rgba(0,0,0,0.5)`,
              }}
            >
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  style={{
                    width: 18,
                    height: 18,
                    objectFit: 'contain',
                    margin: '2px auto',
                    display: 'block',
                  }}
                  draggable={false}
                />
              )}
            </div>
            {/* Regular player dot */}
            <div
              className={`carrier-dot rounded-full ${isCarrier && !showLogo ? 'player-carrier-pulse' : ''}`}
              style={{
                display: showLogo && logoUrl ? 'none' : 'block',
                width: isCarrier ? 10 : 8,
                height: isCarrier ? 10 : 8,
                backgroundColor: offenseColor,
                opacity: isCarrier ? 1.0 : 0.7,
                boxShadow: isCarrier
                  ? `0 0 8px ${offenseColor}`
                  : `0 0 4px ${offenseColor}60`,
              }}
            />
          </div>
        );
      })}

      {/* Defense dots (11) */}
      {Array.from({ length: 11 }, (_, i) => {
        const pos = defDotsRef.current[i] || { x: 50, y: 50 };
        return (
          <div
            key={`def-${i}`}
            className="player-dot-def absolute rounded-full"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: 8,
              height: 8,
              backgroundColor: defenseColor,
              opacity: 0.7,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 4px ${defenseColor}60`,
              zIndex: 3,
              transition: transitionStyle,
            }}
          />
        );
      })}
    </div>
  );
}
