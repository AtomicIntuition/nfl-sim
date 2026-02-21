'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult, NarrativeSnapshot } from '@/lib/simulation/types';
import { FieldSurface } from './field/field-surface';
import { BallMarker } from './field/ball-marker';
import { DownDistanceOverlay } from './field/down-distance-overlay';
import { PlayScene } from './field/play-scene';
import { PlayersOverlay } from './field/players-overlay';
import { CoinFlip } from './field/coin-flip';
import { CelebrationOverlay } from './field/celebration-overlay';
import { DriveTrail } from './field/drive-trail';
import { PlayerHighlight } from './field/player-highlight';
import { PlayCallOverlay } from './field/play-call-overlay';
import { CrowdAtmosphere } from './field/crowd-atmosphere';
import { FieldCommentaryOverlay } from './field/field-commentary-overlay';
import { Minimap } from './field/minimap';

interface FieldVisualProps {
  ballPosition: number;
  firstDownLine: number;
  possession: 'home' | 'away';
  homeTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  quarter: number | 'OT';
  clock: number;
  lastPlay: PlayResult | null;
  isKickoff: boolean;
  isPatAttempt: boolean;
  gameStatus: 'pregame' | 'live' | 'halftime' | 'game_over';
  driveStartPosition: number;
  narrativeContext: NarrativeSnapshot | null;
  commentary?: { playByPlay: string; crowdReaction: string; excitement: number } | null;
}

/**
 * Immersive field visual — orchestrator component.
 * Full-field view with formation-accurate player rendering,
 * play-by-play overlays, and crowd atmosphere effects.
 */
export function FieldVisual({
  ballPosition,
  firstDownLine,
  possession,
  homeTeam,
  awayTeam,
  down,
  yardsToGo,
  quarter,
  lastPlay,
  isKickoff,
  isPatAttempt,
  gameStatus,
  driveStartPosition,
  narrativeContext,
  commentary,
}: FieldVisualProps) {
  // ── Coordinate conversion ─────────────────────────────

  const toAbsolutePercent = (pos: number, team: 'home' | 'away'): number => {
    return team === 'home' ? 100 - pos : pos;
  };

  let absoluteBallPct = toAbsolutePercent(ballPosition, possession);

  // Force ball to the correct end zone on touchdowns.
  if (lastPlay?.isTouchdown && lastPlay?.scoring) {
    absoluteBallPct = lastPlay.scoring.team === 'home' ? 0 : 100;
  }

  const absoluteFirstDownPct = toAbsolutePercent(
    Math.min(firstDownLine, 100),
    possession
  );
  const absoluteDriveStartPct = toAbsolutePercent(driveStartPosition, possession);

  const endZoneWidth = 8.33;
  const fieldStart = endZoneWidth;
  const fieldWidth = 100 - endZoneWidth * 2;

  let ballLeft = fieldStart + (absoluteBallPct / 100) * fieldWidth;

  // Push ball visually INTO the end zone graphic
  if (lastPlay?.isTouchdown) {
    if (absoluteBallPct >= 95) {
      ballLeft = 96;
    } else if (absoluteBallPct <= 5) {
      ballLeft = 4;
    }
  }

  const firstDownLeft = fieldStart + (absoluteFirstDownPct / 100) * fieldWidth;
  const driveStartLeft = fieldStart + (absoluteDriveStartPct / 100) * fieldWidth;

  // ── Play tracking for animations ──────────────────────

  const [playKey, setPlayKey] = useState(0);
  const [celebKey, setCelebKey] = useState(0);
  const [highlightKey, setHighlightKey] = useState(0);
  const prevPlayRef = useRef<PlayResult | null>(null);
  const [prevBallLeft, setPrevBallLeft] = useState(ballLeft);

  const ballDirection = useMemo<'left' | 'right' | null>(() => {
    const diff = ballLeft - prevBallLeft;
    if (Math.abs(diff) < 0.5) return null;
    return diff > 0 ? 'right' : 'left';
  }, [ballLeft, prevBallLeft]);

  useEffect(() => {
    setPrevBallLeft(ballLeft);
  }, [ballLeft]);

  // Detect new play
  useEffect(() => {
    if (!lastPlay || lastPlay === prevPlayRef.current) return;
    prevPlayRef.current = lastPlay;
    setPlayKey((k) => k + 1);

    if (lastPlay.isTouchdown) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.turnover) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.isSafety) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.type === 'field_goal' && lastPlay.scoring) {
      setCelebKey((k) => k + 1);
    }

    const isBigPlay =
      lastPlay.isTouchdown ||
      lastPlay.turnover != null ||
      lastPlay.type === 'sack' ||
      (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) ||
      (lastPlay.type === 'run' && lastPlay.yardsGained > 15);

    if (isBigPlay) {
      setHighlightKey((k) => k + 1);
    }
  }, [lastPlay]);

  // ── Celebration type ──────────────────────────────────

  const celebType = useMemo(() => {
    if (!lastPlay) return null;
    if (lastPlay.isTouchdown) return 'touchdown' as const;
    if (lastPlay.turnover) return 'turnover' as const;
    if (lastPlay.isSafety) return 'safety' as const;
    if (lastPlay.type === 'field_goal' && lastPlay.scoring) return 'field_goal' as const;
    return null;
  }, [lastPlay]);

  // ── Coin flip state ───────────────────────────────────

  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const coinFlipShownRef = useRef(false);

  useEffect(() => {
    if (lastPlay?.type === 'coin_toss' && !coinFlipShownRef.current) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [lastPlay]);

  const handleCoinFlipComplete = useCallback(() => {
    setShowCoinFlip(false);
  }, []);

  // ── Kicking detection ─────────────────────────────────

  const isKicking =
    lastPlay?.type === 'punt' ||
    lastPlay?.type === 'kickoff' ||
    lastPlay?.type === 'field_goal' ||
    lastPlay?.type === 'extra_point';

  // ── Player highlight data ─────────────────────────────

  const highlightPlayer = useMemo(() => {
    if (!lastPlay) return { name: null, number: null };
    if (lastPlay.isTouchdown) {
      const p = lastPlay.receiver ?? lastPlay.rusher ?? lastPlay.passer;
      return { name: p?.name ?? null, number: null };
    }
    if (lastPlay.turnover) {
      const p = lastPlay.defender ?? lastPlay.passer;
      return { name: p?.name ?? null, number: null };
    }
    if (lastPlay.type === 'sack') {
      return { name: lastPlay.defender?.name ?? null, number: null };
    }
    if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
      return { name: lastPlay.receiver?.name ?? null, number: null };
    }
    if (lastPlay.type === 'run' && lastPlay.yardsGained > 15) {
      return { name: lastPlay.rusher?.name ?? null, number: null };
    }
    return { name: null, number: null };
  }, [lastPlay]);

  // ── Possessing team data ──────────────────────────────

  const possessingTeam = possession === 'home' ? homeTeam : awayTeam;
  const isRedZone = ballPosition >= 80;
  const isGoalLine = ballPosition >= 95;
  const showDriveTrail = !isKickoff && !isPatAttempt && gameStatus === 'live';

  // ── PlayScene animation state ──────────────────────────
  const [isPlayAnimating, setIsPlayAnimating] = useState(false);
  const [playPhase, setPlayPhase] = useState<string>('idle');
  const handlePlayAnimating = useCallback((animating: boolean) => {
    setIsPlayAnimating(animating);
  }, []);
  const handlePhaseChange = useCallback((phase: string) => {
    setPlayPhase(phase);
  }, []);

  const opposingTeam = possession === 'home' ? awayTeam : homeTeam;

  // ── SkyCam broadcast camera ─────────────────────────────
  const [skyCamEnabled, setSkyCamEnabled] = useState(false);
  const [cameraFlash, setCameraFlash] = useState(false);
  const [cameraOrigin, setCameraOrigin] = useState(50);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('skycam-enabled');
      if (stored === 'true') setSkyCamEnabled(true);
    } catch {}
  }, []);

  // Update camera origin only during idle phase (invisible at scale 1)
  useEffect(() => {
    if (!skyCamEnabled || playPhase !== 'idle') return;
    // Lead 6% in offensive direction
    const offensiveLead = possession === 'home' ? -6 : 6;
    const origin = Math.max(18, Math.min(82, ballLeft + offensiveLead));
    setCameraOrigin(origin);
  }, [skyCamEnabled, playPhase, ballLeft, possession]);

  // Toggle handler with camera cut flash
  const handleSkyCamToggle = useCallback(() => {
    setCameraFlash(true);
    setTimeout(() => {
      setSkyCamEnabled(prev => {
        const next = !prev;
        try { localStorage.setItem('skycam-enabled', String(next)); } catch {}
        return next;
      });
    }, 125);
    setTimeout(() => setCameraFlash(false), 250);
  }, []);

  // Zoom computation based on play phase and play type
  const skyCamZoom = useMemo(() => {
    if (!skyCamEnabled) return { scale: 1, transition: 'none' };

    const isFieldGoalOrXP = lastPlay?.type === 'field_goal' || lastPlay?.type === 'extra_point';
    const isLongKick = lastPlay?.type === 'kickoff' || lastPlay?.type === 'punt';

    let scale = 1;
    let transition = 'transform 500ms ease-in-out';

    switch (playPhase) {
      case 'idle':
        scale = 1;
        transition = 'transform 700ms ease-in-out';
        break;
      case 'pre_snap':
        if (isLongKick) scale = 1.15;
        else if (isFieldGoalOrXP) scale = 1.4;
        else if (isGoalLine) scale = 1.6;
        else if (isRedZone) scale = 1.6;
        else scale = 1.6;
        transition = 'transform 450ms ease-out';
        break;
      case 'snap':
      case 'action':
      case 'result':
        if (isLongKick) scale = 1.2;
        else if (isFieldGoalOrXP) scale = 1.5;
        else if (isGoalLine) scale = 2.2;
        else if (isRedZone) scale = 2.1;
        else scale = 1.9;
        transition = 'transform 150ms ease-out';
        break;
      case 'post_play':
        scale = 1.3;
        transition = 'transform 500ms ease-in-out';
        break;
      default:
        scale = 1;
        transition = 'transform 700ms ease-in-out';
    }

    return { scale, transition };
  }, [skyCamEnabled, playPhase, lastPlay?.type, isRedZone, isGoalLine]);

  // ── Ball vertical position variety ─────────────────────
  const ballTopPercent = useMemo(() => {
    if (!lastPlay) return 50;
    switch (lastPlay.type) {
      case 'run':
        return 45 + (lastPlay.yardsGained % 7) * 2;
      case 'pass_complete':
      case 'pass_incomplete':
        return 42 + (Math.abs(lastPlay.yardsGained) % 5) * 3;
      case 'sack':
        return 55;
      case 'scramble':
        return 40 + (lastPlay.yardsGained % 6) * 3;
      default:
        return 50;
    }
  }, [lastPlay]);

  return (
    <div className="w-full h-full px-1.5 py-1">
      <div
        className="field-container relative w-full h-full rounded-xl overflow-hidden border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
      >
        {/* Perspective wrapper for 3D depth effect */}
        <div
          className="field-perspective absolute inset-0"
          style={skyCamEnabled ? {
            transform: `scale(${skyCamZoom.scale}) rotateX(2deg)`,
            transformOrigin: `${cameraOrigin}% 55%`,
            transition: skyCamZoom.transition,
            willChange: 'transform',
          } : undefined}
        >
          {/* SVG field surface (grass, lines, end zones) */}
          <FieldSurface homeTeam={homeTeam} awayTeam={awayTeam} possession={possession} />

          {/* Down & distance overlay */}
          <div className="absolute inset-0">
            <DownDistanceOverlay
              ballLeftPercent={ballLeft}
              firstDownLeftPercent={firstDownLeft}
              down={down}
              yardsToGo={yardsToGo}
              isRedZone={isRedZone}
              isGoalLine={isGoalLine}
              possession={possession}
            />
          </div>

          {/* Drive trail */}
          <div className="absolute inset-0">
            <DriveTrail
              driveStartPercent={driveStartLeft}
              ballPercent={ballLeft}
              teamColor={possessingTeam.primaryColor}
              visible={showDriveTrail}
            />
          </div>

          {/* 22 player dots */}
          <PlayersOverlay
            phase={playPhase}
            ballLeftPercent={ballLeft}
            prevBallLeftPercent={prevBallLeft}
            possession={possession}
            offenseColor={possessingTeam.primaryColor}
            defenseColor={opposingTeam.primaryColor}
            lastPlay={lastPlay}
            playKey={playKey}
            isKickoff={isKickoff}
            isPatAttempt={isPatAttempt}
            gameStatus={gameStatus === 'game_over' ? 'game_over' : gameStatus === 'halftime' ? 'halftime' : gameStatus === 'live' ? 'live' : 'pregame'}
          />

          {/* Ball marker (hides during PlayScene animation) */}
          <BallMarker
            leftPercent={ballLeft}
            topPercent={ballTopPercent}
            direction={ballDirection}
            isKicking={!!isKicking}
            hidden={isPlayAnimating}
            teamAbbreviation={possessingTeam.abbreviation}
            teamColor={possessingTeam.primaryColor}
          />

          {/* Play scene: animated ball trajectory */}
          <PlayScene
            ballLeftPercent={ballLeft}
            prevBallLeftPercent={prevBallLeft}
            possession={possession}
            offenseColor={possessingTeam.primaryColor}
            defenseColor={opposingTeam.primaryColor}
            lastPlay={lastPlay}
            playKey={playKey}
            onAnimating={handlePlayAnimating}
            onPhaseChange={handlePhaseChange}
            teamAbbreviation={possessingTeam.abbreviation}
            teamColor={possessingTeam.primaryColor}
          />

          {/* Player name highlight */}
          <PlayerHighlight
            playerName={highlightPlayer.name}
            jerseyNumber={highlightPlayer.number}
            teamColor={possessingTeam.primaryColor}
            ballPercent={ballLeft}
            highlightKey={highlightKey}
          />
        </div>

        {/* Play call overlay */}
        <PlayCallOverlay
          formation={lastPlay?.formation ?? null}
          defensiveCall={lastPlay?.defensiveCall ?? null}
          playCall={lastPlay?.call ?? null}
          visible={playPhase === 'pre_snap'}
        />

        {/* Crowd atmosphere edge effects */}
        <CrowdAtmosphere
          crowdReaction={commentary?.crowdReaction ?? null}
          excitement={commentary?.excitement ?? 0}
        />

        {/* Field commentary overlay — bottom of field */}
        <FieldCommentaryOverlay
          text={commentary?.playByPlay ?? null}
          lastPlay={lastPlay}
        />

        {/* Coin flip overlay */}
        <CoinFlip
          show={showCoinFlip}
          winningTeam={possession === 'home' ? awayTeam.abbreviation : homeTeam.abbreviation}
          onComplete={handleCoinFlipComplete}
        />

        {/* Celebration overlay */}
        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />

        {/* SkyCam toggle button */}
        <button
          onClick={handleSkyCamToggle}
          className="absolute top-2 right-2 z-30 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200"
          style={{
            background: skyCamEnabled
              ? 'rgba(212, 175, 55, 0.25)'
              : 'rgba(17, 24, 39, 0.7)',
            border: skyCamEnabled
              ? '1px solid rgba(212, 175, 55, 0.5)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: skyCamEnabled
              ? '0 0 12px rgba(212, 175, 55, 0.3)'
              : 'none',
          }}
          title={skyCamEnabled ? 'Switch to All-22 view' : 'Switch to SkyCam view'}
          aria-label={skyCamEnabled ? 'Switch to All-22 view' : 'Switch to SkyCam view'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={skyCamEnabled ? '#d4af37' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>

        {/* SkyCam minimap — visible when zoomed */}
        {skyCamEnabled && skyCamZoom.scale > 1 && (
          <Minimap
            ballLeftPercent={ballLeft}
            firstDownLeftPercent={firstDownLeft}
            driveStartPercent={driveStartLeft}
            viewportCenter={cameraOrigin}
            zoomLevel={skyCamZoom.scale}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            possession={possession}
          />
        )}

        {/* SkyCam vignette — depth-of-field effect proportional to zoom */}
        {skyCamEnabled && skyCamZoom.scale > 1 && (
          <div
            className="absolute inset-0 z-[22] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
              opacity: Math.min(1, (skyCamZoom.scale - 1) / 1.2),
            }}
          />
        )}

        {/* Camera cut flash on toggle */}
        {cameraFlash && (
          <div className="absolute inset-0 z-50 pointer-events-none camera-cut-flash" />
        )}
      </div>
    </div>
  );
}
