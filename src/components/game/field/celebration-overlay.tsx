'use client';

import { useEffect, useState, useRef, useMemo } from 'react';

type CelebType = 'touchdown' | 'turnover' | 'field_goal' | 'safety' | null;

interface CelebrationOverlayProps {
  type: CelebType;
  /** Scoring team's primary color (for confetti) */
  teamColor: string;
  /** Unique key to re-trigger animations */
  celebKey: number;
}

/**
 * Event-triggered visual overlays for big moments:
 * - Touchdown: confetti + golden "TOUCHDOWN!" text + white flash
 * - Turnover: screen shake + red flash + "TURNOVER" text
 * - Field goal: "FIELD GOAL - 3 PTS" overlay
 * - Safety: purple flash + "SAFETY - 2 PTS"
 */
export function CelebrationOverlay({ type, teamColor, celebKey }: CelebrationOverlayProps) {
  const [active, setActive] = useState(false);
  const prevKeyRef = useRef(celebKey);

  useEffect(() => {
    if (celebKey === prevKeyRef.current || !type) return;
    prevKeyRef.current = celebKey;

    setActive(true);
    const duration = type === 'touchdown' ? 2500 : type === 'turnover' ? 1200 : 1500;
    const timer = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(timer);
  }, [celebKey, type]);

  if (!active || !type) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {type === 'touchdown' && <TouchdownCelebration teamColor={teamColor} />}
      {type === 'turnover' && <TurnoverAlert />}
      {type === 'field_goal' && <FieldGoalCelebration />}
      {type === 'safety' && <SafetyCelebration />}
    </div>
  );
}

// ── Touchdown Celebration ──────────────────────────────────

function TouchdownCelebration({ teamColor }: { teamColor: string }) {
  const confettiPieces = useMemo(() => (
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 1,
      color: [teamColor, '#ffd700', '#ffffff', '#d4af37'][i % 4],
      size: 4 + Math.random() * 7,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
      glow: i % 3 === 0, // every 3rd piece glows
    }))
  ), [teamColor]);

  return (
    <>
      {/* Bright white screen flash — brief burst before team color wash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'white',
          animation: 'td-screen-flash 0.4s ease-out forwards',
        }}
      />

      {/* Team color wash */}
      <div className="absolute inset-0 td-flash-anim" />

      {/* Confetti with glow effect */}
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute confetti-fall-anim"
          style={{
            left: `${piece.left}%`,
            top: '-10px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: piece.id % 3 === 0 ? '50%' : '1px',
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            boxShadow: piece.glow ? `0 0 6px ${piece.color}, 0 0 12px ${piece.color}40` : 'none',
            '--confetti-drift': `${piece.drift}px`,
            '--confetti-rotation': `${piece.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* "TOUCHDOWN!" text with scale+fade entrance */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="td-text-pulse-anim text-3xl sm:text-5xl lg:text-6xl font-black tracking-wider super-bowl-text"
          style={{
            animation: 'td-text-entrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, td-text-pulse 1.5s ease-in-out 0.5s infinite',
          }}
        >
          TOUCHDOWN!
        </span>
      </div>
    </>
  );
}

// ── Turnover Alert ─────────────────────────────────────────

function TurnoverAlert() {
  return (
    <>
      {/* Red flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(239, 68, 68, 0.15)',
          animation: 'turnover-flash 0.8s ease-out forwards',
        }}
      />

      {/* Screen shake applied via parent class */}
      <div className="absolute inset-0 shake-anim">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="turnover-text-anim text-2xl sm:text-4xl lg:text-5xl font-black tracking-wider text-red-500"
            style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.6)' }}
          >
            TURNOVER
          </span>
        </div>
      </div>
    </>
  );
}

// ── Field Goal Celebration ─────────────────────────────────

function FieldGoalCelebration() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center" style={{ animation: 'coin-result-fade 0.5s ease-out forwards' }}>
        <span className="text-xl sm:text-3xl font-black tracking-wider text-gold"
          style={{ textShadow: '0 0 16px rgba(212, 175, 55, 0.5)' }}
        >
          FIELD GOAL
        </span>
        <span className="block text-sm sm:text-lg font-bold text-gold/70 mt-1">
          3 PTS
        </span>
      </div>
    </div>
  );
}

// ── Safety Celebration ─────────────────────────────────────

function SafetyCelebration() {
  return (
    <>
      {/* Purple flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(147, 51, 234, 0.15)',
          animation: 'turnover-flash 0.8s ease-out forwards',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center" style={{ animation: 'coin-result-fade 0.5s ease-out forwards' }}>
          <span className="text-xl sm:text-3xl font-black tracking-wider text-purple-400"
            style={{ textShadow: '0 0 16px rgba(147, 51, 234, 0.5)' }}
          >
            SAFETY
          </span>
          <span className="block text-sm sm:text-lg font-bold text-purple-400/70 mt-1">
            2 PTS
          </span>
        </div>
      </div>
    </>
  );
}
