'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NarrativeSnapshot } from '@/lib/simulation/types';
import { useGameStream } from '@/hooks/use-game-stream';
import { useMomentum } from '@/hooks/use-momentum';
import { useCountdown } from '@/hooks/use-countdown';
import { useDynamicTab } from '@/hooks/use-dynamic-tab';
import { buildLiveBoxScore } from '@/lib/utils/live-box-score';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import { ScoreBug } from '@/components/game/scorebug';
import { PlayFeed } from '@/components/game/play-feed';
import { FieldVisual } from '@/components/game/field-visual';
import { MomentumMeter } from '@/components/game/momentum-meter';
import { BoxScore } from '@/components/game/box-score';
import { GameOverSummary } from '@/components/game/game-over-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

  // ── Game Over state ───────────────────────────────────────

  if (status === 'game_over' && gameState) {
    return (
      <div className="min-h-dvh">
        <GameNav />
        <GameOverSummary
          homeTeam={gameState.homeTeam}
          awayTeam={gameState.awayTeam}
          finalScore={finalScore ?? { home: gameState.homeScore, away: gameState.awayScore }}
          boxScore={boxScore}
          mvp={mvp}
          nextGameCountdown={0}
        />
        <NextGamePreview />
      </div>
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
    <div className="flex flex-col min-h-dvh">
      {/* ── Unified Layout (mobile + desktop) ── */}
      <div className="flex flex-col h-dvh">
        {/* Navigation bar */}
        <GameNav />

        {/* Scoreboard at top */}
        <ScoreBug
          gameState={gameState}
          status={status === 'game_over' ? 'game_over' : 'live'}
        />

        {/* Banners */}
        {isCatchup && (
          <div className="bg-info/10 border-b border-info/20 px-3 py-1 text-center flex-shrink-0">
            <span className="text-[11px] sm:text-xs text-info font-semibold">
              Catching up to live...
            </span>
          </div>
        )}
        {error && status !== 'error' && (
          <div className="bg-danger/10 border-b border-danger/20 px-3 py-1 flex items-center justify-between flex-shrink-0">
            <span className="text-[11px] text-danger font-medium">{error}</span>
            <button onClick={reconnect} className="text-[10px] text-danger font-bold underline">
              Retry
            </button>
          </div>
        )}

        {/* ── Above the fold: Field + Momentum + Latest Play ── */}
        <div className="flex-shrink-0">
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
          />

          <MomentumMeter
            momentum={momentum}
            homeColor={gameState.homeTeam.primaryColor}
            awayColor={gameState.awayTeam.primaryColor}
            homeAbbrev={gameState.homeTeam.abbreviation}
            awayAbbrev={gameState.awayTeam.abbreviation}
          />

          {/* Latest play commentary — always visible on screen */}
          <LatestPlayBanner event={currentEvent} isLive={isLive} />
        </div>

        {/* ── Below the fold: scrollable section ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Narrative context */}
          {currentEvent?.narrativeContext && (
            <NarrativeBar narrative={currentEvent.narrativeContext} />
          )}

          {/* Collapsible box score */}
          <BoxScoreDropdown
            boxScore={activeBoxScore}
            homeTeam={gameState.homeTeam}
            awayTeam={gameState.awayTeam}
          />

          {/* Full play history */}
          <PlayFeed events={events} isLive={isLive} />
        </div>
      </div>
    </div>
  );
}

// ── Game Navigation Bar ──────────────────────────────────────

function GameNav() {
  return (
    <div className="flex items-center justify-between px-4 py-2 scorebug-glass border-b border-white/[0.06] flex-shrink-0">
      <Link
        href="/"
        className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
      >
        {'\u2190'} Home
      </Link>
      <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">
        Live Broadcast
      </span>
      <Link
        href="/schedule"
        className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
      >
        Schedule
      </Link>
    </div>
  );
}

// ── Latest Play Banner (above the fold) ──────────────────────

function LatestPlayBanner({
  event,
  isLive,
}: {
  event: import('@/lib/simulation/types').GameEvent | null;
  isLive: boolean;
}) {
  if (!event) {
    return (
      <div className="px-3 py-3 text-center text-text-muted text-sm border-b border-border/30">
        Waiting for the first play...
      </div>
    );
  }

  const { playResult, commentary } = event;

  // Badge for big plays
  let badge: string | null = null;
  let badgeColor = '#2d3548';
  if (playResult.isTouchdown) { badge = 'TOUCHDOWN'; badgeColor = '#fbbf24'; }
  else if (playResult.turnover) { badge = 'TURNOVER'; badgeColor = '#ef4444'; }
  else if (playResult.scoring) { badge = 'SCORE'; badgeColor = '#60a5fa'; }
  else if (playResult.type === 'sack') { badge = 'SACK'; badgeColor = '#f97316'; }
  else if (playResult.yardsGained >= 15) { badge = 'BIG PLAY'; badgeColor = '#22c55e'; }

  return (
    <div
      className="px-3 py-2.5 border-b border-border/30"
      style={badge ? { borderLeftWidth: '3px', borderLeftColor: badgeColor } : undefined}
    >
      {/* Badge + yards */}
      <div className="flex items-center gap-2 mb-1">
        {badge && (
          <span
            className="text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
          >
            {badge}
          </span>
        )}
        {playResult.yardsGained !== 0 &&
          playResult.type !== 'kickoff' &&
          playResult.type !== 'punt' &&
          playResult.type !== 'extra_point' &&
          playResult.type !== 'field_goal' && (
            <span className={`text-xs font-mono font-bold tabular-nums ${
              playResult.yardsGained > 0 ? 'text-success' : 'text-danger'
            }`}>
              {playResult.yardsGained > 0 ? '+' : ''}{playResult.yardsGained} yds
            </span>
          )}
      </div>

      {/* Play-by-play */}
      <p className="text-[13px] sm:text-sm font-semibold text-text-primary leading-snug">
        {commentary.playByPlay}
      </p>

      {/* Color analysis */}
      {commentary.colorAnalysis && (
        <p className="text-xs italic text-text-secondary leading-snug mt-0.5 line-clamp-2">
          {commentary.colorAnalysis}
        </p>
      )}
    </div>
  );
}

// ── Collapsible Box Score Dropdown ────────────────────────────

function BoxScoreDropdown({
  boxScore: boxScoreData,
  homeTeam: home,
  awayTeam: away,
}: {
  boxScore: import('@/lib/simulation/types').BoxScore | null;
  homeTeam: import('@/lib/simulation/types').Team;
  awayTeam: import('@/lib/simulation/types').Team;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-hover/50 transition-colors"
      >
        <span className="text-[10px] font-black tracking-widest uppercase text-text-muted">
          Box Score
        </span>
        <svg
          className="w-4 h-4 text-text-muted transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: open ? '50vh' : '0px',
        }}
      >
        <div className="overflow-y-auto border-t border-border/30" style={{ maxHeight: '50vh' }}>
          <BoxScore
            boxScore={boxScoreData}
            homeTeam={home}
            awayTeam={away}
          />
        </div>
      </div>
    </div>
  );
}

// ── Next Game Preview (shown after game over) ───────────────

interface NextGameData {
  id: string;
  homeTeam: { abbreviation: string; name: string; city: string; mascot: string; primaryColor: string } | null;
  awayTeam: { abbreviation: string; name: string; city: string; mascot: string; primaryColor: string } | null;
  gameType: string;
  week: number;
}

function NextGamePreview() {
  const [nextGame, setNextGame] = useState<NextGameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdownTarget, setCountdownTarget] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchNext() {
      try {
        const res = await fetch('/api/game/current');
        const data = await res.json();
        if (cancelled) return;

        if (data.nextGame) {
          setNextGame(data.nextGame);
          // Use actual intermission timing from API if available
          if (data.intermission?.remainingSeconds) {
            setCountdownTarget(data.intermission.remainingSeconds);
          } else {
            setCountdownTarget(15 * 60);
          }
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Small delay before fetching — let game_over settle
    const timer = setTimeout(fetchNext, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const { formatted: countdown, isExpired } = useCountdown(countdownTarget, countdownTarget > 0);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="glass-card rounded-2xl p-6 text-center">
          <div className="w-6 h-6 rounded-full border-2 border-gold/30 border-t-gold animate-spin mx-auto" />
          <p className="text-xs text-text-muted mt-2">Finding next game...</p>
        </div>
      </div>
    );
  }

  if (!nextGame) {
    return (
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-xs text-text-muted tracking-wider uppercase font-bold mb-2">
            Week Complete
          </p>
          <p className="text-sm text-text-secondary">
            All games this week have been played. Next week kicks off soon.
          </p>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 mt-4 px-5 py-2 text-sm font-medium text-gold hover:text-gold-bright transition-colors border border-gold/20 rounded-full"
          >
            View Standings {'\u2192'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 mt-4 pb-6">
      <div className="glass-card rounded-2xl p-6">
        {/* Countdown */}
        <div className="text-center mb-5">
          <p className="text-[10px] text-text-muted tracking-wider uppercase font-bold mb-1">
            Next Game
          </p>
          {!isExpired ? (
            <div className="font-mono text-2xl font-black text-gold tabular-nums">
              {countdown}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
              </span>
              <span className="text-sm font-bold text-gold">Starting soon...</span>
            </div>
          )}
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-center gap-5">
          {/* Away team */}
          <div className="flex flex-col items-center text-center">
            <img
              src={getTeamLogoUrl(nextGame.awayTeam?.abbreviation ?? '???')}
              alt={nextGame.awayTeam?.name ?? ''}
              className="w-14 h-14 object-contain drop-shadow-lg mb-1.5"
            />
            <span className="text-xs text-text-muted">
              {nextGame.awayTeam?.city ?? ''}
            </span>
            <span className="text-sm font-bold">
              {nextGame.awayTeam?.mascot ?? '???'}
            </span>
          </div>

          {/* VS */}
          <div className="text-center">
            <p className="text-2xl font-black text-text-muted">VS</p>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center text-center">
            <img
              src={getTeamLogoUrl(nextGame.homeTeam?.abbreviation ?? '???')}
              alt={nextGame.homeTeam?.name ?? ''}
              className="w-14 h-14 object-contain drop-shadow-lg mb-1.5"
            />
            <span className="text-xs text-text-muted">
              {nextGame.homeTeam?.city ?? ''}
            </span>
            <span className="text-sm font-bold">
              {nextGame.homeTeam?.mascot ?? '???'}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center mt-5">
          <Link
            href={`/game/${nextGame.id}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold text-midnight font-bold text-sm rounded-full hover:bg-gold-bright transition-colors shadow-lg shadow-gold/20"
          >
            MAKE YOUR PREDICTION
          </Link>
        </div>
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

  // Auto-navigate to next game when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && nextGameId) {
      const timer = setTimeout(() => {
        router.push(`/game/${nextGameId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [countdown, nextGameId, router]);

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
          {nextGameId && (
            <Link
              href={`/game/${nextGameId}`}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gold text-midnight font-bold text-sm rounded-full hover:bg-gold-bright transition-colors shadow-lg shadow-gold/20"
            >
              GO TO NEXT GAME
            </Link>
          )}
          {!nextGameId && (
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-border rounded-full"
            >
              View Standings {'\u2192'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading Screen ────────────────────────────────────────────

function ConnectingScreen() {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Field skeleton */}
      <div className="px-2 py-2">
        <Skeleton variant="rectangular" className="w-full h-[240px] sm:h-[320px] lg:h-[400px] rounded-xl" />
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
