'use client';

import Link from 'next/link';
import type { ScheduledGame } from '@/lib/simulation/types';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface GameCardProps {
  game: ScheduledGame;
}

function formatEST(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' EST';
}

function getGameTimeLabel(game: ScheduledGame): string | null {
  if (game.status === 'broadcasting' || game.status === 'simulating') {
    return 'LIVE NOW';
  }
  if (game.status === 'completed' && game.broadcastStartedAt) {
    return formatEST(new Date(game.broadcastStartedAt));
  }
  if (game.status === 'scheduled' && game.scheduledAt) {
    return formatEST(new Date(game.scheduledAt));
  }
  return null;
}

export function GameCard({ game }: GameCardProps) {
  const { homeTeam, awayTeam, homeScore, awayScore, status } = game;
  const isFinished = status === 'completed';
  const isLive = status === 'broadcasting' || status === 'simulating';
  const isUpcoming = status === 'scheduled';
  const hasScores = homeScore !== null && awayScore !== null && isFinished;

  const homeWon = isFinished && hasScores && homeScore > awayScore;
  const awayWon = isFinished && hasScores && awayScore > homeScore;

  const timeLabel = getGameTimeLabel(game);

  return (
    <Link
      href={`/game/${game.id}`}
      className={`
        group block rounded-xl overflow-hidden transition-all duration-200
        bg-surface border
        hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20
        ${isLive ? 'border-live-red/40 shadow-lg shadow-live-red/10' : ''}
        ${isFinished ? 'border-border hover:border-border-bright' : ''}
        ${isUpcoming ? 'border-border hover:border-gold/30' : ''}
      `}
    >
      {/* Live pulse bar */}
      {isLive && (
        <div className="h-0.5 bg-gradient-to-r from-live-red via-red-400 to-live-red animate-pulse" />
      )}

      <div className="px-4 py-3.5">
        {/* Top row: status + time + meta */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLive && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-live-red" />
                </span>
                <span className="text-[10px] font-bold text-live-red uppercase tracking-widest">
                  Live
                </span>
              </div>
            )}
            {isFinished && (
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                Final
              </span>
            )}
            {isUpcoming && !timeLabel && (
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-widest">
                Upcoming
              </span>
            )}
            {isUpcoming && timeLabel && (
              <span className="text-[10px] font-medium text-text-secondary tracking-wide">
                {timeLabel}
              </span>
            )}
            {isFinished && timeLabel && (
              <span className="text-[10px] text-text-muted tracking-wide ml-1">
                {timeLabel}
              </span>
            )}
          </div>
          {game.isFeatured && (
            <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
              Featured
            </span>
          )}
        </div>

        {/* Away team row */}
        <div className={`flex items-center gap-3 ${awayWon ? '' : isFinished ? 'opacity-60' : ''}`}>
          <img
            src={getTeamLogoUrl(awayTeam?.abbreviation ?? '???')}
            alt={awayTeam?.name ?? 'Away'}
            width={36}
            height={36}
            className="w-9 h-9 object-contain flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-text-primary tracking-wide">
                {awayTeam?.abbreviation ?? 'TBD'}
              </span>
              <span className="text-xs text-text-muted truncate hidden sm:inline">
                {awayTeam?.mascot ?? ''}
              </span>
            </div>
          </div>
          {hasScores && (
            <span
              className={`
                text-lg font-mono font-black tabular-nums
                ${awayWon ? 'text-text-primary' : 'text-text-muted'}
              `}
            >
              {awayScore}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="my-2 border-t border-border/50" />

        {/* Home team row */}
        <div className={`flex items-center gap-3 ${homeWon ? '' : isFinished ? 'opacity-60' : ''}`}>
          <img
            src={getTeamLogoUrl(homeTeam?.abbreviation ?? '???')}
            alt={homeTeam?.name ?? 'Home'}
            width={36}
            height={36}
            className="w-9 h-9 object-contain flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-text-primary tracking-wide">
                {homeTeam?.abbreviation ?? 'TBD'}
              </span>
              <span className="text-xs text-text-muted truncate hidden sm:inline">
                {homeTeam?.mascot ?? ''}
              </span>
            </div>
          </div>
          {hasScores && (
            <span
              className={`
                text-lg font-mono font-black tabular-nums
                ${homeWon ? 'text-text-primary' : 'text-text-muted'}
              `}
            >
              {homeScore}
            </span>
          )}
        </div>
      </div>

      {/* Bottom accent bar for live games */}
      {isLive && (
        <div className="px-4 py-2 bg-live-red/5 border-t border-live-red/20">
          <span className="text-[10px] font-bold text-live-red tracking-wider uppercase">
            Tap to watch &rarr;
          </span>
        </div>
      )}
    </Link>
  );
}
