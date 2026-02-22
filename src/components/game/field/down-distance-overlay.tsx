'use client';

interface DownDistanceOverlayProps {
  /** Absolute field % for ball position (0=left, 100=right) */
  ballLeftPercent: number;
  /** Absolute field % for first down line */
  firstDownLeftPercent: number;
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  /** Is the ball inside the opponent's 20? */
  isRedZone: boolean;
  /** Is the ball inside the opponent's 5? */
  isGoalLine: boolean;
  possession: 'home' | 'away';
}

const DOWN_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

/**
 * NFL broadcast-style down & distance overlay:
 * - Yellow semi-transparent first-down zone
 * - Blue line of scrimmage
 * - Yellow first-down line with glow
 * - Down & distance text badge
 * - Red zone pulse overlay
 * - Goal line shimmer
 */
export function DownDistanceOverlay({
  ballLeftPercent,
  firstDownLeftPercent,
  down,
  yardsToGo,
  isRedZone,
  isGoalLine,
  possession,
}: DownDistanceOverlayProps) {
  const leftBound = Math.min(ballLeftPercent, firstDownLeftPercent);
  const rightBound = Math.max(ballLeftPercent, firstDownLeftPercent);
  const zoneWidth = rightBound - leftBound;

  const downText = `${DOWN_LABELS[down]} & ${yardsToGo >= 10 && yardsToGo >= 100 ? 'Goal' : yardsToGo}`;
  const isGoalToGo = yardsToGo >= 100 || firstDownLeftPercent <= 0 || firstDownLeftPercent >= 100;

  return (
    <>
      {/* Yellow first-down zone — brighter */}
      {zoneWidth > 0.5 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${leftBound}%`,
            width: `${zoneWidth}%`,
            background: 'rgba(251, 191, 36, 0.13)',
          }}
        />
      )}

      {/* Line of scrimmage — brighter blue with enhanced glow */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: `${ballLeftPercent}%`,
          width: '2.5px',
          transform: 'translateX(-50%)',
          background: '#60a5fa',
          boxShadow: '0 0 8px rgba(96, 165, 250, 0.7), 0 0 16px rgba(96, 165, 250, 0.4), 0 0 32px rgba(59, 130, 246, 0.2)',
        }}
      />

      {/* First down line — brighter gold with enhanced glow */}
      {!isGoalToGo && firstDownLeftPercent > 0 && firstDownLeftPercent < 100 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${firstDownLeftPercent}%`,
            width: '2.5px',
            transform: 'translateX(-50%)',
            background: '#fcd34d',
            boxShadow: '0 0 10px rgba(252, 211, 77, 0.9), 0 0 20px rgba(251, 191, 36, 0.5), 0 0 40px rgba(251, 191, 36, 0.2)',
          }}
        />
      )}

      {/* Down & distance badge — glass-morphism with glow border */}
      <div
        className="absolute pointer-events-none z-30"
        style={{
          left: `${ballLeftPercent}%`,
          top: '6px',
          transform: 'translateX(-50%)',
        }}
      >
        <div
          className="rounded px-2 py-0.5"
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(212, 175, 55, 0.25)',
            boxShadow: '0 0 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <span className="text-[10px] sm:text-xs font-mono font-black text-white whitespace-nowrap">
            {downText}
          </span>
        </div>
      </div>

      {/* Red zone pulse */}
      {isRedZone && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none red-zone-pulse"
          style={{
            // Pulse on the end zone side the offense is attacking
            left: possession === 'away' ? '83.33%' : '0%',
            width: '16.67%',
          }}
        />
      )}

      {/* Goal line shimmer */}
      {isGoalLine && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none goal-line-shimmer"
          style={{
            left: possession === 'away' ? '91.67%' : '8.33%',
            width: '2px',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </>
  );
}
