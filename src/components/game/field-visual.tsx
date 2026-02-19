'use client';

import { useEffect, useRef, useState } from 'react';

interface FieldVisualProps {
  ballPosition: number;
  firstDownLine: number;
  possession: 'home' | 'away';
  homeTeam: { abbreviation: string; primaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string };
}

/**
 * Simplified horizontal football field showing ball position,
 * first down line, end zones, and red zone shading.
 *
 * Ball position is 0-100 from the possessing team's own end zone.
 * We convert to an absolute field position for rendering where:
 *   - Left end zone = away team's end zone
 *   - Right end zone = home team's end zone
 */
export function FieldVisual({
  ballPosition,
  firstDownLine,
  possession,
  homeTeam,
  awayTeam,
}: FieldVisualProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [prevBallPct, setPrevBallPct] = useState<number | null>(null);

  // Convert possession-relative position (0-100) to absolute field percentage
  // where 0% = far left (away endzone) and 100% = far right (home endzone)
  const toAbsolutePercent = (pos: number, team: 'home' | 'away'): number => {
    if (team === 'home') {
      // Home team: their own 0 is the right endzone (100%), their 100 is the left (0%)
      // Actually: home 0 = home's own goal line (right side), moving toward away endzone
      // So home's own 25 means 25 yards from right side = 75% from left
      return 100 - pos;
    }
    // Away team: their own 0 is the left endzone (0%), their 100 is the right (100%)
    return pos;
  };

  const absoluteBallPct = toAbsolutePercent(ballPosition, possession);
  const absoluteFirstDownPct = toAbsolutePercent(
    Math.min(firstDownLine, 100),
    possession
  );

  // Ball position within the playing field (between end zones)
  // End zones take ~8.33% each side, playing field is ~83.33% in the middle
  const endZoneWidth = 8.33;
  const fieldStart = endZoneWidth;
  const fieldWidth = 100 - endZoneWidth * 2;

  const ballLeft = fieldStart + (absoluteBallPct / 100) * fieldWidth;
  const firstDownLeft = fieldStart + (absoluteFirstDownPct / 100) * fieldWidth;

  // Red zone detection (inside opponent's 20)
  const isInRedZone = ballPosition >= 80;
  const redZoneStart =
    possession === 'home'
      ? fieldStart + (80 / 100) * fieldWidth // Away's 20 from left
      : fieldStart;
  const redZoneEnd =
    possession === 'home'
      ? fieldStart + fieldWidth
      : fieldStart + (20 / 100) * fieldWidth;

  // Track previous position for ball animation
  useEffect(() => {
    setPrevBallPct(absoluteBallPct);
  }, [absoluteBallPct]);

  const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

  return (
    <div className="w-full px-2 py-2">
      <div
        ref={fieldRef}
        className="relative w-full h-12 sm:h-16 rounded-lg overflow-hidden field-gradient border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line.`}
      >
        {/* End zones */}
        <div
          className="absolute left-0 top-0 bottom-0 flex items-center justify-center"
          style={{
            width: `${endZoneWidth}%`,
            backgroundColor: awayTeam.primaryColor,
            opacity: 0.7,
          }}
        >
          <span className="text-[8px] sm:text-[10px] font-black text-white/80 tracking-widest uppercase rotate-0 select-none">
            {awayTeam.abbreviation}
          </span>
        </div>
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
          style={{
            width: `${endZoneWidth}%`,
            backgroundColor: homeTeam.primaryColor,
            opacity: 0.7,
          }}
        >
          <span className="text-[8px] sm:text-[10px] font-black text-white/80 tracking-widest uppercase select-none">
            {homeTeam.abbreviation}
          </span>
        </div>

        {/* Yard lines every 10 yards (9 lines: 10, 20, 30, 40, 50, 60, 70, 80, 90) */}
        {Array.from({ length: 9 }, (_, i) => {
          const yardLine = (i + 1) * 10; // 10..90
          const leftPct = fieldStart + (yardLine / 100) * fieldWidth;
          return (
            <div
              key={yardLine}
              className="absolute top-0 bottom-0 w-px"
              style={{
                left: `${leftPct}%`,
                backgroundColor:
                  yardLine === 50
                    ? 'rgba(255,255,255,0.35)'
                    : 'rgba(255,255,255,0.15)',
              }}
            />
          );
        })}

        {/* Yard numbers */}
        {yardNumbers.map((num, i) => {
          const yardLine = (i + 1) * 10;
          const leftPct = fieldStart + (yardLine / 100) * fieldWidth;
          return (
            <span
              key={`num-${i}`}
              className="absolute text-[7px] sm:text-[9px] font-bold text-white/20 select-none pointer-events-none"
              style={{
                left: `${leftPct}%`,
                transform: 'translateX(-50%)',
                bottom: '2px',
              }}
            >
              {num}
            </span>
          );
        })}

        {/* Red zone shading */}
        {isInRedZone && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${Math.min(redZoneStart, redZoneEnd)}%`,
              width: `${Math.abs(redZoneEnd - redZoneStart)}%`,
              background: 'rgba(239, 68, 68, 0.1)',
            }}
          />
        )}

        {/* First down line marker (yellow) */}
        {firstDownLine <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
            style={{
              left: `${firstDownLeft}%`,
              backgroundColor: '#fbbf24',
              boxShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
              transform: 'translateX(-50%)',
            }}
          />
        )}

        {/* Ball marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 ball-marker"
          style={
            {
              left: `${ballLeft}%`,
              '--ball-from': prevBallPct !== null ? `${((prevBallPct - absoluteBallPct) / 100) * (fieldRef.current?.offsetWidth ?? 0)}px` : '0px',
              '--ball-to': '0px',
            } as React.CSSProperties
          }
        >
          {/* Outer glow */}
          <div
            className="absolute inset-0 rounded-full blur-sm"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: 'rgba(251, 191, 36, 0.4)',
              transform: 'translate(-25%, -25%)',
            }}
          />
          {/* Ball dot */}
          <div
            className="relative w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white shadow-lg"
            style={{
              backgroundColor: '#fbbf24',
              boxShadow: '0 0 8px rgba(251, 191, 36, 0.6), 0 0 16px rgba(251, 191, 36, 0.3)',
            }}
          />
        </div>

        {/* Line of scrimmage (blue) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
          style={{
            left: `${ballLeft}%`,
            backgroundColor: '#3b82f6',
            opacity: 0.6,
            transform: 'translateX(-50%)',
          }}
        />
      </div>
    </div>
  );
}
