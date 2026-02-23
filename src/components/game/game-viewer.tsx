'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NarrativeSnapshot, GameState } from '@/lib/simulation/types';
import { useGameStream } from '@/hooks/use-game-stream';
import { useMomentum } from '@/hooks/use-momentum';
import { useDynamicTab } from '@/hooks/use-dynamic-tab';
import { useProceduralAudio } from '@/hooks/use-procedural-audio';
import { useBroadcasterAudio } from '@/hooks/use-broadcaster-audio';
import { buildLiveBoxScore } from '@/lib/utils/live-box-score';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import { ScoreBug } from '@/components/game/scorebug';
import { PlayFeed } from '@/components/game/play-feed';
import { FieldVisual } from '@/components/game/field-visual';
import { MomentumMeter } from '@/components/game/momentum-meter';
import { BoxScore } from '@/components/game/box-score';
import { GameOverSummary } from '@/components/game/game-over-summary';
// BroadcastMoment removed — field overlay + LiveCommentary cover this
import { CrowdEnergy } from '@/components/game/crowd-energy';
import { DriveTracker } from '@/components/game/drive-tracker';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JumbotronOverlay } from '@/components/game/jumbotron-overlay';

interface GameViewerProps {
  gameId: string;
}

export function GameViewer({ gameId }: GameViewerProps) {
  const router = useRouter();
  const {
    events,
    currentEvent,
    gameState,
    boxScore,
    mvp,
    finalScore,
    status,
    error,
    intermissionMessage,
    intermissionCountdown,
    nextGameId,
    reconnect,
  } = useGameStream(gameId);

  const { momentum } = useMomentum(events);

  // Procedural crowd audio
  const { isMuted, toggle: toggleAudio, triggerReaction } = useProceduralAudio();

  // Broadcaster narration (Web Speech API)
  const {
    isMuted: isBroadcasterMuted,
    toggle: toggleBroadcaster,
    speak: speakPlay,
    voiceGender: broadcasterVoice,
    cycleVoice: cycleBroadcasterVoice,
  } = useBroadcasterAudio();

  // Trigger audio reactions on new events
  const prevEventNumRef = useRef<number | null>(null);
  useEffect(() => {
    if (!currentEvent) return;
    if (currentEvent.eventNumber === prevEventNumRef.current) return;
    prevEventNumRef.current = currentEvent.eventNumber;
    triggerReaction(currentEvent.commentary.crowdReaction, currentEvent.commentary.excitement);
  }, [currentEvent?.eventNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger broadcaster narration with delay to sync with play animation
  const broadcasterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentEvent) return;
    if (broadcasterTimerRef.current) clearTimeout(broadcasterTimerRef.current);
    broadcasterTimerRef.current = setTimeout(() => {
      speakPlay(currentEvent);
    }, 1100);
    return () => {
      if (broadcasterTimerRef.current) clearTimeout(broadcasterTimerRef.current);
    };
  }, [currentEvent?.eventNumber, speakPlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build live box score progressively from events
  const liveBoxScore = useMemo(() => buildLiveBoxScore(events), [events]);
  // Use final boxScore from stream (game_over) if available, otherwise live
  const activeBoxScore = boxScore ?? liveBoxScore;

  // Dynamic browser tab: team logos + score
  const tabStatusText = useMemo(() => {
    if (status === 'game_over') return 'FINAL';
    if (status === 'intermission') return 'INTERMISSION';
    if (!gameState) return 'LIVE';
    if (gameState.isHalftime) return 'HALFTIME';
    const q = gameState.quarter === 'OT' ? 'OT' : `Q${gameState.quarter}`;
    const mins = Math.floor(gameState.clock / 60);
    const secs = gameState.clock % 60;
    return `${q} ${mins}:${secs.toString().padStart(2, '0')}`;
  }, [status, gameState?.quarter, gameState?.clock, gameState?.isHalftime]);

  useDynamicTab(
    gameState
      ? {
          awayAbbrev: gameState.awayTeam.abbreviation,
          homeAbbrev: gameState.homeTeam.abbreviation,
          awayScore: gameState.awayScore,
          homeScore: gameState.homeScore,
          statusText: tabStatusText,
        }
      : null
  );

  // Derive driveStartPosition from events
  const driveStartPosition = useMemo(() => {
    if (events.length === 0 || !gameState) return gameState?.ballPosition ?? 25;
    const currentDrive = events[events.length - 1].driveNumber;
    // Find first event of this drive — the ball position is post-play,
    // so the drive started at the previous drive's end position or kickoff
    for (let i = 0; i < events.length; i++) {
      if (events[i].driveNumber === currentDrive) {
        if (i === 0) return events[0].gameState.ballPosition;
        // Previous event's ball position is where this drive started
        return events[i - 1].gameState.ballPosition;
      }
    }
    return gameState.ballPosition;
  }, [events, gameState]);

  // Detect halftime: current quarter is 3 but the last event is still from Q2
  // or the engine set isHalftime. Show halftime report for 45 seconds.
  const [showHalftime, setShowHalftime] = useState(false);
  const halftimeShownRef = useRef(false);

  useEffect(() => {
    if (!currentEvent || !gameState || halftimeShownRef.current) return;

    // Detect halftime transition: previous event was Q2, current state is Q3
    const isHalftimeNow =
      gameState.quarter === 3 &&
      events.length >= 2 &&
      events[events.length - 2]?.gameState.quarter === 2;

    if (isHalftimeNow) {
      halftimeShownRef.current = true;
      setShowHalftime(true);
      // Auto-dismiss after 18 seconds (halftime is 20s total, leave 2s buffer)
      const timer = setTimeout(() => setShowHalftime(false), 18_000);
      return () => clearTimeout(timer);
    }
  }, [currentEvent?.eventNumber, gameState?.quarter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delay commentary so text appears during play development, not at pre-snap.
  // Non-play events (kickoff, coin_toss, touchback, pregame) skip the delay.
  const [delayedCommentary, setDelayedCommentary] = useState<{
    playByPlay: string;
    crowdReaction: import('@/lib/simulation/types').CrowdReaction;
    excitement: number;
  } | null>(null);

  useEffect(() => {
    if (!currentEvent) {
      setDelayedCommentary(null);
      return;
    }

    const skipDelay = ['pregame', 'coin_toss', 'touchback', 'kickoff', 'kickoff_return'].includes(
      currentEvent.playResult.type
    );

    if (skipDelay) {
      setDelayedCommentary({
        playByPlay: currentEvent.commentary.playByPlay,
        crowdReaction: currentEvent.commentary.crowdReaction,
        excitement: currentEvent.commentary.excitement,
      });
      return;
    }

    // Clear immediately, then reveal after 1100ms (during DEVELOPMENT phase)
    setDelayedCommentary(null);
    const timer = setTimeout(() => {
      setDelayedCommentary({
        playByPlay: currentEvent.commentary.playByPlay,
        crowdReaction: currentEvent.commentary.crowdReaction,
        excitement: currentEvent.commentary.excitement,
      });
    }, 1100);
    return () => clearTimeout(timer);
  }, [currentEvent?.eventNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect quarter breaks: Q1→Q2 and Q3→Q4 transitions
  const [showQuarterBreak, setShowQuarterBreak] = useState(false);
  const [quarterBreakNumber, setQuarterBreakNumber] = useState<1 | 3>(1);
  const quarterBreaksShownRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!currentEvent || !gameState || events.length < 2) return;

    const prevQuarter = events[events.length - 2]?.gameState.quarter;
    const curQuarter = gameState.quarter;

    // Q1→Q2 transition
    if (curQuarter === 2 && prevQuarter === 1 && !quarterBreaksShownRef.current.has(1)) {
      quarterBreaksShownRef.current.add(1);
      setQuarterBreakNumber(1);
      setShowQuarterBreak(true);
      const timer = setTimeout(() => setShowQuarterBreak(false), 10_000);
      return () => clearTimeout(timer);
    }

    // Q3→Q4 transition
    if (curQuarter === 4 && prevQuarter === 3 && !quarterBreaksShownRef.current.has(3)) {
      quarterBreaksShownRef.current.add(3);
      setQuarterBreakNumber(3);
      setShowQuarterBreak(true);
      const timer = setTimeout(() => setShowQuarterBreak(false), 10_000);
      return () => clearTimeout(timer);
    }
  }, [currentEvent?.eventNumber, gameState?.quarter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connecting / Error state ──────────────────────────────

  if (status === 'connecting') {
    return <ConnectingScreen />;
  }

  if (status === 'error' && !gameState) {
    return (
      <ErrorScreen
        message={error ?? 'Failed to connect to game stream.'}
        onRetry={reconnect}
      />
    );
  }

  // ── Game Over state ───────────────────────────────────────
  // Check game_over BEFORE intermission — defense-in-depth so the user
  // always sees the game-over summary even if status slips to intermission.

  if ((status === 'game_over' || (status === 'intermission' && finalScore)) && gameState) {
    return (
      <GameOverWithRedirect
        gameState={gameState}
        finalScore={finalScore}
        boxScore={boxScore}
        mvp={mvp}
        nextGameId={nextGameId}
        intermissionMessage={intermissionMessage}
        intermissionCountdown={intermissionCountdown}
      />
    );
  }

  // ── Intermission state ────────────────────────────────────

  if (status === 'intermission') {
    return (
      <IntermissionScreen
        message={intermissionMessage}
        initialCountdown={intermissionCountdown}
        nextGameId={nextGameId}
      />
    );
  }

  // ── Live / Catchup state ──────────────────────────────────

  if (!gameState) {
    return <ConnectingScreen />;
  }

  const firstDownLine = gameState.ballPosition + gameState.yardsToGo;
  const isLive = status === 'live';
  const isCatchup = status === 'catchup';

  return (
    <div className="min-h-dvh flex flex-col lg:h-dvh lg:overflow-hidden">
      {/* ── Top: Nav + ScoreBug (full width) ── */}
      <div className="flex-shrink-0">
        <GameNav
          isMuted={isMuted}
          onToggleAudio={toggleAudio}
          isBroadcasterMuted={isBroadcasterMuted}
          onToggleBroadcaster={toggleBroadcaster}
          broadcasterVoice={broadcasterVoice}
          onCycleBroadcasterVoice={cycleBroadcasterVoice}
        />
        <ScoreBug
          gameState={gameState}
          status={status === 'game_over' ? 'game_over' : 'live'}
        />

        {/* Banners */}
        {isCatchup && (
          <div className="bg-info/10 border-b border-info/20 px-3 py-0.5 text-center">
            <span className="text-[10px] text-info font-semibold">
              Catching up to live...
            </span>
          </div>
        )}
        {error && status !== 'error' && (
          <div className="bg-danger/10 border-b border-danger/20 px-3 py-0.5 flex items-center justify-between">
            <span className="text-[10px] text-danger font-medium">{error}</span>
            <button onClick={reconnect} className="text-[10px] text-danger font-bold underline">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Main content: scrollable on mobile, locked grid on desktop ── */}
      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-5">
        {/* ═══ Left: Field + info strips (3/5 on desktop, full on mobile) ═══ */}
        <div className="flex flex-col lg:col-span-3 lg:min-h-0">
          {/* Field — fixed aspect on mobile so it's always visible */}
          <div className="h-[180px] sm:h-[220px] lg:flex-1 lg:h-auto lg:min-h-0 lg:max-h-[45%] relative">
            <JumbotronOverlay />
            <FieldVisual
              ballPosition={gameState.ballPosition}
              firstDownLine={firstDownLine}
              possession={gameState.possession}
              homeTeam={{
                abbreviation: gameState.homeTeam.abbreviation,
                primaryColor: gameState.homeTeam.primaryColor,
                secondaryColor: gameState.homeTeam.secondaryColor,
              }}
              awayTeam={{
                abbreviation: gameState.awayTeam.abbreviation,
                primaryColor: gameState.awayTeam.primaryColor,
                secondaryColor: gameState.awayTeam.secondaryColor,
              }}
              down={gameState.down}
              yardsToGo={gameState.yardsToGo}
              quarter={gameState.quarter}
              clock={gameState.clock}
              lastPlay={currentEvent?.playResult ?? null}
              isKickoff={gameState.kickoff}
              isPatAttempt={gameState.patAttempt}
              gameStatus={status === 'game_over' ? 'game_over' : gameState.isHalftime ? 'halftime' : 'live'}
              driveStartPosition={driveStartPosition}
              narrativeContext={currentEvent?.narrativeContext ?? null}
              commentary={delayedCommentary}
            />
          </div>

          {/* Info strips below field */}
          <div className="flex-shrink-0 border-t border-white/[0.06]">
            <PossessionStrip gameState={gameState} />

            <MomentumMeter
              momentum={momentum}
              homeColor={gameState.homeTeam.primaryColor}
              awayColor={gameState.awayTeam.primaryColor}
              homeAbbrev={gameState.homeTeam.abbreviation}
              awayAbbrev={gameState.awayTeam.abbreviation}
            />

            {currentEvent && (
              <CrowdEnergy
                excitement={currentEvent.commentary.excitement}
                crowdReaction={currentEvent.commentary.crowdReaction}
                compact
              />
            )}

            {!gameState.kickoff && !gameState.patAttempt && currentEvent && (
              <DriveTracker
                startPosition={driveStartPosition}
                currentPosition={gameState.ballPosition}
                plays={events.filter(e => e.driveNumber === currentEvent.driveNumber).length}
                yards={gameState.ballPosition - driveStartPosition}
                timeElapsed={0}
                teamColor={(gameState.possession === 'home' ? gameState.homeTeam : gameState.awayTeam).primaryColor}
                firstDownLine={firstDownLine}
                compact
              />
            )}
          </div>
        </div>

        {/* ═══ Right: Sidebar (2/5 on desktop, below field on mobile) ═══ */}
        <div className="lg:col-span-2 flex flex-col lg:min-h-0 border-l border-white/[0.06]">
          {/* Live commentary */}
          <div className="flex-shrink-0">
            <LiveCommentary event={currentEvent} />
          </div>

          {/* Between-play insights — rotates through contextual info */}
          <div className="flex-shrink-0">
            <BetweenPlayInsight
              gameState={gameState}
              events={events}
              currentEvent={currentEvent}
              activeBoxScore={activeBoxScore}
            />
          </div>

          {/* Narrative tags */}
          {currentEvent?.narrativeContext && (
            <div className="flex-shrink-0">
              <NarrativeBar narrative={currentEvent.narrativeContext} />
            </div>
          )}

          {/* Box Score — always visible */}
          <div className="flex-shrink-0 border-t border-white/[0.06]">
            <BoxScore
              boxScore={activeBoxScore}
              homeTeam={gameState.homeTeam}
              awayTeam={gameState.awayTeam}
            />
          </div>

          {/* Play Feed — scrollable on both mobile and desktop */}
          <div className="min-h-[300px] lg:flex-1 lg:min-h-0 overflow-y-auto border-t border-white/[0.06]">
            <PlayFeed events={events} isLive={isLive} />
          </div>
        </div>
      </div>

      {/* ── Halftime report overlay ── */}
      {showHalftime && activeBoxScore && (
        <HalftimeReport
          boxScore={activeBoxScore}
          homeTeam={gameState.homeTeam}
          awayTeam={gameState.awayTeam}
          homeScore={gameState.homeScore}
          awayScore={gameState.awayScore}
          onDismiss={() => setShowHalftime(false)}
        />
      )}

      {/* ── Quarter break overlay ── */}
      {showQuarterBreak && activeBoxScore && (
        <QuarterBreakOverlay
          quarter={quarterBreakNumber}
          homeTeam={gameState.homeTeam}
          awayTeam={gameState.awayTeam}
          homeScore={gameState.homeScore}
          awayScore={gameState.awayScore}
          boxScore={activeBoxScore}
          onDismiss={() => setShowQuarterBreak(false)}
        />
      )}
    </div>
  );
}

// ── Game Navigation Bar ──────────────────────────────────────

function GameNav({
  isMuted,
  onToggleAudio,
  isBroadcasterMuted,
  onToggleBroadcaster,
  broadcasterVoice,
  onCycleBroadcasterVoice,
}: {
  isMuted?: boolean;
  onToggleAudio?: () => void;
  isBroadcasterMuted?: boolean;
  onToggleBroadcaster?: () => void;
  broadcasterVoice?: 'male' | 'female';
  onCycleBroadcasterVoice?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 scorebug-glass border-b border-white/[0.06] flex-shrink-0">
      <Link
        href="/"
        className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
      >
        {'\u2190'} Home
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">
          Live Broadcast
        </span>
        {onToggleBroadcaster && (
          <button
            onClick={onToggleBroadcaster}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200"
            style={{
              background: isBroadcasterMuted ? 'rgba(17, 24, 39, 0.7)' : 'rgba(212, 175, 55, 0.15)',
              border: isBroadcasterMuted ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(212, 175, 55, 0.3)',
            }}
            title={isBroadcasterMuted ? 'Enable broadcaster narration' : 'Disable broadcaster narration'}
            aria-label={isBroadcasterMuted ? 'Enable broadcaster narration' : 'Disable broadcaster narration'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isBroadcasterMuted ? '#64748b' : '#d4af37'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isBroadcasterMuted ? (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}
        {onCycleBroadcasterVoice && !isBroadcasterMuted && (
          <button
            onClick={onCycleBroadcasterVoice}
            className="h-7 px-1.5 rounded-md flex items-center justify-center gap-1 transition-all duration-200"
            style={{
              background: 'rgba(212, 175, 55, 0.10)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
            }}
            title={`Switch to ${broadcasterVoice === 'male' ? 'female' : 'male'} broadcaster`}
            aria-label={`Switch to ${broadcasterVoice === 'male' ? 'female' : 'male'} broadcaster`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {broadcasterVoice === 'male' ? (
                <>
                  {/* Male silhouette */}
                  <circle cx="12" cy="7" r="4" />
                  <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
                </>
              ) : (
                <>
                  {/* Female silhouette */}
                  <circle cx="12" cy="7" r="4" />
                  <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
                  <path d="M8 7c0-3 1.5-5 4-5s4 2 4 5" />
                </>
              )}
            </svg>
            <span className="text-[9px] font-bold text-gold uppercase tracking-wide">
              {broadcasterVoice === 'male' ? 'M' : 'F'}
            </span>
          </button>
        )}
        {onToggleAudio && (
          <button
            onClick={onToggleAudio}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200"
            style={{
              background: isMuted ? 'rgba(17, 24, 39, 0.7)' : 'rgba(212, 175, 55, 0.15)',
              border: isMuted ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(212, 175, 55, 0.3)',
            }}
            title={isMuted ? 'Unmute crowd audio' : 'Mute crowd audio'}
            aria-label={isMuted ? 'Unmute crowd audio' : 'Mute crowd audio'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isMuted ? '#64748b' : '#d4af37'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMuted ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
      <Link
        href="/schedule"
        className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
      >
        Schedule
      </Link>
    </div>
  );
}

// ── Possession Strip ──────────────────────────────────────────

function PossessionStrip({ gameState }: { gameState: GameState }) {
  const team = gameState.possession === 'home' ? gameState.homeTeam : gameState.awayTeam;
  const { down, yardsToGo, ballPosition, kickoff, patAttempt, isHalftime } = gameState;

  if (isHalftime) return null;

  let situation = '';
  if (kickoff) {
    situation = 'KICKOFF';
  } else if (patAttempt) {
    situation = 'EXTRA POINT';
  } else {
    const suffix = down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th';
    situation = `${down}${suffix} & ${yardsToGo}`;
  }

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06]"
      style={{ backgroundColor: `${team.primaryColor}15`, borderLeftWidth: '3px', borderLeftColor: team.primaryColor }}
    >
      <div className="flex items-center gap-2">
        <img
          src={getTeamLogoUrl(team.abbreviation)}
          alt=""
          className="w-5 h-5 object-contain"
        />
        <span className="text-xs font-black" style={{ color: team.primaryColor }}>
          {team.abbreviation}
        </span>
        <span className="text-[10px] font-bold text-text-muted">has the ball</span>
      </div>
      <span className="text-xs font-black text-text-primary tracking-wide">
        {situation}
      </span>
    </div>
  );
}

// ── Live Commentary (compact, below field) ───────────────────

function LiveCommentary({
  event,
}: {
  event: import('@/lib/simulation/types').GameEvent | null;
}) {
  if (!event) {
    return (
      <div className="px-3 py-1.5 border-t border-white/[0.06] text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span className="text-[11px] text-text-secondary font-medium">
            Broadcast starting shortly...
          </span>
        </div>
      </div>
    );
  }

  const { playResult, commentary } = event;

  if (playResult.type === 'pregame' || playResult.type === 'coin_toss') {
    return (
      <div className="px-3 py-1.5 border-t border-white/[0.06] text-center">
        <p className="text-[11px] text-text-secondary leading-snug line-clamp-1">
          {commentary.playByPlay}
        </p>
      </div>
    );
  }

  // Badge for big plays
  let badge: string | null = null;
  let badgeColor = '';
  if (playResult.isTouchdown) { badge = 'TD'; badgeColor = '#fbbf24'; }
  else if (playResult.turnover) { badge = 'TO'; badgeColor = '#ef4444'; }
  else if (playResult.type === 'sack') { badge = 'SACK'; badgeColor = '#f97316'; }
  else if (playResult.yardsGained >= 15) { badge = 'BIG'; badgeColor = '#22c55e'; }

  // Show color analysis here (play-by-play is on the field overlay)
  // Fall back to play-by-play if no color analysis
  const text = commentary.colorAnalysis || commentary.playByPlay;

  return (
    <div className="px-3 py-1.5 border-t border-white/[0.06]">
      <div className="flex items-start gap-2">
        {badge && (
          <span
            className="text-[7px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-px"
            style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
          >
            {badge}
          </span>
        )}
        <p className="text-[11px] text-text-secondary leading-snug line-clamp-2 italic">
          {text}
        </p>
      </div>
    </div>
  );
}

// ── Between-Play Insight (rotates contextual info) ───────────

function BetweenPlayInsight({
  gameState,
  events,
  currentEvent,
  activeBoxScore,
}: {
  gameState: GameState;
  events: import('@/lib/simulation/types').GameEvent[];
  currentEvent: import('@/lib/simulation/types').GameEvent | null;
  activeBoxScore: import('@/lib/simulation/types').BoxScore | null;
}) {
  const [insightIndex, setInsightIndex] = useState(0);

  // Rotate through insights every 4 seconds
  const insights = useMemo(() => {
    const items: string[] = [];

    // Drive summary
    if (currentEvent && !gameState.kickoff && !gameState.patAttempt) {
      const driveEvents = events.filter(e => e.driveNumber === currentEvent.driveNumber);
      const driveYards = gameState.ballPosition -
        (driveEvents.length > 0 ? driveEvents[0].gameState.ballPosition : gameState.ballPosition);
      if (driveEvents.length > 0) {
        items.push(`Drive: ${driveEvents.length} play${driveEvents.length !== 1 ? 's' : ''}, ${Math.abs(driveYards)} yards`);
      }
    }

    // Stat comparison
    if (activeBoxScore) {
      const { homeStats, awayStats } = activeBoxScore;
      items.push(`Total yards: ${gameState.awayTeam.abbreviation} ${awayStats.totalYards} - ${gameState.homeTeam.abbreviation} ${homeStats.totalYards}`);
      if (homeStats.turnovers + awayStats.turnovers > 0) {
        items.push(`Turnovers: ${gameState.awayTeam.abbreviation} ${awayStats.turnovers} - ${gameState.homeTeam.abbreviation} ${homeStats.turnovers}`);
      }
    }

    // Narrative tags
    if (currentEvent?.narrativeContext) {
      const nc = currentEvent.narrativeContext;
      if (nc.isComebackBrewing) items.push('A comeback is brewing...');
      if (nc.isClutchMoment) items.push('Clutch moment!');
      if (nc.isBlowout) items.push('This one is getting out of hand');
      if (nc.isDominatingPerformance) {
        items.push(`${nc.isDominatingPerformance.player.name} is dominating`);
      }
    }

    // Situation context
    if (gameState.ballPosition >= 80 && !gameState.kickoff && !gameState.patAttempt) {
      items.push('Red zone opportunity');
    }
    const q = gameState.quarter;
    if (typeof q === 'number' && q === 4 && gameState.clock <= 120) {
      items.push('Two-minute warning approaching');
    }
    if (q === 'OT') {
      items.push('Overtime — next score could win it');
    }

    // Scoring margin
    const diff = Math.abs(gameState.homeScore - gameState.awayScore);
    if (diff === 0 && events.length > 10) {
      items.push('Tied game — every play matters');
    } else if (diff <= 3 && typeof q === 'number' && q >= 4) {
      items.push('One score game in the 4th quarter');
    }

    return items.length > 0 ? items : ['Game in progress...'];
  }, [gameState, events, currentEvent, activeBoxScore]);

  useEffect(() => {
    if (insights.length <= 1) return;
    const timer = setInterval(() => {
      setInsightIndex(prev => (prev + 1) % insights.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [insights.length]);

  // Reset index when insights change
  useEffect(() => {
    setInsightIndex(0);
  }, [insights.length]);

  const currentInsight = insights[insightIndex % insights.length];

  return (
    <div className="px-3 py-1.5 border-t border-white/[0.06]">
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-gold/50 flex-shrink-0" />
        <p
          className="text-[10px] text-text-muted font-medium truncate transition-opacity duration-300"
          key={currentInsight}
        >
          {currentInsight}
        </p>
        {insights.length > 1 && (
          <span className="text-[8px] text-text-muted/50 flex-shrink-0 tabular-nums">
            {(insightIndex % insights.length) + 1}/{insights.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Narrative Context Bar ─────────────────────────────────────

function NarrativeBar({
  narrative,
}: {
  narrative: NarrativeSnapshot;
}) {
  const threads = narrative.activeThreads;
  if (threads.length === 0 && !narrative.isComebackBrewing && !narrative.isClutchMoment) {
    return null;
  }

  const tags: string[] = [];

  if (narrative.isClutchMoment) tags.push('CLUTCH TIME');
  if (narrative.isComebackBrewing) tags.push('COMEBACK ALERT');
  if (narrative.isBlowout) tags.push('BLOWOUT');
  if (narrative.isDominatingPerformance) {
    tags.push(`${narrative.isDominatingPerformance.player.name} DOMINATING`);
  }

  // Add thread-based tags
  threads.forEach((thread) => {
    if (thread.intensity > 50) {
      switch (thread.type) {
        case 'hot_streak':
          tags.push('HOT STREAK');
          break;
        case 'defensive_dominance':
          tags.push('DEFENSIVE DOMINANCE');
          break;
        case 'shootout':
          tags.push('SHOOTOUT');
          break;
        case 'comeback':
          tags.push('COMEBACK');
          break;
        case 'defensive_battle':
          tags.push('DEFENSIVE BATTLE');
          break;
        case 'rivalry_moment':
          tags.push('RIVALRY');
          break;
        case 'record_chase':
          tags.push('RECORD WATCH');
          break;
        case 'rookie_spotlight':
          tags.push('ROOKIE SPOTLIGHT');
          break;
      }
    }
  });

  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto border-b border-border/50">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20 whitespace-nowrap flex-shrink-0"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// ── Quarter Break Overlay ────────────────────────────────────

function QuarterBreakOverlay({
  quarter,
  homeTeam: home,
  awayTeam: away,
  homeScore,
  awayScore,
  boxScore: qtrBox,
  onDismiss,
}: {
  quarter: 1 | 3;
  homeTeam: import('@/lib/simulation/types').Team;
  awayTeam: import('@/lib/simulation/types').Team;
  homeScore: number;
  awayScore: number;
  boxScore: import('@/lib/simulation/types').BoxScore;
  onDismiss: () => void;
}) {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onDismiss]);

  const label = quarter === 1 ? '1ST' : '3RD';

  return (
    <div className="px-3 py-3 border-b border-white/10 bg-gradient-to-b from-surface-elevated/95 to-surface/90 backdrop-blur-sm">
      <div className="max-w-lg mx-auto space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/5 text-text-secondary border border-white/10">
            END OF {label} QUARTER
          </span>
          <button
            onClick={onDismiss}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Resuming in {countdown}s
          </button>
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-4 py-0.5">
          <div className="text-center">
            <span className="text-xs text-text-muted">{away.abbreviation}</span>
            <p className="text-lg font-black tabular-nums">{awayScore}</p>
          </div>
          <span className="text-xs text-text-muted font-bold">—</span>
          <div className="text-center">
            <span className="text-xs text-text-muted">{home.abbreviation}</span>
            <p className="text-lg font-black tabular-nums">{homeScore}</p>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
          <div>
            <span className="text-text-muted block">Total Yards</span>
            <span className="font-bold">{qtrBox.awayStats.totalYards}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="font-bold">{qtrBox.homeStats.totalYards}</span>
          </div>
          <div>
            <span className="text-text-muted block">Turnovers</span>
            <span className="font-bold">{qtrBox.awayStats.turnovers}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="font-bold">{qtrBox.homeStats.turnovers}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Intermission Screen ──────────────────────────────────────

function IntermissionScreen({
  message,
  initialCountdown,
  nextGameId,
}: {
  message: string | null;
  initialCountdown: number;
  nextGameId: string | null;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(initialCountdown);

  // Parse team abbreviations from message like "Up next: SF @ ARI"
  const matchup = useMemo(() => {
    if (!message) return null;
    const match = message.match(/Up next:\s*(\w+)\s*@\s*(\w+)/i);
    if (!match) return null;
    return { away: match[1], home: match[2] };
  }, [message]);

  // Live countdown timer that decrements every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-navigate to home when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      const timer = setTimeout(() => {
        router.push('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [countdown, router]);

  return (
    <div className="min-h-dvh flex flex-col">
      <GameNav />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-5">
          <Badge variant="default" size="md">
            INTERMISSION
          </Badge>

          {/* Team logos + matchup */}
          {matchup ? (
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center">
                <img
                  src={getTeamLogoUrl(matchup.away)}
                  alt={matchup.away}
                  className="w-16 h-16 object-contain drop-shadow-lg"
                />
                <span className="text-sm font-bold mt-1.5">{matchup.away}</span>
              </div>
              <span className="text-xl font-black text-text-muted">@</span>
              <div className="flex flex-col items-center">
                <img
                  src={getTeamLogoUrl(matchup.home)}
                  alt={matchup.home}
                  className="w-16 h-16 object-contain drop-shadow-lg"
                />
                <span className="text-sm font-bold mt-1.5">{matchup.home}</span>
              </div>
            </div>
          ) : message ? (
            <p className="text-sm text-text-secondary">{message}</p>
          ) : null}

          {countdown > 0 ? (
            <div className="font-mono text-3xl font-black text-gold tabular-nums">
              {Math.floor(countdown / 60)}:
              {(countdown % 60).toString().padStart(2, '0')}
            </div>
          ) : nextGameId ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
                </span>
                <span className="text-sm font-bold text-gold">Starting soon...</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Next week kicks off soon.</p>
          )}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold text-midnight font-bold text-sm rounded-full hover:bg-gold-bright transition-colors shadow-lg shadow-gold/20"
          >
            GO HOME
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Halftime Report ──────────────────────────────────────────

function HalftimeReport({
  boxScore: halftimeBox,
  homeTeam: home,
  awayTeam: away,
  homeScore,
  awayScore,
  onDismiss,
}: {
  boxScore: import('@/lib/simulation/types').BoxScore;
  homeTeam: import('@/lib/simulation/types').Team;
  awayTeam: import('@/lib/simulation/types').Team;
  homeScore: number;
  awayScore: number;
  onDismiss: () => void;
}) {
  const [countdown, setCountdown] = useState(18);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onDismiss]);

  // Find top performers
  const allPlayers = [...halftimeBox.homePlayerStats, ...halftimeBox.awayPlayerStats];
  const topPasser = allPlayers.filter(p => p.attempts > 0).sort((a, b) => b.passingYards - a.passingYards)[0];
  const topRusher = allPlayers.filter(p => p.carries > 0).sort((a, b) => b.rushingYards - a.rushingYards)[0];
  const topReceiver = allPlayers.filter(p => p.receptions > 0).sort((a, b) => b.receivingYards - a.receivingYards)[0];

  return (
    <div className="px-3 py-4 border-b border-gold/20 bg-gradient-to-b from-gold/5 to-transparent">
      <div className="max-w-lg mx-auto space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20">
              HALFTIME
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            2nd half in {countdown}s
          </button>
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-4 py-1">
          <div className="text-center">
            <span className="text-xs text-text-muted">{away.abbreviation}</span>
            <p className="text-xl font-black tabular-nums">{awayScore}</p>
          </div>
          <span className="text-xs text-text-muted font-bold">—</span>
          <div className="text-center">
            <span className="text-xs text-text-muted">{home.abbreviation}</span>
            <p className="text-xl font-black tabular-nums">{homeScore}</p>
          </div>
        </div>

        {/* Key stats comparison */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div>
            <span className="text-text-muted block">Total Yards</span>
            <span className="font-bold">{halftimeBox.awayStats.totalYards}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="font-bold">{halftimeBox.homeStats.totalYards}</span>
          </div>
          <div>
            <span className="text-text-muted block">Turnovers</span>
            <span className="font-bold">{halftimeBox.awayStats.turnovers}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="font-bold">{halftimeBox.homeStats.turnovers}</span>
          </div>
          <div>
            <span className="text-text-muted block">1st Downs</span>
            <span className="font-bold">{halftimeBox.awayStats.firstDowns}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="font-bold">{halftimeBox.homeStats.firstDowns}</span>
          </div>
        </div>

        {/* Top performers */}
        <div className="space-y-1">
          <span className="text-[9px] font-black tracking-widest uppercase text-text-muted">Top Performers</span>
          <div className="grid grid-cols-1 gap-0.5 text-[11px]">
            {topPasser && topPasser.passingYards > 0 && (
              <div className="flex justify-between">
                <span className="text-text-secondary">{topPasser.player.name}</span>
                <span className="font-mono font-bold tabular-nums">
                  {topPasser.completions}/{topPasser.attempts}, {topPasser.passingYards} yds{topPasser.passingTDs > 0 ? `, ${topPasser.passingTDs} TD` : ''}
                </span>
              </div>
            )}
            {topRusher && topRusher.rushingYards > 0 && (
              <div className="flex justify-between">
                <span className="text-text-secondary">{topRusher.player.name}</span>
                <span className="font-mono font-bold tabular-nums">
                  {topRusher.carries} car, {topRusher.rushingYards} yds{topRusher.rushingTDs > 0 ? `, ${topRusher.rushingTDs} TD` : ''}
                </span>
              </div>
            )}
            {topReceiver && topReceiver.receivingYards > 0 && (
              <div className="flex justify-between">
                <span className="text-text-secondary">{topReceiver.player.name}</span>
                <span className="font-mono font-bold tabular-nums">
                  {topReceiver.receptions} rec, {topReceiver.receivingYards} yds{topReceiver.receivingTDs > 0 ? `, ${topReceiver.receivingTDs} TD` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Game Over with Auto-Redirect ──────────────────────────────

function GameOverWithRedirect({
  gameState,
  finalScore,
  boxScore: gameOverBoxScore,
  mvp: gameOverMvp,
  nextGameId: upNextGameId,
  intermissionMessage: upNextMessage,
  intermissionCountdown: upNextCountdown,
}: {
  gameState: import('@/lib/simulation/types').GameState;
  finalScore: { home: number; away: number } | null;
  boxScore: import('@/lib/simulation/types').BoxScore | null;
  mvp: import('@/lib/simulation/types').PlayerGameStats | null;
  nextGameId?: string | null;
  intermissionMessage?: string | null;
  intermissionCountdown?: number;
}) {
  const router = useRouter();
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const minDisplayRef = useRef(false);

  // Minimum display time of 15s before we allow redirect
  useEffect(() => {
    const timer = setTimeout(() => {
      minDisplayRef.current = true;
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  // Poll /api/game/current every 10s. Redirect when the game is confirmed completed
  // and we've shown the summary for at least 15s.
  useEffect(() => {
    let cancelled = false;
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/game/current');
        if (!res.ok) return;
        const data = await res.json();
        // If there's no current live game, the game is officially completed
        if (!data.currentGame && minDisplayRef.current) {
          // Start a visible 5s countdown before redirect
          setRedirectCountdown(5);
        }
      } catch {
        // Ignore polling errors
      }
    }, 10000);

    // Fallback: redirect after 60s regardless (prevents stuck state)
    const fallback = setTimeout(() => {
      if (!cancelled) setRedirectCountdown(5);
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearTimeout(fallback);
    };
  }, []);

  // Visible countdown → redirect
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      router.push('/');
      return;
    }
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  // Parse team abbreviations from "Up next: SF @ ARI" style message
  const upNextMatchup = useMemo(() => {
    if (!upNextMessage) return null;
    const match = upNextMessage.match(/Up next:\s*(\w+)\s*@\s*(\w+)/i);
    if (!match) return null;
    return { away: match[1], home: match[2] };
  }, [upNextMessage]);

  return (
    <div className="min-h-dvh">
      <GameNav />
      <GameOverSummary
        homeTeam={gameState.homeTeam}
        awayTeam={gameState.awayTeam}
        finalScore={finalScore ?? { home: gameState.homeScore, away: gameState.awayScore }}
        boxScore={gameOverBoxScore}
        mvp={gameOverMvp}
        nextGameCountdown={0}
      />

      {/* Up Next section when intermission data is available */}
      {upNextGameId && upNextMatchup && (
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <Link href={`/game/${upNextGameId}`}>
            <div className="glass-card rounded-xl p-4 text-center hover:border-gold/30 transition-colors cursor-pointer">
              <span className="text-[9px] font-black tracking-widest uppercase text-gold">UP NEXT</span>
              <div className="flex items-center justify-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <img src={getTeamLogoUrl(upNextMatchup.away)} alt={upNextMatchup.away} className="w-8 h-8 object-contain" />
                  <span className="text-sm font-bold">{upNextMatchup.away}</span>
                </div>
                <span className="text-xs text-text-muted font-bold">@</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{upNextMatchup.home}</span>
                  <img src={getTeamLogoUrl(upNextMatchup.home)} alt={upNextMatchup.home} className="w-8 h-8 object-contain" />
                </div>
              </div>
              {upNextCountdown != null && upNextCountdown > 0 && (
                <p className="text-xs text-text-muted mt-2">
                  Kickoff in {Math.floor(upNextCountdown / 60)}:{(upNextCountdown % 60).toString().padStart(2, '0')}
                </p>
              )}
            </div>
          </Link>
        </div>
      )}

      {redirectCountdown !== null && redirectCountdown > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="glass-card rounded-full px-5 py-2 text-sm text-text-secondary font-medium">
            Returning to lobby in {redirectCountdown}...
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading Screen ────────────────────────────────────────────

function ConnectingScreen() {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Field skeleton */}
      <div className="px-2 py-2">
        <Skeleton variant="rectangular" className="w-full h-[180px] sm:h-[220px] lg:h-[300px] rounded-xl" />
      </div>

      {/* Momentum skeleton */}
      <div className="px-3 py-1.5">
        <Skeleton variant="rectangular" className="w-full h-2 rounded-full" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 px-3 py-2 space-y-3">
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
            </div>
            <span className="text-sm text-text-muted font-medium">
              Connecting to broadcast...
            </span>
          </div>
        </div>

        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 p-3 rounded-lg bg-surface/30">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-2/3" />
          </div>
        ))}
      </div>

      {/* Scorebug skeleton */}
      <div className="fixed bottom-0 left-0 right-0 scorebug-glass safe-bottom">
        <div className="flex items-center h-[72px] px-4 gap-4 max-w-3xl mx-auto">
          <Skeleton variant="rectangular" className="w-14 h-6 rounded-full" />
          <Skeleton variant="rectangular" className="w-32 h-10" />
          <Skeleton variant="rectangular" className="w-20 h-10" />
          <Skeleton variant="rectangular" className="w-28 h-8" />
        </div>
      </div>
    </div>
  );
}

// ── Error Screen ──────────────────────────────────────────────

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center mx-auto">
          <span className="text-danger text-xl">!</span>
        </div>
        <h2 className="text-lg font-bold text-text-primary">Connection Error</h2>
        <p className="text-sm text-text-secondary">{message}</p>
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
