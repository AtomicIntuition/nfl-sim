'use client';

import { useEffect, useState } from 'react';

interface CoinFlipProps {
  /** Whether to show the coin flip animation */
  show: boolean;
  /** Which team wins the toss (for result display) */
  winningTeam: string;
  /** Called when the coin flip animation completes */
  onComplete: () => void;
}

/**
 * 3D CSS coin flip animation shown at game start.
 * Uses preserve-3d with backface-visibility for realistic flip effect.
 * Coin has HEADS (front, with GI logo) and TAILS (back, with football).
 * Always lands on heads (1260deg = 7 full rotations = front face up).
 */
export function CoinFlip({ show, winningTeam, onComplete }: CoinFlipProps) {
  const [phase, setPhase] = useState<'flipping' | 'result' | 'fading' | 'done'>('flipping');

  useEffect(() => {
    if (!show) {
      setPhase('flipping');
      return;
    }

    // Coin flips for 2.5s
    const resultTimer = setTimeout(() => setPhase('result'), 2500);
    // Show result for 2s
    const fadeTimer = setTimeout(() => setPhase('fading'), 4500);
    // Complete
    const doneTimer = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 5500);

    return () => {
      clearTimeout(resultTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [show, onComplete]);

  if (!show || phase === 'done') return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 1s ease-out',
      }}
    >
      {/* Label */}
      <p
        className="text-xs sm:text-sm font-bold tracking-[0.2em] uppercase mb-4"
        style={{
          color: 'rgba(212, 175, 55, 0.7)',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }}
      >
        COIN TOSS
      </p>

      {/* Coin container */}
      <div
        className="coin-flip-container"
        style={{
          width: '120px',
          height: '120px',
          perspective: '600px',
        }}
      >
        <div
          className={phase === 'flipping' ? 'coin-flip-anim' : ''}
          style={{
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            ...(phase !== 'flipping'
              ? { transform: 'rotateY(1260deg) scale(1)' }
              : {}),
          }}
        >
          {/* Front face — HEADS with GI logo */}
          <div
            className="absolute inset-0 rounded-full flex flex-col items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(135deg, #d4af37 0%, #ffd700 50%, #b8960c 100%)',
              border: '3px solid #8B7A2E',
              boxShadow: '0 0 30px rgba(212, 175, 55, 0.4), inset 0 2px 4px rgba(255,255,255,0.3)',
            }}
          >
            <span
              className="text-3xl font-black leading-none"
              style={{
                color: '#5C3D0A',
                textShadow: '0 1px 2px rgba(255,255,255,0.3)',
              }}
            >
              GI
            </span>
            <span
              className="text-[9px] font-black tracking-wider mt-0.5"
              style={{ color: '#7A5C1A' }}
            >
              HEADS
            </span>
          </div>

          {/* Back face — TAILS with football icon */}
          <div
            className="absolute inset-0 rounded-full flex flex-col items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'linear-gradient(135deg, #b8960c 0%, #d4af37 50%, #ffd700 100%)',
              border: '3px solid #8B7A2E',
              boxShadow: '0 0 30px rgba(212, 175, 55, 0.4), inset 0 2px 4px rgba(255,255,255,0.3)',
            }}
          >
            <span
              className="text-3xl leading-none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.2))' }}
            >
              🏈
            </span>
            <span
              className="text-[9px] font-black tracking-wider mt-0.5"
              style={{ color: '#7A5C1A' }}
            >
              TAILS
            </span>
          </div>
        </div>
      </div>

      {/* Result text */}
      {phase === 'result' && (
        <div
          className="mt-5 text-center"
          style={{
            animation: 'coin-result-fade 0.6s ease-out forwards',
          }}
        >
          <p className="text-sm sm:text-base font-bold text-white/70 mb-1">
            It&apos;s heads!
          </p>
          <p className="text-lg sm:text-xl font-black text-gold">
            {winningTeam} wins the toss!
          </p>
          <p className="text-xs sm:text-sm font-semibold text-white/50 mt-1">
            They elect to receive
          </p>
        </div>
      )}
    </div>
  );
}
