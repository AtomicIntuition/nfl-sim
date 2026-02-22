'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WeatherConditions } from '@/lib/simulation/types';

interface WeatherEffectsProps {
  weather: WeatherConditions | null;
}

/**
 * Weather particle system — rain, snow, fog, wind.
 * All particles use Points geometry for minimal GPU cost (1 draw call per type).
 */
export function WeatherEffects({ weather }: WeatherEffectsProps) {
  if (!weather || weather.type === 'clear' || weather.type === 'cloudy') return null;

  return (
    <>
      {weather.type === 'rain' && <RainEffect intensity={weather.precipitation} windSpeed={weather.windSpeed} />}
      {weather.type === 'snow' && <SnowEffect intensity={weather.precipitation} />}
      {weather.type === 'wind' && weather.windSpeed > 15 && <WindStreaks windSpeed={weather.windSpeed} />}
    </>
  );
}

// ── Rain ────────────────────────────────────────────────────

function RainEffect({ intensity, windSpeed }: { intensity: number; windSpeed: number }) {
  const count = Math.floor(1000 + intensity * 2000); // 1000-3000 particles
  const meshRef = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 140;     // X: across field
      pos[i3 + 1] = Math.random() * 40;            // Y: height
      pos[i3 + 2] = (Math.random() - 0.5) * 70;   // Z: width
      vel[i3] = (windSpeed / 35) * 0.3;            // Wind drift X
      vel[i3 + 1] = -(0.5 + Math.random() * 0.5); // Fall speed
      vel[i3 + 2] = (Math.random() - 0.5) * 0.1;  // Slight Z drift
    }
    return { positions: pos, velocities: vel };
  }, [count, windSpeed]);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    const posAttr = meshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      arr[i3] += velocities[i3] * delta * 60;
      arr[i3 + 1] += velocities[i3 + 1] * delta * 60;
      arr[i3 + 2] += velocities[i3 + 2] * delta * 60;

      // Reset fallen particles
      if (arr[i3 + 1] < -1) {
        arr[i3] = (Math.random() - 0.5) * 140;
        arr[i3 + 1] = 35 + Math.random() * 5;
        arr[i3 + 2] = (Math.random() - 0.5) * 70;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#aaccff"
        size={0.08}
        transparent
        opacity={0.5 + intensity * 0.3}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ── Snow ────────────────────────────────────────────────────

function SnowEffect({ intensity }: { intensity: number }) {
  const count = Math.floor(500 + intensity * 1500); // 500-2000 particles
  const meshRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const { positions, driftPhases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 140;
      pos[i3 + 1] = Math.random() * 35;
      pos[i3 + 2] = (Math.random() - 0.5) * 70;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions: pos, driftPhases: phases };
  }, [count]);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;
    const posAttr = meshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Slow fall with sine drift
      arr[i3] += Math.sin(timeRef.current * 0.5 + driftPhases[i]) * 0.02;
      arr[i3 + 1] -= (0.03 + Math.random() * 0.02) * delta * 60;
      arr[i3 + 2] += Math.cos(timeRef.current * 0.3 + driftPhases[i] * 1.5) * 0.015;

      if (arr[i3 + 1] < -0.5) {
        arr[i3] = (Math.random() - 0.5) * 140;
        arr[i3 + 1] = 30 + Math.random() * 5;
        arr[i3 + 2] = (Math.random() - 0.5) * 70;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={0.2}
        transparent
        opacity={0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ── Wind Streaks ────────────────────────────────────────────

function WindStreaks({ windSpeed }: { windSpeed: number }) {
  const count = Math.floor(50 + (windSpeed / 35) * 150); // 50-200 streaks
  const meshRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 140;
      pos[i3 + 1] = 1 + Math.random() * 15;
      pos[i3 + 2] = (Math.random() - 0.5) * 70;
    }
    return pos;
  }, [count]);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    const posAttr = meshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const speed = (windSpeed / 35) * 1.5;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      arr[i3] += speed * delta * 60;
      if (arr[i3] > 70) {
        arr[i3] = -70;
        arr[i3 + 1] = 1 + Math.random() * 15;
        arr[i3 + 2] = (Math.random() - 0.5) * 70;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#cccccc"
        size={0.15}
        transparent
        opacity={0.25}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
