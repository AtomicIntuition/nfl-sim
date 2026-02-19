'use client';

import Link from 'next/link';
import type { ScheduledGame } from '@/lib/simulation/types';
import { Badge } from '@/components/ui/badge';

interface GameCardProps {
  game: ScheduledGame;
}

function formatClock(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function GameStatusBadge({ game }: { game: ScheduledGame }) {
  switch (game.status) {
    case 'broadcasting':
      return (
        <Badge variant="live" size="sm" pulse>
          LIVE
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="final" size="sm">
          FINAL
        </Badge>
      );
    case 'simulating':
      return (
        <Badge variant="upcoming" size="sm">
          SIM
        </Badge>
      );
    case 'scheduled':
    default:
      return (
        <Badge variant="upcoming" size="sm">
          {game.broadcastStartedAt
            ? formatClock(game.broadcastStartedAt)
            : 'Upcoming'}
        </Badge>
      );
  }
}

export function GameCard({ game }: GameCardProps) {
  const { homeTeam, awayTeam, homeScore, awayScore, status } = game;
  const isFinished = status === 'completed';
  const isLive = status === 'broadcasting';
  const hasScores = homeScore !== null && awayScore !== null;

  const homeWon = isFinished && hasScores && homeScore > awayScore;
  const awayWon = isFinished && hasScores && awayScore > homeScore;

  return (
    <Link
      href={`/game/${game.id}`}
      className={`
        block rounded-xl p-3 transition-all duration-200
        bg-surface border border-border
        hover:bg-surface-hover hover:border-border-bright
        ${isLive ? 'ring-1 ring-live-red/30' : ''}
      `}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-2">
        <GameStatusBadge game={game} />
        {game.isFeatured && (
          <span className="text-[10px] font-semibold text-gold uppercase tracking-wider">
            Featured
          </span>
        )}
      </div>

      {/* Matchup */}
      <div className="space-y-1.5">
        {/* Away Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-1 h-6 rounded-full shrink-0"
              style={{
                backgroundColor: awayTeam?.primaryColor ?? '#6b7280',
              }}
            />
            <span
              className={`
                text-sm font-semibold truncate
                ${awayWon ? 'text-text-primary' : 'text-text-secondary'}
              `}
            >
              {awayTeam?.abbreviation ?? 'TBD'}
            </span>
            <span className="text-xs text-text-muted truncate hidden sm:inline">
              {awayTeam?.name ?? ''}
            </span>
          </div>
          {hasScores && (
            <span
              className={`
                text-sm font-mono font-bold tabular-nums
                ${awayWon ? 'text-text-primary' : 'text-text-muted'}
              `}
            >
              {awayScore}
            </span>
          )}
        </div>

        {/* Home Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-1 h-6 rounded-full shrink-0"
              style={{
                backgroundColor: homeTeam?.primaryColor ?? '#6b7280',
              }}
            />
            <span
              className={`
                text-sm font-semibold truncate
                ${homeWon ? 'text-text-primary' : 'text-text-secondary'}
              `}
            >
              {homeTeam?.abbreviation ?? 'TBD'}
            </span>
            <span className="text-xs text-text-muted truncate hidden sm:inline">
              {homeTeam?.name ?? ''}
            </span>
          </div>
          {hasScores && (
            <span
              className={`
                text-sm font-mono font-bold tabular-nums
                ${homeWon ? 'text-text-primary' : 'text-text-muted'}
              `}
            >
              {homeScore}
            </span>
          )}
        </div>
      </div>

      {/* At indicator for scheduled games */}
      {!hasScores && (
        <div className="text-center mt-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">
            {awayTeam?.abbreviation ?? '?'} @ {homeTeam?.abbreviation ?? '?'}
          </span>
        </div>
      )}
    </Link>
  );
}
