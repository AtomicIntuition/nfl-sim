'use client';

import { useEffect, useRef, useState } from 'react';

interface BallMarkerProps {
  /** Absolute field percentage 0-100 (0 = left/away endzone, 100 = right/home endzone) */
  leftPercent: number;
  /** Vertical position as percentage (default 50 = centered) */
  topPercent?: number;
  /** Direction of last play: 'left' | 'right' | null */
  direction: 'left' | 'right' | null;
  /** Whether a kick is in the air (punt/kickoff/FG) */
  isKicking: boolean;
  /** When true, ball fades out (PlayScene is animating its own ball) */
  hidden?: boolean;
}

/**
 * Neutral LOS ball marker — simple dot with pulse ring.
 * Shows between plays to indicate ball position.
 */
export function BallMarker({
  leftPercent,
  topPercent = 50,
  direction,
  isKicking,
  hidden = false,
}: BallMarkerProps) {
  const [snap, setSnap] = useState(false);
  const prevLeft = useRef(leftPercent);

  // Trigger snap bounce on ball movement
  useEffect(() => {
    if (Math.abs(leftPercent - prevLeft.current) > 0.5) {
      setSnap(true);
      const timer = setTimeout(() => setSnap(false), 300);
      prevLeft.current = leftPercent;
      return () => clearTimeout(timer);
    }
  }, [leftPercent]);

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transition: hidden
          ? 'opacity 150ms ease-out'
          : 'left 600ms cubic-bezier(0.34, 1.56, 0.64, 1), top 400ms ease-out, opacity 200ms ease-in',
        transform: `translate(-50%, -50%)${snap ? ' scale(1.15)' : ''}`,
        opacity: hidden ? 0 : 1,
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* LED-style radial glow background */}
        {!hidden && (
          <div
            className="absolute rounded-full"
            style={{
              width: 32,
              height: 32,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.08) 40%, transparent 70%)',
            }}
          />
        )}

        {/* Outer pulse ring — gold glow */}
        {!hidden && (
          <div
            className="absolute rounded-full animate-[ball-pulse_2s_ease-in-out_infinite]"
            style={{
              width: 26,
              height: 26,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              border: '1.5px solid rgba(212, 175, 55, 0.4)',
              boxShadow: '0 0 8px rgba(212, 175, 55, 0.3)',
              opacity: 0.5,
            }}
          />
        )}

        {/* Main marker dot — larger, with gold glow */}
        <div
          className="rounded-full"
          style={{
            width: 13,
            height: 13,
            background: 'radial-gradient(circle at 35% 35%, #f0e6cc, #d4af37, #b8942e)',
            boxShadow: '0 0 10px rgba(212, 175, 55, 0.5), 0 0 4px rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.5)',
          }}
        />

        {/* Small football accent below */}
        <div
          style={{
            width: 9,
            height: 6,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
            border: '0.5px solid #5C2D06',
            marginTop: 2,
            opacity: 0.7,
            transform: direction === 'right' ? 'rotate(-15deg)' : direction === 'left' ? 'rotate(15deg)' : 'none',
            transition: 'transform 400ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
