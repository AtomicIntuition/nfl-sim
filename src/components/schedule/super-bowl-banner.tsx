'use client';

import type { PlayoffMatchup } from '@/lib/simulation/types';

interface SuperBowlBannerProps {
  matchup: PlayoffMatchup | null;
  isComplete: boolean;
}

function TrophySvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cup body */}
      <path
        d="M16 4H48V32C48 44.7 37.7 55 25 55H39C26.3 55 16 44.7 16 32V4Z"
        fill="url(#trophy-grad)"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* Left handle */}
      <path
        d="M16 12H10C6.7 12 4 14.7 4 18V22C4 25.3 6.7 28 10 28H16"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Right handle */}
      <path
        d="M48 12H54C57.3 12 60 14.7 60 18V22C60 25.3 57.3 28 54 28H48"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Stem */}
      <rect x="28" y="55" width="8" height="10" fill="currentColor" opacity="0.6" />
      {/* Base */}
      <rect x="20" y="65" width="24" height="4" rx="2" fill="currentColor" opacity="0.8" />
      <rect x="16" y="69" width="32" height="6" rx="3" fill="currentColor" />
      {/* Star */}
      <path
        d="M32 18L34.5 25.5H42L36 30L38 37.5L32 33L26 37.5L28 30L22 25.5H29.5L32 18Z"
        fill="currentColor"
        opacity="0.9"
      />
      <defs>
        <linearGradient id="trophy-grad" x1="16" y1="4" x2="48" y2="55">
          <stop offset="0%" stopColor="rgb(212, 175, 55)" stopOpacity="0.3" />
          <stop offset="50%" stopColor="rgb(255, 215, 0)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="rgb(139, 122, 46)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SuperBowlBanner({ matchup, isComplete }: SuperBowlBannerProps) {
  const winner = isComplete && matchup?.winner ? matchup.winner : null;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl
        border
        ${isComplete && winner ? 'border-gold/40' : 'border-border'}
      `}
      style={{
        background: isComplete && winner
          ? 'linear-gradient(135deg, rgba(10, 14, 26, 0.95) 0%, rgba(212, 175, 55, 0.08) 50%, rgba(10, 14, 26, 0.95) 100%)'
          : 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
      }}
    >
      {/* Background shimmer accents */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55, 0.4) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 px-6 py-8 sm:py-12 text-center">
        {/* Trophy */}
        <div className="flex justify-center mb-4">
          <TrophySvg className="w-12 h-16 sm:w-16 sm:h-20 text-gold" />
        </div>

        {/* Title */}
        <h2 className="super-bowl-text text-2xl sm:text-4xl font-black tracking-[0.15em] uppercase mb-2">
          Super Bowl
        </h2>
        <p className="text-xs sm:text-sm text-text-muted tracking-widest uppercase mb-8">
          Championship Game
        </p>

        {/* Matchup */}
        {matchup && (matchup.homeTeam || matchup.awayTeam) ? (
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            {/* Away team (AFC) */}
            <div className="flex-1 max-w-[200px] text-right">
              {matchup.awayTeam ? (
                <div>
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <span
                      className="w-3 h-8 sm:w-4 sm:h-10 rounded-sm"
                      style={{
                        backgroundColor: matchup.awayTeam.primaryColor,
                      }}
                    />
                    <span
                      className={`
                        text-xl sm:text-3xl font-black tracking-wide
                        ${
                          winner?.id === matchup.awayTeam.id
                            ? 'text-gold'
                            : isComplete
                              ? 'text-text-muted'
                              : 'text-text-primary'
                        }
                      `}
                    >
                      {matchup.awayTeam.abbreviation}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-text-muted">
                    AFC Champion
                  </p>
                  {matchup.awayScore !== null && (
                    <p
                      className={`
                        text-2xl sm:text-4xl font-mono font-black mt-2 tabular-nums
                        ${winner?.id === matchup.awayTeam.id ? 'text-gold-bright' : 'text-text-muted'}
                      `}
                    >
                      {matchup.awayScore}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-lg text-text-muted font-semibold">
                    TBD
                  </span>
                  <p className="text-[10px] text-text-muted">AFC Champion</p>
                </div>
              )}
            </div>

            {/* VS divider */}
            <div className="shrink-0">
              <span className="text-xs sm:text-sm font-bold text-text-muted tracking-widest">
                VS
              </span>
            </div>

            {/* Home team (NFC) */}
            <div className="flex-1 max-w-[200px] text-left">
              {matchup.homeTeam ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`
                        text-xl sm:text-3xl font-black tracking-wide
                        ${
                          winner?.id === matchup.homeTeam.id
                            ? 'text-gold'
                            : isComplete
                              ? 'text-text-muted'
                              : 'text-text-primary'
                        }
                      `}
                    >
                      {matchup.homeTeam.abbreviation}
                    </span>
                    <span
                      className="w-3 h-8 sm:w-4 sm:h-10 rounded-sm"
                      style={{
                        backgroundColor: matchup.homeTeam.primaryColor,
                      }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-xs text-text-muted">
                    NFC Champion
                  </p>
                  {matchup.homeScore !== null && (
                    <p
                      className={`
                        text-2xl sm:text-4xl font-mono font-black mt-2 tabular-nums
                        ${winner?.id === matchup.homeTeam.id ? 'text-gold-bright' : 'text-text-muted'}
                      `}
                    >
                      {matchup.homeScore}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-lg text-text-muted font-semibold">
                    TBD
                  </span>
                  <p className="text-[10px] text-text-muted">NFC Champion</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Conference champions yet to be determined
          </p>
        )}

        {/* Winner celebration */}
        {winner && (
          <div className="mt-8 pt-6 border-t border-gold/20">
            <p className="text-xs text-gold uppercase tracking-[0.2em] mb-2">
              Champion
            </p>
            <div className="flex items-center justify-center gap-3">
              <span
                className="w-3 h-10 rounded-sm"
                style={{ backgroundColor: winner.primaryColor }}
              />
              <span className="text-2xl sm:text-3xl font-black text-gold-bright tracking-wide">
                {winner.name}
              </span>
              <span
                className="w-3 h-10 rounded-sm"
                style={{ backgroundColor: winner.secondaryColor }}
              />
            </div>
            {/* Confetti dots */}
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: i % 2 === 0 ? winner.primaryColor : '#d4af37',
                    animationDelay: `${i * 100}ms`,
                    animationDuration: '1.2s',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
