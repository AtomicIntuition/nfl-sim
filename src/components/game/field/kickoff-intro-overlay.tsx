'use client';

import { useEffect, useState } from 'react';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface KickoffIntroOverlayProps {
  show: boolean;
  awayTeam: { abbreviation: string; primaryColor: string };
  homeTeam: { abbreviation: string; primaryColor: string };
  onComplete: () => void;
}

/**
 * Pro-style matchup overlay shown between coin flip and first kickoff.
 * Displays team logos with a "VS" graphic, auto-dismisses after 4 seconds.
 */
export function KickoffIntroOverlay({
  show,
  awayTeam,
  homeTeam,
  onComplete,
}: KickoffIntroOverlayProps) {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'fading' | 'done'>('entering');

  useEffect(() => {
    if (!show) {
      setPhase('entering');
      return;
    }

    // Entrance animation: 300ms
    const enterTimer = setTimeout(() => setPhase('visible'), 300);
    // Start fading at 3.5s
    const fadeTimer = setTimeout(() => setPhase('fading'), 3500);
    // Complete at 4s
    const doneTimer = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [show, onComplete]);

  if (!show || phase === 'done') return null;

  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col items-center justify-center pointer-events-none"
      style={{
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)',
        opacity: phase === 'fading' ? 0 : phase === 'entering' ? 0 : 1,
        transition: 'opacity 500ms ease-out',
      }}
    >
      <div
        className="flex items-center gap-6 sm:gap-10"
        style={{
          animation: 'kickoff-intro-fade-in 0.4s ease-out forwards',
        }}
      >
        {/* Away team */}
        <div
          className="flex flex-col items-center"
          style={{ animation: 'kickoff-intro-logo-slide-left 0.5s ease-out 0.1s both' }}
        >
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle, ${awayTeam.primaryColor}30 0%, transparent 70%)`,
              boxShadow: `0 0 30px ${awayTeam.primaryColor}25`,
            }}
          >
            <img
              src={getTeamLogoUrl(awayTeam.abbreviation)}
              alt={awayTeam.abbreviation}
              className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
          </div>
          <span
            className="text-sm sm:text-base font-black tracking-wider mt-2"
            style={{ color: awayTeam.primaryColor, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
          >
            {awayTeam.abbreviation}
          </span>
        </div>

        {/* VS badge */}
        <div
          className="flex flex-col items-center"
          style={{ animation: 'kickoff-intro-vs-pop 0.5s ease-out 0.2s both' }}
        >
          <span
            className="text-2xl sm:text-3xl font-black tracking-widest"
            style={{
              color: '#d4af37',
              textShadow: '0 0 20px rgba(212, 175, 55, 0.4), 0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            VS
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.3em] uppercase text-text-muted mt-1">
            KICKOFF
          </span>
        </div>

        {/* Home team */}
        <div
          className="flex flex-col items-center"
          style={{ animation: 'kickoff-intro-logo-slide-right 0.5s ease-out 0.1s both' }}
        >
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle, ${homeTeam.primaryColor}30 0%, transparent 70%)`,
              boxShadow: `0 0 30px ${homeTeam.primaryColor}25`,
            }}
          >
            <img
              src={getTeamLogoUrl(homeTeam.abbreviation)}
              alt={homeTeam.abbreviation}
              className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
          </div>
          <span
            className="text-sm sm:text-base font-black tracking-wider mt-2"
            style={{ color: homeTeam.primaryColor, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
          >
            {homeTeam.abbreviation}
          </span>
        </div>
      </div>
    </div>
  );
}
