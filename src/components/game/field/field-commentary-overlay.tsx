'use client';

import { useState, useEffect, useRef } from 'react';
import type { PlayResult } from '@/lib/simulation/types';

interface FieldCommentaryOverlayProps {
  text: string | null;
  lastPlay: PlayResult | null;
}

function getBadge(play: PlayResult | null): { label: string; color: string } | null {
  if (!play) return null;
  if (play.isTouchdown) return { label: 'TOUCHDOWN', color: '#fbbf24' };
  if (play.turnover) return { label: 'TURNOVER', color: '#ef4444' };
  if (play.isSafety) return { label: 'SAFETY', color: '#ef4444' };
  if (play.type === 'field_goal' && play.scoring) return { label: 'FIELD GOAL', color: '#22c55e' };
  if (play.type === 'sack') return { label: 'SACK', color: '#f97316' };
  if (play.yardsGained >= 20) return { label: 'BIG PLAY', color: '#22c55e' };
  return null;
}

/**
 * Commentary overlay positioned at the bottom of the field container.
 * Shows play-by-play text with a typewriter effect and badges for big plays.
 */
export function FieldCommentaryOverlay({ text, lastPlay }: FieldCommentaryOverlayProps) {
  const [displayText, setDisplayText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const prevTextRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!text || text === prevTextRef.current) return;
    prevTextRef.current = text;

    // Clear any ongoing animation
    if (intervalRef.current) clearInterval(intervalRef.current);

    setIsAnimating(true);
    setDisplayText('');

    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      setDisplayText(text.slice(0, i));
      if (i >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsAnimating(false);
      }
    }, 18); // ~55 chars/sec typewriter speed

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text]);

  if (!text) return null;

  const badge = getBadge(lastPlay);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      <div
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        }}
      >
        {badge && (
          <span
            className="inline-block text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded mb-1"
            style={{
              backgroundColor: `${badge.color}25`,
              color: badge.color,
              border: `1px solid ${badge.color}40`,
            }}
          >
            {badge.label}
          </span>
        )}
        <p
          className="text-[12px] sm:text-[13px] font-semibold text-white leading-snug"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
        >
          {displayText}
          {isAnimating && <span className="typewriter-cursor ml-0.5" />}
        </p>
      </div>
    </div>
  );
}
