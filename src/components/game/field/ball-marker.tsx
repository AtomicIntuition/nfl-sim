'use client';

import { useEffect, useRef, useState } from 'react';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

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
  /** Team abbreviation for logo display */
  teamAbbreviation?: string;
  /** Team primary color for border */
  teamColor?: string;
}

/**
 * Primary ball marker — team logo badge with football accent.
 * Pulses between plays to keep the screen alive.
 */
export function BallMarker({
  leftPercent,
  topPercent = 50,
  direction,
  isKicking,
  hidden = false,
  teamAbbreviation,
  teamColor = '#A0522D',
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
      {/* Team logo badge */}
      <div className="relative flex flex-col items-center">
        {/* Pulse ring (visible between plays when not hidden) */}
        {!hidden && (
          <div
            className="absolute rounded-full animate-[ball-pulse_2s_ease-in-out_infinite]"
            style={{
              width: 34,
              height: 34,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              border: `2px solid ${teamColor}`,
              opacity: 0.3,
            }}
          />
        )}

        {/* Logo circle */}
        <div
          className="rounded-full overflow-hidden flex items-center justify-center"
          style={{
            width: 26,
            height: 26,
            backgroundColor: '#1a1a2e',
            border: `2px solid ${teamColor}`,
            boxShadow: `0 0 8px ${teamColor}40, 0 2px 6px rgba(0,0,0,0.6)`,
          }}
        >
          {teamAbbreviation ? (
            <img
              src={getTeamLogoUrl(teamAbbreviation)}
              alt=""
              className="w-[18px] h-[18px] object-contain"
              draggable={false}
            />
          ) : (
            /* Fallback football shape */
            <div
              style={{
                width: 14,
                height: 9,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
                border: '1px solid #5C2D06',
              }}
            />
          )}
        </div>

        {/* Small football accent below */}
        <div
          style={{
            width: 10,
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
