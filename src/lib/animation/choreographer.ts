/**
 * PlayChoreographer — central animation engine.
 *
 * Computes all 23 entities (22 players + ball) in dependency order each frame.
 * Ball position is ALWAYS derived from its owner or flight trajectory.
 *
 * Usage:
 *   const frame = computeFrame(phase, phaseT, playContext, snapPositions);
 *   // frame.offense[0..10], frame.defense[0..10], frame.ball, frame.camera
 */

import type {
  Phase, PlayContext, ChoreographyFrame, EntityState, PhaseTiming, AnimState,
} from './types';
import { getTemplate } from './templates';
import {
  computeFormationPositions,
  fieldPctToWorld,
  type DotPos,
} from './play-animation';
import {
  getIdlePositions,
  getAbsolutePositions,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  SPECIAL_TEAMS,
  type PlayerPosition,
} from '@/components/game/field/formation-data';
import type { PlayResult, Formation, DefensivePersonnel } from '@/lib/simulation/types';
import { easeOutCubic, easeInOutQuad, clamp, lerp } from './ball-trajectory';

// ── Phase Timing ──────────────────────────────────────────────

export function getPhaseTimings(play: PlayResult | null): PhaseTiming {
  const isKickoff = play?.type === 'kickoff';
  const isPunt = play?.type === 'punt';
  const isFG = play?.type === 'field_goal' || play?.type === 'extra_point';
  const isSpecial = play?.type === 'kneel' || play?.type === 'spike' || play?.type === 'touchback';

  // Kickoffs/punts skip huddle phase
  if (isKickoff || isPunt) {
    return {
      huddle: 0,
      break: 0,
      set: 800,
      motion: 0,
      snap: 350,
      development: getDevelopmentMs(play),
      result: 800,
      whistle: 400,
      reset: 400,
    };
  }

  if (isFG) {
    return {
      huddle: 0,
      break: 400,
      set: 600,
      motion: 0,
      snap: 300,
      development: getDevelopmentMs(play),
      result: 600,
      whistle: 300,
      reset: 400,
    };
  }

  if (isSpecial) {
    return {
      huddle: 0,
      break: 0,
      set: 400,
      motion: 0,
      snap: 250,
      development: getDevelopmentMs(play),
      result: 400,
      whistle: 200,
      reset: 300,
    };
  }

  // Standard plays — full huddle-to-reset cycle
  return {
    huddle: 1200,
    break: 600,
    set: 800,
    motion: 400,
    snap: 350,
    development: getDevelopmentMs(play),
    result: 800,
    whistle: 400,
    reset: 600,
  };
}

function getDevelopmentMs(play: PlayResult | null): number {
  if (!play) return 2400;
  const ctx: PlayContext = { play, losX: 50, toX: 50, offDir: 1, possession: 'home' };
  const template = getTemplate(ctx);
  return template.getDevelopmentMs(ctx);
}

export function getTotalPhaseDuration(play: PlayResult | null): number {
  const t = getPhaseTimings(play);
  return t.huddle + t.break + t.set + t.motion + t.snap + t.development + t.result + t.whistle + t.reset;
}

// ── Phase Sequencing ──────────────────────────────────────────

const PHASE_ORDER = ['huddle', 'break', 'set', 'motion', 'snap', 'development', 'result', 'whistle', 'reset'] as const;

/** Get current phase and progress within that phase given elapsed time */
export function getPhaseAtTime(elapsed: number, timings: PhaseTiming): { phase: Phase; progress: number } {
  let remaining = elapsed;
  for (const phase of PHASE_ORDER) {
    const duration = timings[phase as keyof PhaseTiming];
    if (duration === 0) continue;
    if (remaining < duration) {
      return { phase, progress: remaining / duration };
    }
    remaining -= duration;
  }
  return { phase: 'idle', progress: 1 };
}

// ── Core Frame Computation ────────────────────────────────────

/** Convert DotPos (field %) to EntityState */
function dotToEntity(dot: DotPos, offDir: number, side: 'offense' | 'defense'): EntityState {
  return {
    x: dot.x,
    y: dot.y,
    height: 0,
    role: dot.role,
    facing: side === 'offense' ? -offDir * Math.PI / 2 : offDir * Math.PI / 2,
    animState: 'idle',
  };
}

/**
 * Compute a complete choreography frame for the given phase and progress.
 */
export function computeFrame(
  phase: Phase,
  phaseProgress: number, // 0-1 within current phase
  ctx: PlayContext,
  snapOff: EntityState[],
  snapDef: EntityState[],
): ChoreographyFrame {
  const { play, losX, toX, offDir } = ctx;

  switch (phase) {
    case 'huddle': {
      // Offense in huddle oval, defense relaxed
      const offIdle = getIdlePositions(losX, offDir, 'offense');
      const defIdle = getIdlePositions(losX, offDir, 'defense');

      // Smooth movement toward huddle positions
      const t = easeOutCubic(phaseProgress);
      const offense = snapOff.map((p, i) => {
        const target = offIdle[i] || offIdle[0];
        return {
          ...p,
          x: lerp(p.x, target.x, t),
          y: lerp(p.y, target.y, t),
          animState: 'idle' as AnimState,
          facing: -offDir * Math.PI / 2,
        };
      });
      const defense = snapDef.map((p, i) => {
        const target = defIdle[i] || defIdle[0];
        return {
          ...p,
          x: lerp(p.x, target.x, t * 0.6),
          y: lerp(p.y, target.y, t * 0.6),
          animState: 'idle' as AnimState,
          facing: offDir * Math.PI / 2,
        };
      });

      const qbIdx = offense.findIndex(p => p.role === 'QB') || 0;
      return {
        offense,
        defense,
        ball: { x: offense[qbIdx]?.x ?? losX, y: offense[qbIdx]?.y ?? 50, height: 0.4, spinRate: 0, tilt: 0, owner: { type: 'ground', x: losX, y: 50 } },
        camera: { preset: 'allTwenty' },
      };
    }

    case 'break': {
      // Players jog from huddle to formation spots
      const { offPositions, defPositions } = computeFormationPositions(play, losX, offDir);
      const t = easeInOutQuad(phaseProgress);

      const offIdle = getIdlePositions(losX, offDir, 'offense');
      const offense = snapOff.map((p, i) => {
        const from = offIdle[i] || offIdle[0];
        const to = offPositions[i] || offPositions[0];
        return {
          x: lerp(from.x, to.x, t),
          y: lerp(from.y, to.y, t),
          height: 0,
          role: to.role,
          facing: -offDir * Math.PI / 2,
          animState: 'running' as AnimState,
        };
      });

      const defIdle = getIdlePositions(losX, offDir, 'defense');
      const defense = snapDef.map((p, i) => {
        const from = defIdle[i] || defIdle[0];
        const to = defPositions[i] || defPositions[0];
        return {
          x: lerp(from.x, to.x, t),
          y: lerp(from.y, to.y, t),
          height: 0,
          role: to.role,
          facing: offDir * Math.PI / 2,
          animState: 'running' as AnimState,
        };
      });

      return {
        offense,
        defense,
        ball: { x: losX, y: 50, height: 0.4, spinRate: 0, tilt: 0, owner: { type: 'ground', x: losX, y: 50 } },
        camera: { preset: 'allTwenty' },
      };
    }

    case 'set': {
      // All 22 at formation spots, pre-snap reads
      const { offPositions, defPositions } = computeFormationPositions(play, losX, offDir);
      const offense = offPositions.map(p => dotToEntity(p, offDir, 'offense'));
      const defense = defPositions.map(p => dotToEntity(p, offDir, 'defense'));

      // Subtle pre-snap movement (weight shifting)
      const offense2 = offense.map((p, i) => ({
        ...p,
        y: p.y + Math.sin(phaseProgress * Math.PI * 2 + i * 0.5) * 0.3,
      }));

      const cIdx = offense2.findIndex(p => p.role === 'C');
      return {
        offense: offense2,
        defense,
        ball: {
          x: offense2[cIdx >= 0 ? cIdx : 0].x,
          y: offense2[cIdx >= 0 ? cIdx : 0].y,
          height: 0.4,
          spinRate: 0, tilt: 0,
          owner: { type: 'held', side: 'offense', index: cIdx >= 0 ? cIdx : 0 },
        },
        camera: { preset: 'sideline' },
      };
    }

    case 'motion': {
      // Optional WR motion — for now, subtle shift of slot receiver
      const { offPositions, defPositions } = computeFormationPositions(play, losX, offDir);
      const offense = offPositions.map(p => dotToEntity(p, offDir, 'offense'));
      const defense = defPositions.map(p => dotToEntity(p, offDir, 'defense'));

      const cIdx = offense.findIndex(p => p.role === 'C');
      return {
        offense,
        defense,
        ball: {
          x: offense[cIdx >= 0 ? cIdx : 0].x,
          y: offense[cIdx >= 0 ? cIdx : 0].y,
          height: 0.4,
          spinRate: 0, tilt: 0,
          owner: { type: 'held', side: 'offense', index: cIdx >= 0 ? cIdx : 0 },
        },
        camera: { preset: 'sideline' },
      };
    }

    case 'snap': {
      // Ball transfers from center to QB
      const { offPositions, defPositions } = computeFormationPositions(play, losX, offDir);
      const offense = offPositions.map(p => dotToEntity(p, offDir, 'offense'));
      const defense = defPositions.map(p => dotToEntity(p, offDir, 'defense'));

      const cIdx = offense.findIndex(p => p.role === 'C');
      const qbIdx = offense.findIndex(p => p.role === 'QB');
      const t = easeOutCubic(phaseProgress);

      // Ball travels from center to QB
      const center = offense[cIdx >= 0 ? cIdx : 0];
      const qb = offense[qbIdx >= 0 ? qbIdx : 0];
      const ballX = lerp(center.x, qb.x, t);
      const ballY = lerp(center.y, qb.y, t);
      const ballHeight = lerp(0.4, 1.5, t);

      const owner = t > 0.5
        ? { type: 'held' as const, side: 'offense' as const, index: qbIdx >= 0 ? qbIdx : 0 }
        : { type: 'held' as const, side: 'offense' as const, index: cIdx >= 0 ? cIdx : 0 };

      return {
        offense,
        defense,
        ball: { x: ballX, y: ballY, height: ballHeight, spinRate: 0, tilt: 0, owner },
        camera: { preset: 'sideline' },
      };
    }

    case 'development': {
      // Delegate to play template
      const template = getTemplate(ctx);
      return template.computeDevelopment(phaseProgress, ctx, snapOff, snapDef);
    }

    case 'result': {
      // Post-play: tackle animation, players settle
      const template = getTemplate(ctx);
      const endFrame = template.computeDevelopment(1.0, ctx, snapOff, snapDef);

      // Slight settling movement
      const t = easeOutCubic(phaseProgress);
      const offense = endFrame.offense.map(p => ({
        ...p,
        y: lerp(p.y, 50, t * 0.1),
        animState: play.isTouchdown ? 'celebrating' as AnimState : 'idle' as AnimState,
      }));
      const defense = endFrame.defense.map(p => ({
        ...p,
        y: lerp(p.y, 50, t * 0.1),
        animState: 'idle' as AnimState,
      }));

      return {
        ...endFrame,
        offense,
        defense,
        camera: play.isTouchdown ? { preset: 'closeUp' } : { preset: 'sideline' },
      };
    }

    case 'whistle': {
      // Players disengage, officials mark ball
      const template = getTemplate(ctx);
      const endFrame = template.computeDevelopment(1.0, ctx, snapOff, snapDef);
      return {
        ...endFrame,
        camera: { preset: 'sideline' },
      };
    }

    case 'reset': {
      // Players walk back toward huddle area
      const template = getTemplate(ctx);
      const endFrame = template.computeDevelopment(1.0, ctx, snapOff, snapDef);
      const t = easeOutCubic(phaseProgress);

      const huddleOff = getIdlePositions(toX, offDir, 'offense');
      const huddleDef = getIdlePositions(toX, offDir, 'defense');

      const offense = endFrame.offense.map((p, i) => {
        const target = huddleOff[i] || huddleOff[0];
        return {
          ...p,
          x: lerp(p.x, target.x, t * 0.4),
          y: lerp(p.y, target.y, t * 0.4),
          animState: 'running' as AnimState,
        };
      });
      const defense = endFrame.defense.map((p, i) => {
        const target = huddleDef[i] || huddleDef[0];
        return {
          ...p,
          x: lerp(p.x, target.x, t * 0.3),
          y: lerp(p.y, target.y, t * 0.3),
          animState: 'running' as AnimState,
        };
      });

      return {
        offense,
        defense,
        ball: endFrame.ball,
        camera: { preset: 'allTwenty' },
      };
    }

    case 'idle':
    default: {
      // Relaxed positions
      const offIdle = getIdlePositions(losX, offDir, 'offense');
      const defIdle = getIdlePositions(losX, offDir, 'defense');
      const offense = offIdle.map(p => ({ ...p, height: 0, facing: -offDir * Math.PI / 2, animState: 'idle' as AnimState }));
      const defense = defIdle.map(p => ({ ...p, height: 0, facing: offDir * Math.PI / 2, animState: 'idle' as AnimState }));

      return {
        offense,
        defense,
        ball: { x: losX, y: 50, height: 0.4, spinRate: 0, tilt: 0, owner: { type: 'ground', x: losX, y: 50 } },
        camera: { preset: 'allTwenty' },
      };
    }
  }
}

// Re-export fieldPctToWorld for convenience
export { fieldPctToWorld } from './play-animation';
