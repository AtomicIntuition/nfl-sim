'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult, NarrativeSnapshot, PlayType } from '@/lib/simulation/types';
import { FieldSurface } from './field/field-surface';
import { BallMarker } from './field/ball-marker';
import { DownDistanceOverlay } from './field/down-distance-overlay';
import { PlayAnimation } from './field/play-animation';
import { CoinFlip } from './field/coin-flip';
import { CelebrationOverlay } from './field/celebration-overlay';
import { DriveTrail } from './field/drive-trail';
import { PlayerHighlight } from './field/player-highlight';

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
}

/**
 * Immersive field visual — orchestrator component.
 * Manages perspective container, coordinate conversions, animation state,
 * and delegates rendering to specialized sub-components.
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
}: FieldVisualProps) {
  // ── Coordinate conversion ─────────────────────────────

  const toAbsolutePercent = (pos: number, team: 'home' | 'away'): number => {
    return team === 'home' ? 100 - pos : pos;
  };

  const absoluteBallPct = toAbsolutePercent(ballPosition, possession);
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

  // Push ball INTO the end zone on touchdowns (not just at the goal line)
  if (lastPlay?.isTouchdown) {
    if (absoluteBallPct >= 95) {
      ballLeft = 96; // Deep in the home (right) end zone
    } else if (absoluteBallPct <= 5) {
      ballLeft = 4;  // Deep in the away (left) end zone
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

  // ── Play animation coordinates ────────────────────────

  const playFromPercent = prevBallLeft;
  const playToPercent = ballLeft;
  const playSuccess = useMemo(() => {
    if (!lastPlay) return true;
    if (lastPlay.type === 'pass_incomplete') return false;
    if (lastPlay.type === 'field_goal' && !lastPlay.scoring) return false;
    if (lastPlay.type === 'extra_point' && !lastPlay.scoring) return false;
    return true;
  }, [lastPlay]);

  // ── Coin flip state ───────────────────────────────────

  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const coinFlipShownRef = useRef(false);

  useEffect(() => {
    if (
      isKickoff &&
      quarter === 1 &&
      !lastPlay &&
      gameStatus === 'live' &&
      !coinFlipShownRef.current
    ) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [isKickoff, quarter, lastPlay, gameStatus]);

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

  return (
    <div className="w-full px-2 py-2">
      <div
        className="field-container relative w-full h-[240px] sm:h-[320px] lg:h-[400px] xl:h-[440px] rounded-xl overflow-hidden border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
      >
        {/* Perspective wrapper for 3D depth effect */}
        <div className="field-perspective absolute inset-0">
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

          {/* Ball marker */}
          <BallMarker
            leftPercent={ballLeft}
            direction={ballDirection}
            isKicking={!!isKicking}
          />

          {/* Per-play-type animation */}
          <PlayAnimation
            playType={lastPlay?.type ?? null}
            fromPercent={playFromPercent}
            toPercent={playToPercent}
            success={playSuccess}
            playKey={playKey}
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

        {/* Coin flip overlay */}
        <CoinFlip
          show={showCoinFlip}
          winningTeam={possession === 'home' ? homeTeam.abbreviation : awayTeam.abbreviation}
          onComplete={handleCoinFlipComplete}
        />

        {/* Celebration overlay (TD confetti, turnover shake, etc.) */}
        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />
      </div>
    </div>
  );
}
