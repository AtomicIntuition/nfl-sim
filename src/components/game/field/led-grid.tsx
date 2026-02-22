'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
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
  getKickoffDevMs,
} from './play-timing';
import type { Phase } from './play-timing';
import {
  GRID_COLS,
  GRID_ROWS,
  fieldPctToGrid,
  gridToCss,
  yardPosToCol,
  yardPosToFieldPct,
} from './grid-coords';
import {
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  SPECIAL_TEAMS,
  getAbsolutePositions,
  getIdlePositions,
} from './formation-data';

// ── Constants ───────────────────────────────────────────────
const MAX_TRAIL_CELLS = 30;
const LINEMEN_ROLES = new Set(['C', 'LG', 'RG', 'LT', 'RT', 'DT', 'DE', 'NT', 'LS']);

interface LedGridProps {
  ballPosition: number;
  firstDownLine: number;
  possession: 'home' | 'away';
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  driveStartPosition: number;
  homeTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  lastPlay: PlayResult | null;
  playKey: number;
  isKickoff: boolean;
  isPatAttempt: boolean;
  gameStatus: 'pregame' | 'live' | 'halftime' | 'game_over';
  onPhaseChange: (phase: Phase) => void;
  onAnimating: (animating: boolean) => void;
}

// ── Coordinate helpers ─────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Convert yard position to absolute column */
function posToCol(pos: number, possession: 'home' | 'away'): number {
  return yardPosToCol(pos, possession);
}

// ── Cell sizing ─────────────────────────────────────────────
function cellWidthPct(): number { return 100 / GRID_COLS; }
function cellHeightPct(): number { return 100 / GRID_ROWS; }

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export function LedGrid({
  ballPosition,
  firstDownLine,
  possession,
  down,
  yardsToGo,
  driveStartPosition,
  homeTeam,
  awayTeam,
  lastPlay,
  playKey,
  isKickoff,
  isPatAttempt,
  gameStatus,
  onPhaseChange,
  onAnimating,
}: LedGridProps) {
  // ── Stable refs ───────────────────────────────────────────
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  // ── State ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [outcomeEffect, setOutcomeEffect] = useState<
    'td' | 'turnover' | 'incomplete' | 'sack' | 'fg_good' | 'fg_miss' | null
  >(null);

  // Drive trail columns
  const [driveTrailCols, setDriveTrailCols] = useState<Set<number>>(new Set());

  // Trail cells for current play animation
  const [trailCells, setTrailCells] = useState<{ col: number; row: number }[]>([]);

  const prevKeyRef = useRef(playKey);
  const prevPossessionRef = useRef(possession);
  const animFrameRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Refs for player cell DOM manipulation
  const offenseRefs = useRef<(HTMLDivElement | null)[]>(Array(11).fill(null));
  const defenseRefs = useRef<(HTMLDivElement | null)[]>(Array(11).fill(null));
  const ballCarrierIdxRef = useRef(5); // Default: QB (index 5 in most formations)

  // ── Derived values ────────────────────────────────────────
  const losCol = posToCol(ballPosition, possession);
  const fdCol = posToCol(Math.min(firstDownLine, 100), possession);
  const possTeam = possession === 'home' ? homeTeam : awayTeam;
  const oppTeam = possession === 'home' ? awayTeam : homeTeam;
  const offDir = possession === 'away' ? 1 : -1;

  // LOS as field container percentage
  const losFieldPct = yardPosToFieldPct(ballPosition, possession);

  // ── Update phase helper ───────────────────────────────────
  const updatePhase = useCallback((p: Phase) => {
    setPhase(p);
    onPhaseChangeRef.current(p);
  }, []);

  // ── Formation data ────────────────────────────────────────
  const { offenseFormation, defenseFormation, isSpecialTeams } = useMemo(() => {
    if (!lastPlay) {
      return {
        offenseFormation: OFFENSIVE_FORMATIONS['shotgun'],
        defenseFormation: DEFENSIVE_FORMATIONS['base_4_3'],
        isSpecialTeams: false,
      };
    }

    // Special teams
    if (lastPlay.type === 'kickoff') {
      return {
        offenseFormation: SPECIAL_TEAMS.kickoff.kicking,
        defenseFormation: SPECIAL_TEAMS.kickoff.receiving,
        isSpecialTeams: true,
      };
    }
    if (lastPlay.type === 'punt') {
      return {
        offenseFormation: SPECIAL_TEAMS.punt.kicking,
        defenseFormation: SPECIAL_TEAMS.punt.receiving,
        isSpecialTeams: true,
      };
    }
    if (lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point') {
      return {
        offenseFormation: SPECIAL_TEAMS.field_goal.kicking,
        defenseFormation: SPECIAL_TEAMS.field_goal.blocking,
        isSpecialTeams: true,
      };
    }

    const offForm = lastPlay.formation && OFFENSIVE_FORMATIONS[lastPlay.formation]
      ? OFFENSIVE_FORMATIONS[lastPlay.formation]
      : OFFENSIVE_FORMATIONS['shotgun'];

    const defPers = lastPlay.defensiveCall?.personnel && DEFENSIVE_FORMATIONS[lastPlay.defensiveCall.personnel]
      ? DEFENSIVE_FORMATIONS[lastPlay.defensiveCall.personnel]
      : DEFENSIVE_FORMATIONS['base_4_3'];

    return { offenseFormation: offForm, defenseFormation: defPers, isSpecialTeams: false };
  }, [lastPlay]);

  // ── Position calculations ─────────────────────────────────

  // Absolute formation positions (field %)
  const offensePositions = useMemo(() => {
    return getAbsolutePositions(offenseFormation, losFieldPct, offDir, 'offense');
  }, [offenseFormation, losFieldPct, offDir]);

  const defensePositions = useMemo(() => {
    return getAbsolutePositions(defenseFormation, losFieldPct, offDir, 'defense');
  }, [defenseFormation, losFieldPct, offDir]);

  // Idle (huddle) positions
  const offenseIdlePositions = useMemo(() => {
    return getIdlePositions(losFieldPct, offDir, 'offense');
  }, [losFieldPct, offDir]);

  const defenseIdlePositions = useMemo(() => {
    return getIdlePositions(losFieldPct, offDir, 'defense');
  }, [losFieldPct, offDir]);

  // Convert positions to grid cells
  const offenseGridIdle = useMemo(() => offenseIdlePositions.map(p => fieldPctToGrid(p.x, p.y)), [offenseIdlePositions]);
  const defenseGridIdle = useMemo(() => defenseIdlePositions.map(p => fieldPctToGrid(p.x, p.y)), [defenseIdlePositions]);
  const offenseGridForm = useMemo(() => offensePositions.map(p => fieldPctToGrid(p.x, p.y)), [offensePositions]);
  const defenseGridForm = useMemo(() => defensePositions.map(p => fieldPctToGrid(p.x, p.y)), [defensePositions]);

  // ── Drive trail management ────────────────────────────────
  useEffect(() => {
    if (possession !== prevPossessionRef.current) {
      setDriveTrailCols(new Set());
      prevPossessionRef.current = possession;
    }
  }, [possession]);

  useEffect(() => {
    if (isKickoff || isPatAttempt) {
      setDriveTrailCols(new Set());
    }
  }, [isKickoff, isPatAttempt]);

  // ── Position player cells via DOM refs ────────────────────
  const positionPlayers = useCallback((
    offPositions: { col: number; row: number }[],
    defPositions: { col: number; row: number }[],
  ) => {
    for (let i = 0; i < 11; i++) {
      const offEl = offenseRefs.current[i];
      if (offEl && offPositions[i]) {
        const css = gridToCss(offPositions[i].col, offPositions[i].row);
        offEl.style.left = css.left;
        offEl.style.top = css.top;
      }
      const defEl = defenseRefs.current[i];
      if (defEl && defPositions[i]) {
        const css = gridToCss(defPositions[i].col, defPositions[i].row);
        defEl.style.left = css.left;
        defEl.style.top = css.top;
      }
    }
  }, []);

  // ── Position players for current phase (static) ───────────
  useEffect(() => {
    if (phase === 'idle' || phase === 'post_play') {
      positionPlayers(offenseGridIdle, defenseGridIdle);
    } else if (phase === 'pre_snap') {
      positionPlayers(offenseGridForm, defenseGridForm);
    }
  }, [phase, offenseGridIdle, defenseGridIdle, offenseGridForm, defenseGridForm, positionPlayers]);

  // ── Detect new play → run animation ───────────────────────
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    // Skip non-animatable plays
    if (
      lastPlay.type === 'kneel' || lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' || lastPlay.type === 'coin_toss'
    ) return;

    // Compute start and end columns
    const prevBallPos = ballPosition - (possession === 'home' ? -lastPlay.yardsGained : lastPlay.yardsGained);
    let startCol = posToCol(Math.max(0, Math.min(100, prevBallPos)), possession);
    let endCol = losCol;

    if (lastPlay.isTouchdown && lastPlay.scoring) {
      endCol = lastPlay.scoring.team === 'home' ? 10 : 109;
    }
    if (lastPlay.turnover) endCol = losCol;
    if (lastPlay.type === 'sack') endCol = losCol;
    if (lastPlay.type === 'pass_incomplete') endCol = startCol;

    const isKickPlay = lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point';
    const isPunt = lastPlay.type === 'punt';
    const isKickoffPlay = lastPlay.type === 'kickoff';

    startCol = clamp(startCol, 0, 119);
    endCol = clamp(endCol, 0, 119);

    // Timing
    const isKO = isKickoffPlay;
    const preMs = isKO ? KICKOFF_PRE_SNAP_MS : PRE_SNAP_MS;
    const snapMs = isKO ? KICKOFF_SNAP_MS : SNAP_MS;
    const devMs = isKO ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;
    const resMs = isKO ? KICKOFF_RESULT_MS : RESULT_MS;
    const postMs = isKO ? KICKOFF_POST_PLAY_MS : POST_PLAY_MS;
    const totalMs = preMs + snapMs + devMs + resMs + postMs;

    // Clear previous animation
    cancelAnimationFrame(animFrameRef.current);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    onAnimatingRef.current(true);
    setTrailCells([]);
    setOutcomeEffect(null);
    ballCarrierIdxRef.current = 5; // QB

    // ── PRE_SNAP ──
    updatePhase('pre_snap');

    // ── SNAP ──
    const t1 = setTimeout(() => {
      updatePhase('snap');
    }, preMs);

    // ── DEVELOPMENT ──
    const t2 = setTimeout(() => {
      updatePhase('development');

      const isPass = lastPlay.type === 'pass_complete' || lastPlay.type === 'pass_incomplete';
      const isRun = lastPlay.type === 'run' || lastPlay.type === 'scramble' || lastPlay.type === 'two_point';
      const isSack = lastPlay.type === 'sack';

      const dir = endCol >= startCol ? 1 : -1;
      const totalCols = Math.abs(endCol - startCol);
      const centerRow = Math.floor(GRID_ROWS / 2);

      if (isKickPlay || isPunt || isKickoffPlay) {
        // Kick sweep
        runKickTrail(startCol, endCol, devMs, isKickoffPlay, lastPlay, centerRow);
      } else if (isPass && lastPlay.type === 'pass_complete') {
        // Pass: QB drops back, then ball flies to receiver
        const holdMs = devMs * 0.4;
        const sweepMs = devMs * 0.6;
        // Drop QB back during hold
        animateQBDrop(startCol, devMs * 0.35);
        const holdTimer = setTimeout(() => {
          runBallTrail(startCol, endCol, sweepMs, centerRow, possTeam.primaryColor);
        }, holdMs);
        timersRef.current.push(holdTimer);
      } else if (isPass && lastPlay.type === 'pass_incomplete') {
        const holdMs = devMs * 0.4;
        const targetCol = startCol + dir * Math.min(15, totalCols + 10);
        const sweepMs = devMs * 0.35;
        animateQBDrop(startCol, devMs * 0.35);
        const holdTimer = setTimeout(() => {
          runBallTrail(startCol, clamp(targetCol, 0, 119), sweepMs, centerRow, possTeam.primaryColor);
        }, holdMs);
        timersRef.current.push(holdTimer);
      } else if (isSack) {
        runBallTrail(startCol, endCol, devMs, centerRow, oppTeam.primaryColor);
      } else if (isRun) {
        // Run: move ball carrier forward
        runBallTrail(startCol, endCol, devMs, centerRow, possTeam.primaryColor);
        // Push OL forward slightly
        animateOLPush(devMs * 0.5);
      } else {
        runBallTrail(startCol, endCol, devMs, centerRow, possTeam.primaryColor);
      }
    }, preMs + snapMs);

    // ── RESULT ──
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);

      if (lastPlay.isTouchdown) setOutcomeEffect('td');
      else if (lastPlay.turnover) setOutcomeEffect('turnover');
      else if (lastPlay.type === 'pass_incomplete') setOutcomeEffect('incomplete');
      else if (lastPlay.type === 'sack') setOutcomeEffect('sack');
      else if (isKickPlay && lastPlay.scoring) setOutcomeEffect('fg_good');
      else if (isKickPlay && !lastPlay.scoring) setOutcomeEffect('fg_miss');
    }, preMs + snapMs + devMs);

    // ── POST_PLAY ──
    const t4 = setTimeout(() => {
      updatePhase('post_play');

      // Add to drive trail
      if (!isKickoffPlay && !isPunt && !isKickPlay && !isPatAttempt && !lastPlay.turnover) {
        setDriveTrailCols(prev => {
          const next = new Set(prev);
          const lo = Math.min(startCol, endCol);
          const hi = Math.max(startCol, endCol);
          for (let c = lo; c <= hi; c++) next.add(c);
          return next;
        });
      }

      if (lastPlay.turnover || isKickoffPlay || isPunt) {
        setDriveTrailCols(new Set());
      }
    }, preMs + snapMs + devMs + resMs);

    // ── IDLE ──
    const t5 = setTimeout(() => {
      updatePhase('idle');
      setTrailCells([]);
      setOutcomeEffect(null);
      onAnimatingRef.current(false);
    }, totalMs);

    timersRef.current.push(t1, t2, t3, t4, t5);

    return () => {
      timersRef.current.forEach(clearTimeout);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, ballPosition, losCol, possession, isPatAttempt, updatePhase,
      possTeam.primaryColor, oppTeam.primaryColor, losFieldPct, offDir]);

  // ── RAF: Ball trail animation ─────────────────────────────
  function runBallTrail(from: number, to: number, durationMs: number, centerRow: number, _color: string) {
    const totalCols = Math.abs(to - from);
    if (totalCols === 0) return;
    const dir = to > from ? 1 : -1;
    const startTime = performance.now();
    const trail: { col: number; row: number }[] = [];

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const col = from + Math.round(eased * totalCols) * dir;
      const clamped = clamp(col, Math.min(from, to), Math.max(from, to));

      // Add to trail if new column
      if (trail.length === 0 || trail[trail.length - 1].col !== clamped) {
        // Slight vertical wobble for visual interest
        const wobble = Math.round(Math.sin(clamped * 0.5) * 2);
        trail.push({ col: clamped, row: clamp(centerRow + wobble, 2, GRID_ROWS - 3) });
        if (trail.length > MAX_TRAIL_CELLS) trail.shift();
        setTrailCells([...trail]);
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Kick trail (gold sweep, optional return) ──────────────
  function runKickTrail(from: number, to: number, durationMs: number, isKO: boolean, play: PlayResult, centerRow: number) {
    const kickPhaseEnd = isKO ? 0.45 : 1.0;
    const totalCols = Math.abs(to - from);
    if (totalCols === 0) return;
    const dir = to > from ? 1 : -1;

    let landingCol: number;
    if (isKO && play.kickoffMeta?.distance) {
      landingCol = from + dir * Math.min(play.kickoffMeta.distance, totalCols);
    } else {
      landingCol = from + Math.round(totalCols * 0.7) * dir;
    }
    landingCol = clamp(landingCol, 0, 119);

    const startTime = performance.now();
    const trail: { col: number; row: number }[] = [];

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);

      let col: number;
      if (t <= kickPhaseEnd) {
        const kickT = t / kickPhaseEnd;
        const eased = kickT < 0.5 ? 2 * kickT * kickT : 1 - Math.pow(-2 * kickT + 2, 2) / 2;
        const kickCols = Math.abs(landingCol - from);
        col = from + Math.round(eased * kickCols) * dir;
        col = clamp(col, Math.min(from, landingCol), Math.max(from, landingCol));
      } else if (isKO) {
        const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
        const eased = 1 - Math.pow(1 - returnT, 2);
        const returnCols = Math.abs(to - landingCol);
        const returnDir = to > landingCol ? 1 : -1;
        col = landingCol + Math.round(eased * returnCols) * returnDir;
        col = clamp(col, Math.min(landingCol, to), Math.max(landingCol, to));
      } else {
        col = to;
      }

      if (trail.length === 0 || trail[trail.length - 1].col !== col) {
        trail.push({ col, row: centerRow });
        if (trail.length > MAX_TRAIL_CELLS) trail.shift();
        setTrailCells([...trail]);
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── QB drop back animation ────────────────────────────────
  function animateQBDrop(startCol: number, durationMs: number) {
    const qbIdx = offenseFormation.findIndex(p => p.role === 'QB');
    if (qbIdx === -1) return;
    const qbEl = offenseRefs.current[qbIdx];
    if (!qbEl) return;

    const dropCols = 3; // 3 yards back
    const dropDir = offDir; // behind LOS
    const startTime = performance.now();

    const fromPos = offenseGridForm[qbIdx];
    if (!fromPos) return;

    const capturedEl = qbEl;
    const capturedFrom = fromPos;

    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const col = capturedFrom.col + Math.round(eased * dropCols) * dropDir;
      const css = gridToCss(clamp(col, 0, GRID_COLS - 1), capturedFrom.row);
      capturedEl.style.left = css.left;
      capturedEl.style.top = css.top;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── OL push forward animation ─────────────────────────────
  function animateOLPush(durationMs: number) {
    const olIndices = offenseFormation.reduce<number[]>((acc, p, i) => {
      if (LINEMEN_ROLES.has(p.role)) acc.push(i);
      return acc;
    }, []);

    if (olIndices.length === 0) return;
    const startTime = performance.now();
    const pushCols = 2;
    const pushDir = -offDir; // push toward defense

    const fromPositions = olIndices.map(i => offenseGridForm[i]);

    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 2);

      olIndices.forEach((idx, j) => {
        const el = offenseRefs.current[idx];
        const from = fromPositions[j];
        if (!el || !from) return;
        const col = from.col + Math.round(eased * pushCols) * pushDir;
        const css = gridToCss(clamp(col, 0, GRID_COLS - 1), from.row);
        el.style.left = css.left;
        el.style.top = css.top;
      });

      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── Down & distance text ──────────────────────────────────
  const downText = useMemo(() => {
    if (isKickoff || isPatAttempt || gameStatus !== 'live') return null;
    const suffix = down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th';
    const yds = yardsToGo >= 100 ? 'Goal' : `${yardsToGo}`;
    return `${down}${suffix} & ${yds}`;
  }, [down, yardsToGo, isKickoff, isPatAttempt, gameStatus]);

  // LOS position as CSS %
  const losCssPct = ((losCol) / GRID_COLS) * 100;
  const fdCssPct = ((fdCol) / GRID_COLS) * 100;

  // ── TD / Turnover classes ─────────────────────────────────
  const isTdPulse = phase === 'result' && outcomeEffect === 'td';
  const isTurnoverFlash = phase === 'result' && outcomeEffect === 'turnover';

  // Cell dimensions as % for sizing
  const cw = cellWidthPct();
  const ch = cellHeightPct();

  // ── Determine which player is the ball carrier ────────────
  const ballCarrierIdx = useMemo(() => {
    if (!lastPlay) return -1;
    if (lastPlay.type === 'run' || lastPlay.type === 'scramble') {
      return offenseFormation.findIndex(p => p.role === 'RB') ?? -1;
    }
    if (lastPlay.type === 'pass_complete') {
      // After catch, receivers are WR roles
      const wrIdx = offenseFormation.findIndex(p => p.role === 'WR');
      return wrIdx >= 0 ? wrIdx : -1;
    }
    // Default: QB
    return offenseFormation.findIndex(p => p.role === 'QB');
  }, [lastPlay, offenseFormation]);

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-10 ${isTdPulse ? 'led-td-pulse' : ''} ${isTurnoverFlash ? 'led-turnover-flash' : ''}`}
    >
      {/* Faint grid lines via CSS */}
      <div className="led-grid-lines absolute inset-0" />

      {/* LOS stripe (full-height blue) */}
      {(phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') && losCol >= 10 && losCol < 110 && (
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${losCssPct}%`,
            width: `${cw}%`,
            background: 'rgba(96, 165, 250, 0.25)',
            transform: 'translateX(-50%)',
          }}
        />
      )}

      {/* First-down stripe (full-height gold) */}
      {(phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') &&
        !isKickoff && !isPatAttempt && fdCol >= 10 && fdCol < 110 && fdCol !== losCol && (
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${fdCssPct}%`,
            width: `${cw}%`,
            background: 'rgba(252, 211, 77, 0.2)',
            transform: 'translateX(-50%)',
          }}
        />
      )}

      {/* End zone tints */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: `${(10 / GRID_COLS) * 100}%`,
          background: `${awayTeam.primaryColor}18`,
        }}
      />
      <div
        className="absolute top-0 bottom-0 right-0"
        style={{
          width: `${(10 / GRID_COLS) * 100}%`,
          background: `${homeTeam.primaryColor}18`,
        }}
      />

      {/* TD end zone pulse */}
      {outcomeEffect === 'td' && lastPlay?.scoring && (
        <div
          className="absolute top-0 bottom-0"
          style={{
            ...(lastPlay.scoring.team === 'away'
              ? { left: 0, width: `${(10 / GRID_COLS) * 100}%` }
              : { right: 0, width: `${(10 / GRID_COLS) * 100}%` }),
            background: `${lastPlay.scoring.team === 'away' ? awayTeam.primaryColor : homeTeam.primaryColor}60`,
            animation: 'led-td-pulse 0.6s ease-in-out 2',
          }}
        />
      )}

      {/* Drive trail (dim full-height columns in team color) */}
      {gameStatus === 'live' && !isKickoff && !isPatAttempt && driveTrailCols.size > 0 && (
        (() => {
          // Render as contiguous blocks for performance
          const cols = Array.from(driveTrailCols).filter(c => c >= 10 && c < 110).sort((a, b) => a - b);
          if (cols.length === 0) return null;
          const blocks: { start: number; end: number }[] = [];
          let cur = { start: cols[0], end: cols[0] };
          for (let i = 1; i < cols.length; i++) {
            if (cols[i] === cur.end + 1) {
              cur.end = cols[i];
            } else {
              blocks.push(cur);
              cur = { start: cols[i], end: cols[i] };
            }
          }
          blocks.push(cur);
          return blocks.map((b, idx) => (
            <div
              key={`dt-${idx}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(b.start / GRID_COLS) * 100}%`,
                width: `${((b.end - b.start + 1) / GRID_COLS) * 100}%`,
                background: `${possTeam.primaryColor}14`,
              }}
            />
          ));
        })()
      )}

      {/* Ball trail cells during development/result */}
      {trailCells.length > 0 && (phase === 'development' || phase === 'result') && (
        trailCells.map((cell, i) => {
          const isHead = i === trailCells.length - 1;
          const isSack = lastPlay?.type === 'sack';
          const isKick = lastPlay?.type === 'field_goal' || lastPlay?.type === 'extra_point' ||
                         lastPlay?.type === 'punt' || lastPlay?.type === 'kickoff';
          const color = isSack
            ? oppTeam.primaryColor
            : isKick ? '#fbbf24' : possTeam.primaryColor;
          const opacity = isHead ? 0.9 : 0.2 + (i / trailCells.length) * 0.4;
          const css = gridToCss(cell.col, cell.row);
          return (
            <div
              key={`trail-${i}`}
              className="led-cell led-cell--trail"
              style={{
                left: css.left,
                top: css.top,
                width: `${cw * 1.2}%`,
                height: `${ch * 1.2}%`,
                background: color,
                opacity,
                boxShadow: isHead ? `0 0 8px ${color}, 0 0 4px ${color}` : 'none',
              }}
            />
          );
        })
      )}

      {/* 22 player cells — offense */}
      {offenseFormation.map((pos, i) => {
        const isLineman = LINEMEN_ROLES.has(pos.role);
        const isCarrier = (phase === 'development' || phase === 'result') && i === ballCarrierIdx;
        const initPos = (phase === 'idle' || phase === 'post_play')
          ? (offenseGridIdle[i] ? gridToCss(offenseGridIdle[i].col, offenseGridIdle[i].row) : { left: '50%', top: '50%' })
          : (offenseGridForm[i] ? gridToCss(offenseGridForm[i].col, offenseGridForm[i].row) : { left: '50%', top: '50%' });

        return (
          <div
            key={`off-${i}`}
            ref={el => { offenseRefs.current[i] = el; }}
            className={`led-cell led-cell--player ${isLineman ? 'led-cell--player-ol' : ''} ${isCarrier ? 'led-cell--ball-carrier' : ''}`}
            style={{
              left: initPos.left,
              top: initPos.top,
              width: `${cw * (isCarrier ? 1.8 : 1.3)}%`,
              height: `${ch * (isCarrier ? 1.8 : 1.3)}%`,
              background: possTeam.primaryColor,
              boxShadow: `0 0 4px ${possTeam.primaryColor}80`,
              transition: 'left 120ms linear, top 120ms linear, width 150ms, height 150ms',
            }}
          />
        );
      })}

      {/* 22 player cells — defense */}
      {defenseFormation.map((pos, i) => {
        const isLineman = LINEMEN_ROLES.has(pos.role);
        const initPos = (phase === 'idle' || phase === 'post_play')
          ? (defenseGridIdle[i] ? gridToCss(defenseGridIdle[i].col, defenseGridIdle[i].row) : { left: '50%', top: '50%' })
          : (defenseGridForm[i] ? gridToCss(defenseGridForm[i].col, defenseGridForm[i].row) : { left: '50%', top: '50%' });

        return (
          <div
            key={`def-${i}`}
            ref={el => { defenseRefs.current[i] = el; }}
            className={`led-cell led-cell--player ${isLineman ? 'led-cell--player-ol' : ''}`}
            style={{
              left: initPos.left,
              top: initPos.top,
              width: `${cw * 1.3}%`,
              height: `${ch * 1.3}%`,
              background: oppTeam.primaryColor,
              boxShadow: `0 0 4px ${oppTeam.primaryColor}80`,
              transition: 'left 120ms linear, top 120ms linear',
            }}
          />
        );
      })}

      {/* Snap flash */}
      {phase === 'snap' && (
        <div
          className="led-cell"
          style={{
            ...gridToCss(losCol, Math.floor(GRID_ROWS / 2)),
            width: `${cw * 2}%`,
            height: `${ch * 2}%`,
            background: '#ffffff',
            opacity: 0.9,
            boxShadow: '0 0 12px #fff, 0 0 6px #fff',
          }}
        />
      )}

      {/* Outcome effects — incomplete red flash */}
      {outcomeEffect === 'incomplete' && (
        <div
          className="led-cell"
          style={{
            ...gridToCss(losCol, Math.floor(GRID_ROWS / 2)),
            width: `${cw * 3}%`,
            height: `${ch * 3}%`,
            background: '#ef4444',
            opacity: 0.7,
            boxShadow: '0 0 16px #ef4444',
          }}
        />
      )}

      {/* Outcome effects — sack burst */}
      {outcomeEffect === 'sack' && (
        <div
          className="led-cell"
          style={{
            ...gridToCss(losCol, Math.floor(GRID_ROWS / 2)),
            width: `${cw * 3}%`,
            height: `${ch * 3}%`,
            background: oppTeam.primaryColor,
            opacity: 0.8,
            boxShadow: `0 0 16px ${oppTeam.primaryColor}`,
          }}
        />
      )}

      {/* Down & distance badge */}
      {downText && (phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') && (
        <div
          className="absolute z-20"
          style={{
            left: `${clamp(losCssPct, 8, 92)}%`,
            top: '4px',
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={{
              background: 'rgba(17, 24, 39, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              color: '#e2e8f0',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {downText}
          </div>
        </div>
      )}

      {/* Team abbreviations at field edges */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 z-20">
        <span
          className="text-[10px] font-black tracking-widest"
          style={{ color: awayTeam.primaryColor, opacity: 0.5, textShadow: `0 0 8px ${awayTeam.primaryColor}40` }}
        >
          {awayTeam.abbreviation}
        </span>
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 z-20">
        <span
          className="text-[10px] font-black tracking-widest"
          style={{ color: homeTeam.primaryColor, opacity: 0.5, textShadow: `0 0 8px ${homeTeam.primaryColor}40` }}
        >
          {homeTeam.abbreviation}
        </span>
      </div>
    </div>
  );
}
