'use client';

import { Canvas } from '@react-three/fiber';
import type { PlayResult, WeatherConditions } from '@/lib/simulation/types';
import type { Phase } from '@/lib/animation/types';
import { FieldGround } from './field-ground';
import { GoalPosts } from './goal-posts';
import { StadiumLighting } from './stadium-lighting';
import { BroadcastCamera } from './broadcast-camera';
import { PlayerModels } from './player-models';
import { Football3D } from './football-3d';
import { FieldLines3D } from './field-lines-3d';
import { DriveTrail3D } from './drive-trail-3d';
import { BallMarker3D } from './ball-marker-3d';
import { WeatherEffects } from './weather-effects';

interface FieldSceneProps {
  ballLeft: number;
  prevBallLeft: number;
  firstDownLeft: number;
  driveStartLeft: number;
  possession: 'home' | 'away';
  homeTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  phase: Phase;
  isPlayAnimating: boolean;
  showDriveTrail: boolean;
  isKickoff: boolean;
  weather: WeatherConditions | null;
}

/**
 * The actual Three.js scene — all 3D components live here inside the Canvas.
 * This is dynamically imported to avoid SSR issues.
 */
export function FieldScene({
  ballLeft,
  prevBallLeft,
  firstDownLeft,
  driveStartLeft,
  possession,
  homeTeam,
  awayTeam,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  phase,
  isPlayAnimating,
  showDriveTrail,
  isKickoff,
  weather,
}: FieldSceneProps) {
  // Convert ball position to world X for camera
  const ballWorldX = (ballLeft / 100) * 120 - 60;
  const offenseDirection = possession === 'away' ? -1 : 1;
  const isWidePlay = lastPlay?.type === 'kickoff' || lastPlay?.type === 'punt';

  const possessingTeam = possession === 'home' ? homeTeam : awayTeam;

  // Weather-driven fog distances
  const fogNear = weather?.type === 'fog' ? 20 : 60;
  const fogFar = weather?.type === 'fog' ? 60 : 150;

  return (
    <Canvas
      frameloop={isPlayAnimating ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 50, near: 0.1, far: 500, position: [ballWorldX - 20, 22, 0] }}
      style={{ width: '100%', height: '100%', background: '#0a1a0a' }}
    >
      {/* Fog for depth (adjusted by weather) */}
      <fog attach="fog" args={['#0a1a0a', fogNear, fogFar]} />

      {/* Lighting (weather-responsive) */}
      <StadiumLighting weather={weather} />

      {/* Broadcast camera (preset-based with phase transitions) */}
      <BroadcastCamera
        ballX={ballWorldX}
        offenseDirection={offenseDirection}
        isWidePlay={isWidePlay}
        phase={phase}
        lastPlay={lastPlay}
      />

      {/* Field ground with procedural texture */}
      <FieldGround homeTeam={homeTeam} awayTeam={awayTeam} />

      {/* Goal posts */}
      <GoalPosts />

      {/* Field markers (LOS + first down) */}
      <FieldLines3D
        ballPosition={ballLeft}
        firstDownLine={firstDownLeft}
        possession={possession}
      />

      {/* Drive trail */}
      <DriveTrail3D
        driveStartPosition={driveStartLeft}
        ballPosition={ballLeft}
        teamColor={possessingTeam.primaryColor}
        visible={showDriveTrail}
      />

      {/* 22 player capsules with helmets */}
      <PlayerModels
        ballPosition={ballLeft}
        prevBallPosition={prevBallLeft}
        possession={possession}
        offenseColor={offenseColor}
        defenseColor={defenseColor}
        lastPlay={lastPlay}
        playKey={playKey}
        phase={phase}
      />

      {/* 3D Football (choreographer-driven) */}
      <Football3D
        ballPosition={ballLeft}
        prevBallPosition={prevBallLeft}
        possession={possession}
        lastPlay={lastPlay}
        phase={phase}
        playKey={playKey}
      />

      {/* Ball marker (when not animating) */}
      <BallMarker3D
        ballPosition={ballLeft}
        hidden={isPlayAnimating}
      />

      {/* Weather particles */}
      <WeatherEffects weather={weather} />
    </Canvas>
  );
}
