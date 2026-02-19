'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { NarrativeSnapshot } from '@/lib/simulation/types';
import { useGameStream } from '@/hooks/use-game-stream';
import { useMomentum } from '@/hooks/use-momentum';
import { useCountdown } from '@/hooks/use-countdown';
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
    reconnect,
  } = useGameStream(gameId);

  const { momentum } = useMomentum(events);

  // Build live box score progressively from events
  const liveBoxScore = useMemo(() => buildLiveBoxScore(events), [events]);
  // Use final boxScore from stream (game_over) if available, otherwise live
  const activeBoxScore = boxScore ?? liveBoxScore;

  // Celebration / alert overlay state
  const [celebrationClass, setCelebrationClass] = useState('');
  const prevEventCount = useRef(0);

  // Detect touchdowns and turnovers for visual effects
  useEffect(() => {
    if (events.length <= prevEventCount.current) {
      prevEventCount.current = events.length;
      return;
    }

    const latestEvent = events[events.length - 1];
    if (!latestEvent) {
      prevEventCount.current = events.length;
      return;
    }

    if (latestEvent.playResult.isTouchdown) {
      setCelebrationClass('touchdown-celebration');
      const t = setTimeout(() => setCelebrationClass(''), 1300);
      prevEventCount.current = events.length;
      return () => clearTimeout(t);
    }

    if (latestEvent.playResult.turnover) {
      setCelebrationClass('turnover-alert');
      const t = setTimeout(() => setCelebrationClass(''), 900);
      prevEventCount.current = events.length;
      return () => clearTimeout(t);
    }

    prevEventCount.current = events.length;
  }, [events]);

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
      <div className="min-h-dvh flex flex-col">
        <GameNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <Badge variant="default" size="md">
              INTERMISSION
            </Badge>
            {intermissionMessage && (
              <p className="text-sm text-text-secondary">{intermissionMessage}</p>
            )}
            {intermissionCountdown > 0 && (
              <div className="font-mono text-3xl font-black text-gold tabular-nums">
                {Math.floor(intermissionCountdown / 60)}:
                {(intermissionCountdown % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Game Over state ───────────────────────────────────────

  if (status === 'game_over' && gameState) {
    return (
      <div className={`min-h-dvh ${celebrationClass}`}>
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
    <div className={`flex flex-col min-h-dvh ${celebrationClass}`}>
      {/* ── Mobile Layout ── */}
      <div className="flex flex-col h-dvh lg:hidden">
        {/* Navigation bar */}
        <GameNav />

        {/* Scoreboard at top */}
        <ScoreBug
          gameState={gameState}
          status={status === 'game_over' ? 'game_over' : 'live'}
        />

        {/* Banners + Field + Momentum */}
        <div className="flex-shrink-0">
          {isCatchup && (
            <div className="bg-info/10 border-b border-info/20 px-3 py-1 text-center">
              <span className="text-[11px] text-info font-semibold">
                Catching up to live...
              </span>
            </div>
          )}
          {error && status !== 'error' && (
            <div className="bg-danger/10 border-b border-danger/20 px-3 py-1 flex items-center justify-between">
              <span className="text-[11px] text-danger font-medium">{error}</span>
              <button onClick={reconnect} className="text-[10px] text-danger font-bold underline">
                Retry
              </button>
            </div>
          )}

          <FieldVisual
            ballPosition={gameState.ballPosition}
            firstDownLine={firstDownLine}
            possession={gameState.possession}
            homeTeam={{
              abbreviation: gameState.homeTeam.abbreviation,
              primaryColor: gameState.homeTeam.primaryColor,
            }}
            awayTeam={{
              abbreviation: gameState.awayTeam.abbreviation,
              primaryColor: gameState.awayTeam.primaryColor,
            }}
          />

          <MomentumMeter
            momentum={momentum}
            homeColor={gameState.homeTeam.primaryColor}
            awayColor={gameState.awayTeam.primaryColor}
            homeAbbrev={gameState.homeTeam.abbreviation}
            awayAbbrev={gameState.awayTeam.abbreviation}
          />
        </div>

        {/* Play feed fills remaining space */}
        <div className="flex-1 min-h-0">
          <PlayFeed events={events} isLive={isLive} />
        </div>
      </div>

      {/* ── Desktop Layout ── */}
      <div className="hidden lg:flex lg:flex-col lg:h-dvh">
        {/* Navigation bar */}
        <GameNav />

        {/* Scoreboard at top */}
        <ScoreBug
          gameState={gameState}
          status={status === 'game_over' ? 'game_over' : 'live'}
        />

        {/* Banners */}
        {isCatchup && (
          <div className="bg-info/10 border-b border-info/20 px-4 py-1 text-center flex-shrink-0">
            <span className="text-xs text-info font-semibold">
              Catching up to live broadcast...
            </span>
          </div>
        )}
        {error && status !== 'error' && (
          <div className="bg-danger/10 border-b border-danger/20 px-4 py-1 flex items-center justify-center gap-3 flex-shrink-0">
            <span className="text-xs text-danger font-medium">{error}</span>
            <button onClick={reconnect} className="text-xs text-danger font-bold underline">
              Retry
            </button>
          </div>
        )}

        {/* Main content grid */}
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-0">
          {/* Left column: field + momentum + narrative + play feed */}
          <div className="col-span-2 flex flex-col border-r border-border">
            <div className="flex-shrink-0">
              <FieldVisual
                ballPosition={gameState.ballPosition}
                firstDownLine={firstDownLine}
                possession={gameState.possession}
                homeTeam={{
                  abbreviation: gameState.homeTeam.abbreviation,
                  primaryColor: gameState.homeTeam.primaryColor,
                }}
                awayTeam={{
                  abbreviation: gameState.awayTeam.abbreviation,
                  primaryColor: gameState.awayTeam.primaryColor,
                }}
              />
              <MomentumMeter
                momentum={momentum}
                homeColor={gameState.homeTeam.primaryColor}
                awayColor={gameState.awayTeam.primaryColor}
                homeAbbrev={gameState.homeTeam.abbreviation}
                awayAbbrev={gameState.awayTeam.abbreviation}
              />

              {/* Narrative context */}
              {currentEvent?.narrativeContext && (
                <NarrativeBar narrative={currentEvent.narrativeContext} />
              )}
            </div>

            {/* Play feed fills remaining space */}
            <div className="flex-1 min-h-0">
              <PlayFeed events={events} isLive={isLive} />
            </div>
          </div>

          {/* Right column: box score */}
          <div className="col-span-1 overflow-y-auto">
            <BoxScore
              boxScore={activeBoxScore}
              homeTeam={gameState.homeTeam}
              awayTeam={gameState.awayTeam}
            />
          </div>
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
          // Countdown: 15 minutes from now (intermission duration)
          setCountdownTarget(15 * 60);
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

// ── Loading Screen ────────────────────────────────────────────

function ConnectingScreen() {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Field skeleton */}
      <div className="px-2 py-2">
        <Skeleton variant="rectangular" className="w-full h-12 sm:h-16" />
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
