'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { useGameStream } from '@/hooks/use-game-stream';
import { ScoreBug } from '@/components/game/scorebug';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, PlayCardSkeleton } from '@/components/ui/skeleton';
import { formatGameType } from '@/lib/utils/formatting';
import { ROUTES } from '@/lib/utils/constants';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

// ============================================================
// Types
// ============================================================

interface TeamInfo {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
  mascot: string;
  primaryColor: string;
  secondaryColor: string;
}

interface InitialGameData {
  id: string;
  status: string;
  gameType: string;
  week: number;
  homeTeam: TeamInfo | null;
  awayTeam: TeamInfo | null;
  homeScore: number;
  awayScore: number;
  isFeatured: boolean | null;
  broadcastStartedAt: string | null;
}

interface GameViewerProps {
  gameId: string;
  initialData: InitialGameData;
}

// ============================================================
// Component
// ============================================================

export function GameViewer({ gameId, initialData }: GameViewerProps) {
  const stream = useGameStream(
    initialData.status === 'scheduled' ? null : gameId
  );
  const playFeedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll play feed to the latest event
  useEffect(() => {
    if (playFeedRef.current && stream.currentEvent) {
      playFeedRef.current.scrollTop = 0;
    }
  }, [stream.currentEvent]);

  const isPreGame = initialData.status === 'scheduled';
  const isConnecting = stream.status === 'connecting' && !isPreGame;
  const isLive = stream.status === 'live' || stream.status === 'catchup';
  const isGameOver = stream.status === 'game_over';
  const isError = stream.status === 'error';

  return (
    <div className="min-h-screen bg-midnight">
      {/* Header bar */}
      <header className="sticky top-0 z-40 glass-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link
            href={ROUTES.HOME}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; GridBlitz
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted tracking-wider uppercase">
              Week {initialData.week}
            </span>
            {initialData.gameType !== 'regular' && (
              <Badge variant="gold" size="sm">
                {formatGameType(
                  initialData.gameType as
                    | 'regular'
                    | 'wild_card'
                    | 'divisional'
                    | 'conference_championship'
                    | 'super_bowl'
                )}
              </Badge>
            )}
            {isLive && (
              <Badge variant="live" size="sm" pulse>
                LIVE
              </Badge>
            )}
            {isGameOver && (
              <Badge variant="final" size="sm">
                FINAL
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 pb-32">
        {/* ---- Pre-game state ---- */}
        {isPreGame && (
          <div className="py-16 text-center">
            <div className="flex items-center justify-center gap-8 sm:gap-16 mb-8">
              <TeamBadge team={initialData.awayTeam} />
              <span className="text-3xl sm:text-5xl font-black text-text-muted">
                VS
              </span>
              <TeamBadge team={initialData.homeTeam} />
            </div>
            <p className="text-text-secondary text-lg mb-6">
              This game hasn&apos;t started yet. Check back soon!
            </p>
            <Link href={ROUTES.SCHEDULE}>
              <Button variant="secondary">View Schedule</Button>
            </Link>
          </div>
        )}

        {/* ---- Connecting state ---- */}
        {isConnecting && (
          <div className="py-16">
            <div className="flex items-center justify-center gap-8 sm:gap-16 mb-8">
              <TeamBadge team={initialData.awayTeam} />
              <div className="text-center">
                <div className="relative flex h-3 w-3 mx-auto mb-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-gold" />
                </div>
                <p className="text-xs text-text-muted tracking-wider uppercase">
                  Connecting to broadcast...
                </p>
              </div>
              <TeamBadge team={initialData.homeTeam} />
            </div>
            <div className="space-y-3 max-w-xl mx-auto">
              <PlayCardSkeleton />
              <PlayCardSkeleton />
              <PlayCardSkeleton />
            </div>
          </div>
        )}

        {/* ---- Error state ---- */}
        {isError && (
          <div className="py-16 text-center">
            <p className="text-danger text-lg mb-2">Connection Lost</p>
            <p className="text-text-secondary mb-6">{stream.error}</p>
            <Button variant="primary" onClick={stream.reconnect}>
              Reconnect
            </Button>
          </div>
        )}

        {/* ---- Live / Game Over play feed ---- */}
        {(isLive || isGameOver) && stream.gameState && (
          <>
            {/* Score display */}
            <div className="py-6">
              <div className="flex items-center justify-center gap-6 sm:gap-12">
                <div className="text-center">
                  <img
                    src={getTeamLogoUrl(initialData.awayTeam?.abbreviation ?? '???')}
                    alt={initialData.awayTeam?.mascot ?? 'Away'}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-contain mx-auto mb-1 drop-shadow-lg"
                  />
                  <p className="text-xs text-text-muted">
                    {initialData.awayTeam?.mascot ?? ''}
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-4xl sm:text-5xl font-black tabular-nums">
                      {stream.gameState.awayScore}
                    </span>
                    <span className="text-text-muted text-xl">-</span>
                    <span className="font-mono text-4xl sm:text-5xl font-black tabular-nums">
                      {stream.gameState.homeScore}
                    </span>
                  </div>
                </div>

                <div className="text-center">
                  <img
                    src={getTeamLogoUrl(initialData.homeTeam?.abbreviation ?? '???')}
                    alt={initialData.homeTeam?.mascot ?? 'Home'}
                    className="w-14 h-14 sm:w-16 sm:h-16 object-contain mx-auto mb-1 drop-shadow-lg"
                  />
                  <p className="text-xs text-text-muted">
                    {initialData.homeTeam?.mascot ?? ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Play-by-play feed */}
            <div className="space-y-2" ref={playFeedRef}>
              {/* Current play (most recent) */}
              {stream.currentEvent && (
                <Card
                  variant="elevated"
                  padding="md"
                  className="play-enter border-l-2"
                  style={{
                    borderLeftColor:
                      (stream.currentEvent.playResult as unknown as { isTouchdown?: boolean; turnover?: unknown })
                        ?.isTouchdown
                        ? 'var(--color-touchdown)'
                        : (stream.currentEvent.playResult as unknown as { turnover?: unknown })
                              ?.turnover
                          ? 'var(--color-turnover)'
                          : 'var(--color-border)',
                  }}
                >
                  <p className="text-sm sm:text-base font-medium text-text-primary leading-relaxed">
                    {(stream.currentEvent.commentary as unknown as { playByPlay?: string })
                      ?.playByPlay ?? 'Play in progress...'}
                  </p>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1.5 italic">
                    {(stream.currentEvent.commentary as unknown as { colorAnalysis?: string })
                      ?.colorAnalysis ?? ''}
                  </p>
                  {(stream.currentEvent.playResult as unknown as { isTouchdown?: boolean })
                    ?.isTouchdown && (
                    <Badge variant="touchdown" size="sm" className="mt-2">
                      TOUCHDOWN
                    </Badge>
                  )}
                  {!!(stream.currentEvent.playResult as unknown as { turnover?: unknown })
                    ?.turnover && (
                    <Badge variant="turnover" size="sm" className="mt-2">
                      TURNOVER
                    </Badge>
                  )}
                </Card>
              )}

              {/* Previous plays (reverse chronological, most recent first) */}
              {stream.events
                .filter((e) => e !== stream.currentEvent)
                .reverse()
                .slice(0, 30)
                .map((event, idx) => (
                  <Card
                    key={event.eventNumber ?? idx}
                    variant="default"
                    padding="sm"
                    className={`transition-opacity ${idx > 5 ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-[10px] font-mono text-text-muted tabular-nums mt-0.5 flex-shrink-0 w-5 text-right">
                        {event.eventNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                          {(event.commentary as unknown as { playByPlay?: string })
                            ?.playByPlay ?? ''}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>

            {/* Game over summary */}
            {isGameOver && stream.finalScore && (
              <Card variant="glass" padding="lg" className="mt-6 text-center">
                <Badge variant="final" className="mb-4">
                  FINAL
                </Badge>
                <div className="flex items-baseline justify-center gap-4 mb-4">
                  <div className="text-center">
                    <span
                      className="text-sm font-bold"
                      style={{ color: initialData.awayTeam?.primaryColor }}
                    >
                      {initialData.awayTeam?.abbreviation}
                    </span>
                    <p className="font-mono text-3xl font-black tabular-nums">
                      {stream.finalScore.away}
                    </p>
                  </div>
                  <span className="text-text-muted text-lg">-</span>
                  <div className="text-center">
                    <span
                      className="text-sm font-bold"
                      style={{ color: initialData.homeTeam?.primaryColor }}
                    >
                      {initialData.homeTeam?.abbreviation}
                    </span>
                    <p className="font-mono text-3xl font-black tabular-nums">
                      {stream.finalScore.home}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center gap-3">
                  <Link href={ROUTES.SCHEDULE}>
                    <Button variant="secondary" size="sm">
                      Full Schedule
                    </Button>
                  </Link>
                  <Link href={ROUTES.HOME}>
                    <Button variant="gold" size="sm">
                      Back to Home
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
          </>
        )}
      </main>

      {/* ScoreBug (fixed at bottom during live game) */}
      {(isLive || isGameOver) && stream.gameState && (
        <ScoreBug
          gameState={stream.gameState}
          status={isGameOver ? 'game_over' : 'live'}
        />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function TeamBadge({ team }: { team: TeamInfo | null }) {
  if (!team) {
    return (
      <div className="text-center">
        <Skeleton variant="rectangular" width={80} height={80} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <img
        src={getTeamLogoUrl(team.abbreviation)}
        alt={team.mascot}
        className="w-20 h-20 object-contain mx-auto mb-2 drop-shadow-lg"
      />
      <p className="text-xs text-text-secondary">{team.city}</p>
      <p className="text-sm font-bold">{team.mascot}</p>
    </div>
  );
}
