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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 scorebug-glass safe-bottom">
      {/* Main scorebug bar */}
      <div className="max-w-3xl mx-auto">
        {/* Desktop layout */}
        <div className="hidden sm:flex items-center h-[72px] px-4 gap-1">
          {/* Live badge */}
          <div className="w-14 flex-shrink-0">
            {status === 'live' ? (
              <Badge variant="live" size="sm" pulse>
                LIVE
              </Badge>
            ) : (
              <Badge variant="final" size="sm">
                FINAL
              </Badge>
            )}
          </div>

          {/* Teams and scores */}
          <div className="flex flex-col gap-0.5 min-w-[160px]">
            {/* Away team row */}
            <div className="flex items-center gap-2">
              <img
                src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
                alt=""
                className="w-5 h-5 flex-shrink-0 object-contain"
              />
              <span
                className={`text-sm font-bold tracking-wide w-10 ${
                  possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {awayTeam.abbreviation}
              </span>
              {possession === 'away' && (
                <span className="text-gold text-[10px]">{'\u25C0'}</span>
              )}
              <span
                className={`font-mono text-lg font-black tabular-nums min-w-[28px] text-right ${
                  awayScoreAnim ? 'score-update' : ''
                }`}
              >
                {awayScore}
              </span>
            </div>
            {/* Home team row */}
            <div className="flex items-center gap-2">
              <img
                src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
                alt=""
                className="w-5 h-5 flex-shrink-0 object-contain"
              />
              <span
                className={`text-sm font-bold tracking-wide w-10 ${
                  possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {homeTeam.abbreviation}
              </span>
              {possession === 'home' && (
                <span className="text-gold text-[10px]">{'\u25C0'}</span>
              )}
              <span
                className={`font-mono text-lg font-black tabular-nums min-w-[28px] text-right ${
                  homeScoreAnim ? 'score-update' : ''
                }`}
              >
                {homeScore}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-border mx-3" />

          {/* Clock and quarter */}
          <div className="flex flex-col items-center min-w-[80px]">
            <span className="text-[11px] font-semibold text-text-secondary tracking-wider uppercase">
              {formatQuarter(quarter)}
            </span>
            <span className="font-mono text-xl font-black tabular-nums text-text-primary">
              {isHalftime ? 'HALF' : clockDisplay}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-border mx-3" />

          {/* Situation */}
          <div className="flex flex-col items-start min-w-[140px]">
            <span className="text-xs font-bold text-text-primary tracking-wide">
              {situationText}
            </span>
            {fieldPosText && (
              <span className="text-[11px] text-text-muted font-medium">
                {fieldPosText}
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-border mx-3" />

          {/* Timeouts */}
          <div className="flex flex-col gap-1 min-w-[80px]">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-text-muted w-8 text-right">
                {awayTeam.abbreviation}
              </span>
              <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-text-muted w-8 text-right">
                {homeTeam.abbreviation}
              </span>
              <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} />
            </div>
          </div>
        </div>

        {/* Mobile layout — compact two-row design */}
        <div className="sm:hidden">
          {/* Top row: teams, scores, clock */}
          <div className="flex items-center h-10 px-3 gap-2">
            {/* Live badge */}
            {status === 'live' ? (
              <Badge variant="live" size="sm" pulse>
                LIVE
              </Badge>
            ) : (
              <Badge variant="final" size="sm">
                FINAL
              </Badge>
            )}

            {/* Away */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <img
                src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
                alt=""
                className="w-4 h-4 flex-shrink-0 object-contain"
              />
              <span
                className={`text-xs font-bold ${
                  possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {possession === 'away' && (
                  <span className="text-gold text-[8px] mr-0.5">{'\u25B6'}</span>
                )}
                {awayTeam.abbreviation}
              </span>
              <span
                className={`font-mono text-sm font-black tabular-nums ${
                  awayScoreAnim ? 'score-update' : ''
                }`}
              >
                {awayScore}
              </span>
            </div>

            {/* Clock */}
            <div className="flex flex-col items-center px-2">
              <span className="text-[9px] font-semibold text-text-muted tracking-widest uppercase">
                {formatQuarter(quarter)}
              </span>
              <span className="font-mono text-sm font-black tabular-nums leading-none">
                {isHalftime ? 'HALF' : clockDisplay}
              </span>
            </div>

            {/* Home */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span
                className={`font-mono text-sm font-black tabular-nums ${
                  homeScoreAnim ? 'score-update' : ''
                }`}
              >
                {homeScore}
              </span>
              <span
                className={`text-xs font-bold ${
                  possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {homeTeam.abbreviation}
                {possession === 'home' && (
                  <span className="text-gold text-[8px] ml-0.5">{'\u25C0'}</span>
                )}
              </span>
              <img
                src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
                alt=""
                className="w-4 h-4 flex-shrink-0 object-contain"
              />
            </div>
          </div>

          {/* Bottom row: situation, timeouts */}
          <div className="flex items-center h-7 px-3 gap-2 border-t border-white/[0.04]">
            <span className="text-[10px] font-bold text-text-secondary tracking-wide flex-1">
              {situationText}
              {fieldPosText && (
                <span className="text-text-muted font-medium ml-2">{fieldPosText}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} size="sm" />
              <span className="text-[8px] text-text-muted">|</span>
              <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} size="sm" />
            </div>
          </div>
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
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full transition-colors duration-300`}
          style={{
            backgroundColor: i <= remaining ? color : 'transparent',
            border: `1.5px solid ${i <= remaining ? color : 'rgba(100, 116, 139, 0.4)'}`,
          }}
        />
      ))}
    </div>
  );
}
