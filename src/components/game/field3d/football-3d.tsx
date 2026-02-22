'use client';

import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayResult } from '@/lib/simulation/types';
import type { Phase, PlayContext, ChoreographyFrame } from '@/lib/animation/types';
import { computeFrame, getPhaseTimings, fieldPctToWorld } from '@/lib/animation/choreographer';
import { computeFormationPositions, type DotPos } from '@/lib/animation/play-animation';
import { getIdlePositions } from '@/components/game/field/formation-data';
import type { EntityState } from '@/lib/animation/types';

interface Football3DProps {
  ballPosition: number;
  prevBallPosition: number;
  possession: 'home' | 'away';
  lastPlay: PlayResult | null;
  phase: Phase;
  playKey: number;
}

/**
 * 3D football — position driven by choreographer ball ownership.
 * Ball is ALWAYS at its owner's position when held, or on a flight arc.
 * Spiral rotation on passes/kicks, gentle bob on carries.
 */
export function Football3D({
  ballPosition,
  prevBallPosition,
  possession,
  lastPlay,
  phase,
  playKey,
}: Football3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const animStartRef = useRef(0);
  const prevKeyRef = useRef(playKey);
  const snapOffRef = useRef<EntityState[]>([]);
  const snapDefRef = useRef<EntityState[]>([]);
  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallPosition;

  // Detect new play
  if (playKey !== prevKeyRef.current) {
    prevKeyRef.current = playKey;
    animStartRef.current = performance.now();

    if (lastPlay) {
      const { offPositions, defPositions } = computeFormationPositions(lastPlay, losX, offDir);
      snapOffRef.current = offPositions.map(p => ({
        x: p.x, y: p.y, height: 0, role: p.role,
        facing: -offDir * Math.PI / 2, animState: 'idle' as const,
      }));
      snapDefRef.current = defPositions.map(p => ({
        x: p.x, y: p.y, height: 0, role: p.role,
        facing: offDir * Math.PI / 2, animState: 'idle' as const,
      }));
    }
  }

  // Football materials
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8B4513', roughness: 0.7, metalness: 0.1,
  }), []);
  const laceMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.5, metalness: 0,
  }), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const group = meshRef.current;

    if (phase === 'idle') {
      const worldX = (ballPosition / 100) * 120 - 60;
      group.position.set(worldX, 0.4, 0);
      group.rotation.set(0, 0, 0);
      group.visible = false;
      return;
    }

    if (!lastPlay) return;

    const ctx: PlayContext = {
      play: lastPlay,
      losX,
      toX: ballPosition,
      offDir,
      possession,
    };

    const elapsed = performance.now() - animStartRef.current;
    const timings = getPhaseTimings(lastPlay);

    // Calculate phase progress
    const phases = ['huddle', 'break', 'set', 'motion', 'snap', 'development', 'result', 'whistle', 'reset'] as const;
    let phaseProgress = 0;
    let phaseStart = 0;
    for (const p of phases) {
      const dur = timings[p];
      if (dur === 0) continue;
      if (p === phase) {
        phaseProgress = Math.min((elapsed - phaseStart) / dur, 1);
        break;
      }
      phaseStart += dur;
    }

    // Get choreography frame
    const frame = computeFrame(
      phase,
      Math.max(0, Math.min(1, phaseProgress)),
      ctx,
      snapOffRef.current.length > 0 ? snapOffRef.current : getIdleDefaults(losX, offDir, 'offense'),
      snapDefRef.current.length > 0 ? snapDefRef.current : getIdleDefaults(losX, offDir, 'defense'),
    );

    // Position ball from choreographer
    const ballWorld = fieldPctToWorld(frame.ball.x, frame.ball.y);
    group.position.x = ballWorld.x;
    group.position.y = Math.max(0.2, frame.ball.height);
    group.position.z = ballWorld.z;

    // Rotation based on ball state
    if (frame.ball.spinRate > 0) {
      // Spiral rotation for passes and kicks
      group.rotation.z += frame.ball.spinRate * 0.02;
      group.rotation.x = frame.ball.tilt;
    } else if (frame.ball.owner.type === 'held') {
      // Held: gentle bob for running, minimal for standing
      group.rotation.z = Math.sin(elapsed * 0.01) * 0.05;
      group.rotation.x = 0;
    } else if (frame.ball.owner.type === 'ground') {
      // On ground: dampen rotation
      group.rotation.z *= 0.95;
      group.rotation.x *= 0.95;
    }

    group.visible = true;
  });

  return (
    <group ref={meshRef}>
      {/* Elongated football body */}
      <mesh material={material} scale={[0.55, 0.35, 0.35]}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      {/* Lace stripe */}
      <mesh material={laceMaterial} position={[0, 0.33, 0]} scale={[0.35, 0.02, 0.02]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* Lace cross-stitches */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} material={laceMaterial}
          position={[-0.12 + i * 0.08, 0.34, 0]}
          scale={[0.01, 0.06, 0.01]}
        >
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function getIdleDefaults(losX: number, offDir: number, side: 'offense' | 'defense'): EntityState[] {
  const idle = getIdlePositions(losX, offDir, side);
  return idle.map(p => ({
    x: p.x, y: p.y, height: 0, role: p.role,
    facing: side === 'offense' ? -offDir * Math.PI / 2 : offDir * Math.PI / 2,
    animState: 'idle' as const,
  }));
}
