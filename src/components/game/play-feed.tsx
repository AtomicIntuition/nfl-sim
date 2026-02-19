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
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastEventCount = useRef(0);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && events.length > lastEventCount.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: events.length - lastEventCount.current > 3 ? 'auto' : 'smooth' });
    }
    lastEventCount.current = events.length;
  }, [events.length, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isNearBottom);
  }, []);

  // Filter out kickoffs/touchbacks for a cleaner feed, but keep scoring plays
  const displayEvents = events.filter(
    (e) =>
      e.playResult.type !== 'touchback' ||
      e.playResult.isTouchdown ||
      e.playResult.scoring
  );

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

        {displayEvents.map((event, idx) => (
          <PlayCard
            key={event.eventNumber}
            event={event}
            isNew={isLive && idx === displayEvents.length - 1}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && isLive && (
        <button
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            setAutoScroll(true);
          }}
          className="absolute bottom-3 right-3 bg-surface-elevated/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 text-[11px] font-semibold text-gold shadow-lg hover:bg-surface-hover transition-colors"
        >
          {'\u2193'} New plays
        </button>
      )}
    </div>
  );
}

// ── Play Card ──────────────────────────────────────────────────

interface PlayCardProps {
  event: GameEvent;
  isNew: boolean;
}

function PlayCard({ event, isNew }: PlayCardProps) {
  const { playResult, commentary, gameState, narrativeContext } = event;
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
        relative rounded-lg bg-surface/60 border border-border/50
        transition-all duration-300
        ${isNew ? 'play-enter' : ''}
      `}
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
    >
      <div className="p-3">
        {/* Header: situation + yards */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-text-muted tabular-nums flex-shrink-0">
              {clockText}
            </span>
            {badge && (
              <span
                className="text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded flex-shrink-0"
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
                className={`text-xs font-mono font-bold tabular-nums flex-shrink-0 ${
                  playResult.yardsGained > 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatYards(playResult.yardsGained)}
              </span>
            )}
        </div>

        {/* Play-by-play commentary */}
        <p className="text-sm font-semibold text-text-primary leading-snug mb-1">
          {isNew ? (
            <TypewriterText text={commentary.playByPlay} speed={18} />
          ) : (
            commentary.playByPlay
          )}
        </p>

        {/* Color analysis */}
        {commentary.colorAnalysis && (
          <p
            className={`text-[13px] italic text-text-secondary leading-snug ${
              !showFullCommentary && !isNew ? 'line-clamp-2' : ''
            }`}
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
        <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
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
