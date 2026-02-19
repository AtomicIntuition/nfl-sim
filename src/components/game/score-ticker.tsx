'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { TeamLogo } from '@/components/team/team-logo';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface TickerGame {
  id: string;
  homeTeam: {
    abbreviation: string;
    name: string;
    primaryColor: string;
  } | null;
  awayTeam: {
    abbreviation: string;
    name: string;
    primaryColor: string;
  } | null;
  homeScore: number | null;
  awayScore: number | null;
}

interface ScoreTickerProps {
  games: TickerGame[];
}

const SCROLL_SPEED = 0.5; // pixels per frame
const PAUSE_AFTER_INTERACT = 3000; // ms to pause after user scrolls

export function ScoreTicker({ games }: ScoreTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const isPaused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteracting = useRef(false);
  const [isHovered, setIsHovered] = useState(false);

  // Duplicate games for seamless loop (only if enough to fill the screen)
  const displayGames = games.length >= 3 ? [...games, ...games] : games;
  const shouldLoop = games.length >= 3;

  const resetScroll = useCallback(() => {
    if (!trackRef.current || !shouldLoop) return;
    const track = trackRef.current;
    const halfWidth = track.scrollWidth / 2;
    // When we've scrolled past the first set, snap back
    if (track.scrollLeft >= halfWidth) {
      track.scrollLeft -= halfWidth;
    }
  }, [shouldLoop]);

  // Animation loop
  useEffect(() => {
    if (!shouldLoop) return;

    const animate = () => {
      if (!isPaused.current && !userInteracting.current && trackRef.current) {
        trackRef.current.scrollLeft += SCROLL_SPEED;
        resetScroll();
      }
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [shouldLoop, resetScroll]);

  // Pause on hover
  useEffect(() => {
    isPaused.current = isHovered;
  }, [isHovered]);

  // Detect manual scroll → pause, then auto-resume
  const handleScroll = useCallback(() => {
    if (!userInteracting.current) return;
    // User is scrolling — reset the resume timer
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      userInteracting.current = false;
      resetScroll();
    }, PAUSE_AFTER_INTERACT);
  }, [resetScroll]);

  const handlePointerDown = useCallback(() => {
    userInteracting.current = true;
  }, []);

  const handleWheel = useCallback(() => {
    userInteracting.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      userInteracting.current = false;
      resetScroll();
    }, PAUSE_AFTER_INTERACT);
  }, [resetScroll]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  return (
    <section className="border-y border-border bg-surface/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-text-muted tracking-wider uppercase">
            Scores
          </span>
          {shouldLoop && (
            <div className="flex gap-0.5 ml-auto opacity-40">
              <div className="w-3 h-0.5 rounded-full bg-gold" />
              <div className="w-1.5 h-0.5 rounded-full bg-text-muted" />
              <div className="w-1.5 h-0.5 rounded-full bg-text-muted" />
            </div>
          )}
        </div>

        <div
          ref={trackRef}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onPointerDown={handlePointerDown}
          onScroll={handleScroll}
          onWheel={handleWheel}
          className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {displayGames.map((game, idx) =>
            game ? (
              <TickerCard key={`${game.id}-${idx}`} game={game} />
            ) : null
          )}
        </div>
      </div>
    </section>
  );
}

function TickerCard({ game }: { game: TickerGame }) {
  const homeWon =
    game.homeScore !== null &&
    game.awayScore !== null &&
    game.homeScore > game.awayScore;
  const awayWon =
    game.homeScore !== null &&
    game.awayScore !== null &&
    game.awayScore > game.homeScore;

  return (
    <Link href={`/game/${game.id}`} className="flex-shrink-0 group">
      <Card
        variant="bordered"
        padding="sm"
        className="min-w-[168px] hover:border-gold/30 transition-all duration-200 group-hover:shadow-lg group-hover:shadow-gold/5"
      >
        <div className="space-y-1.5">
          {/* Away team */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <TeamLogo
                abbreviation={game.awayTeam?.abbreviation ?? '???'}
                teamName={game.awayTeam?.name ?? undefined}
                size={18}
                className="w-[18px] h-[18px] object-contain shrink-0"
              />
              <span
                className={`text-xs font-bold ${
                  awayWon ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {game.awayTeam?.abbreviation ?? '???'}
              </span>
            </div>
            <span
              className={`font-mono text-sm font-black tabular-nums ${
                awayWon ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {game.awayScore ?? 0}
            </span>
          </div>

          {/* Home team */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <TeamLogo
                abbreviation={game.homeTeam?.abbreviation ?? '???'}
                teamName={game.homeTeam?.name ?? undefined}
                size={18}
                className="w-[18px] h-[18px] object-contain shrink-0"
              />
              <span
                className={`text-xs font-bold ${
                  homeWon ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {game.homeTeam?.abbreviation ?? '???'}
              </span>
            </div>
            <span
              className={`font-mono text-sm font-black tabular-nums ${
                homeWon ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {game.homeScore ?? 0}
            </span>
          </div>
        </div>

        {/* Final badge */}
        <div className="mt-1.5 flex items-center justify-between">
          <Badge variant="final" size="sm">
            Final
          </Badge>
          <span className="text-[9px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Recap {'\u2192'}
          </span>
        </div>
      </Card>
    </Link>
  );
}
