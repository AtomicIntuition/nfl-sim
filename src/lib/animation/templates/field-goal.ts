/**
 * Field goal / extra point template.
 * Ball: Holder → Kick → Arc over goal posts.
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import { easeInOutQuad, clamp, lerp } from '../ball-trajectory';

const SNAP_PHASE = 0.08;
const HOLD_PHASE = 0.15;
const KICK_LAUNCH = 0.20;

export const fieldGoalTemplate: PlayTemplate = {
  getDevelopmentMs(): number {
    return 2200;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, possession } = ctx;
    const goalPostX = possession === 'away' ? 91.66 : 8.33;
    const arcHeight = play.type === 'extra_point' ? 8 : 12;

    // ── FG team (offense) ───────────────────────────────────
    const offense: EntityState[] = snapOff.map((p, i) => {
      if (p.role === 'K') {
        if (t < KICK_LAUNCH) {
          // Approach
          const kickT = t / KICK_LAUNCH;
          return { ...p, y: clamp(p.y + Math.sin(kickT * Math.PI) * 1.5, 5, 95), animState: 'kicking' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        return { ...p, animState: 'idle' as AnimState, facing: -offDir * Math.PI / 2 };
      }
      if (p.role === 'H') {
        return { ...p, animState: 'idle' as AnimState, facing: -offDir * Math.PI / 2 };
      }
      // Blockers: slight jitter
      return { ...p, x: clamp(p.x + Math.sin(t * 6 + i) * 0.4, 2, 98), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
    });

    // ── Block team (defense) ────────────────────────────────
    const defense: EntityState[] = snapDef.map((p, i) => {
      const isDL = p.role === 'RSH';
      if (isDL) {
        return { ...p, x: clamp(p.x + offDir * 4 * easeInOutQuad(Math.min(t * 2, 1)), 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      return { ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2 };
    });

    // ── Ball ────────────────────────────────────────────────
    let ballX: number, ballY: number, ballHeight: number;
    let ballOwner: BallOwner;
    let spinRate = 0, tilt = 0;

    const kIdx = offense.findIndex(pp => pp.role === 'K');
    const hIdx = offense.findIndex(pp => pp.role === 'H');

    if (t < HOLD_PHASE) {
      // Holder has ball
      ballOwner = { type: 'held', side: 'offense', index: hIdx >= 0 ? hIdx : 0 };
      const holder = offense[hIdx >= 0 ? hIdx : 0];
      ballX = holder.x; ballY = holder.y; ballHeight = 0.3;
    } else {
      // Ball in flight toward goal posts
      const flightT = (t - HOLD_PHASE) / (1 - HOLD_PHASE);
      const flightEased = easeInOutQuad(flightT);

      const holderPos = offense[hIdx >= 0 ? hIdx : 0];
      ballX = lerp(holderPos.x, goalPostX, flightEased);
      ballY = 50;
      ballHeight = arcHeight * Math.sin(flightT * Math.PI);
      ballOwner = { type: 'kicked', progress: flightEased, arcHeight, from: { x: holderPos.x, y: 50 }, to: { x: goalPostX, y: 50 } };
      spinRate = 6; tilt = 0.3;
    }

    return {
      offense,
      defense,
      ball: { x: ballX, y: ballY, height: ballHeight, spinRate, tilt, owner: ballOwner },
      camera: t < KICK_LAUNCH ? { preset: 'endzoneHigh' } : { preset: 'endzoneHigh' },
    };
  },
};
