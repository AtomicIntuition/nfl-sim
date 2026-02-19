'use client';

import type { ScheduledGame } from '@/lib/simulation/types';

interface WeeklyRecapProps {
  week: number;
  results: ScheduledGame[];
  standingsUpdates: string[];
}

function GameResult({ game }: { game: ScheduledGame }) {
  const hasScores = game.homeScore !== null && game.awayScore !== null;
  if (!hasScores) return null;

  const homeWon = game.homeScore! > game.awayScore!;
  const awayWon = game.awayScore! > game.homeScore!;

  return (
    <div className="rounded-lg bg-surface border border-border p-3">
      {/* Away */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {game.awayTeam && (
            <span
              className="w-1 h-5 rounded-full shrink-0"
              style={{ backgroundColor: game.awayTeam.primaryColor }}
            />
          )}
          <span
            className={`
              text-sm font-semibold truncate
              ${awayWon ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {game.awayTeam?.abbreviation ?? 'TBD'}
          </span>
        </div>
        <span
          className={`
            text-sm font-mono font-bold tabular-nums
            ${awayWon ? 'text-text-primary' : 'text-text-muted'}
          `}
        >
          {game.awayScore}
        </span>
      </div>

      {/* Home */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {game.homeTeam && (
            <span
              className="w-1 h-5 rounded-full shrink-0"
              style={{ backgroundColor: game.homeTeam.primaryColor }}
            />
          )}
          <span
            className={`
              text-sm font-semibold truncate
              ${homeWon ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {game.homeTeam?.abbreviation ?? 'TBD'}
          </span>
        </div>
        <span
          className={`
            text-sm font-mono font-bold tabular-nums
            ${homeWon ? 'text-text-primary' : 'text-text-muted'}
          `}
        >
          {game.homeScore}
        </span>
      </div>
    </div>
  );
}

export function WeeklyRecap({ week, results, standingsUpdates }: WeeklyRecapProps) {
  const completedGames = results.filter(
    (g) => g.status === 'completed' && g.homeScore !== null
  );

  // Find stat leaders from completed games (simplified: show top scores)
  const highScorers = completedGames
    .flatMap((g) => {
      const entries: { team: string; score: number; color: string }[] = [];
      if (g.homeTeam && g.homeScore !== null) {
        entries.push({
          team: g.homeTeam.abbreviation,
          score: g.homeScore,
          color: g.homeTeam.primaryColor,
        });
      }
      if (g.awayTeam && g.awayScore !== null) {
        entries.push({
          team: g.awayTeam.abbreviation,
          score: g.awayScore,
          color: g.awayTeam.primaryColor,
        });
      }
      return entries;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-surface-elevated border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-wide">
              WEEK {week} RESULTS
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {completedGames.length} game{completedGames.length !== 1 ? 's' : ''} completed
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-muted">Coming up</span>
            <p className="text-sm font-semibold text-gold">
              Week {week + 1}
            </p>
          </div>
        </div>
      </div>

      {/* Game Results Grid */}
      {completedGames.length > 0 && (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {completedGames.map((game) => (
              <GameResult key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}

      {/* Standings Updates */}
      {standingsUpdates.length > 0 && (
        <div className="px-5 py-4 border-t border-border">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
            Standings Changes
          </h3>
          <div className="flex flex-wrap gap-2">
            {standingsUpdates.map((update, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-elevated border border-border text-text-secondary"
              >
                <svg
                  className="w-3 h-3 text-gold shrink-0"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M6 1l1.545 3.13L11 4.635 8.5 7.07l.59 3.43L6 8.885 2.91 10.5l.59-3.43L1 4.635l3.455-.505L6 1z" />
                </svg>
                {update}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Scores */}
      {highScorers.length > 0 && (
        <div className="px-5 py-4 border-t border-border">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
            Top Scores
          </h3>
          <div className="flex items-center gap-4 overflow-x-auto">
            {highScorers.map((entry, i) => (
              <div
                key={`${entry.team}-${i}`}
                className="flex items-center gap-2 shrink-0"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs font-semibold text-text-secondary">
                  {entry.team}
                </span>
                <span className="text-xs font-mono font-bold text-text-primary tabular-nums">
                  {entry.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coming Up Preview */}
      <div className="px-5 py-4 border-t border-border bg-gold/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-gold"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold text-gold">
              Week {week + 1} Preview
            </span>
            <p className="text-xs text-text-muted mt-0.5">
              Stay tuned for the next set of matchups
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
