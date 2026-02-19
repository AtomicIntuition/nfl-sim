'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';

// ── Props ────────────────────────────────────────────────────

interface CommentaryPanelProps {
  playByPlay: string;
  colorAnalysis: string;
  excitement: number;
}

// ── Component ────────────────────────────────────────────────

export function CommentaryPanel({
  playByPlay,
  colorAnalysis,
  excitement,
}: CommentaryPanelProps) {
  const [showPBP, setShowPBP] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const prevPBPRef = useRef(playByPlay);

  // Reset animation when commentary changes
  useEffect(() => {
    if (playByPlay !== prevPBPRef.current) {
      setShowPBP(false);
      setShowColor(false);
      prevPBPRef.current = playByPlay;

      // PBP appears immediately with animation
      const pbpTimer = setTimeout(() => setShowPBP(true), 50);

      // Color analysis follows 1-2 seconds later (scaled by excitement)
      const colorDelay = excitement > 70 ? 1000 : 1500;
      const colorTimer = setTimeout(() => setShowColor(true), colorDelay);

      return () => {
        clearTimeout(pbpTimer);
        clearTimeout(colorTimer);
      };
    } else {
      // On first render, show both
      setShowPBP(true);
      setShowColor(true);
    }
  }, [playByPlay, excitement]);

  // Excitement level determines accent color intensity
  const excitementGlow =
    excitement > 80
      ? 'shadow-lg shadow-gold/10 border-gold/20'
      : excitement > 50
        ? 'shadow-md shadow-white/5 border-white/10'
        : 'border-border/50';

  const excitementIndicator =
    excitement > 80
      ? 'bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500'
      : excitement > 50
        ? 'bg-gradient-to-r from-yellow-500 to-orange-400'
        : excitement > 25
          ? 'bg-gradient-to-r from-blue-400 to-cyan-400'
          : 'bg-gradient-to-r from-slate-500 to-slate-400';

  return (
    <Card variant="glass" padding="none" className={`overflow-hidden border ${excitementGlow}`}>
      {/* Excitement bar at top */}
      <div className="h-0.5 w-full bg-surface-elevated">
        <div
          className={`h-full transition-all duration-700 ease-out ${excitementIndicator}`}
          style={{ width: `${excitement}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Play-by-play voice */}
        <div
          className={`
            transition-all duration-500 ease-out
            ${showPBP ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Play-by-Play
            </span>
          </div>
          <p
            className={`
              text-base font-bold text-text-primary leading-relaxed
              ${showPBP ? 'commentary-typewriter' : ''}
            `}
          >
            {playByPlay}
          </p>
        </div>

        {/* Color analyst voice */}
        {colorAnalysis && (
          <div
            className={`
              transition-all duration-500 ease-out
              ${showColor ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Color Analysis
              </span>
            </div>
            <p
              className={`
                text-sm italic text-text-secondary leading-relaxed
                ${showColor ? 'commentary-typewriter' : ''}
              `}
            >
              {colorAnalysis}
            </p>
          </div>
        )}

        {/* Excitement label */}
        {excitement > 70 && (
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
              Excitement
            </span>
            <span
              className={`text-[10px] font-mono font-black tabular-nums ${
                excitement > 90
                  ? 'text-red-400'
                  : excitement > 80
                    ? 'text-orange-400'
                    : 'text-yellow-400'
              }`}
            >
              {excitement}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
