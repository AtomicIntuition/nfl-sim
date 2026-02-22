/**
 * Kickoff template — 5-phase choreography with lane coverage,
 * blocking interactions, and varied return paths.
 *
 * Phases (within development t=0-1):
 *   Approach (0.00-0.08): Kicker runs up
 *   Kick     (0.08-0.12): Ball launches
 *   Flight   (0.12-0.45): Ball arcs, coverage sprints in lanes, wedge forms
 *   Catch    (0.45-0.50): Returner catches
 *   Return   (0.50-1.00): Runback with blocking
 */

import type { PlayTemplate, PlayContext, ChoreographyFrame, EntityState, BallOwner, AnimState } from '../types';
import { easeOutCubic, easeInOutQuad, easeOutQuad, clamp, lerp } from '../ball-trajectory';

const APPROACH_END = 0.08;
const KICK_END = 0.12;
const FLIGHT_END = 0.45;
const CATCH_END = 0.50;

export const kickoffTemplate: PlayTemplate = {
  getDevelopmentMs(ctx: PlayContext): number {
    const { play } = ctx;
    if (play.yardsGained === 0) return 2200; // Touchback
    if (play.isTouchdown) return 3800;
    if (play.yardsGained >= 35) return 3200;
    return 3000;
  },

  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
    const { play, offDir, losX, toX } = ctx;
    const isTouchback = play.yardsGained === 0;
    const isTD = play.isTouchdown;
    const kickDir = toX < losX ? -1 : 1;

    // Compute landing spot
    const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
    const meta = play.kickoffMeta;
    const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
    const landingX = losX + (receiverEndZone - losX) * Math.min(catchSpotPct, 0.95);
    const kickDist = Math.abs(landingX - losX);
    const arcHeight = Math.min(kickDist * 0.15, 15);

    // ── Kicking team (offense = kicking) ────────────────────
    const offense: EntityState[] = snapOff.map((p, i) => {
      if (p.role === 'K') {
        // Kicker: approach then follow
        if (t < APPROACH_END) {
          const runT = t / APPROACH_END;
          return {
            ...p,
            x: clamp(p.x - offDir * 3 * easeOutCubic(runT), 2, 98),
            y: clamp(p.y + Math.sin(runT * Math.PI) * 2, 5, 95),
            animState: 'kicking' as AnimState,
            facing: -offDir * Math.PI / 2,
          };
        }
        // After kick, kicker jogs downfield slowly
        const driftT = (t - APPROACH_END) / (1 - APPROACH_END);
        return {
          ...p,
          x: clamp(p.x - offDir * 12 * easeOutCubic(driftT), 2, 98),
          animState: 'running' as AnimState,
          facing: -offDir * Math.PI / 2,
        };
      }

      // Coverage team: lane-based sprint with staggered speeds
      const laneIndex = i - 1; // Skip kicker (index 0)
      const laneSpread = 10; // Lanes spread across field
      const baseLane = p.y; // Start from formation position
      const laneTarget = 50 + (laneIndex - 4.5) * laneSpread; // Converge toward center

      // Stagger: outside lanes go slightly earlier
      const staggerDelay = Math.abs(laneIndex - 4.5) * 0.01;
      const adjustedT = Math.max(0, t - staggerDelay);

      // Sprint speed varies: outside faster, inside more deliberate
      const sprintSpeed = 0.85 + (Math.abs(laneIndex - 4.5) / 5) * 0.15;
      const covEased = easeOutCubic(Math.min(adjustedT * sprintSpeed, 1));

      // During return phase, converge on ball carrier
      let targetX = p.x - offDir * 45 * covEased;
      let targetY = lerp(baseLane, laneTarget, covEased * 0.6);

      if (t > CATCH_END && !isTouchback) {
        const returnT = (t - CATCH_END) / (1 - CATCH_END);
        const carrierX = computeReturnPath(play, landingX, toX, returnT, isTD).x;
        const carrierY = computeReturnPath(play, landingX, toX, returnT, isTD).y;
        // Converge on carrier
        targetX = lerp(targetX, carrierX, returnT * 0.4);
        targetY = lerp(targetY, carrierY, returnT * 0.3);
      }

      return {
        ...p,
        x: clamp(targetX, 2, 98),
        y: clamp(targetY, 5, 95),
        animState: 'running' as AnimState,
        facing: -offDir * Math.PI / 2,
      };
    });

    // ── Receiving team (defense = receiving) ────────────────
    const defense: EntityState[] = snapDef.map((p, i) => {
      if (p.role === 'KR') {
        // Returner
        if (isTouchback) {
          return { ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2 };
        }
        if (t < FLIGHT_END) {
          // Settle under ball during flight
          const settleT = easeOutCubic(t / FLIGHT_END);
          return {
            ...p,
            x: clamp(lerp(p.x, landingX, settleT * 0.3), 2, 98),
            y: clamp(lerp(p.y, 50, settleT * 0.5), 5, 95),
            animState: 'idle' as AnimState,
            facing: offDir * Math.PI / 2,
          };
        }
        if (t < CATCH_END) {
          // Catching
          return { ...p, x: clamp(landingX, 2, 98), y: 50, animState: 'catching' as AnimState, facing: offDir * Math.PI / 2 };
        }
        // Return
        const returnT = (t - CATCH_END) / (1 - CATCH_END);
        const path = computeReturnPath(play, landingX, toX, returnT, isTD);
        return {
          ...p,
          x: clamp(path.x, 2, 98),
          y: clamp(path.y, 5, 95),
          animState: 'returning' as AnimState,
          facing: computeReturnFacing(path.x - p.x, path.y - p.y, offDir),
        };
      }

      if (p.role === 'WDG') {
        // Wedge blockers: form up then lead returner
        if (t < CATCH_END) {
          // Form wedge ahead of catch spot
          const formT = easeOutCubic(Math.min(t / CATCH_END, 1));
          const wedgeX = landingX + offDir * 8;
          return {
            ...p,
            x: clamp(lerp(p.x, wedgeX, formT * 0.5), 2, 98),
            y: clamp(lerp(p.y, 50 + (p.y - 50) * 0.3, formT), 5, 95),
            animState: 'blocking' as AnimState,
            facing: offDir * Math.PI / 2,
          };
        }
        // Lead block during return
        const returnT = (t - CATCH_END) / (1 - CATCH_END);
        const path = computeReturnPath(play, landingX, toX, returnT, isTD);
        return {
          ...p,
          x: clamp(path.x + offDir * 5, 2, 98),
          y: clamp(lerp(p.y, path.y, returnT * 0.6), 5, 95),
          animState: 'blocking' as AnimState,
          facing: offDir * Math.PI / 2,
        };
      }

      // Blockers: set up lanes then engage coverage
      if (p.role === 'BLK') {
        if (t < FLIGHT_END) {
          return { ...p, animState: 'idle' as AnimState, facing: offDir * Math.PI / 2 };
        }
        // Move forward to engage
        const engageT = (t - FLIGHT_END) / (1 - FLIGHT_END);
        const engageEased = easeOutCubic(engageT);
        return {
          ...p,
          x: clamp(p.x + offDir * 15 * engageEased, 2, 98),
          y: clamp(p.y + (50 - p.y) * engageEased * 0.3, 5, 95),
          animState: 'blocking' as AnimState,
          facing: offDir * Math.PI / 2,
        };
      }

      return p;
    });

    // ── Ball ────────────────────────────────────────────────
    let ballX: number;
    let ballY: number;
    let ballHeight: number;
    let ballOwner: BallOwner;
    let spinRate = 0;
    let tilt = 0;

    const kIdx = offense.findIndex(pp => pp.role === 'K');
    const krIdx = defense.findIndex(pp => pp.role === 'KR');

    if (t < KICK_END) {
      // Ball with kicker
      ballOwner = { type: 'held', side: 'offense', index: kIdx >= 0 ? kIdx : 0 };
      const holder = offense[kIdx >= 0 ? kIdx : 0];
      ballX = holder.x;
      ballY = holder.y;
      ballHeight = 0.4;
    } else if (t < FLIGHT_END || isTouchback) {
      // Ball in flight
      const flightStart = KICK_END;
      const flightDuration = isTouchback ? (1 - KICK_END) : (FLIGHT_END - KICK_END);
      const kickT = (t - flightStart) / flightDuration;
      const kickEased = easeInOutQuad(Math.min(kickT, 1));

      const kicker = offense[kIdx >= 0 ? kIdx : 0];
      const targetX = isTouchback ? receiverEndZone : landingX;

      ballX = lerp(kicker.x, targetX, kickEased);
      ballY = 50;
      ballHeight = arcHeight * Math.sin(Math.min(kickT, 1) * Math.PI);
      ballOwner = {
        type: 'kicked',
        progress: kickEased,
        arcHeight,
        from: { x: kicker.x, y: 50 },
        to: { x: targetX, y: 50 },
      };
      spinRate = 8;
      tilt = 0.3;
    } else if (t < CATCH_END) {
      // Catching
      ballOwner = { type: 'held', side: 'defense', index: krIdx >= 0 ? krIdx : 0 };
      const kr = defense[krIdx >= 0 ? krIdx : 0];
      ballX = kr.x;
      ballY = kr.y;
      ballHeight = 1.5;
    } else {
      // Return — ball with returner
      ballOwner = { type: 'held', side: 'defense', index: krIdx >= 0 ? krIdx : 0 };
      const kr = defense[krIdx >= 0 ? krIdx : 0];
      ballX = kr.x;
      ballY = kr.y;
      ballHeight = 0.8;
    }

    // Camera
    const camera = t < FLIGHT_END
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

function computeReturnPath(
  play: { yardsGained: number; isTouchdown?: boolean },
  landingX: number, toX: number, returnT: number, isTD: boolean,
): { x: number; y: number } {
  const eased = easeOutQuad(returnT);

  if (isTD) {
    // Big return with jukes
    if (returnT < 0.6) {
      const jukeT = returnT / 0.6;
      const jukeEased = easeOutQuad(jukeT);
      const x = landingX + (toX - landingX) * 0.5 * jukeEased;
      return { x, y: 50 + Math.sin(jukeT * Math.PI * 5) * 22 * (1 - jukeT * 0.3) };
    }
    const sprintT = (returnT - 0.6) / 0.4;
    const midX = landingX + (toX - landingX) * 0.5;
    return { x: midX + (toX - midX) * easeOutCubic(sprintT), y: 50 + Math.sin(sprintT * Math.PI * 2) * 4 * (1 - sprintT) };
  }

  // Normal return
  const x = landingX + (toX - landingX) * eased;
  const amplitude = 16 * (1 - returnT * 0.6);
  const juke = returnT > 0.35 && returnT < 0.5
    ? Math.sin((returnT - 0.35) * Math.PI / 0.15) * 8 : 0;
  return { x, y: 50 + Math.sin(returnT * Math.PI * 3) * amplitude + juke };
}

function computeReturnFacing(dx: number, dy: number, offDir: number): number {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return offDir * Math.PI / 2;
  return Math.atan2(dy, dx);
}
