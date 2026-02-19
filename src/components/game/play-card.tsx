'use client';

import { useEffect, useState } from 'react';
import type { GameEvent } from '@/lib/simulation/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  formatDownAndDistance,
  formatYards,
  formatFieldPosition,
  formatClock,
} from '@/lib/utils/formatting';

// ── Props ────────────────────────────────────────────────────

interface PlayCardEvent {
  eventNumber: number;
  playResult: GameEvent['playResult'];
  commentary: GameEvent['commentary'];
  gameState: GameEvent['gameState'];
  narrativeContext: GameEvent['narrativeContext'];
  timestamp: number;
  driveNumber: number;
}

interface PlayCardProps {
  event: PlayCardEvent;
  isLatest: boolean;
}

// ── Border color logic ───────────────────────────────────────

function getBorderColor(event: PlayCardEvent): string {
  const { playResult } = event;

  if (
    playResult.isTouchdown ||
    playResult.scoring?.type === 'touchdown' ||
    playResult.scoring?.type === 'defensive_touchdown' ||
    playResult.scoring?.type === 'pick_six' ||
    playResult.scoring?.type === 'fumble_recovery_td'
  ) {
    return '#fbbf24'; // gold -- touchdown
  }
  if (playResult.turnover) {
    return '#ef4444'; // red -- turnover
  }
  if (playResult.yardsGained >= 15) {
    return '#22c55e'; // green -- big play
  }
  if (
    playResult.penalty &&
    !playResult.penalty.declined &&
    !playResult.penalty.offsetting
  ) {
    return '#eab308'; // yellow -- penalty
  }
  return '#2d3548'; // subtle gray -- normal
}

function getBadgeVariant(
  event: PlayCardEvent
): { label: string; variant: 'touchdown' | 'turnover' | 'big-play' | 'penalty' } | null {
  const { playResult } = event;

  if (playResult.isTouchdown) return { label: 'TOUCHDOWN', variant: 'touchdown' };
  if (playResult.scoring?.type === 'field_goal') return { label: 'FIELD GOAL', variant: 'touchdown' };
  if (playResult.scoring?.type === 'safety') return { label: 'SAFETY', variant: 'turnover' };
  if (playResult.turnover) return { label: 'TURNOVER', variant: 'turnover' };
  if (playResult.yardsGained >= 15) return { label: 'BIG PLAY', variant: 'big-play' };
  if (playResult.penalty && !playResult.penalty.declined) return { label: 'FLAG', variant: 'penalty' };
  return null;
}

// ── Typewriter effect ────────────────────────────────────────

function TypewriterText({
  text,
  speed = 18,
  delay = 0,
}: {
  text: string;
  speed?: number;
  delay?: number;
}) {
  const [displayed, setDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setDisplayed('');
    setIsTyping(true);

    const startTimeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        index++;
        if (index >= text.length) {
          setDisplayed(text);
          setIsTyping(false);
          clearInterval(interval);
        } else {
          setDisplayed(text.slice(0, index));
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay]);

  return (
    <span>
      {displayed}
      {isTyping && <span className="typewriter-cursor" />}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────

export function PlayCard({ event, isLatest }: PlayCardProps) {
  const { playResult, commentary, gameState } = event;
  const borderColor = getBorderColor(event);
  const badge = getBadgeVariant(event);

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

  // Determine card variant based on play type
  const cardVariant = playResult.isTouchdown
    ? 'touchdown' as const
    : playResult.turnover
      ? 'turnover' as const
      : 'default' as const;

  return (
    <Card
      variant={cardVariant}
      padding="none"
      className={`
        relative overflow-hidden transition-all duration-300
        ${isLatest ? 'play-enter ring-1 ring-white/10' : ''}
      `}
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
    >
      <div className="p-3">
        {/* Header row: clock, badge, yards */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[10px] font-mono text-text-muted tabular-nums flex-shrink-0">
              {clockText}
            </span>
            {badge && (
              <Badge variant={badge.variant} size="sm">
                {badge.label}
              </Badge>
            )}
          </div>

          {/* Yards gained */}
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

        {/* Play description */}
        <p className="text-sm font-semibold text-text-primary leading-snug mb-1">
          {playResult.description}
        </p>

        {/* Commentary with typewriter effect */}
        <p className="text-base font-bold text-text-primary leading-snug mb-1">
          {isLatest ? (
            <TypewriterText text={commentary.playByPlay} speed={18} />
          ) : (
            commentary.playByPlay
          )}
        </p>

        {commentary.colorAnalysis && (
          <p className="text-sm italic text-text-secondary leading-snug">
            {isLatest ? (
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

        {/* Footer: down/distance, field position, penalty info */}
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

          {playResult.penalty &&
            !playResult.penalty.declined &&
            !playResult.penalty.offsetting && (
              <>
                <span className="text-border">{'|'}</span>
                <span className="text-penalty-flag font-medium">
                  {'\u26A0'} {playResult.penalty.description} ({playResult.penalty.yards} yds)
                </span>
              </>
            )}
        </div>
      </div>
    </Card>
  );
}
