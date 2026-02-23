'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult, NarrativeSnapshot, WeatherConditions } from '@/lib/simulation/types';
import { FieldSurface } from './field/field-surface';
import { WeatherOverlay } from './field/weather-overlay';
import { DownDistanceOverlay } from './field/down-distance-overlay';
import { PlayScene } from './field/play-scene';
import { CoinFlip } from './field/coin-flip';
import { CelebrationOverlay } from './field/celebration-overlay';
import { PlayerHighlight } from './field/player-highlight';
import { PlayCallOverlay } from './field/play-call-overlay';
import { CrowdAtmosphere } from './field/crowd-atmosphere';
import { FieldCommentaryOverlay } from './field/field-commentary-overlay';
import { KickoffIntroOverlay } from './field/kickoff-intro-overlay';
import type { Phase } from './field/play-timing';

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
  weather?: WeatherConditions | null;
}

export function FieldVisual({
  ballPosition,
  firstDownLine,
  possession,
  homeTeam,
  awayTeam,
  down,
  yardsToGo,
  lastPlay,
  isKickoff,
  isPatAttempt,
  gameStatus,
  driveStartPosition,
  commentary,
  weather,
}: FieldVisualProps) {
  // ── Ball position math ──────────────────────────────────
  const endZoneWidth = 8.33;
  const fieldWidth = 100 - endZoneWidth * 2;
  const absoluteBallPct = possession === 'home' ? 100 - ballPosition : ballPosition;
  const ballLeft = endZoneWidth + (absoluteBallPct / 100) * fieldWidth;

  // Previous ball position — derived from current + yardsGained (avoids timing issues)
  // For possession-changing plays (kickoffs, punts, missed FGs, turnovers),
  // possession has already flipped by the time we see the event, so we must
  // compute the start position using the PRE-FLIP team's coordinate system.
  const prevBallLeft = useMemo(() => {
    if (!lastPlay) return ballLeft;

    const yardToLeft = (yardLine: number, team: 'home' | 'away') => {
      const abs = team === 'home' ? 100 - yardLine : yardLine;
      return endZoneWidth + (Math.max(0, Math.min(100, abs)) / 100) * fieldWidth;
    };

    // Kickoffs: kicker always kicks from their own 35. Possession = receiver.
    if (lastPlay.type === 'kickoff') {
      const kicker = possession === 'home' ? 'away' : 'home';
      return yardToLeft(35, kicker);
    }

    // Punts: punter's LOS = 100 - (ballPosition + |yardsGained|) from punter's perspective.
    // Possession = receiving team (already flipped).
    if (lastPlay.type === 'punt') {
      const punter = possession === 'home' ? 'away' : 'home';
      const punterYardLine = 100 - (ballPosition + Math.abs(lastPlay.yardsGained));
      return yardToLeft(Math.max(0, Math.min(100, punterYardLine)), punter);
    }

    // Missed field goals: possession flips to defending team.
    // Kicker's LOS = 100 - ballPosition from the kicker's perspective.
    if (lastPlay.type === 'field_goal' && !lastPlay.scoring) {
      const kicker = possession === 'home' ? 'away' : 'home';
      const kickerYardLine = 100 - ballPosition;
      return yardToLeft(Math.max(0, Math.min(100, kickerYardLine)), kicker);
    }

    // Turnovers: LOS was from the old offense's perspective.
    // Old offense = opposite of current possession (which flipped on turnover).
    if (lastPlay.turnover) {
      const oldOffense = possession === 'home' ? 'away' : 'home';
      // The ball's current position includes return yards; recover original LOS
      const returnYards = lastPlay.turnover.returnYards ?? 0;
      const losYardLine = 100 - (ballPosition + returnYards);
      return yardToLeft(Math.max(0, Math.min(100, losYardLine)), oldOffense);
    }

    // Normal plays (run, pass, sack, made FG, etc.): possession hasn't changed.
    const prevYardPos = ballPosition - (possession === 'home' ? -lastPlay.yardsGained : lastPlay.yardsGained);
    const prevAbsolute = possession === 'home' ? 100 - prevYardPos : prevYardPos;
    return endZoneWidth + (Math.max(0, Math.min(100, prevAbsolute)) / 100) * fieldWidth;
  }, [lastPlay, ballPosition, possession, endZoneWidth, fieldWidth, ballLeft]);

  // First down line position
  const fdAbsolute = possession === 'home' ? 100 - firstDownLine : firstDownLine;
  const firstDownLeft = endZoneWidth + (Math.max(0, Math.min(100, fdAbsolute)) / 100) * fieldWidth;

  // ── Play tracking for animations ──────────────────────
  const [playKey, setPlayKey] = useState(0);
  const [celebKey, setCelebKey] = useState(0);
  const [highlightKey, setHighlightKey] = useState(0);
  const prevPlayRef = useRef<PlayResult | null>(null);

  useEffect(() => {
    if (!lastPlay || lastPlay === prevPlayRef.current) return;
    prevPlayRef.current = lastPlay;
    setPlayKey((k) => k + 1);

    if (lastPlay.isTouchdown || lastPlay.turnover || lastPlay.isSafety ||
        (lastPlay.type === 'field_goal' && lastPlay.scoring)) {
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
  const [showKickoffIntro, setShowKickoffIntro] = useState(false);
  const kickoffIntroShownRef = useRef(false);

  useEffect(() => {
    if (lastPlay?.type === 'coin_toss' && !coinFlipShownRef.current) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [lastPlay]);

  const handleCoinFlipComplete = useCallback(() => {
    setShowCoinFlip(false);
    if (!kickoffIntroShownRef.current) {
      kickoffIntroShownRef.current = true;
      setTimeout(() => {
        setShowKickoffIntro(true);
      }, 500);
    }
  }, []);

  const handleKickoffIntroComplete = useCallback(() => {
    setShowKickoffIntro(false);
  }, []);

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

  // ── Team data ─────────────────────────────────────────
  const possessingTeam = possession === 'home' ? homeTeam : awayTeam;
  const defendingTeam = possession === 'home' ? awayTeam : homeTeam;

  // ── Animation state ───────────────────────────────────
  const [isPlayAnimating, setIsPlayAnimating] = useState(false);
  const [playPhase, setPlayPhase] = useState<Phase>('idle');

  const handlePlayAnimating = useCallback((animating: boolean) => {
    setIsPlayAnimating(animating);
  }, []);
  const handlePhaseChange = useCallback((phase: Phase) => {
    setPlayPhase(phase);
  }, []);

  // ── Big play border pulse ─────────────────────────────
  const [borderPulse, setBorderPulse] = useState(false);
  useEffect(() => {
    if (!lastPlay) return;
    const isBig =
      lastPlay.isTouchdown ||
      lastPlay.turnover != null ||
      lastPlay.type === 'sack' ||
      (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) ||
      (lastPlay.type === 'run' && lastPlay.yardsGained > 15);
    if (isBig) {
      setBorderPulse(true);
      const timer = setTimeout(() => setBorderPulse(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastPlay]);

  // ── Derived display state ─────────────────────────────
  const isRedZone = ballPosition <= 20;
  const isGoalLine = ballPosition <= 5;

  return (
    <div className="w-full h-full px-1.5 py-1">
      <div
        className="field-container relative w-full h-full rounded-xl overflow-hidden"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
        style={{
          border: borderPulse
            ? '1.5px solid rgba(212, 175, 55, 0.6)'
            : '1.5px solid rgba(255, 255, 255, 0.08)',
          boxShadow: borderPulse
            ? '0 0 16px rgba(212, 175, 55, 0.3), inset 0 0 16px rgba(212, 175, 55, 0.05)'
            : 'none',
          transition: 'border-color 300ms ease-out, box-shadow 300ms ease-out',
        }}
      >
        {/* z-0: Green field background */}
        <FieldSurface homeTeam={homeTeam} awayTeam={awayTeam} possession={possession} />

        {/* z-2: Weather effects (rain, snow, fog, wind) */}
        <WeatherOverlay weather={weather} />

        {/* z-6: Down & distance overlay (LOS, FD line, badge) */}
        {!isKickoff && !isPatAttempt && gameStatus === 'live' && (
          <DownDistanceOverlay
            ballLeftPercent={ballLeft}
            firstDownLeftPercent={firstDownLeft}
            down={down}
            yardsToGo={yardsToGo}
            isRedZone={isRedZone}
            isGoalLine={isGoalLine}
            possession={possession}
          />
        )}

        {/* z-12: Play scene (logo ball + effects, phase timing driver) */}
        <PlayScene
          ballLeftPercent={ballLeft}
          prevBallLeftPercent={prevBallLeft}
          possession={possession}
          offenseColor={possessingTeam.primaryColor}
          defenseColor={defendingTeam.primaryColor}
          lastPlay={lastPlay}
          playKey={playKey}
          onAnimating={handlePlayAnimating}
          onPhaseChange={handlePhaseChange}
          teamAbbreviation={possessingTeam.abbreviation}
          opposingTeamAbbreviation={defendingTeam.abbreviation}
          teamColor={possessingTeam.primaryColor}
          teamSecondaryColor={possessingTeam.secondaryColor}
          isKickoff={isKickoff}
          isPatAttempt={isPatAttempt}
        />

        {/* z-20: Player name highlight */}
        <PlayerHighlight
          playerName={highlightPlayer.name}
          jerseyNumber={highlightPlayer.number}
          teamColor={possessingTeam.primaryColor}
          ballPercent={ballLeft}
          highlightKey={highlightKey}
        />

        {/* z-21: Play call overlay */}
        <PlayCallOverlay
          formation={lastPlay?.formation ?? null}
          defensiveCall={lastPlay?.defensiveCall ?? null}
          playCall={lastPlay?.call ?? null}
          visible={playPhase === 'pre_snap'}
        />

        {/* z-22: Crowd atmosphere edge effects */}
        <CrowdAtmosphere
          crowdReaction={commentary?.crowdReaction ?? null}
          excitement={commentary?.excitement ?? 0}
        />

        {/* Field commentary overlay */}
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

        {/* Kickoff intro overlay */}
        <KickoffIntroOverlay
          show={showKickoffIntro}
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          onComplete={handleKickoffIntroComplete}
        />

        {/* Celebration overlay */}
        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />
      </div>
    </div>
  );
}
