/**
 * Punt template — punt flight + return/fair catch/touchback.
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import { easeOutCubic, easeInOutQuad, easeOutQuad, clamp, lerp } from '../ball-trajectory';

const SNAP_PHASE = 0.08;
const KICK_PHASE = 0.15;
const FLIGHT_END = 0.50;
const CATCH_END = 0.55;

export const puntTemplate: PlayTemplate = {
  getDevelopmentMs(ctx: PlayContext): number {
    const { play } = ctx;
    const desc = (play.description || '').toLowerCase();
    if (desc.includes('fair catch') || play.yardsGained === 0) return 2400;
    if (play.isTouchdown) return 3200;
    return 2800;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, toX } = ctx;
    const desc = (play.description || '').toLowerCase();
    const isFairCatch = desc.includes('fair catch');
    const isTouchback = play.yardsGained === 0 || desc.includes('touchback');
    const eased = easeOutCubic(t);

    const puntDir = toX < losX ? -1 : 1;
    const targetX = isTouchback ? (puntDir < 0 ? 8.33 : 91.66) : toX;
    const dist = Math.abs(targetX - losX);
    const arcHeight = Math.min(dist * 0.12, 12);

    // ── Punting team (offense) ──────────────────────────────
    const offense: EntityState[] = snapOff.map((p, i) => {
      if (p.role === 'P') {
        const kickT = Math.min(t / KICK_PHASE, 1);
        return {
          ...p,
          x: clamp(p.x - offDir * 3 * kickT, 2, 98),
          animState: t < KICK_PHASE ? 'kicking' as AnimState : 'idle' as AnimState,
          facing: -offDir * Math.PI / 2,
        };
      }
      if (p.role === 'GUN') {
        // Gunners sprint downfield
        return {
          ...p,
          x: clamp(p.x - offDir * 40 * eased, 2, 98),
          y: clamp(p.y + (p.y > 50 ? -6 : 6) * eased, 5, 95),
          animState: 'running' as AnimState,
          facing: -offDir * Math.PI / 2,
        };
      }
      // Protection then release
      const releaseT = Math.max(0, t - 0.3) / 0.7;
      return {
        ...p,
        x: clamp(p.x - offDir * 12 * easeOutCubic(releaseT), 2, 98),
        animState: t < 0.3 ? 'blocking' as AnimState : 'running' as AnimState,
        facing: -offDir * Math.PI / 2,
      };
    });

    // ── Return team (defense) ───────────────────────────────
    const defense: EntityState[] = snapDef.map((p, i) => {
      if (p.role === 'PR') {
        if (isTouchback || isFairCatch) {
          if (t < FLIGHT_END) return { ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2 };
          return { ...p, x: clamp(targetX, 2, 98), y: 50, animState: 'catching' as AnimState, facing: offDir * Math.PI / 2 };
        }
        if (t < FLIGHT_END) return { ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2 };
        if (t < CATCH_END) return { ...p, x: clamp(targetX, 2, 98), y: 50, animState: 'catching' as AnimState, facing: offDir * Math.PI / 2 };
        // Return
        const returnT = (t - CATCH_END) / (1 - CATCH_END);
        const returnEased = easeOutCubic(returnT);
        return {
          ...p,
          x: clamp(lerp(targetX, toX, returnEased), 2, 98),
          y: clamp(50 + Math.sin(returnT * Math.PI * 2) * 10, 5, 95),
          animState: 'returning' as AnimState,
          facing: offDir * Math.PI / 2,
        };
      }
      if (p.role === 'JAM') {
        return { ...p, x: clamp(p.x + offDir * 4 * eased, 2, 98), animState: 'blocking' as AnimState, facing: offDir * Math.PI / 2 };
      }
      if (p.role === 'RSH') {
        return { ...p, x: clamp(p.x + offDir * 8 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      // Blockers
      return { ...p, x: clamp(p.x + offDir * 10 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
    });

    // ── Ball ────────────────────────────────────────────────
    let ballX: number, ballY: number, ballHeight: number;
    let ballOwner: BallOwner;
    let spinRate = 0, tilt = 0;

    const pIdx = offense.findIndex(pp => pp.role === 'P');
    const prIdx = defense.findIndex(pp => pp.role === 'PR');

    if (t < KICK_PHASE) {
      // Ball with punter
      ballOwner = { type: 'held', side: 'offense', index: pIdx >= 0 ? pIdx : 0 };
      const holder = offense[pIdx >= 0 ? pIdx : 0];
      ballX = holder.x; ballY = holder.y; ballHeight = 1.5;
    } else if (t < FLIGHT_END || isTouchback || isFairCatch) {
      // Ball in flight
      const flightStart = KICK_PHASE;
      const flightDur = (isTouchback || isFairCatch) ? (1 - KICK_PHASE) : (FLIGHT_END - KICK_PHASE);
      const kickT = Math.min((t - flightStart) / flightDur, 1);
      const kickEased = easeInOutQuad(kickT);

      const punter = offense[pIdx >= 0 ? pIdx : 0];
      ballX = lerp(punter.x, targetX, kickEased);
      ballY = 50;
      ballHeight = arcHeight * Math.sin(kickT * Math.PI);
      ballOwner = { type: 'kicked', progress: kickEased, arcHeight, from: { x: punter.x, y: 50 }, to: { x: targetX, y: 50 } };
      spinRate = 6; tilt = 0.3;
    } else if (t < CATCH_END) {
      ballOwner = { type: 'held', side: 'defense', index: prIdx >= 0 ? prIdx : 0 };
      const pr = defense[prIdx >= 0 ? prIdx : 0];
      ballX = pr.x; ballY = pr.y; ballHeight = 1.5;
    } else {
      ballOwner = { type: 'held', side: 'defense', index: prIdx >= 0 ? prIdx : 0 };
      const pr = defense[prIdx >= 0 ? prIdx : 0];
      ballX = pr.x; ballY = pr.y; ballHeight = 0.8;
    }

    return {
      offense,
      defense,
      ball: { x: ballX, y: ballY, height: ballHeight, spinRate, tilt, owner: ballOwner },
      camera: t < FLIGHT_END ? { preset: 'skyCam' } : { preset: 'sideline' },
    };
  },
};
