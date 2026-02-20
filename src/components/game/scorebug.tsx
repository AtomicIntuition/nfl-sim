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

  const possTeamColor = possession === 'home' ? homeTeam.primaryColor : awayTeam.primaryColor;

  // Detect scoring for pulse effect
  const isScoringPlay = homeScoreAnim || awayScoreAnim;
  const scoringTeamColor = homeScoreAnim ? homeTeam.primaryColor : awayScoreAnim ? awayTeam.primaryColor : null;

  return (
    <div
      className="scorebug-glass border-b z-50 flex-shrink-0"
      style={{
        borderBottomWidth: '2px',
        borderBottomColor: possTeamColor,
        boxShadow: isScoringPlay && scoringTeamColor
          ? `0 2px 12px ${scoringTeamColor}40, inset 0 -1px 8px ${scoringTeamColor}15`
          : undefined,
        transition: 'border-color 400ms ease-out, box-shadow 400ms ease-out',
      }}
    >
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
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5"
                >
                  <span className="text-[8px] font-black tracking-widest uppercase" style={{ color: awayTeam.primaryColor, textShadow: `0 0 8px ${awayTeam.primaryColor}` }}>
                    POSS
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                {possession === 'away' && (
                  <PossessionArrow color={awayTeam.primaryColor} />
                )}
                <span
                  className={`text-lg font-black tracking-wide leading-tight ${
                    possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {awayTeam.abbreviation}
                </span>
              </div>
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
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-lg font-black tracking-wide leading-tight ${
                    possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {homeTeam.abbreviation}
                </span>
                {possession === 'home' && (
                  <PossessionArrow color={homeTeam.primaryColor} direction="left" />
                )}
              </div>
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
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5"
                >
                  <span className="text-[8px] font-black tracking-widest uppercase" style={{ color: homeTeam.primaryColor, textShadow: `0 0 8px ${homeTeam.primaryColor}` }}>
                    POSS
                  </span>
                </div>
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
            </div>
            <div className="flex items-center gap-1">
              {possession === 'away' && (
                <PossessionArrow color={awayTeam.primaryColor} size="sm" />
              )}
              <span
                className={`text-sm font-black tracking-wide ${
                  possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {awayTeam.abbreviation}
              </span>
            </div>
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
            <div className="flex items-center gap-1">
              <span
                className={`text-sm font-black tracking-wide ${
                  possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {homeTeam.abbreviation}
              </span>
              {possession === 'home' && (
                <PossessionArrow color={homeTeam.primaryColor} size="sm" direction="left" />
              )}
            </div>
            <div className="relative">
              <img
                src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
                alt=""
                className="w-9 h-9 flex-shrink-0 object-contain drop-shadow-lg"
              />
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

function PossessionArrow({
  color,
  size = 'md',
  direction = 'right',
}: {
  color: string;
  size?: 'sm' | 'md';
  direction?: 'left' | 'right';
}) {
  const dim = size === 'sm' ? 10 : 14;
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 14 14"
      className="flex-shrink-0"
      style={{ filter: `drop-shadow(0 0 4px ${color})`, transform: direction === 'left' ? 'scaleX(-1)' : undefined }}
    >
      {/* Small football icon */}
      <ellipse cx="7" cy="7" rx="6" ry="4" fill={color} opacity="0.9" />
      <line x1="4.5" y1="7" x2="9.5" y2="7" stroke="white" strokeWidth="0.8" opacity="0.8" />
      <line x1="5.5" y1="5.5" x2="5.5" y2="8.5" stroke="white" strokeWidth="0.5" opacity="0.7" />
      <line x1="7" y1="5" x2="7" y2="9" stroke="white" strokeWidth="0.5" opacity="0.7" />
      <line x1="8.5" y1="5.5" x2="8.5" y2="8.5" stroke="white" strokeWidth="0.5" opacity="0.7" />
    </svg>
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
