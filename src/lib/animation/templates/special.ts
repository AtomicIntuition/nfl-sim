/**
 * Special play templates — kneel, spike, touchback, interception, fumble.
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import { easeOutCubic, clamp, lerp } from '../ball-trajectory';

/** Kneel / spike — minimal animation */
export const specialTemplate: PlayTemplate = {
  getDevelopmentMs(ctx: PlayContext): number {
    if (ctx.play.type === 'touchback') return 1200;
    return 1600;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir } = ctx;
    const eased = easeOutCubic(t);

    // Offense: minimal movement
    const offense: EntityState[] = snapOff.map((p, i) => {
      if (p.role === 'QB') {
        if (play.type === 'kneel' || play.call === 'kneel') {
          // QB kneels — drop height slightly forward
          return { ...p, x: clamp(p.x + offDir * 0.5 * eased, 2, 98), animState: 'idle' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        if (play.type === 'spike' || play.call === 'spike') {
          return { ...p, x: clamp(p.x + offDir * 0.3 * eased, 2, 98), animState: 'throwing' as AnimState, facing: -offDir * Math.PI / 2 };
        }
      }
      return { ...p, animState: 'idle' as AnimState, facing: -offDir * Math.PI / 2 };
    });

    // Defense: mostly idle
    const defense: EntityState[] = snapDef.map(p => ({
      ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2,
    }));

    const qbIdx = offense.findIndex(p => p.role === 'QB');
    const ballOwner: BallOwner = { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 };
    const holder = offense[qbIdx >= 0 ? qbIdx : 0];

    return {
      offense,
      defense,
      ball: { x: holder.x, y: holder.y, height: play.type === 'kneel' ? 0.3 : 2, spinRate: 0, tilt: 0, owner: ballOwner },
      camera: { preset: 'sideline' },
    };
  },
};

/** Turnover (interception/fumble) — ball changes possession during play */
export const turnoverTemplate: PlayTemplate = {
  getDevelopmentMs(): number {
    return 3000;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, toX } = ctx;
    const isFumble = play.turnover?.type === 'fumble';
    const eased = easeOutCubic(t);
    const turnoverPoint = isFumble ? 0.45 : 0.35; // When possession changes

    // Before turnover: normal play development
    const offense: EntityState[] = snapOff.map((p, i) => {
      const isOL = ['C', 'LG', 'RG', 'LT', 'RT'].includes(p.role);
      const isQB = p.role === 'QB';

      if (isOL) {
        return { ...p, x: clamp(p.x + offDir * 2.5 * eased, 2, 98), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }
      if (isQB) {
        if (t < turnoverPoint) {
          const dropT = easeOutCubic(t / turnoverPoint);
          return { ...p, x: clamp(p.x + offDir * 4 * dropT, 2, 98), animState: 'throwing' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        // After turnover, QB chases
        const chaseT = (t - turnoverPoint) / (1 - turnoverPoint);
        return { ...p, x: clamp(lerp(p.x + offDir * 4, toX, chaseT * 0.3), 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      return { ...p, animState: t > turnoverPoint ? 'running' : 'running' as AnimState, facing: -offDir * Math.PI / 2 };
    });

    const defense: EntityState[] = snapDef.map((p, i) => {
      const isDL = ['DE', 'DT', 'NT'].includes(p.role);

      if (t > turnoverPoint) {
        // After turnover — defense has ball, starts returning
        const returnT = (t - turnoverPoint) / (1 - turnoverPoint);
        const returnEased = easeOutCubic(returnT);

        // The first DB becomes the interceptor/recoverer
        if (i === snapDef.findIndex(pp => ['CB', 'S', 'NCB'].includes(pp.role))) {
          return {
            ...p,
            x: clamp(lerp(p.x, toX, returnEased * 0.7), 2, 98),
            y: clamp(50 + Math.sin(returnT * Math.PI * 3) * 12 * (1 - returnT * 0.5), 5, 95),
            animState: 'returning' as AnimState,
            facing: -offDir * Math.PI / 2,
          };
        }
        // Others block
        return { ...p, x: clamp(p.x - offDir * 5 * returnEased, 2, 98), animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      // Pre-turnover: normal defensive movement
      if (isDL) {
        return { ...p, x: clamp(p.x + offDir * 5 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      return { ...p, x: clamp(p.x - offDir * 4 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
    });

    // Ball
    let ballOwner: BallOwner;
    let ballX: number, ballY: number, ballHeight: number;
    let spinRate = 0, tilt = 0;

    const qbIdx = offense.findIndex(pp => pp.role === 'QB');
    const interceptorIdx = defense.findIndex(pp => ['CB', 'S', 'NCB'].includes(pp.role));

    if (t < turnoverPoint) {
      if (isFumble) {
        // Ball with carrier until fumble
        ballOwner = { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 };
        const holder = offense[qbIdx >= 0 ? qbIdx : 0];
        ballX = holder.x; ballY = holder.y; ballHeight = 0.8;
      } else {
        // Interception — ball in flight
        const flightT = t / turnoverPoint;
        const qb = offense[qbIdx >= 0 ? qbIdx : 0];
        const target = defense[interceptorIdx >= 0 ? interceptorIdx : 0];
        ballX = lerp(qb.x, target.x, flightT);
        ballY = lerp(qb.y, target.y, flightT);
        ballHeight = 2 + 6 * Math.sin(flightT * Math.PI);
        ballOwner = { type: 'flight', from: { x: qb.x, y: qb.y, height: 2 }, to: { x: target.x, y: target.y, height: 2 }, progress: flightT };
        spinRate = 10; tilt = 0.3;
      }
    } else {
      if (isFumble) {
        // Brief loose ball then recovery
        const looseT = (t - turnoverPoint) / (1 - turnoverPoint);
        if (looseT < 0.2) {
          // Ball bouncing
          const qb = offense[qbIdx >= 0 ? qbIdx : 0];
          ballX = qb.x + Math.sin(looseT * 30) * 2;
          ballY = qb.y + Math.cos(looseT * 20) * 2;
          ballHeight = Math.abs(Math.sin(looseT * 15)) * 1.5;
          ballOwner = { type: 'ground', x: ballX, y: ballY };
          spinRate = 15;
        } else {
          // Recovered by defense
          ballOwner = { type: 'held', side: 'defense', index: interceptorIdx >= 0 ? interceptorIdx : 0 };
          const holder = defense[interceptorIdx >= 0 ? interceptorIdx : 0];
          ballX = holder.x; ballY = holder.y; ballHeight = 0.8;
        }
      } else {
        // Interception caught
        ballOwner = { type: 'held', side: 'defense', index: interceptorIdx >= 0 ? interceptorIdx : 0 };
        const holder = defense[interceptorIdx >= 0 ? interceptorIdx : 0];
        ballX = holder.x; ballY = holder.y; ballHeight = 0.8;
      }
    }

    return {
      offense,
      defense,
      ball: { x: ballX, y: ballY, height: ballHeight, spinRate, tilt, owner: ballOwner },
      camera: isFumble && t > turnoverPoint - 0.05 && t < turnoverPoint + 0.1
        ? { preset: 'closeUp', shake: 0.5 }
        : { preset: 'sideline' },
    };
  },
};
