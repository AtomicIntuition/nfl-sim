/**
 * Animation system types — central type definitions for the choreographer-driven
 * play animation system. All 22 players + ball computed in dependency order.
 */

import type { PlayResult } from '@/lib/simulation/types';

// ── Entity State ──────────────────────────────────────────────

/** Position and visual state for a single entity (player or ball) */
export interface EntityState {
  /** Field percentage X (0-100, own endzone to opponent endzone) */
  x: number;
  /** Field percentage Y (0-100, sideline to sideline, 50 = center) */
  y: number;
  /** Height in world units (0 = ground). Used for ball flight arcs. */
  height: number;
  /** Player role identifier */
  role: string;
  /** Facing direction in radians (0 = toward opponent endzone) */
  facing: number;
  /** Animation state for visual rendering */
  animState: AnimState;
}

export type AnimState =
  | 'idle'
  | 'running'
  | 'blocking'
  | 'throwing'
  | 'catching'
  | 'tackling'
  | 'juking'
  | 'celebrating'
  | 'kicking'
  | 'returning';

// ── Ball Ownership ────────────────────────────────────────────

export type BallOwner =
  | { type: 'held'; side: 'offense' | 'defense'; index: number }
  | { type: 'flight'; from: { x: number; y: number; height: number }; to: { x: number; y: number; height: number }; progress: number }
  | { type: 'ground'; x: number; y: number }
  | { type: 'kicked'; progress: number; arcHeight: number; from: { x: number; y: number }; to: { x: number; y: number } };

// ── Camera Hints ──────────────────────────────────────────────

export type CameraPreset = 'sideline' | 'skyCam' | 'endzoneHigh' | 'allTwenty' | 'closeUp';

export interface CameraHint {
  preset: CameraPreset;
  /** Optional focus point override (field percentage) */
  focusX?: number;
  focusY?: number;
  /** Camera shake intensity (0-1) */
  shake?: number;
}

// ── Choreography Frame ────────────────────────────────────────

/** Complete frame output from the choreographer */
export interface ChoreographyFrame {
  offense: EntityState[];
  defense: EntityState[];
  ball: {
    x: number;
    y: number;
    height: number;
    /** Ball spin rate for visual rotation */
    spinRate: number;
    /** Ball tilt angle */
    tilt: number;
    owner: BallOwner;
  };
  camera: CameraHint;
}

// ── Phase System ──────────────────────────────────────────────

export type Phase =
  | 'huddle'
  | 'break'
  | 'set'
  | 'motion'
  | 'snap'
  | 'development'
  | 'result'
  | 'whistle'
  | 'reset'
  | 'idle';

export interface PhaseTiming {
  huddle: number;
  break: number;
  set: number;
  motion: number;
  snap: number;
  development: number;
  result: number;
  whistle: number;
  reset: number;
}

// ── Play Context ──────────────────────────────────────────────

/** All data the choreographer needs to animate a play */
export interface PlayContext {
  play: PlayResult;
  /** LOS in field percentage (absolute, 0-100) */
  losX: number;
  /** Ball destination in field percentage (absolute, 0-100) */
  toX: number;
  /** Offense direction: 1 = going right, -1 = going left */
  offDir: number;
  /** Offense team side */
  possession: 'home' | 'away';
}

// ── Template Interface ────────────────────────────────────────

/** A play template computes all entity positions for a given normalized time */
export interface PlayTemplate {
  /** Compute positions for all entities at normalized time t (0-1) within the development phase */
  computeDevelopment(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame;
  /** Get the development phase duration in ms */
  getDevelopmentMs(ctx: PlayContext): number;
}
