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

// ── Grid dimensions ────────────────────────────────────────
const COLS = 120; // 10 away EZ + 100 field + 10 home EZ
const ROWS = 5;
const TOTAL_CELLS = COLS * ROWS;

// ── Colors ─────────────────────────────────────────────────
const OFF_COLOR = '#0a0f19';
const LOS_COLOR = '#60a5fa';
const FIRST_DOWN_COLOR = '#fcd34d';
const TURNOVER_COLOR = '#f59e0b';
const INCOMPLETE_COLOR = '#ef4444';
const KICK_COLOR = '#fbbf24';

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

/** Convert a field position (0-100, relative to possessing team) to an absolute column (0-119) */
function posToCol(pos: number, possession: 'home' | 'away'): number {
  const absolutePct = possession === 'home' ? 100 - pos : pos;
  return Math.round(absolutePct) + 10; // offset for away end zone
}

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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
  // ── Stable refs for callbacks ───────────────────────────────
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  // ── State ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [animCol, setAnimCol] = useState<number | null>(null); // head column during animation
  const [animStartCol, setAnimStartCol] = useState<number | null>(null);
  const [animEndCol, setAnimEndCol] = useState<number | null>(null);
  const [outcomeEffect, setOutcomeEffect] = useState<'td' | 'turnover' | 'incomplete' | 'sack' | 'fg_good' | 'fg_miss' | null>(null);
  const [kickSweepCol, setKickSweepCol] = useState<number | null>(null); // for kick animation gold sweep

  // Drive trail: columns covered in current drive
  const [driveTrailCols, setDriveTrailCols] = useState<Set<number>>(new Set());

  const prevKeyRef = useRef(playKey);
  const prevPossessionRef = useRef(possession);
  const animFrameRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Derived columns ─────────────────────────────────────────
  const losCol = posToCol(ballPosition, possession);
  const fdCol = posToCol(Math.min(firstDownLine, 100), possession);
  const driveStartCol = posToCol(driveStartPosition, possession);
  const possTeam = possession === 'home' ? homeTeam : awayTeam;
  const oppTeam = possession === 'home' ? awayTeam : homeTeam;

  // ── Update phase helper ─────────────────────────────────────
  const updatePhase = useCallback((p: Phase) => {
    setPhase(p);
    onPhaseChangeRef.current(p);
  }, []);

  // ── Drive trail management ──────────────────────────────────
  // Reset drive trail on possession change / kickoff
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

  // ── Detect new play → run animation ─────────────────────────
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

    // TD: end at the correct end zone
    if (lastPlay.isTouchdown && lastPlay.scoring) {
      endCol = lastPlay.scoring.team === 'home' ? 10 : 109;
    }

    // Turnovers: animate to LOS, then flash
    if (lastPlay.turnover) {
      endCol = losCol;
    }

    // Sack: move backward
    if (lastPlay.type === 'sack') {
      endCol = losCol;
    }

    // Incomplete: stay at LOS (no forward progress)
    if (lastPlay.type === 'pass_incomplete') {
      endCol = startCol;
    }

    // Kick plays (FG, XP, punt, kickoff): special handling
    const isKickPlay = lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point';
    const isPunt = lastPlay.type === 'punt';
    const isKickoffPlay = lastPlay.type === 'kickoff';

    // Clamp columns
    startCol = clamp(startCol, 0, 119);
    endCol = clamp(endCol, 0, 119);

    // Determine timing
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

    // Start animation
    onAnimatingRef.current(true);
    setAnimStartCol(startCol);
    setAnimEndCol(endCol);
    setAnimCol(null);
    setOutcomeEffect(null);
    setKickSweepCol(null);
    updatePhase('pre_snap');

    // ── SNAP ──
    const t1 = setTimeout(() => {
      updatePhase('snap');
      setAnimCol(startCol); // brief flash on LOS
    }, preMs);

    // ── DEVELOPMENT ──
    const t2 = setTimeout(() => {
      updatePhase('development');

      const isPass = lastPlay.type === 'pass_complete' || lastPlay.type === 'pass_incomplete';
      const isRun = lastPlay.type === 'run' || lastPlay.type === 'scramble' || lastPlay.type === 'two_point';
      const isSack = lastPlay.type === 'sack';

      // Determine sweep direction and approach
      const dir = endCol >= startCol ? 1 : -1;
      const totalCols = Math.abs(endCol - startCol);

      if (isKickPlay || isPunt || isKickoffPlay) {
        // Kicks: rapid gold sweep to landing, then (for kickoff) return sweep
        runKickSweep(startCol, endCol, devMs, isKickoffPlay, lastPlay);
      } else if (isPass && lastPlay.type === 'pass_complete') {
        // Pass complete: hold 40%, then fast sweep remaining 60%
        const holdMs = devMs * 0.4;
        const sweepMs = devMs * 0.6;
        const holdTimer = setTimeout(() => {
          runColumnSweep(startCol, endCol, sweepMs);
        }, holdMs);
        timersRef.current.push(holdTimer);
      } else if (isPass && lastPlay.type === 'pass_incomplete') {
        // Incomplete: hold 40%, short sweep toward target, then snap back
        const holdMs = devMs * 0.4;
        const targetCol = startCol + dir * Math.min(15, totalCols + 10);
        const sweepMs = devMs * 0.35;
        const holdTimer = setTimeout(() => {
          runColumnSweep(startCol, clamp(targetCol, 0, 119), sweepMs);
        }, holdMs);
        timersRef.current.push(holdTimer);
      } else if (isSack) {
        // Sack: backward sweep from LOS
        runColumnSweep(startCol, endCol, devMs);
      } else {
        // Runs and everything else: even sweep
        runColumnSweep(startCol, endCol, devMs);
      }
    }, preMs + snapMs);

    // ── RESULT ──
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      setAnimCol(endCol);
      setKickSweepCol(null);

      // Determine outcome effect
      if (lastPlay.isTouchdown) {
        setOutcomeEffect('td');
      } else if (lastPlay.turnover) {
        setOutcomeEffect('turnover');
      } else if (lastPlay.type === 'pass_incomplete') {
        setOutcomeEffect('incomplete');
      } else if (lastPlay.type === 'sack') {
        setOutcomeEffect('sack');
      } else if (isKickPlay && lastPlay.scoring) {
        setOutcomeEffect('fg_good');
      } else if (isKickPlay && !lastPlay.scoring) {
        setOutcomeEffect('fg_miss');
      }
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

      // Reset on turnover/kick
      if (lastPlay.turnover || isKickoffPlay || isPunt) {
        setDriveTrailCols(new Set());
      }
    }, preMs + snapMs + devMs + resMs);

    // ── IDLE ──
    const t5 = setTimeout(() => {
      updatePhase('idle');
      setAnimCol(null);
      setAnimStartCol(null);
      setAnimEndCol(null);
      setOutcomeEffect(null);
      setKickSweepCol(null);
      onAnimatingRef.current(false);
    }, totalMs);

    timersRef.current.push(t1, t2, t3, t4, t5);

    return () => {
      timersRef.current.forEach(clearTimeout);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, ballPosition, losCol, possession, isPatAttempt, updatePhase]);

  // ── RAF sweep: light columns one at a time ────────────────
  function runColumnSweep(from: number, to: number, durationMs: number) {
    const totalCols = Math.abs(to - from);
    if (totalCols === 0) {
      setAnimCol(to);
      return;
    }
    const dir = to > from ? 1 : -1;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 2); // easeOutQuad
      const col = from + Math.round(eased * totalCols) * dir;
      setAnimCol(clamp(col, Math.min(from, to), Math.max(from, to)));
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Kick sweep: gold cells across kick distance, then return
  function runKickSweep(from: number, to: number, durationMs: number, isKickoff: boolean, play: PlayResult) {
    // For kickoffs: sweep gold to landing point (45% of time), then sweep team color back
    // For punts/FG: just sweep gold across
    const kickPhaseEnd = isKickoff ? 0.45 : 1.0;
    const totalCols = Math.abs(to - from);
    if (totalCols === 0) { setAnimCol(to); return; }

    const dir = to > from ? 1 : -1;
    const startTime = performance.now();

    // For kickoff, compute a landing col (same as original logic)
    let landingCol: number;
    if (isKickoff && play.kickoffMeta?.distance) {
      landingCol = from + dir * Math.min(play.kickoffMeta.distance, totalCols);
    } else {
      landingCol = from + Math.round(totalCols * 0.7) * dir;
    }
    landingCol = clamp(landingCol, 0, 119);

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);

      if (t <= kickPhaseEnd) {
        // Phase 1: Gold kick sweep
        const kickT = t / kickPhaseEnd;
        const eased = kickT < 0.5 ? 2 * kickT * kickT : 1 - Math.pow(-2 * kickT + 2, 2) / 2;
        const kickCols = Math.abs(landingCol - from);
        const col = from + Math.round(eased * kickCols) * dir;
        setKickSweepCol(clamp(col, Math.min(from, landingCol), Math.max(from, landingCol)));
        setAnimCol(null);
      } else if (isKickoff) {
        // Phase 2: Return sweep in team color
        const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
        const eased = 1 - Math.pow(1 - returnT, 2);
        const returnCols = Math.abs(to - landingCol);
        const returnDir = to > landingCol ? 1 : -1;
        const col = landingCol + Math.round(eased * returnCols) * returnDir;
        setKickSweepCol(null);
        setAnimCol(clamp(col, Math.min(landingCol, to), Math.max(landingCol, to)));
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Build cell color/opacity arrays ─────────────────────────
  const { cellColors, cellOpacities, cellGlows } = useMemo(() => {
    const colors = new Array<string>(TOTAL_CELLS).fill(OFF_COLOR);
    const opacities = new Array<number>(TOTAL_CELLS).fill(1.0);
    const glows = new Array<boolean>(TOTAL_CELLS).fill(false);

    // Helper: set all rows for a column
    function setColumn(col: number, color: string, opacity: number, glow: boolean = false) {
      if (col < 0 || col >= COLS) return;
      for (let row = 0; row < ROWS; row++) {
        const idx = row * COLS + col;
        colors[idx] = color;
        opacities[idx] = opacity;
        glows[idx] = glow;
      }
    }

    // Helper: set range of columns
    function setColumnRange(fromCol: number, toCol: number, color: string, opacity: number) {
      const lo = Math.max(0, Math.min(fromCol, toCol));
      const hi = Math.min(COLS - 1, Math.max(fromCol, toCol));
      for (let c = lo; c <= hi; c++) {
        setColumn(c, color, opacity);
      }
    }

    // 1. End zones (always dimly lit)
    for (let c = 0; c < 10; c++) {
      setColumn(c, awayTeam.primaryColor, 0.2);
    }
    for (let c = 110; c < 120; c++) {
      setColumn(c, homeTeam.primaryColor, 0.2);
    }

    // 2. Drive trail (dim team color)
    if (gameStatus === 'live' && !isKickoff && !isPatAttempt) {
      driveTrailCols.forEach(col => {
        if (col >= 10 && col < 110) {
          setColumn(col, possTeam.primaryColor, 0.12);
        }
      });
    }

    // 3. LOS marker (when idle or pre-snap)
    if (phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') {
      if (losCol >= 10 && losCol < 110) {
        setColumn(losCol, LOS_COLOR, 0.85, true);
      }
    }

    // 4. First down marker (when idle or pre-snap, and relevant)
    if ((phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') && !isKickoff && !isPatAttempt) {
      if (fdCol >= 10 && fdCol < 110 && fdCol !== losCol) {
        setColumn(fdCol, FIRST_DOWN_COLOR, 0.7, true);
      }
    }

    // 5. Snap flash
    if (phase === 'snap' && animCol !== null) {
      setColumn(animCol, '#ffffff', 0.9, true);
    }

    // 6. Development phase animation
    if (phase === 'development' && animStartCol !== null) {
      // Kick sweep (gold)
      if (kickSweepCol !== null) {
        const lo = Math.min(animStartCol, kickSweepCol);
        const hi = Math.max(animStartCol, kickSweepCol);
        setColumnRange(lo, hi, KICK_COLOR, 0.4);
        setColumn(kickSweepCol, KICK_COLOR, 1.0, true);
      }

      // Normal column sweep (team color)
      if (animCol !== null && kickSweepCol === null) {
        const lo = Math.min(animStartCol, animCol);
        const hi = Math.max(animStartCol, animCol);

        // Sack: use opponent color
        const isSack = lastPlay?.type === 'sack';
        const sweepColor = isSack ? oppTeam.primaryColor : possTeam.primaryColor;

        // Trail cells
        for (let c = lo; c <= hi; c++) {
          if (c >= 0 && c < COLS) {
            setColumn(c, sweepColor, c === animCol ? 1.0 : 0.5);
          }
        }
        // Head cell glow
        if (animCol >= 0 && animCol < COLS) {
          glows[animCol] = true;
          for (let row = 0; row < ROWS; row++) {
            glows[row * COLS + animCol] = true;
          }
        }
      }
    }

    // 7. Result phase effects
    if (phase === 'result' && animStartCol !== null && animEndCol !== null) {
      const lo = Math.min(animStartCol, animEndCol);
      const hi = Math.max(animStartCol, animEndCol);

      if (outcomeEffect === 'td') {
        // Light up sweep in team color + end zone pulse
        setColumnRange(lo, hi, possTeam.primaryColor, 0.8);
        const scoringTeam = lastPlay?.scoring?.team === 'home' ? homeTeam : awayTeam;
        if (animEndCol <= 10) {
          for (let c = 0; c < 10; c++) setColumn(c, scoringTeam.primaryColor, 1.0, true);
        } else if (animEndCol >= 109) {
          for (let c = 110; c < 120; c++) setColumn(c, scoringTeam.primaryColor, 1.0, true);
        }
      } else if (outcomeEffect === 'turnover') {
        setColumnRange(lo, hi, TURNOVER_COLOR, 0.7);
        if (animEndCol >= 0 && animEndCol < COLS) {
          setColumn(animEndCol, TURNOVER_COLOR, 1.0, true);
        }
      } else if (outcomeEffect === 'incomplete') {
        // Flash red at start col
        setColumn(animStartCol, INCOMPLETE_COLOR, 0.8, true);
      } else if (outcomeEffect === 'sack') {
        setColumnRange(lo, hi, oppTeam.primaryColor, 0.6);
        setColumn(animEndCol, oppTeam.primaryColor, 1.0, true);
      } else if (outcomeEffect === 'fg_good' || outcomeEffect === 'fg_miss') {
        const color = outcomeEffect === 'fg_good' ? '#22c55e' : INCOMPLETE_COLOR;
        setColumnRange(lo, hi, KICK_COLOR, 0.4);
        setColumn(animEndCol, color, 1.0, true);
      } else {
        // Normal gain
        setColumnRange(lo, hi, possTeam.primaryColor, 0.7);
        setColumn(animEndCol, possTeam.primaryColor, 1.0, true);
      }
    }

    return { cellColors: colors, cellOpacities: opacities, cellGlows: glows };
  }, [
    phase, losCol, fdCol, animCol, animStartCol, animEndCol, kickSweepCol,
    outcomeEffect, homeTeam, awayTeam, possTeam, oppTeam, driveTrailCols,
    isKickoff, isPatAttempt, gameStatus, lastPlay,
  ]);

  // ── Yard line positions (every 10 yards) ────────────────────
  const yardLines = useMemo(() => {
    // Columns at 10-yard marks: col 20=10yd, 30=20yd, ... 60=50yd, 70=40yd, ... 110=end
    return [20, 30, 40, 50, 60, 70, 80, 90, 100];
  }, []);

  const yardNumbers = useMemo(() => {
    return [
      { col: 20, label: '10' },
      { col: 30, label: '20' },
      { col: 40, label: '30' },
      { col: 50, label: '40' },
      { col: 60, label: '50' },
      { col: 70, label: '40' },
      { col: 80, label: '30' },
      { col: 90, label: '20' },
      { col: 100, label: '10' },
    ];
  }, []);

  // ── Down & distance text ────────────────────────────────────
  const downText = useMemo(() => {
    if (isKickoff || isPatAttempt || gameStatus !== 'live') return null;
    const suffix = down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th';
    const yds = yardsToGo >= 100 ? 'Goal' : `${yardsToGo}`;
    return `${down}${suffix} & ${yds}`;
  }, [down, yardsToGo, isKickoff, isPatAttempt, gameStatus]);

  // ── Down badge position (above grid, at LOS column) ────────
  const losPct = ((losCol) / COLS) * 100;

  // ── TD pulse animation class ────────────────────────────────
  const isTdPulse = phase === 'result' && outcomeEffect === 'td';
  const isTurnoverFlash = phase === 'result' && outcomeEffect === 'turnover';

  return (
    <div className="relative w-full h-full flex flex-col justify-center select-none">
      {/* Down & distance badge */}
      {downText && (phase === 'idle' || phase === 'pre_snap' || phase === 'post_play') && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${clamp(losPct, 8, 92)}%`,
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

      {/* Team abbreviations */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <span
          className="text-[10px] font-black tracking-widest"
          style={{ color: awayTeam.primaryColor, opacity: 0.6, textShadow: `0 0 8px ${awayTeam.primaryColor}40` }}
        >
          {awayTeam.abbreviation}
        </span>
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <span
          className="text-[10px] font-black tracking-widest"
          style={{ color: homeTeam.primaryColor, opacity: 0.6, textShadow: `0 0 8px ${homeTeam.primaryColor}40` }}
        >
          {homeTeam.abbreviation}
        </span>
      </div>

      {/* Main LED grid */}
      <div className="relative mx-auto w-full" style={{ maxWidth: '100%' }}>
        {/* Grid wrapper with gap simulating LED grid lines */}
        <div
          className={`led-grid-board ${isTdPulse ? 'led-td-pulse' : ''} ${isTurnoverFlash ? 'led-turnover-flash' : ''}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            gap: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px',
            overflow: 'hidden',
            aspectRatio: `${COLS} / ${ROWS}`,
          }}
        >
          {Array.from({ length: TOTAL_CELLS }, (_, i) => {
            const color = cellColors[i];
            const opacity = cellOpacities[i];
            const glow = cellGlows[i];

            return (
              <div
                key={i}
                style={{
                  backgroundColor: color,
                  opacity,
                  boxShadow: glow ? `0 0 6px ${color}, 0 0 2px ${color}` : 'none',
                  transition: 'background-color 60ms linear, opacity 60ms linear',
                }}
              />
            );
          })}
        </div>

        {/* Yard line markers (absolutely positioned thin lines) */}
        {yardLines.map(col => (
          <div
            key={col}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(col / COLS) * 100}%`,
              width: '1px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}
          />
        ))}

        {/* End zone dividers */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${(10 / COLS) * 100}%`,
            width: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
          }}
        />
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${(110 / COLS) * 100}%`,
            width: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
          }}
        />
      </div>

      {/* Yard numbers below grid */}
      <div className="relative w-full mt-0.5" style={{ height: '14px' }}>
        {yardNumbers.map(({ col, label }) => (
          <span
            key={col}
            className="absolute text-[9px] font-mono font-bold pointer-events-none"
            style={{
              left: `${(col / COLS) * 100}%`,
              transform: 'translateX(-50%)',
              color: 'rgba(255, 255, 255, 0.25)',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
