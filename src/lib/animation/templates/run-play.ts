/**
 * Run play template — handles all run types + scramble + two_point.
 * Ball ownership: Center → QB → RB (handoff) → RB carries.
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import { easeOutCubic, easeInOutQuad, easeOutQuad, clamp, lerp } from '../ball-trajectory';

const HANDOFF_TIME = 0.12; // When RB receives ball

export const runPlayTemplate: PlayTemplate = {
  getDevelopmentMs(ctx: PlayContext): number {
    const { play } = ctx;
    if (play.call === 'run_draw') return 2800;
    if (play.call === 'run_outside_zone' || play.call === 'run_sweep' || play.call === 'run_outside') return 2600;
    if (play.type === 'scramble') return 2800;
    return 2400;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, toX } = ctx;
    const eased = easeOutCubic(t);
    const call = play.call || '';
    const isScramble = play.type === 'scramble';
    const travel = toX - losX;

    // ── Ball carrier path ───────────────────────────────────
    const carrierPath = computeCarrierPath(call, t, losX, toX, offDir, travel, isScramble);

    // ── Offense ─────────────────────────────────────────────
    const offense: EntityState[] = snapOff.map((p, i) => {
      const isOL = ['C', 'LG', 'RG', 'LT', 'RT'].includes(p.role);
      const isQB = p.role === 'QB';
      const isRB = p.role === 'RB' || p.role === 'FB';
      const isWR = p.role === 'WR';
      const isTE = p.role === 'TE';

      if (isOL) {
        // OL: run block — push forward and create lanes
        const blockDist = call.includes('outside') || call.includes('sweep') ? 3 : 4;
        const pull = (call === 'run_power' && p.role === 'RG') || (call === 'run_counter' && p.role === 'LG');
        if (pull) {
          // Pulling guard
          const pullT = Math.min(t / 0.4, 1);
          const pullEased = easeOutCubic(pullT);
          return { ...p, x: clamp(p.x - offDir * 6 * pullEased, 2, 98), y: clamp(p.y + (carrierPath.y - p.y) * pullEased * 0.5, 5, 95), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        return { ...p, x: clamp(p.x - offDir * blockDist * eased, 2, 98), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      if (isRB && !isScramble) {
        // RB: follows carrier path exactly
        const weave = Math.sin(t * Math.PI * 3) * 4 * (1 - t);
        return {
          ...p,
          x: clamp(carrierPath.x, 2, 98),
          y: clamp(carrierPath.y + weave, 5, 95),
          animState: t > HANDOFF_TIME ? (t > 0.5 ? 'juking' : 'running') as AnimState : 'idle' as AnimState,
          facing: computeFacing(carrierPath.x - p.x, carrierPath.y - p.y, offDir),
        };
      }

      if (isQB) {
        if (isScramble) {
          // QB scramble — QB IS the carrier
          return {
            ...p,
            x: clamp(carrierPath.x, 2, 98),
            y: clamp(carrierPath.y, 5, 95),
            animState: 'running' as AnimState,
            facing: computeFacing(carrierPath.x - p.x, 0, offDir),
          };
        }
        // Handoff then drift
        const handoffT = Math.min(t / 0.2, 1);
        const driftX = clamp(p.x + offDir * 1.5 * easeOutCubic(handoffT), 2, 98);
        return { ...p, x: driftX, animState: t < HANDOFF_TIME ? 'idle' : 'running' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      if (isWR) {
        // WRs block downfield
        return { ...p, x: clamp(p.x - offDir * 6 * eased, 2, 98), y: p.y + (p.y > 50 ? 3 : -3) * eased, animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      if (isTE) {
        return { ...p, x: clamp(p.x - offDir * 3.5 * eased, 2, 98), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      return p;
    });

    // ── Defense ─────────────────────────────────────────────
    const defense: EntityState[] = snapDef.map((p, i) => {
      const isDL = ['DE', 'DT', 'NT'].includes(p.role);
      const isLB = ['LB', 'ILB', 'OLB'].includes(p.role);
      const isCB = ['CB', 'NCB'].includes(p.role);

      const pursuitSpeed = isDL ? 0.6 : isLB ? 0.7 : isCB ? 0.55 : 0.5;
      const ballX = carrierPath.x;

      return {
        ...p,
        x: clamp(lerp(p.x, ballX, pursuitSpeed * eased), 2, 98),
        y: clamp(lerp(p.y, carrierPath.y, 0.45 * eased), 5, 95),
        animState: 'running' as AnimState,
        facing: computeFacing(ballX - p.x, carrierPath.y - p.y, offDir),
      };
    });

    // ── Ball ownership ──────────────────────────────────────
    const carrierIdx = isScramble
      ? offense.findIndex(p => p.role === 'QB')
      : offense.findIndex(p => p.role === 'RB' || p.role === 'FB');
    const qbIdx = offense.findIndex(p => p.role === 'QB');

    let ballOwner: BallOwner;
    if (t < HANDOFF_TIME && !isScramble) {
      ballOwner = { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 };
    } else {
      ballOwner = { type: 'held', side: 'offense', index: carrierIdx >= 0 ? carrierIdx : 0 };
    }

    const holder = offense[ballOwner.type === 'held' ? ballOwner.index : 0];

    return {
      offense,
      defense,
      ball: {
        x: holder.x,
        y: holder.y,
        height: 0.8,
        spinRate: 0,
        tilt: 0,
        owner: ballOwner,
      },
      camera: { preset: 'sideline' },
    };
  },
};

/** Compute the ball carrier's path based on run type */
function computeCarrierPath(
  call: string, t: number, fromX: number, toX: number, offDir: number, travel: number, isScramble: boolean,
): { x: number; y: number } {
  const overshootX = travel * 0.10;
  const eased = easeOutCubic(t);

  if (isScramble) {
    let x: number;
    if (t < 0.85) {
      x = fromX + (travel + travel * 0.12) * easeOutCubic(t / 0.85);
    } else {
      x = fromX + travel + travel * 0.12 * (1 - easeOutQuad((t - 0.85) / 0.15));
    }
    const weave = Math.sin(t * Math.PI * 4) * 18 * (1 - t * 0.7);
    const secondaryWeave = Math.cos(t * Math.PI * 2.5) * 6 * (1 - t);
    return { x, y: 50 + weave + secondaryWeave };
  }

  switch (call) {
    case 'run_power': case 'run_zone': case 'run_inside': {
      let x: number;
      if (t < 0.85) x = fromX + (travel + overshootX) * easeOutQuad(t / 0.85);
      else x = fromX + travel + overshootX * (1 - easeOutQuad((t - 0.85) / 0.15));
      const drift = Math.sin(t * Math.PI * 2) * 8 * (1 - t);
      const juke = t > 0.35 && t < 0.5 ? Math.sin((t - 0.35) * Math.PI / 0.15) * 6 : 0;
      return { x, y: 50 + drift + juke };
    }
    case 'run_outside_zone': case 'run_sweep': case 'run_outside': {
      if (t < 0.35) {
        const sweepT = easeOutQuad(t / 0.35);
        return { x: fromX + travel * 0.1 * sweepT, y: 50 + offDir * 28 * sweepT };
      }
      const sprintT = (t - 0.35) / 0.65;
      const cornerX = fromX + travel * 0.1;
      let x: number;
      if (sprintT < 0.85) x = cornerX + (toX + overshootX - cornerX) * easeOutQuad(sprintT / 0.85);
      else x = toX + overshootX * (1 - easeOutQuad((sprintT - 0.85) / 0.15));
      const cornerY = 50 + offDir * 28;
      return { x, y: cornerY + (50 - cornerY) * easeOutCubic(sprintT) };
    }
    case 'run_draw': {
      if (t < 0.25) return { x: fromX + offDir * 3 * easeOutQuad(t / 0.25), y: 50 };
      if (t < 0.45) return { x: fromX + offDir * 3 + Math.sin((t - 0.25) * 30) * 0.5, y: 50 };
      const burstT = (t - 0.45) / 0.55;
      const startX = fromX + offDir * 3;
      const bTravel = toX - startX;
      const bOver = bTravel * 0.10;
      let x: number;
      if (burstT < 0.85) x = startX + (bTravel + bOver) * easeOutCubic(burstT / 0.85);
      else x = startX + bTravel + bOver * (1 - easeOutQuad((burstT - 0.85) / 0.15));
      return { x, y: 50 + Math.sin(burstT * Math.PI * 2) * 10 * (1 - burstT) };
    }
    case 'run_counter': {
      if (t < 0.30) {
        const fakeT = easeOutQuad(t / 0.30);
        return { x: fromX + travel * 0.05 * fakeT, y: 50 - offDir * 24 * fakeT };
      }
      if (t < 0.45) {
        const cutT = (t - 0.30) / 0.15;
        return { x: fromX + travel * 0.05 + travel * 0.1 * cutT, y: (50 - offDir * 24) + offDir * 40 * easeInOutQuad(cutT) };
      }
      const sprintT = (t - 0.45) / 0.55;
      const cutX = fromX + travel * 0.15;
      const cutY = 50 + offDir * 16;
      let x: number;
      if (sprintT < 0.85) x = cutX + (toX + overshootX - cutX) * easeOutQuad(sprintT / 0.85);
      else x = toX + overshootX * (1 - easeOutQuad((sprintT - 0.85) / 0.15));
      return { x, y: cutY + (50 - cutY) * sprintT };
    }
    case 'run_option': {
      if (t < 0.20) return { x: fromX, y: 50 + offDir * 14 * (t / 0.20) };
      if (t < 0.40) return { x: fromX + travel * 0.1 * ((t - 0.20) / 0.20), y: 50 + offDir * 14 };
      const burstT = (t - 0.40) / 0.60;
      const startX = fromX + travel * 0.1;
      let x: number;
      if (burstT < 0.85) x = startX + (toX + overshootX - startX) * easeOutQuad(burstT / 0.85);
      else x = toX + overshootX * (1 - easeOutQuad((burstT - 0.85) / 0.15));
      return { x, y: 50 + offDir * 14 * (1 - burstT) };
    }
    case 'run_qb_sneak': {
      const e = easeOutCubic(t);
      return { x: fromX + travel * e, y: 50 + Math.sin(t * Math.PI * 5) * 1.5 * (1 - t) };
    }
    default: {
      const defOver = travel * 0.08;
      let x: number;
      if (t < 0.85) x = fromX + (travel + defOver) * easeOutQuad(t / 0.85);
      else x = fromX + travel + defOver * (1 - easeOutQuad((t - 0.85) / 0.15));
      return { x, y: 50 + Math.sin(t * Math.PI * 3) * 10 * (1 - t) };
    }
  }
}

function computeFacing(dx: number, dy: number, offDir: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return -offDir * Math.PI / 2;
  return Math.atan2(dy, dx);
}
