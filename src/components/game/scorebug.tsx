'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@/lib/simulation/types';
import { Badge } from '@/components/ui/badge';
import { useCountdown } from '@/hooks/use-countdown';
import {
  formatQuarter,
  formatDownAndDistance,
  formatFieldPosition,
} from '@/lib/utils/formatting';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';

interface ScoreBugProps {
  gameState: GameState;
  status: 'live' | 'game_over';
}

export function ScoreBug({ gameState, status }: ScoreBugProps) {
  const {
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    quarter,
    clock,
    possession,
    down,
    yardsToGo,
    ballPosition,
    homeTimeouts,
    awayTimeouts,
    isClockRunning,
    isHalftime,
    kickoff,
    patAttempt,
  } = gameState;

  const { formatted: clockDisplay } = useCountdown(clock, isClockRunning && status === 'live');

  // Track score changes for animation
  const [homeScoreAnim, setHomeScoreAnim] = useState(false);
  const [awayScoreAnim, setAwayScoreAnim] = useState(false);
  const prevHomeScore = useRef(homeScore);
  const prevAwayScore = useRef(awayScore);

  useEffect(() => {
    if (homeScore !== prevHomeScore.current) {
      setHomeScoreAnim(true);
      prevHomeScore.current = homeScore;
      const t = setTimeout(() => setHomeScoreAnim(false), 700);
      return () => clearTimeout(t);
    }
  }, [homeScore]);

  useEffect(() => {
    if (awayScore !== prevAwayScore.current) {
      setAwayScoreAnim(true);
      prevAwayScore.current = awayScore;
      const t = setTimeout(() => setAwayScoreAnim(false), 700);
      return () => clearTimeout(t);
    }
  }, [awayScore]);

  const situationText = isHalftime
    ? 'HALFTIME'
    : kickoff
      ? 'KICKOFF'
      : patAttempt
        ? 'PAT ATTEMPT'
        : formatDownAndDistance(down, yardsToGo, ballPosition);

  const fieldPosText =
    isHalftime || kickoff || patAttempt
      ? ''
      : formatFieldPosition(
          ballPosition,
          homeTeam.abbreviation,
          awayTeam.abbreviation,
          possession
        );

  const awayLeading = awayScore > homeScore;
  const homeLeading = homeScore > awayScore;

  return (
    <div className="scorebug-glass border-b border-white/[0.06] z-50 flex-shrink-0">
      {/* ── Desktop layout ── */}
      <div className="hidden sm:block max-w-5xl mx-auto">
        {/* Main scoreboard row */}
        <div className="flex items-center px-6 py-3">
          {/* Away team block */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative">
              <img
                src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
                alt=""
                className="w-12 h-12 flex-shrink-0 object-contain drop-shadow-lg"
              />
              {possession === 'away' && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: awayTeam.primaryColor, boxShadow: `0 0 6px ${awayTeam.primaryColor}` }}
                />
              )}
            </div>
            <div className="flex flex-col">
              <span
                className={`text-lg font-black tracking-wide leading-tight ${
                  possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {awayTeam.abbreviation}
              </span>
              <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} />
            </div>
            <span
              className={`font-mono text-5xl font-black tabular-nums ml-auto transition-all duration-300 ${
                awayScoreAnim ? 'score-update text-gold' : awayLeading ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {awayScore}
            </span>
          </div>

          {/* Center: quarter + clock + status */}
          <div className="flex flex-col items-center mx-8 min-w-[140px]">
            {status === 'live' ? (
              <Badge variant="live" size="md" pulse>LIVE</Badge>
            ) : (
              <Badge variant="final" size="md">FINAL</Badge>
            )}
            <span className="font-mono text-3xl font-black tabular-nums text-text-primary mt-1 leading-tight">
              {isHalftime ? 'HALF' : clockDisplay}
            </span>
            <span className="text-xs font-bold text-text-muted tracking-widest uppercase mt-0.5">
              {formatQuarter(quarter)}
            </span>
          </div>

          {/* Home team block */}
          <div className="flex items-center gap-4 flex-1 min-w-0 justify-end">
            <span
              className={`font-mono text-5xl font-black tabular-nums mr-auto transition-all duration-300 ${
                homeScoreAnim ? 'score-update text-gold' : homeLeading ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {homeScore}
            </span>
            <div className="flex flex-col items-end">
              <span
                className={`text-lg font-black tracking-wide leading-tight ${
                  possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {homeTeam.abbreviation}
              </span>
              <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} />
            </div>
            <div className="relative">
              <img
                src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
                alt=""
                className="w-12 h-12 flex-shrink-0 object-contain drop-shadow-lg"
              />
              {possession === 'home' && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: homeTeam.primaryColor, boxShadow: `0 0 6px ${homeTeam.primaryColor}` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Situation bar */}
        <div className="flex items-center justify-center gap-4 h-8 border-t border-white/[0.06] bg-white/[0.02]">
          <span className="text-sm font-bold text-text-primary tracking-wide">
            {situationText}
          </span>
          {fieldPosText && (
            <>
              <span className="text-xs text-border-bright">{'|'}</span>
              <span className="text-sm text-text-secondary font-semibold">
                {fieldPosText}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="sm:hidden">
        {/* Main scoreboard row */}
        <div className="flex items-center px-4 py-2.5">
          {/* Away side */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative">
              <img
                src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
                alt=""
                className="w-9 h-9 flex-shrink-0 object-contain drop-shadow-lg"
              />
              {possession === 'away' && (
                <div
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: awayTeam.primaryColor, boxShadow: `0 0 4px ${awayTeam.primaryColor}` }}
                />
              )}
            </div>
            <span
              className={`text-sm font-black tracking-wide ${
                possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {awayTeam.abbreviation}
            </span>
            <span
              className={`font-mono text-3xl font-black tabular-nums ml-auto ${
                awayScoreAnim ? 'score-update text-gold' : awayLeading ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {awayScore}
            </span>
          </div>

          {/* Center: clock + quarter */}
          <div className="flex flex-col items-center mx-4 min-w-[80px]">
            {status === 'live' ? (
              <Badge variant="live" size="sm" pulse>LIVE</Badge>
            ) : (
              <Badge variant="final" size="sm">FINAL</Badge>
            )}
            <span className="font-mono text-xl font-black tabular-nums text-text-primary mt-0.5 leading-tight">
              {isHalftime ? 'HALF' : clockDisplay}
            </span>
            <span className="text-[9px] font-bold text-text-muted tracking-widest uppercase">
              {formatQuarter(quarter)}
            </span>
          </div>

          {/* Home side */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span
              className={`font-mono text-3xl font-black tabular-nums mr-auto ${
                homeScoreAnim ? 'score-update text-gold' : homeLeading ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {homeScore}
            </span>
            <span
              className={`text-sm font-black tracking-wide ${
                possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {homeTeam.abbreviation}
            </span>
            <div className="relative">
              <img
                src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
                alt=""
                className="w-9 h-9 flex-shrink-0 object-contain drop-shadow-lg"
              />
              {possession === 'home' && (
                <div
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: homeTeam.primaryColor, boxShadow: `0 0 4px ${homeTeam.primaryColor}` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Situation bar */}
        <div className="flex items-center justify-between h-7 px-4 border-t border-white/[0.04] bg-white/[0.02]">
          <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} size="sm" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-text-primary tracking-wide">
              {situationText}
            </span>
            {fieldPosText && (
              <>
                <span className="text-[10px] text-border">{'|'}</span>
                <span className="text-xs text-text-secondary font-medium">
                  {fieldPosText}
                </span>
              </>
            )}
          </div>
          <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} size="sm" />
        </div>
      </div>
    </div>
  );
}

function TimeoutDots({
  remaining,
  color,
  size = 'md',
}: {
  remaining: number;
  color: string;
  size?: 'sm' | 'md';
}) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5';

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full transition-all duration-300`}
          style={{
            backgroundColor: i <= remaining ? color : 'transparent',
            border: `1.5px solid ${i <= remaining ? color : 'rgba(100, 116, 139, 0.3)'}`,
            boxShadow: i <= remaining ? `0 0 4px ${color}40` : 'none',
          }}
        />
      ))}
    </div>
  );
}
