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
  KICKOFF_PHASE_END,
  getKickoffDevMs,
} from './play-timing';
import type { Phase } from './play-timing';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import { YARD_PCT, YARDS } from './yard-grid';

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
  offenseSecondaryColor?: string;
  defenseColor: string;
  defenseSecondaryColor?: string;
  lastPlay: PlayResult | null;
  playKey: number;
  isKickoff: boolean;
  isPatAttempt: boolean;
  gameStatus: 'pregame' | 'live' | 'halftime' | 'game_over';
  /** Team abbreviation for the QB/carrier logo */
  teamAbbreviation?: string;
  /** Team primary color for carrier logo border */
  teamColor?: string;
  /** Opposing team abbreviation (for kickoff return carrier logo) */
  opposingTeamAbbreviation?: string;
}

type CarrierMode = 'qb_keeps' | 'handoff' | 'pass' | 'scramble' | 'special' | 'kickoff_return';

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
  offenseSecondaryColor,
  defenseColor,
  defenseSecondaryColor,
  lastPlay,
  playKey,
  isKickoff,
  isPatAttempt,
  gameStatus,
  teamAbbreviation,
  teamColor,
  opposingTeamAbbreviation,
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
  // Route trail lines for WR routes during pass plays
  const [routeLines, setRouteLines] = useState<{ points: string }[]>([]);

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
    } else if (playType === 'kickoff') {
      // Kickoff: KR gets team logo after ball lands
      // Defense dots contain the receiving team (KR is in defPositions for kickoffs)
      const krIdx = defPositions.findIndex(p => p.role === 'KR');
      carrierState = {
        currentCarrierIdx: -1, // no carrier during flight
        receiverIdx: krIdx >= 0 ? krIdx : -1,
        transferT: KICKOFF_PHASE_END, // ball lands
        carrierMode: 'kickoff_return',
      };
    } else {
      // Special teams (punt, FG, XP) — no carrier logo
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
      setRouteLines([]);
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
      // Snap: OL fires forward, center snaps ball backward to QB
      if (offSnapRef.current.length > 0) {
        const snapped = offSnapRef.current.map((p) => {
          if (p.role === 'C') {
            // Center snaps — quick push forward
            return { ...p, x: p.x - offDir * 2.5 };
          }
          if (p.role === 'LG' || p.role === 'RG' || p.role === 'LT' || p.role === 'RT') {
            // Guards/tackles fire into their stance
            return { ...p, x: p.x - offDir * 1.5 };
          }
          return p;
        });
        offDotsRef.current = snapped;

        // Also shift DL to react to the snap
        const defSnapped = defSnapRef.current.map((p) => {
          if (p.role === 'DE' || p.role === 'DT' || p.role === 'NT') {
            return { ...p, x: p.x + offDir * 0.8 };
          }
          return p;
        });
        defDotsRef.current = defSnapped;

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

    // Compute route lines for pass plays (one-time, not per-frame)
    const isPassPlay = playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack';
    if (isPassPlay) {
      const wrRoutes: { points: string }[] = [];
      let wrCount = 0;
      offStart.forEach((p) => {
        if (p.role === 'WR' || p.role === 'TE') {
          const isPrimary = wrCount === 0;
          const route = isPrimary
            ? getRouteForConcept(lastPlay!.routeConcept, lastPlay!.call)
            : COMPLEMENT_ROUTES[wrCount % COMPLEMENT_ROUTES.length];
          const playDepth = Math.abs(toX - fromX);
          const routeScale = isPrimary ? Math.max(playDepth, YARDS.SHORT_ROUTE) : Math.max(playDepth * 0.7, YARDS.SHORT_ROUTE);
          const lateralScale = isPrimary ? routeScale * 0.4 : routeScale * 0.25;

          const pts: string[] = [];
          for (let step = 0; step <= 20; step++) {
            const st = step / 20;
            const routePt = interpolateRoute(route, st);
            const rx = clamp(p.x - offDir * routeScale * routePt.dx, 2, 98);
            const ry = clamp(p.y + routePt.dy * lateralScale, 5, 95);
            pts.push(`${rx},${ry}`);
          }
          wrRoutes.push({ points: pts.join(' ') });
          wrCount++;
        }
      });
      setRouteLines(wrRoutes);
    } else {
      setRouteLines([]);
    }

    const devDurationMs = playType === 'kickoff' ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;

    function tick(now: number) {
      const t = Math.min((now - startTime) / devDurationMs, 1);
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
          // OL pass protection kick (1.5 yards)
          return {
            ...p,
            x: clamp(p.x + offDir * (YARDS.OL_PASS_SET * eased), 2, 98),
            y: p.y + Math.sin(t * 3 + i) * 0.5,
            role: p.role,
          };
        }
        if (isQB) {
          if (playType === 'sack') {
            const dropDist = YARDS.SHORT_DROP;
            if (t < 0.35) {
              return { ...p, x: clamp(p.x + offDir * dropDist * (t / 0.35), 2, 98), role: p.role };
            }
            const sackT = (t - 0.35) / 0.65;
            return {
              ...p,
              x: clamp(lerp(p.x + offDir * dropDist, toX, sackT), 2, 98),
              y: p.y + Math.sin(sackT * 8) * 1.5,
              role: p.role,
            };
          }
          // QB drops back — play action vs normal
          const dropDist = play.call?.includes('play_action') ? YARDS.PA_DROP : YARDS.SHORT_DROP;
          const dropT = Math.min(t / 0.3, 1);
          return {
            ...p,
            x: clamp(p.x + offDir * dropDist * easeOutCubic(dropT), 2, 98),
            role: p.role,
          };
        }
        if (isWR || isTE) {
          // Receivers run routes — proportional to actual pass depth
          const routeIdx = startPositions.filter((pp, ii) => ii < i && (pp.role === 'WR' || pp.role === 'TE')).length;
          const isPrimary = routeIdx === 0;
          const route = isPrimary
            ? getRouteForConcept(play.routeConcept, play.call)
            : COMPLEMENT_ROUTES[routeIdx % COMPLEMENT_ROUTES.length];

          const routePt = interpolateRoute(route, t);
          const playDepth = Math.abs(toX - fromX);
          const routeScale = isPrimary ? Math.max(playDepth, YARDS.SHORT_ROUTE) : Math.max(playDepth * 0.7, YARDS.SHORT_ROUTE);
          const lateralScale = isPrimary ? routeScale * 0.4 : routeScale * 0.25;
          return {
            ...p,
            x: clamp(p.x - offDir * routeScale * routePt.dx, 2, 98),
            y: clamp(p.y + routePt.dy * lateralScale, 5, 95),
            role: p.role,
          };
        }
        if (isRB) {
          // RB check-down (2 yards)
          return {
            ...p,
            x: clamp(p.x + offDir * (2 * YARD_PCT) * eased, 2, 98),
            y: p.y + Math.sin(t * 4) * 2,
            role: p.role,
          };
        }
      }

      // ── Run plays ──
      if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
        if (isOL) {
          // OL drive block (2 yards)
          return {
            ...p,
            x: clamp(p.x - offDir * YARDS.OL_RUN_PUSH * eased, 2, 98),
            y: p.y,
            role: p.role,
          };
        }
        if (isRB || (playType === 'scramble' && isQB)) {
          // Ball carrier follows exact ball path
          const ballX = lerp(fromX, toX, eased);
          const weave = Math.sin(t * Math.PI * 3) * YARDS.MAX_WEAVE * (1 - t);
          return {
            ...p,
            x: clamp(ballX, 2, 98),
            y: clamp(50 + weave, 5, 95),
            role: p.role,
          };
        }
        if (isQB && playType !== 'scramble') {
          // QB hands off and fades back
          const handoffT = Math.min(t / 0.2, 1);
          return {
            ...p,
            x: clamp(p.x + offDir * (1.5 * YARD_PCT) * easeOutCubic(handoffT), 2, 98),
            role: p.role,
          };
        }
        if (isWR) {
          // WRs stalk block downfield (5 yards)
          return {
            ...p,
            x: clamp(p.x - offDir * (5 * YARD_PCT) * eased, 2, 98),
            y: p.y + (p.y > 50 ? 3 : -3) * eased,
            role: p.role,
          };
        }
        if (isTE) {
          // TE lead blocks (3 yards)
          return {
            ...p,
            x: clamp(p.x - offDir * (3 * YARD_PCT) * eased, 2, 98),
            role: p.role,
          };
        }
      }

      // ── Special teams ──
      if (playType === 'kickoff') {
        if (p.role === 'K') {
          // Kicker run-up (3 yards approach), then drift forward
          if (t < 0.15) {
            const runT = t / 0.15;
            const arcX = -offDir * YARDS.KICKER_APPROACH * easeOutCubic(runT);
            const arcY = Math.sin(runT * Math.PI) * 2;
            return { ...p, x: clamp(p.x + arcX, 2, 98), y: clamp(p.y + arcY, 5, 95), role: p.role };
          }
          const driftT = (t - 0.15) / 0.85;
          return { ...p, x: clamp(p.x - offDir * (10 * YARD_PCT) * easeOutCubic(driftT), 2, 98), role: p.role };
        }
        // Coverage team — 40 real yards sprint
        const staggerDelay = (i % 5) * 0.03;
        const adjustedT = Math.max(0, t - staggerDelay);
        const covEased = easeOutCubic(adjustedT);
        return {
          ...p,
          x: clamp(p.x - offDir * (40 * YARD_PCT) * covEased, 2, 98),
          y: clamp(p.y + Math.sin(adjustedT * 3 + i * 1.2) * 2, 5, 95),
          role: p.role,
        };
      }

      if (playType === 'punt') {
        if (p.role === 'P') {
          const kickT = Math.min(t / 0.3, 1);
          return { ...p, x: clamp(p.x - offDir * 3 * kickT, 2, 98), role: p.role };
        }
        if (p.role === 'GUN') {
          return {
            ...p,
            x: clamp(p.x - offDir * 40 * eased, 2, 98),
            y: clamp(p.y + (p.y > 50 ? -6 : 6) * eased, 5, 95),
            role: p.role,
          };
        }
        return {
          ...p,
          x: clamp(p.x - offDir * (t > 0.3 ? 12 * ((t - 0.3) / 0.7) : 0), 2, 98),
          role: p.role,
        };
      }

      if (playType === 'field_goal' || playType === 'extra_point') {
        if (p.role === 'K' || p.role === 'H') {
          return p;
        }
        return {
          ...p,
          x: clamp(p.x + Math.sin(t * 6 + i) * 0.4, 2, 98),
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

      // ── Pass plays — two-phase: coverage pre-throw, pursuit post-throw ──
      if (playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack') {
        const isCatchPhase = t >= 0.35 && playType === 'pass_complete';

        if (isDL) {
          const rushDist = playType === 'sack' ? (7 * YARD_PCT) : (4 * YARD_PCT);
          if (isCatchPhase) {
            const preX = p.x + offDir * rushDist * easeOutCubic(0.35);
            const pursuitT = (t - 0.35) / 0.65;
            return {
              ...p,
              x: clamp(lerp(preX, toX, 0.4 * easeOutCubic(pursuitT)), 2, 98),
              y: clamp(lerp(p.y, 50, 0.3 * pursuitT), 5, 95),
              role: p.role,
            };
          }
          return {
            ...p,
            x: clamp(p.x + offDir * rushDist * eased, 2, 98),
            y: p.y + Math.sin(t * 5 + i) * 1.5,
            role: p.role,
          };
        }
        if (isLB) {
          const lbDist = 3 * YARD_PCT;
          if (isCatchPhase) {
            const preX = p.x - offDir * lbDist * easeOutCubic(0.35);
            const preY = p.y + Math.sin(0.35 * 3 + i * 2) * 2;
            const pursuitT = (t - 0.35) / 0.65;
            return {
              ...p,
              x: clamp(lerp(preX, toX, 0.5 * easeOutCubic(pursuitT)), 2, 98),
              y: clamp(lerp(preY, 50, 0.4 * pursuitT), 5, 95),
              role: p.role,
            };
          }
          return {
            ...p,
            x: clamp(p.x - offDir * lbDist * eased, 2, 98),
            y: p.y + Math.sin(t * 3 + i * 2) * 2,
            role: p.role,
          };
        }
        if (isCB) {
          const cbDist = 5 * YARD_PCT;
          if (isCatchPhase) {
            const preX = p.x - offDir * cbDist * easeOutCubic(0.35);
            const preY = p.y + Math.sin(0.35 * 4 + i) * 3;
            const pursuitT = (t - 0.35) / 0.65;
            return {
              ...p,
              x: clamp(lerp(preX, toX, 0.6 * easeOutCubic(pursuitT)), 2, 98),
              y: clamp(lerp(preY, 50, 0.5 * pursuitT), 5, 95),
              role: p.role,
            };
          }
          return {
            ...p,
            x: clamp(p.x - offDir * cbDist * eased, 2, 98),
            y: p.y + Math.sin(t * 4 + i) * 3,
            role: p.role,
          };
        }
        if (isS) {
          const sDist = 6 * YARD_PCT;
          if (isCatchPhase) {
            const preX = p.x - offDir * sDist * easeOutCubic(0.35);
            const pursuitT = (t - 0.35) / 0.65;
            return {
              ...p,
              x: clamp(lerp(preX, toX, 0.55 * easeOutCubic(pursuitT)), 2, 98),
              y: clamp(lerp(p.y, 50, 0.45 * pursuitT), 5, 95),
              role: p.role,
            };
          }
          return {
            ...p,
            x: clamp(p.x - offDir * sDist * eased, 2, 98),
            role: p.role,
          };
        }
      }

      // ── Run plays — everyone pursues the ball ──
      if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
        const ballX = lerp(fromX, toX, eased);
        const pursuitSpeed = isDL ? 0.6 : isLB ? 0.7 : isCB ? 0.55 : 0.5;

        return {
          ...p,
          x: clamp(lerp(p.x, ballX, pursuitSpeed * eased), 2, 98),
          y: clamp(lerp(p.y, 50, 0.45 * eased), 5, 95),
          role: p.role,
        };
      }

      // ── Kickoff return ──
      if (playType === 'kickoff') {
        if (p.role === 'KR') {
          if (t < KICKOFF_PHASE_END) return p;
          const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
          const ballX = lerp(fromX, toX, easeOutCubic(returnT));
          const amplitude = YARDS.MAX_SCRAMBLE_WEAVE * (1 - returnT * 0.5);
          return {
            ...p,
            x: clamp(ballX + offDir * (5 * YARD_PCT), 2, 98),
            y: clamp(50 + Math.sin(returnT * Math.PI * 4) * amplitude, 5, 95),
            role: p.role,
          };
        }
        if (p.role === 'WDG') {
          if (t < KICKOFF_PHASE_END) return p;
          const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
          const ballX = lerp(fromX, toX, easeOutCubic(returnT));
          return {
            ...p,
            x: clamp(ballX + offDir * (10 * YARD_PCT), 2, 98),
            y: clamp(p.y + (50 - p.y) * 0.3 * returnT, 5, 95),
            role: p.role,
          };
        }
        // Regular blockers
        return {
          ...p,
          x: clamp(p.x + offDir * (20 * YARD_PCT) * eased, 2, 98),
          y: clamp(p.y + (50 - p.y) * 0.35 * eased, 5, 95),
          role: p.role,
        };
      }

      // ── Punt return ──
      if (playType === 'punt') {
        if (p.role === 'PR') {
          if (t < 0.45) return p;
          const returnT = (t - 0.45) / 0.55;
          return {
            ...p,
            x: clamp(lerp(p.x, toX, easeOutCubic(returnT)), 2, 98),
            y: clamp(50 + Math.sin(returnT * Math.PI * 2) * YARDS.MAX_SCRAMBLE_WEAVE, 5, 95),
            role: p.role,
          };
        }
        if (p.role === 'JAM') {
          return {
            ...p,
            x: clamp(p.x + offDir * (4 * YARD_PCT) * eased, 2, 98),
            role: p.role,
          };
        }
        return {
          ...p,
          x: clamp(p.x + offDir * (10 * YARD_PCT) * eased, 2, 98),
          role: p.role,
        };
      }

      // ── FG/XP block attempt ──
      if (playType === 'field_goal' || playType === 'extra_point') {
        if (isDL || p.role === 'RSH') {
          return {
            ...p,
            x: clamp(p.x + offDir * (4 * YARD_PCT) * eased, 2, 98),
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
    const isKickoffReturn = cs.carrierMode === 'kickoff_return';

    offDotsRef.current.forEach((pos, i) => {
      const el = offDots[i];
      if (el) {
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
        // Toggle logo vs dot visibility (offense side — not used for kickoff_return)
        const logo = el.querySelector<HTMLDivElement>('.carrier-logo');
        const dot = el.querySelector<HTMLDivElement>('.carrier-dot');
        if (logo && dot) {
          if (i === activeCarrier && cs.carrierMode !== 'special' && cs.carrierMode !== 'kickoff_return') {
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
        // For kickoff_return: show team logo on KR after ball lands
        if (isKickoffReturn) {
          const logo = el.querySelector<HTMLDivElement>('.carrier-logo');
          const dot = el.querySelector<HTMLDivElement>('.carrier-dot');
          if (logo && dot) {
            if (i === activeCarrier && carrierTransferredRef.current) {
              logo.style.display = 'block';
              dot.style.display = 'none';
              // Make KR dot larger
              el.style.zIndex = '20';
            } else {
              logo.style.display = 'none';
              dot.style.display = 'block';
              el.style.zIndex = '3';
            }
          }
        }
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
  // Pre-snap: 900ms transition → smooth formation set with stagger feel
  const useTransition = phase === 'pre_snap' || phase === 'snap' || phase === 'post_play' || phase === 'idle';
  const transMs = phase === 'pre_snap' ? 500 : phase === 'snap' ? 300 : 250;
  const transitionStyle = useTransition ? `left ${transMs}ms ease-out, top ${transMs}ms ease-out` : 'none';

  const logoUrl = teamAbbreviation ? getTeamLogoUrl(teamAbbreviation) : null;
  const borderColor = teamColor || offenseColor;
  const cs = carrierStateRef.current;

  // Helmet direction: facemask faces toward the opponent
  // offDir=1 → QB drops right (offense attacks LEFT) → facemask faces left
  // offDir=-1 → QB drops left (offense attacks RIGHT) → facemask faces right
  const offFacingLeft = offDir === 1;
  const defFacingLeft = offDir === -1;
  const offSecondary = offenseSecondaryColor || '#ffffff';
  const defSecondary = defenseSecondaryColor || '#ffffff';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-[11]"
    >
      {/* Offense players (11) — SVG helmet + logo carrier */}
      {Array.from({ length: 11 }, (_, i) => {
        const isCarrier = i === ballCarrierIdx && cs.carrierMode !== 'special';
        const showLogo = isCarrier && (phase === 'development' || phase === 'result' || phase === 'pre_snap' || phase === 'snap');
        const pos = offDotsRef.current[i] || { x: 50, y: 50 };
        const role = pos.role || 'OFF';
        const isOL = role === 'C' || role === 'LG' || role === 'RG' || role === 'LT' || role === 'RT';
        const isQB = role === 'QB';
        const helmetW = isOL ? 22 : isCarrier ? 24 : (isQB ? 20 : 18);
        const helmetH = isOL ? 18 : isCarrier ? 20 : (isQB ? 16 : 14);
        const staggerDelay = phase === 'pre_snap' ? (isOL ? '0ms' : isQB ? '80ms' : '150ms') : '0ms';
        return (
          <div
            key={`off-${i}`}
            className="player-dot-off absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: showLogo ? 20 : (isCarrier || isQB ? 10 : 3),
              transition: transitionStyle,
              transitionDelay: staggerDelay,
            }}
          >
            {/* Team logo carrier (shown on QB/ball carrier) */}
            <div
              className="carrier-logo logo-carrier-glow"
              style={{
                display: showLogo && logoUrl ? 'block' : 'none',
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: '#1a1a2e',
                border: `2.5px solid ${borderColor}`,
                boxShadow: `0 0 14px ${borderColor}50, 0 2px 8px rgba(0,0,0,0.5)`,
              }}
            >
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  style={{
                    width: 28,
                    height: 28,
                    objectFit: 'contain',
                    margin: '4px auto',
                    display: 'block',
                  }}
                  draggable={false}
                />
              )}
            </div>
            {/* SVG football helmet */}
            <svg
              className={`carrier-dot ${isCarrier && !showLogo ? 'player-carrier-pulse' : ''}`}
              viewBox="0 0 28 20"
              width={helmetW}
              height={helmetH}
              style={{
                display: showLogo && logoUrl ? 'none' : 'block',
                transform: offFacingLeft ? 'scaleX(-1)' : 'none',
                filter: isCarrier
                  ? `drop-shadow(0 0 6px ${offenseColor})`
                  : `drop-shadow(0 0 3px ${offenseColor}80)`,
                opacity: isCarrier ? 1.0 : 0.85,
              }}
            >
              {/* Helmet shell */}
              <path d="M3,2 C1,3 0,6 0,10 C0,14 1,17 3,18 L17,18 C20,17 22,14 22,12 L22,8 C22,6 20,3 17,2 Z" fill={offenseColor} />
              {/* Facemask */}
              <rect x="19" y="5" width="7" height="10" rx="1.5" fill="rgba(60,60,60,0.8)" />
              <line x1="19.5" y1="7.5" x2="26" y2="7.5" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              <line x1="19.5" y1="10" x2="26" y2="10" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              <line x1="19.5" y1="12.5" x2="26" y2="12.5" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              {/* Center stripe */}
              <path d="M2,10 C6,3 16,3 21,8" stroke={offSecondary} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        );
      })}

      {/* Route lines during pass plays */}
      {routeLines.length > 0 && (phase === 'development' || phase === 'result') && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        >
          {routeLines.map((line, i) => (
            <polyline
              key={`route-${i}`}
              points={line.points}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.35"
              strokeDasharray="1.2 0.8"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}

      {/* Defense players (11) — SVG helmet facing offense */}
      {Array.from({ length: 11 }, (_, i) => {
        const pos = defDotsRef.current[i] || { x: 50, y: 50 };
        const role = pos.role || 'DEF';
        const isDL = role === 'DE' || role === 'DT' || role === 'NT';
        const isDB = role === 'CB' || role === 'NCB' || role === 'S';
        const isKR = role === 'KR';
        const helmetW = isDL ? 22 : isDB ? 16 : 18;
        const helmetH = isDL ? 18 : isDB ? 13 : 15;
        const isKRCarrier = cs.carrierMode === 'kickoff_return' && i === cs.receiverIdx && carrierTransferredRef.current;
        const showKRLogo = isKRCarrier && (phase === 'development' || phase === 'result');
        const krLogoUrl = isKR && cs.carrierMode === 'kickoff_return' && opposingTeamAbbreviation
          ? getTeamLogoUrl(opposingTeamAbbreviation)
          : null;

        return (
          <div
            key={`def-${i}`}
            className="player-dot-def absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: showKRLogo ? 20 : 3,
              transition: transitionStyle,
            }}
          >
            {/* KR carrier logo (shown during kickoff return after ball lands) */}
            {isKR && cs.carrierMode === 'kickoff_return' && (
              <div
                className="carrier-logo logo-carrier-glow"
                style={{
                  display: showKRLogo ? 'block' : 'none',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  backgroundColor: '#1a1a2e',
                  border: `2.5px solid ${defenseColor}`,
                  boxShadow: `0 0 14px ${defenseColor}50, 0 2px 8px rgba(0,0,0,0.5)`,
                }}
              >
                {krLogoUrl ? (
                  <img
                    src={krLogoUrl}
                    alt=""
                    style={{
                      width: 28,
                      height: 28,
                      objectFit: 'contain',
                      margin: '4px auto',
                      display: 'block',
                    }}
                    draggable={false}
                  />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      margin: '4px auto',
                      borderRadius: '50%',
                      backgroundColor: defenseColor,
                      opacity: 0.9,
                    }}
                  />
                )}
              </div>
            )}
            {/* SVG football helmet — facing toward offense */}
            <svg
              className={`carrier-dot ${isKRCarrier && !showKRLogo ? 'player-carrier-pulse' : ''}`}
              viewBox="0 0 28 20"
              width={isKRCarrier ? 24 : helmetW}
              height={isKRCarrier ? 20 : helmetH}
              style={{
                display: showKRLogo ? 'none' : 'block',
                transform: defFacingLeft ? 'scaleX(-1)' : 'none',
                filter: isKRCarrier
                  ? `drop-shadow(0 0 6px ${defenseColor})`
                  : `drop-shadow(0 0 3px ${defenseColor}80)`,
                opacity: isKRCarrier ? 1.0 : 0.85,
              }}
            >
              <path d="M3,2 C1,3 0,6 0,10 C0,14 1,17 3,18 L17,18 C20,17 22,14 22,12 L22,8 C22,6 20,3 17,2 Z" fill={defenseColor} />
              <rect x="19" y="5" width="7" height="10" rx="1.5" fill="rgba(60,60,60,0.8)" />
              <line x1="19.5" y1="7.5" x2="26" y2="7.5" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              <line x1="19.5" y1="10" x2="26" y2="10" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              <line x1="19.5" y1="12.5" x2="26" y2="12.5" stroke="rgba(200,200,200,0.7)" strokeWidth="1.2" />
              <path d="M2,10 C6,3 16,3 21,8" stroke={defSecondary} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
