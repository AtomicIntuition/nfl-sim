'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameEvent } from '@/lib/simulation/types';
import {
  formatDownAndDistance,
  formatYards,
  formatFieldPosition,
  formatClock,
} from '@/lib/utils/formatting';

interface PlayFeedProps {
  events: GameEvent[];
  isLive: boolean;
}

export function PlayFeed({ events, isLive }: PlayFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenCount = useRef(0);

  // Filter out touchbacks for cleaner feed, keep scoring plays
  const displayEvents = events.filter(
    (e) =>
      e.playResult.type !== 'touchback' ||
      e.playResult.isTouchdown ||
      e.playResult.scoring
  );

  // Reverse chronological — newest play at top
  const reversedEvents = [...displayEvents].reverse();

  // Track unseen plays when user has scrolled down
  useEffect(() => {
    if (!isAtTop && displayEvents.length > lastSeenCount.current) {
      setUnseenCount(displayEvents.length - lastSeenCount.current);
    }
    if (isAtTop) {
      lastSeenCount.current = displayEvents.length;
      setUnseenCount(0);
    }
  }, [displayEvents.length, isAtTop]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const nearTop = scrollRef.current.scrollTop < 80;
    setIsAtTop(nearTop);
  }, []);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setUnseenCount(0);
    lastSeenCount.current = displayEvents.length;
  };

  return (
    <div className="relative flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-2"
      >
        {displayEvents.length === 0 && (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            Waiting for the first play...
          </div>
        )}

        {reversedEvents.map((event, idx) => (
          <PlayCard
            key={event.eventNumber}
            event={event}
            isNew={isLive && idx === 0}
            isFeatured={idx === 0}
          />
        ))}
      </div>

      {/* Scroll-to-top pill when new plays arrive while scrolled down */}
      {!isAtTop && unseenCount > 0 && isLive && (
        <button
          onClick={scrollToTop}
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-gold/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-[11px] font-bold text-surface shadow-lg hover:bg-gold transition-colors z-10 animate-bounce-subtle"
        >
          {'\u2191'} {unseenCount} new play{unseenCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}

// ── Play Card ──────────────────────────────────────────────────

interface PlayCardProps {
  event: GameEvent;
  isNew: boolean;
  isFeatured?: boolean;
}

function PlayCard({ event, isNew, isFeatured = false }: PlayCardProps) {
  const { playResult, commentary, gameState } = event;
  const [showFullCommentary, setShowFullCommentary] = useState(false);

  // Determine border color based on play result
  const borderColor = getPlayBorderColor(event);

  // Determine if this play deserves a badge
  const badge = getPlayBadge(event);

  const situationText = formatDownAndDistance(
    gameState.down,
    gameState.yardsToGo,
    gameState.ballPosition
  );

  const fieldPos = formatFieldPosition(
    gameState.ballPosition,
    gameState.homeTeam.abbreviation,
    gameState.awayTeam.abbreviation,
    gameState.possession
  );

  const clockText = `Q${gameState.quarter === 'OT' ? 'OT' : gameState.quarter} ${formatClock(gameState.clock)}`;

  return (
    <div
      className={`
        relative rounded-lg border transition-all duration-300
        ${isFeatured
          ? 'bg-surface/80 border-border shadow-lg shadow-black/20 ring-1 ring-white/[0.06]'
          : 'bg-surface/40 border-border/30 opacity-75 hover:opacity-100'
        }
        ${isNew ? 'play-enter' : ''}
      `}
      style={{ borderLeftWidth: isFeatured ? '4px' : '3px', borderLeftColor: borderColor }}
    >
      <div className={isFeatured ? 'p-3.5' : 'p-2.5'}>
        {/* Header: situation + yards */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`font-mono text-text-muted tabular-nums flex-shrink-0 ${isFeatured ? 'text-[11px]' : 'text-[10px]'}`}>
              {clockText}
            </span>
            {badge && (
              <span
                className={`font-black tracking-widest uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${isFeatured ? 'text-[10px]' : 'text-[9px]'}`}
                style={{
                  backgroundColor: `${borderColor}20`,
                  color: borderColor,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          {playResult.yardsGained !== 0 &&
            playResult.type !== 'kickoff' &&
            playResult.type !== 'punt' &&
            playResult.type !== 'extra_point' &&
            playResult.type !== 'field_goal' && (
              <span
                className={`font-mono font-bold tabular-nums flex-shrink-0 ${
                  playResult.yardsGained > 0 ? 'text-success' : 'text-danger'
                } ${isFeatured ? 'text-sm' : 'text-xs'}`}
              >
                {formatYards(playResult.yardsGained)}
              </span>
            )}
        </div>

        {/* Play-by-play commentary */}
        <p className={`font-semibold text-text-primary leading-snug mb-1 ${isFeatured ? 'text-[15px]' : 'text-sm'}`}>
          {isNew ? (
            <TypewriterText text={commentary.playByPlay} speed={18} />
          ) : (
            commentary.playByPlay
          )}
        </p>

        {/* Color analysis */}
        {commentary.colorAnalysis && (
          <p
            className={`italic text-text-secondary leading-snug ${
              isFeatured ? 'text-[13px]' : 'text-xs'
            } ${!showFullCommentary && !isNew && !isFeatured ? 'line-clamp-1' : !showFullCommentary && !isNew ? 'line-clamp-2' : ''}`}
            onClick={() => setShowFullCommentary((prev) => !prev)}
          >
            {isNew ? (
              <TypewriterText
                text={commentary.colorAnalysis}
                speed={12}
                delay={commentary.playByPlay.length * 18 + 200}
              />
            ) : (
              commentary.colorAnalysis
            )}
          </p>
        )}

        {/* Play details footer */}
        <div className={`flex items-center gap-2 mt-2 text-text-muted ${isFeatured ? 'text-[11px]' : 'text-[10px]'}`}>
          {playResult.type !== 'kickoff' &&
            playResult.type !== 'punt' &&
            playResult.type !== 'extra_point' && (
              <>
                <span>{situationText}</span>
                <span className="text-border">{'|'}</span>
                <span>{fieldPos}</span>
              </>
            )}

          {/* Penalty info */}
          {playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting && (
            <>
              <span className="text-border">{'|'}</span>
              <span className="text-penalty-flag font-medium">
                {'\u26A0'} {playResult.penalty.description} ({playResult.penalty.yards} yds)
              </span>
            </>
          )}

          {/* Injury */}
          {playResult.injury && (
            <>
              <span className="text-border">{'|'}</span>
              <span className="text-danger font-medium">
                {'\u2795'} {playResult.injury.player.name} ({playResult.injury.severity})
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Typewriter Effect ────────────────────────────────────────────

function TypewriterText({
  text,
  speed = 20,
  delay = 0,
}: {
  text: string;
  speed?: number;
  delay?: number;
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setDisplayedText('');
    setIsTyping(true);

    const startTimeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        index++;
        if (index >= text.length) {
          setDisplayedText(text);
          setIsTyping(false);
          clearInterval(interval);
        } else {
          setDisplayedText(text.slice(0, index));
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay]);

  return (
    <span>
      {displayedText}
      {isTyping && <span className="typewriter-cursor" />}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function getPlayBorderColor(event: GameEvent): string {
  const { playResult } = event;

  if (playResult.isTouchdown || playResult.scoring?.type === 'touchdown' || playResult.scoring?.type === 'defensive_touchdown' || playResult.scoring?.type === 'pick_six' || playResult.scoring?.type === 'fumble_recovery_td') {
    return '#fbbf24'; // gold — touchdown
  }
  if (playResult.turnover) {
    return '#ef4444'; // red — turnover
  }
  if (playResult.scoring?.type === 'field_goal' || playResult.scoring?.type === 'extra_point') {
    return '#60a5fa'; // blue — scoring
  }
  if (playResult.scoring?.type === 'safety') {
    return '#ef4444'; // red — safety
  }
  if (playResult.penalty && !playResult.penalty.declined && !playResult.penalty.offsetting) {
    return '#eab308'; // yellow — penalty
  }
  if (playResult.type === 'sack') {
    return '#f97316'; // orange — sack
  }
  if (playResult.yardsGained >= 15) {
    return '#22c55e'; // green — big play
  }
  return '#2d3548'; // subtle gray — normal
}

function getPlayBadge(event: GameEvent): string | null {
  const { playResult } = event;

  if (playResult.isTouchdown) return 'TOUCHDOWN';
  if (playResult.scoring?.type === 'field_goal') return 'FIELD GOAL';
  if (playResult.scoring?.type === 'safety') return 'SAFETY';
  if (playResult.scoring?.type === 'extra_point') return 'XP GOOD';
  if (playResult.scoring?.type === 'two_point_conversion') return '2PT GOOD';
  if (playResult.turnover?.type === 'interception') return 'INTERCEPTED';
  if (playResult.turnover?.type === 'fumble' || playResult.turnover?.type === 'fumble_recovery') return 'FUMBLE';
  if (playResult.turnover?.type === 'turnover_on_downs') return 'TURNOVER ON DOWNS';
  if (playResult.type === 'sack') return 'SACK';
  if (playResult.yardsGained >= 25) return 'BIG PLAY';
  if (playResult.penalty && !playResult.penalty.declined) return 'FLAG';
  return null;
}
