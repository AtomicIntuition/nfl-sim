'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

// ── Props ────────────────────────────────────────────────────

interface DriveTrackerProps {
  /** Starting field position (0-100, yards from own goal line). */
  startPosition: number;
  /** Current field position (0-100, yards from own goal line). */
  currentPosition: number;
  /** Number of plays in the current drive. */
  plays: number;
  /** Total yards gained in the drive. */
  yards: number;
  /** Time elapsed in the drive, in seconds. */
  timeElapsed: number;
  /** CSS hex color for the possessing team. */
  teamColor: string;
  /** First down line position (0-100, yards from own goal line). */
  firstDownLine: number;
  /** Which team has the ball — home drives right-to-left on the field. */
  possession?: 'home' | 'away';
  /** Compact mode — no Card wrapper, smaller */
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDriveTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────

export function DriveTracker({
  startPosition,
  currentPosition,
  plays,
  yards,
  timeElapsed,
  teamColor,
  firstDownLine,
  possession = 'away',
  compact = false,
}: DriveTrackerProps) {
  // For the home team, the drive goes right-to-left on the field,
  // so flip positions so the bar reads correctly (own goal → opponent goal).
  const flip = possession === 'home';
  // Clamp positions to 0-100
  const clampedStart = Math.max(0, Math.min(100, flip ? 100 - startPosition : startPosition));
  const clampedCurrent = Math.max(0, Math.min(100, flip ? 100 - currentPosition : currentPosition));
  const clampedFirstDown = Math.max(0, Math.min(100, flip ? 100 - firstDownLine : firstDownLine));

  // Calculate progress percentages for the bar
  const progressData = useMemo(() => {
    const startPct = clampedStart;
    const currentPct = clampedCurrent;
    const firstDownPct = clampedFirstDown;

    // The drive bar shows from startPosition to currentPosition
    const barLeft = Math.min(startPct, currentPct);
    const barRight = Math.max(startPct, currentPct);
    const barWidth = barRight - barLeft;

    return { startPct, currentPct, firstDownPct, barLeft, barWidth };
  }, [clampedStart, clampedCurrent, clampedFirstDown]);

  // Are we past the first down line?
  const pastFirstDown = clampedCurrent >= clampedFirstDown;

  // Yard line labels for the compact field
  const yardMarkers = [10, 20, 30, 40, 50, 60, 70, 80, 90];

  const barHeight = compact ? 'h-4' : 'h-6';

  const content = (
    <>
      {/* Drive stats header */}
      <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: teamColor }}
          />
          <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-bold uppercase tracking-wider text-text-primary`}>
            Current Drive
          </span>
        </div>
        <div className={`flex items-center gap-3 ${compact ? 'text-[9px]' : 'text-[10px]'} text-text-muted font-mono tabular-nums`}>
          <span>
            <span className="text-text-secondary font-semibold">{plays}</span> plays
          </span>
          <span>
            <span className="text-text-secondary font-semibold">{yards}</span> yds
          </span>
          {!compact && <span>{formatDriveTime(timeElapsed)}</span>}
        </div>
      </div>

      {/* Field bar */}
      <div className={`relative w-full ${barHeight} rounded bg-surface-elevated overflow-hidden`}>
        {/* Yard line markers */}
        {yardMarkers.map((yd) => (
          <div
            key={yd}
            className="absolute top-0 bottom-0 w-px"
            style={{
              left: `${yd}%`,
              backgroundColor:
                yd === 50 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
            }}
          />
        ))}

        {/* Yard numbers */}
        {!compact && [10, 20, 30, 40, 50].map((yd, i) => {
          const displayNum = yd;
          return (
            <span
              key={`num-${i}`}
              className="absolute text-[7px] font-bold text-white/10 select-none pointer-events-none"
              style={{
                left: `${yd}%`,
                transform: 'translateX(-50%)',
                bottom: '1px',
              }}
            >
              {displayNum}
            </span>
          );
        })}

        {/* Drive progress fill */}
        <div
          className="absolute top-0 bottom-0 transition-all duration-500 ease-out rounded-r"
          style={{
            left: `${progressData.barLeft}%`,
            width: `${progressData.barWidth}%`,
            backgroundColor: teamColor,
            opacity: 0.35,
          }}
        />

        {/* Start position marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 transition-all duration-300"
          style={{
            left: `${progressData.startPct}%`,
            backgroundColor: 'rgba(255,255,255,0.4)',
            transform: 'translateX(-50%)',
          }}
        />

        {/* First down line marker (yellow) */}
        {clampedFirstDown <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 transition-all duration-300"
            style={{
              left: `${progressData.firstDownPct}%`,
              backgroundColor: pastFirstDown ? 'rgba(34,197,94,0.6)' : '#fbbf24',
              boxShadow: pastFirstDown
                ? '0 0 4px rgba(34,197,94,0.4)'
                : '0 0 4px rgba(251,191,36,0.4)',
              transform: 'translateX(-50%)',
            }}
          >
            {!compact && (
              <span
                className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold"
                style={{ color: pastFirstDown ? '#22c55e' : '#fbbf24' }}
              >
                1st
              </span>
            )}
          </div>
        )}

        {/* Current ball position marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 transition-all duration-500 ease-out"
          style={{ left: `${progressData.currentPct}%` }}
        >
          <div
            className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} rounded-full border-2 border-white`}
            style={{
              backgroundColor: teamColor,
              boxShadow: `0 0 6px ${teamColor}80, 0 0 12px ${teamColor}40`,
            }}
          />
        </div>
      </div>

      {/* End zone labels */}
      {!compact && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-[8px] text-text-muted font-semibold tracking-wide">
            OWN
          </span>
          <span className="text-[8px] text-text-muted font-semibold tracking-wide">
            OPP
          </span>
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <div className="px-3 py-1.5 border-t border-white/[0.06]">
        {content}
      </div>
    );
  }

  return (
    <Card variant="glass" padding="sm" className="overflow-hidden">
      {content}
    </Card>
  );
}
