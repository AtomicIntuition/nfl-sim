/**
 * Pass play template — handles pass_complete, pass_incomplete, sack.
 * Ball ownership chain: Center → QB (dropback) → Flight → WR/ground.
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import {
  easeOutCubic, easeInOutQuad, easeOutQuad, clamp, lerp,
  interpolateRoute, CONCEPT_ROUTES, getRouteShape,
} from '../ball-trajectory';

const COMPLEMENT_ROUTES = [
  [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.85, dy: -0.15 }, { dx: 1, dy: -0.05 }],
  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],
  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],
  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],
];

function getRouteForConcept(routeConcept?: string): { dx: number; dy: number }[] {
  if (routeConcept && CONCEPT_ROUTES[routeConcept]) return CONCEPT_ROUTES[routeConcept];
  return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.15 }, { dx: 1, dy: 0.3 }];
}

/** Pass play phase boundaries (within development t=0-1) */
const DROP_END = 0.12;
const DROP_END_PA = 0.18;
const HOLD_END = 0.28;
const HOLD_END_PA = 0.38;
const THROW_POINT = 0.30;  // When ball leaves QB's hand
const THROW_POINT_PA = 0.40;
const CATCH_POINT = 0.78;  // When ball arrives at receiver
const RESULT_SETTLE = 0.90; // Tackle animation

export const passPlayTemplate: PlayTemplate = {
  getDevelopmentMs(ctx: PlayContext): number {
    const { play } = ctx;
    if (play.type === 'sack') return 2600;
    if (play.call === 'pass_deep' || play.call === 'play_action_deep') return 3200;
    if (play.call === 'screen_pass') return 2200;
    return 2800;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, toX } = ctx;
    const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
    const isScreen = play.call === 'screen_pass';
    const isSack = play.type === 'sack';
    const isComplete = play.type === 'pass_complete';

    const dropEnd = isPA ? DROP_END_PA : DROP_END;
    const holdEnd = isPA ? HOLD_END_PA : HOLD_END;
    const throwPt = isPA ? THROW_POINT_PA : THROW_POINT;
    const eased = easeOutCubic(t);

    const offense: EntityState[] = snapOff.map((p, i) => {
      const isOL = ['C', 'LG', 'RG', 'LT', 'RT'].includes(p.role);
      const isQB = p.role === 'QB';
      const isRB = p.role === 'RB' || p.role === 'FB';
      const isWR = p.role === 'WR';
      const isTE = p.role === 'TE';

      if (isOL) {
        // OL: push forward, slight lateral shuffle
        const push = offDir * 2.5 * eased;
        const shuffle = Math.sin(t * 3 + i) * 0.5;
        return { ...p, x: clamp(p.x + push, 2, 98), y: p.y + shuffle, animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      if (isQB) {
        if (isSack) {
          // Sack: drop back, then get dragged down
          const dropDist = 4;
          if (t < 0.35) {
            const dt = easeOutCubic(t / 0.35);
            return { ...p, x: clamp(p.x + offDir * dropDist * dt, 2, 98), animState: 'throwing' as AnimState, facing: offDir * Math.PI / 2 };
          }
          const sackT = (t - 0.35) / 0.65;
          const sackEased = easeOutCubic(sackT);
          return {
            ...p,
            x: clamp(lerp(p.x + offDir * dropDist, toX, sackEased), 2, 98),
            y: p.y + Math.sin(sackT * 8) * 1.5,
            animState: 'tackling' as AnimState,
            facing: offDir * Math.PI / 2,
          };
        }
        // Normal pass: dropback then hold
        const dropDist = isPA ? 5 : isScreen ? 2 : 4;
        const dropT = Math.min(t / dropEnd, 1);
        const dt = easeOutCubic(dropT);
        const qbX = clamp(p.x + offDir * dropDist * dt, 2, 98);
        const jitter = t > holdEnd ? Math.sin((t - holdEnd) * 25) * 0.3 : 0;
        const animState: AnimState = t >= throwPt ? 'throwing' : 'idle';
        return { ...p, x: qbX + jitter, animState, facing: -offDir * Math.PI / 2 };
      }

      if (isWR || isTE) {
        // Route running — primary receiver uses actual route concept
        const routeIdx = snapOff.filter((pp, ii) => ii < i && (pp.role === 'WR' || pp.role === 'TE')).length;
        const isPrimary = routeIdx === 0;
        const route = isPrimary ? getRouteForConcept(play.routeConcept) : COMPLEMENT_ROUTES[routeIdx % COMPLEMENT_ROUTES.length];

        // Route progress: receivers run full route from snap to catch point
        const routeProgress = Math.min(t / CATCH_POINT, 1);
        const routePt = interpolateRoute(route, routeProgress);
        const routeScale = isPrimary ? 18 : 12;
        const lateralScale = isPrimary ? 10 : 6;

        let rx = clamp(p.x - offDir * routeScale * routePt.dx, 2, 98);
        let ry = clamp(p.y + routePt.dy * lateralScale, 5, 95);

        // After catch (complete), receiver runs toward toX
        if (isComplete && t > CATCH_POINT && isPrimary) {
          const racT = easeOutCubic((t - CATCH_POINT) / (1 - CATCH_POINT));
          rx = clamp(lerp(rx, toX, racT * 0.5), 2, 98);
          ry = clamp(lerp(ry, 50, racT * 0.3), 5, 95);
        }

        const animState: AnimState = t > CATCH_POINT && isPrimary && isComplete ? 'running' : 'running';
        return { ...p, x: rx, y: ry, animState, facing: -offDir * Math.PI / 2 };
      }

      if (isRB) {
        if (isPA && t < 0.3) {
          // Play action fake — RB runs toward LOS
          const fakeT = easeOutCubic(t / 0.3);
          return { ...p, x: clamp(p.x - offDir * 3 * fakeT, 2, 98), animState: 'running' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        if (isScreen) {
          // Screen: RB drifts out to flat
          const screenT = easeOutCubic(Math.min(t / 0.5, 1));
          return { ...p, x: clamp(p.x - offDir * 2 * screenT, 2, 98), y: clamp(p.y + 12 * screenT, 5, 95), animState: 'running' as AnimState, facing: -offDir * Math.PI / 2 };
        }
        // Pass pro / check release
        return { ...p, x: clamp(p.x + offDir * 1.5 * eased, 2, 98), y: p.y + Math.sin(t * 4) * 2, animState: 'blocking' as AnimState, facing: -offDir * Math.PI / 2 };
      }

      return p;
    });

    // Defense animation
    const defense: EntityState[] = snapDef.map((p, i) => {
      const isDL = ['DE', 'DT', 'NT'].includes(p.role);
      const isLB = ['LB', 'ILB', 'OLB'].includes(p.role);
      const isCB = ['CB', 'NCB'].includes(p.role);
      const isS = p.role === 'S';

      if (isSack) {
        // Sack: DL charges through, everyone converges
        if (isDL) {
          const rushDist = 8;
          return { ...p, x: clamp(p.x + offDir * rushDist * eased, 2, 98), y: p.y + Math.sin(t * 5 + i) * 1.5, animState: 'tackling' as AnimState, facing: offDir * Math.PI / 2 };
        }
        if (isLB) return { ...p, x: clamp(p.x + offDir * 4 * eased, 2, 98), y: p.y + Math.sin(t * 3 + i * 2) * 2, animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
        return { ...p, x: clamp(p.x - offDir * 3 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }

      const isCatchPhase = t >= throwPt && isComplete;

      if (isDL) {
        const rushDist = 5;
        if (isCatchPhase) {
          const preX = p.x + offDir * rushDist * easeOutCubic(throwPt);
          const pursuitT = (t - throwPt) / (1 - throwPt);
          return { ...p, x: clamp(lerp(preX, toX, 0.4 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.3 * pursuitT), 5, 95), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
        }
        return { ...p, x: clamp(p.x + offDir * rushDist * eased, 2, 98), y: p.y + Math.sin(t * 5 + i) * 1.5, animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      if (isLB) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 3 * easeOutCubic(throwPt);
          const pursuitT = (t - throwPt) / (1 - throwPt);
          return { ...p, x: clamp(lerp(preX, toX, 0.5 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.4 * pursuitT), 5, 95), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
        }
        return { ...p, x: clamp(p.x - offDir * 3 * eased, 2, 98), y: p.y + Math.sin(t * 3 + i * 2) * 2, animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      if (isCB) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 5 * easeOutCubic(throwPt);
          const pursuitT = (t - throwPt) / (1 - throwPt);
          return { ...p, x: clamp(lerp(preX, toX, 0.6 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.5 * pursuitT), 5, 95), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
        }
        return { ...p, x: clamp(p.x - offDir * 5 * eased, 2, 98), y: p.y + Math.sin(t * 4 + i) * 3, animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }
      if (isS) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 6 * easeOutCubic(throwPt);
          const pursuitT = (t - throwPt) / (1 - throwPt);
          return { ...p, x: clamp(lerp(preX, toX, 0.55 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.45 * pursuitT), 5, 95), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
        }
        return { ...p, x: clamp(p.x - offDir * 6 * eased, 2, 98), animState: 'running' as AnimState, facing: offDir * Math.PI / 2 };
      }

      return p;
    });

    // ── Ball ownership + position ─────────────────────────────

    // Find QB and primary receiver
    const qbIdx = offense.findIndex(p => p.role === 'QB');
    const receiverIdx = offense.findIndex(p => p.role === 'WR' || p.role === 'TE');

    let ballOwner: BallOwner;
    let ballX: number;
    let ballY: number;
    let ballHeight: number;
    let spinRate = 0;
    let tilt = 0;

    if (isSack) {
      // Ball stays with QB the whole time
      ballOwner = { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 };
      const holder = offense[qbIdx >= 0 ? qbIdx : 0];
      ballX = holder.x;
      ballY = holder.y;
      ballHeight = t < 0.5 ? 2 : lerp(2, 0.8, (t - 0.5) / 0.5);
    } else if (t < throwPt) {
      // QB holds ball
      ballOwner = { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 };
      const holder = offense[qbIdx >= 0 ? qbIdx : 0];
      ballX = holder.x;
      ballY = holder.y;
      ballHeight = 2; // Chest height
    } else if (t < CATCH_POINT) {
      // Ball in flight
      const flightT = (t - throwPt) / (CATCH_POINT - throwPt);
      const smoothT = easeInOutQuad(flightT);
      const qb = offense[qbIdx >= 0 ? qbIdx : 0];
      const receiver = offense[receiverIdx >= 0 ? receiverIdx : 0];

      const fromPt = { x: qb.x, y: qb.y, height: 2 };
      const toPt = { x: receiver.x, y: receiver.y, height: 2 };

      // Ball follows smooth path from QB to receiver
      ballX = lerp(fromPt.x, toPt.x, smoothT);
      ballY = lerp(fromPt.y, toPt.y, smoothT);

      // Arc height based on distance
      const dist = Math.abs(toPt.x - fromPt.x) + Math.abs(toPt.y - fromPt.y) * 0.3;
      const arcHeight = isScreen ? 0.5 : Math.min(dist * 0.3, 10);
      ballHeight = 2 + arcHeight * Math.sin(smoothT * Math.PI);

      ballOwner = { type: 'flight', from: fromPt, to: toPt, progress: smoothT };
      spinRate = 12; // Spiral
      tilt = 0.3;
    } else {
      // After catch point
      if (isComplete && receiverIdx >= 0) {
        // Receiver has ball
        ballOwner = { type: 'held', side: 'offense', index: receiverIdx };
        const holder = offense[receiverIdx];
        ballX = holder.x;
        ballY = holder.y;
        ballHeight = 0.8; // Waist height
      } else {
        // Incomplete — ball on ground
        const qb = offense[qbIdx >= 0 ? qbIdx : 0];
        const dropT = (t - CATCH_POINT) / (1 - CATCH_POINT);
        const targetX = snapOff[receiverIdx >= 0 ? receiverIdx : 0]?.x ?? losX;
        ballX = lerp(targetX, targetX, dropT);
        ballY = 50;
        ballHeight = Math.max(0, 2 * (1 - dropT * 2));
        ballOwner = { type: 'ground', x: ballX, y: ballY };
      }
    }

    // Camera hint
    const camera = t < throwPt
      ? { preset: 'sideline' as const }
      : play.call === 'pass_deep' || play.call === 'play_action_deep'
        ? { preset: 'skyCam' as const }
        : { preset: 'sideline' as const };

    return {
      offense,
      defense,
      ball: { x: ballX, y: ballY, height: ballHeight, spinRate, tilt, owner: ballOwner },
      camera,
    };
  },
};
