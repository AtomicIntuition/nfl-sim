'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult, NarrativeSnapshot } from '@/lib/simulation/types';
import { FieldSurface } from './field/field-surface';
import { BallMarker } from './field/ball-marker';
import { DownDistanceOverlay } from './field/down-distance-overlay';
import { PlayScene } from './field/play-scene';
import { CoinFlip } from './field/coin-flip';
import { CelebrationOverlay } from './field/celebration-overlay';
import { DriveTrail } from './field/drive-trail';
import { PlayerHighlight } from './field/player-highlight';
import { Minimap } from './field/minimap';
import { PlayCallOverlay } from './field/play-call-overlay';
import { CrowdAtmosphere } from './field/crowd-atmosphere';
import { FieldCommentaryOverlay } from './field/field-commentary-overlay';

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

// ── Zoom level by play type ──────────────────────────────
function getZoomLevel(
  lastPlay: PlayResult | null,
  gameStatus: string,
  isKickoff: boolean,
): number {
  if (gameStatus !== 'live') return 1.0;
  if (!lastPlay) return 1.0;

  const t = lastPlay.type;
  if (isKickoff || t === 'kickoff') return 1.5;
  if (t === 'punt') return 1.5;
  if (t === 'field_goal' || t === 'extra_point') return 2.0;
  if (t === 'pregame' || t === 'coin_toss') return 1.0;

  // Normal plays: run, pass, sack, scramble
  return 2.5;
}

/**
 * Immersive field visual — orchestrator component.
 * Manages perspective container, zoomed camera system, coordinate conversions,
 * animation state, and delegates rendering to specialized sub-components.
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

  // End zones take ~8.33% each side, playing field is ~83.33% in the middle
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

  // ── Camera zoom system ─────────────────────────────────

  const zoomLevel = useMemo(
    () => getZoomLevel(lastPlay, gameStatus, isKickoff),
    [lastPlay?.type, gameStatus, isKickoff] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Clamp camera origin so we don't show past field edges
  const clampedBallX = Math.max(22, Math.min(78, ballLeft));

  // ── Play tracking for animations ──────────────────────

  const [playKey, setPlayKey] = useState(0);
  const [celebKey, setCelebKey] = useState(0);
  const [highlightKey, setHighlightKey] = useState(0);
  const prevPlayRef = useRef<PlayResult | null>(null);
  const [prevBallLeft, setPrevBallLeft] = useState(ballLeft);

  // Track previous ball position for direction detection
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

    // Trigger celebration?
    if (lastPlay.isTouchdown) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.turnover) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.isSafety) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.type === 'field_goal' && lastPlay.scoring) {
      setCelebKey((k) => k + 1);
    }

    // Trigger player highlight on big plays
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
    if (
      lastPlay?.type === 'coin_toss' &&
      !coinFlipShownRef.current
    ) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [lastPlay]);

  const handleCoinFlipComplete = useCallback(() => {
    setShowCoinFlip(false);
  }, []);

  // ── Kicking detection for ball launch ─────────────────

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
      case 'kickoff':
      case 'punt':
      case 'field_goal':
      case 'extra_point':
      case 'touchback':
        return 50;
      default:
        return 50;
    }
  }, [lastPlay]);

  return (
    <div className="w-full px-2 py-2">
      <div
        className="field-container relative w-full h-[280px] sm:h-[380px] lg:h-[480px] xl:h-[540px] rounded-xl overflow-hidden border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
      >
        {/* Perspective wrapper for 3D depth effect */}
        <div className="field-perspective absolute inset-0">
          {/* Camera wrapper — zooms into the action area */}
          <div
            className="field-camera"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${clampedBallX}% 50%`,
              transition: 'transform 800ms ease-out, transform-origin 800ms ease-out',
              width: '100%',
              height: '100%',
            }}
          >
            {/* SVG field surface (grass, lines, end zones) */}
            <FieldSurface homeTeam={homeTeam} awayTeam={awayTeam} possession={possession} />

            {/* Down & distance overlay (yellow zone, LOS, first-down line) */}
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

            {/* Ball marker (hides during PlayScene animation) */}
            <BallMarker
              leftPercent={ballLeft}
              topPercent={ballTopPercent}
              direction={ballDirection}
              isKicking={!!isKicking}
              hidden={isPlayAnimating}
            />

            {/* Play scene: player formations + animated ball trajectory */}
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
        </div>

        {/* Play call overlay — outside camera so it doesn't zoom */}
        <PlayCallOverlay
          formation={lastPlay?.formation ?? null}
          defensiveCall={lastPlay?.defensiveCall ?? null}
          playCall={lastPlay?.call ?? null}
          visible={playPhase === 'pre_snap'}
        />

        {/* Crowd atmosphere edge effects — outside camera */}
        <CrowdAtmosphere
          crowdReaction={commentary?.crowdReaction ?? null}
          excitement={commentary?.excitement ?? 0}
        />

        {/* Field commentary overlay — bottom of field */}
        <FieldCommentaryOverlay
          text={commentary?.playByPlay ?? null}
          lastPlay={lastPlay}
        />

        {/* Minimap — shows full-field context when zoomed */}
        {zoomLevel > 1.2 && (
          <Minimap
            ballLeftPercent={ballLeft}
            firstDownLeftPercent={firstDownLeft}
            driveStartPercent={driveStartLeft}
            viewportCenter={clampedBallX}
            zoomLevel={zoomLevel}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            possession={possession}
          />
        )}

        {/* Coin flip overlay */}
        <CoinFlip
          show={showCoinFlip}
          winningTeam={possession === 'home' ? awayTeam.abbreviation : homeTeam.abbreviation}
          onComplete={handleCoinFlipComplete}
        />

        {/* Celebration overlay (TD confetti, turnover shake, etc.) — outside camera */}
        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />
      </div>
    </div>
  );
}
