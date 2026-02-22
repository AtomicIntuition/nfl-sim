'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phase } from '@/lib/animation/types';
import type { PlayResult } from '@/lib/simulation/types';

interface BroadcastCameraProps {
  /** Ball X position in world coordinates (-60 to +60) */
  ballX: number;
  /** Direction offense is going: 1 = right, -1 = left */
  offenseDirection: number;
  /** Whether a kickoff/punt is in progress (wider FOV) */
  isWidePlay?: boolean;
  /** Current animation phase */
  phase: Phase;
  /** Current play for context-aware camera */
  lastPlay: PlayResult | null;
}

/**
 * Broadcast camera with preset-based system.
 * Presets: sideline, skyCam, endzoneHigh, allTwenty, closeUp.
 * Phase-driven selection with smooth 600ms transitions.
 * Camera shake on big hits.
 */
export function BroadcastCamera({
  ballX,
  offenseDirection,
  isWidePlay,
  phase,
  lastPlay,
}: BroadcastCameraProps) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const currentLook = useRef(new THREE.Vector3(0, 0, 0));
  const shakeRef = useRef(0);
  const shakeDecay = useRef(0);

  useFrame((_state, delta) => {
    const cam = camera as THREE.PerspectiveCamera;

    // Determine camera preset based on phase and play type
    const preset = getCameraPreset(phase, lastPlay, isWidePlay);
    const { position, lookAt, fov } = getPresetConfig(preset, ballX, offenseDirection);

    targetPos.current.copy(position);
    targetLook.current.copy(lookAt);

    // Smooth transition speed — 600ms transitions feel broadcast-quality
    const transitionSpeed = Math.min(1, delta * 3.5);
    cam.position.lerp(targetPos.current, transitionSpeed);
    currentLook.current.lerp(targetLook.current, transitionSpeed);

    // Camera shake (decaying)
    if (shakeRef.current > 0) {
      const intensity = shakeRef.current * shakeDecay.current;
      cam.position.x += (Math.random() - 0.5) * intensity * 0.5;
      cam.position.y += (Math.random() - 0.5) * intensity * 0.3;
      shakeDecay.current *= 0.92;
      if (shakeDecay.current < 0.01) shakeRef.current = 0;
    }

    // Trigger shake on big plays
    if (lastPlay && phase === 'result') {
      if (lastPlay.type === 'sack' || lastPlay.turnover?.type === 'fumble') {
        if (shakeRef.current === 0) {
          shakeRef.current = 1.5;
          shakeDecay.current = 1;
        }
      }
    }

    cam.lookAt(currentLook.current);

    // Smooth FOV transitions
    cam.fov = THREE.MathUtils.lerp(cam.fov, fov, transitionSpeed * 0.5);
    cam.updateProjectionMatrix();
  });

  return null;
}

function getCameraPreset(
  phase: Phase,
  lastPlay: PlayResult | null,
  isWidePlay?: boolean,
): 'sideline' | 'skyCam' | 'endzoneHigh' | 'allTwenty' | 'closeUp' {
  // Huddle/break: wide establishing shot
  if (phase === 'huddle' || phase === 'break' || phase === 'reset') return 'allTwenty';

  // Post-touchdown: close up
  if (phase === 'result' && lastPlay?.isTouchdown) return 'closeUp';

  // Field goal: endzone
  if (lastPlay?.type === 'field_goal' || lastPlay?.type === 'extra_point') return 'endzoneHigh';

  // Kickoff/punt flight: sky cam
  if (isWidePlay && (phase === 'development' || phase === 'snap')) return 'skyCam';

  // Deep pass plays in development
  if (phase === 'development' && lastPlay &&
      (lastPlay.call === 'pass_deep' || lastPlay.call === 'play_action_deep') &&
      lastPlay.yardsGained > 20) return 'skyCam';

  // Default: sideline
  return 'sideline';
}

function getPresetConfig(
  preset: string,
  ballX: number,
  offenseDirection: number,
): { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number } {
  switch (preset) {
    case 'skyCam':
      return {
        position: new THREE.Vector3(ballX, 35, 2),
        lookAt: new THREE.Vector3(ballX + offenseDirection * 5, 0, 0),
        fov: 60,
      };

    case 'endzoneHigh': {
      const endX = offenseDirection > 0 ? 60 : -60;
      return {
        position: new THREE.Vector3(endX + offenseDirection * 5, 28, 0),
        lookAt: new THREE.Vector3(ballX, 0, 0),
        fov: 55,
      };
    }

    case 'allTwenty':
      return {
        position: new THREE.Vector3(ballX + offenseDirection * -25, 30, 15),
        lookAt: new THREE.Vector3(ballX, 0, 0),
        fov: 55,
      };

    case 'closeUp':
      return {
        position: new THREE.Vector3(ballX + offenseDirection * -8, 8, 10),
        lookAt: new THREE.Vector3(ballX, 1, 0),
        fov: 45,
      };

    case 'sideline':
    default:
      return {
        position: new THREE.Vector3(ballX + offenseDirection * -20, 22, 0),
        lookAt: new THREE.Vector3(ballX + offenseDirection * 12, 0, 0),
        fov: 50,
      };
  }
}
