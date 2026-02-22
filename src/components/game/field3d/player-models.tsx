'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import type { PlayResult } from '@/lib/simulation/types';
import type { Phase, PlayContext, EntityState, ChoreographyFrame } from '@/lib/animation/types';
import {
  computeFrame,
  getPhaseTimings,
  getPhaseAtTime,
} from '@/lib/animation/choreographer';
import { computeFormationPositions, fieldPctToWorld, type DotPos } from '@/lib/animation/play-animation';
import { getIdlePositions } from '@/components/game/field/formation-data';
import { easeOutCubic } from '@/lib/animation/ball-trajectory';

interface PlayerModelsProps {
  ballPosition: number;      // field percentage
  prevBallPosition: number;  // previous field percentage
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  phase: Phase;
}

// Role-based sizing
function getCapsuleRadius(role: string): number {
  const linemen = ['C', 'LG', 'RG', 'LT', 'RT', 'DE', 'DT', 'NT'];
  const skill = ['WR', 'CB', 'NCB', 'S'];
  if (linemen.includes(role)) return 0.5;
  if (skill.includes(role)) return 0.35;
  return 0.4;
}

function isSkillPosition(role: string): boolean {
  return ['QB', 'RB', 'FB', 'WR', 'TE', 'K', 'P', 'KR', 'PR'].includes(role);
}

/**
 * 22 capsule-geometry players with helmets, jersey numbers, facing direction,
 * and animation states. Positions driven by the choreographer system.
 * No lerp — positions set directly from choreographer output.
 */
export function PlayerModels({
  ballPosition,
  prevBallPosition,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  phase,
}: PlayerModelsProps) {
  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallPosition;

  // Refs for 22 player groups (mesh + helmet)
  const offGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const defGroupRefs = useRef<(THREE.Group | null)[]>([]);

  // Trail refs for ball carrier
  const trailRef = useRef<THREE.Points | null>(null);
  const trailPositions = useRef(new Float32Array(30 * 3)); // 30 trail points
  const trailIdx = useRef(0);

  // Animation state
  const animStartRef = useRef(0);
  const prevKeyRef = useRef(playKey);
  const snapOffRef = useRef<EntityState[]>([]);
  const snapDefRef = useRef<EntityState[]>([]);
  const frameRef = useRef<ChoreographyFrame | null>(null);

  // Shared materials
  const offMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: offenseColor, roughness: 0.6, metalness: 0.1,
  }), [offenseColor]);
  const defMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: defenseColor, roughness: 0.6, metalness: 0.1,
  }), [defenseColor]);
  const helmetOffMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: offenseColor, roughness: 0.3, metalness: 0.4,
  }), [offenseColor]);
  const helmetDefMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: defenseColor, roughness: 0.3, metalness: 0.4,
  }), [defenseColor]);
  const trailMaterial = useMemo(() => new THREE.PointsMaterial({
    color: '#FFD700', size: 0.3, transparent: true, opacity: 0.4, depthWrite: false,
  }), []);

  // Shared geometries
  const geoLarge = useMemo(() => new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), []);
  const geoMedium = useMemo(() => new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), []);
  const geoSmall = useMemo(() => new THREE.CapsuleGeometry(0.35, 1.2, 4, 8), []);
  const helmetGeo = useMemo(() => new THREE.SphereGeometry(0.32, 8, 6), []);

  function getGeo(role: string): THREE.CapsuleGeometry {
    const r = getCapsuleRadius(role);
    if (r >= 0.5) return geoLarge;
    if (r <= 0.35) return geoSmall;
    return geoMedium;
  }

  // Build play context
  const getPlayContext = useCallback((): PlayContext | null => {
    if (!lastPlay) return null;
    return {
      play: lastPlay,
      losX,
      toX: ballPosition,
      offDir,
      possession,
    };
  }, [lastPlay, losX, ballPosition, offDir, possession]);

  // On new play → compute snap positions
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;
    animStartRef.current = performance.now();

    const { offPositions, defPositions } = computeFormationPositions(lastPlay, losX, offDir);
    snapOffRef.current = offPositions.map(p => ({
      x: p.x, y: p.y, height: 0, role: p.role,
      facing: -offDir * Math.PI / 2, animState: 'idle' as const,
    }));
    snapDefRef.current = defPositions.map(p => ({
      x: p.x, y: p.y, height: 0, role: p.role,
      facing: offDir * Math.PI / 2, animState: 'idle' as const,
    }));

    // Reset trail
    trailPositions.current.fill(0);
    trailIdx.current = 0;
  }, [playKey, lastPlay, losX, offDir]);

  // Compute frame every render
  useFrame((_state, delta) => {
    const ctx = getPlayContext();
    if (!ctx) return;

    // Build current phase progress based on elapsed time
    const elapsed = performance.now() - animStartRef.current;
    const timings = getPhaseTimings(lastPlay);
    const { phase: computedPhase, progress } = getPhaseAtTime(elapsed, timings);

    // Use the React phase state (driven by timeouts) but compute progress from elapsed time
    const activePhase = phase === 'idle' ? 'idle' : phase;
    let phaseProgress = 0;

    if (activePhase !== 'idle') {
      // Calculate progress within current phase from elapsed time
      const phases = ['huddle', 'break', 'set', 'motion', 'snap', 'development', 'result', 'whistle', 'reset'] as const;
      let phaseStart = 0;
      for (const p of phases) {
        const dur = timings[p];
        if (dur === 0) continue;
        if (p === activePhase) {
          phaseProgress = Math.min((elapsed - phaseStart) / dur, 1);
          break;
        }
        phaseStart += dur;
      }
    }

    // Compute choreography frame
    const frame = computeFrame(
      activePhase,
      Math.max(0, Math.min(1, phaseProgress)),
      ctx,
      snapOffRef.current.length > 0 ? snapOffRef.current : getIdleDefaults(losX, offDir, 'offense'),
      snapDefRef.current.length > 0 ? snapDefRef.current : getIdleDefaults(losX, offDir, 'defense'),
    );
    frameRef.current = frame;

    // Apply positions directly to meshes (NO lerp!)
    frame.offense.forEach((entity, i) => {
      const group = offGroupRefs.current[i];
      if (!group) return;
      const world = fieldPctToWorld(entity.x, entity.y);
      group.position.x = world.x;
      group.position.z = world.z;

      // Height: running bob, blocking lean
      const bob = entity.animState === 'running' ? Math.sin(elapsed * 0.008 + i) * 0.08 : 0;
      group.position.y = 0.9 + bob;

      // Facing direction
      group.rotation.y = entity.facing;

      // Animation state visual: forward lean for blocking
      if (entity.animState === 'blocking') {
        group.rotation.x = 0.15;
      } else if (entity.animState === 'throwing') {
        group.rotation.x = -0.1;
      } else {
        group.rotation.x = 0;
      }
    });

    frame.defense.forEach((entity, i) => {
      const group = defGroupRefs.current[i];
      if (!group) return;
      const world = fieldPctToWorld(entity.x, entity.y);
      group.position.x = world.x;
      group.position.z = world.z;

      const bob = entity.animState === 'running' ? Math.sin(elapsed * 0.008 + i + 11) * 0.08 : 0;
      group.position.y = 0.9 + bob;
      group.rotation.y = entity.facing;
      group.rotation.x = entity.animState === 'tackling' ? 0.2 : 0;
    });

    // Ball carrier trail
    if (frame.ball.owner.type === 'held' && trailRef.current) {
      const ballWorld = fieldPctToWorld(frame.ball.x, frame.ball.y);
      const idx = (trailIdx.current % 30) * 3;
      trailPositions.current[idx] = ballWorld.x;
      trailPositions.current[idx + 1] = 0.1;
      trailPositions.current[idx + 2] = ballWorld.z;
      trailIdx.current++;

      const geo = trailRef.current.geometry;
      const posAttr = geo.getAttribute('position');
      if (posAttr) {
        (posAttr as THREE.BufferAttribute).set(trailPositions.current);
        posAttr.needsUpdate = true;
      }
    }
  });

  // Determine roles for geometry selection
  const offRoles = snapOffRef.current.length > 0
    ? snapOffRef.current.map(p => p.role)
    : Array(11).fill('OFF');
  const defRoles = snapDefRef.current.length > 0
    ? snapDefRef.current.map(p => p.role)
    : Array(11).fill('DEF');

  return (
    <>
      {/* Offense (11 players) */}
      {Array.from({ length: 11 }, (_, i) => (
        <group
          key={`off-${i}`}
          ref={(el) => { offGroupRefs.current[i] = el; }}
          position={[0, 0.9, i * 2 - 10]}
        >
          {/* Body capsule */}
          <mesh geometry={getGeo(offRoles[i])} material={offMaterial} />
          {/* Helmet */}
          <mesh
            geometry={helmetGeo}
            material={helmetOffMaterial}
            position={[0, 0.9, 0]}
          />
          {/* Jersey number (skill positions only) */}
          {isSkillPosition(offRoles[i]) && (
            <Text
              position={[0, 0.15, 0.42]}
              fontSize={0.3}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="black"
            >
              {getJerseyNumber(offRoles[i], i)}
            </Text>
          )}
        </group>
      ))}

      {/* Defense (11 players) */}
      {Array.from({ length: 11 }, (_, i) => (
        <group
          key={`def-${i}`}
          ref={(el) => { defGroupRefs.current[i] = el; }}
          position={[5, 0.9, i * 2 - 10]}
        >
          <mesh geometry={getGeo(defRoles[i])} material={defMaterial} />
          <mesh
            geometry={helmetGeo}
            material={helmetDefMaterial}
            position={[0, 0.9, 0]}
          />
        </group>
      ))}

      {/* Ball carrier trail */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[trailPositions.current, 3]}
          />
        </bufferGeometry>
        <pointsMaterial color="#FFD700" size={0.3} transparent opacity={0.4} depthWrite={false} />
      </points>
    </>
  );
}

/** Get jersey number for display */
function getJerseyNumber(role: string, index: number): string {
  switch (role) {
    case 'QB': return '12';
    case 'RB': case 'FB': return String(20 + index);
    case 'WR': return String(80 + index);
    case 'TE': return '87';
    case 'K': case 'P': return '4';
    case 'KR': case 'PR': return '16';
    default: return '';
  }
}

/** Default idle positions when no snap data available */
function getIdleDefaults(losX: number, offDir: number, side: 'offense' | 'defense'): EntityState[] {
  const idle = getIdlePositions(losX, offDir, side);
  return idle.map(p => ({
    x: p.x, y: p.y, height: 0, role: p.role,
    facing: side === 'offense' ? -offDir * Math.PI / 2 : offDir * Math.PI / 2,
    animState: 'idle' as const,
  }));
}
