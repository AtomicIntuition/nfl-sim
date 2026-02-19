'use client';

import { useState } from 'react';
import type {
  Team,
  BoxScore as BoxScoreType,
  PlayerGameStats,
  GameEvent,
} from '@/lib/simulation/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCountdown } from '@/hooks/use-countdown';
import { BoxScore } from '@/components/game/box-score';
import { formatClock } from '@/lib/utils/formatting';

interface GameOverSummaryProps {
  homeTeam: Team;
  awayTeam: Team;
  finalScore: { home: number; away: number };
  boxScore: BoxScoreType | null;
  mvp: PlayerGameStats | null;
  nextGameCountdown: number;
}

export function GameOverSummary({
  homeTeam,
  awayTeam,
  finalScore,
  boxScore,
  mvp,
  nextGameCountdown,
}: GameOverSummaryProps) {
  const [showFullBoxScore, setShowFullBoxScore] = useState(false);
  const { formatted: countdown, isExpired } = useCountdown(nextGameCountdown, nextGameCountdown > 0);

  const homeWon = finalScore.home > finalScore.away;
  const awayWon = finalScore.away > finalScore.home;
  const isTied = finalScore.home === finalScore.away;

  const winnerTeam = homeWon ? homeTeam : awayWon ? awayTeam : null;

  return (
    <div className="flex flex-col items-center px-4 py-6 space-y-6 max-w-lg mx-auto">
      {/* FINAL badge */}
      <Badge variant="final" size="md">
        FINAL
      </Badge>

      {/* Score display */}
      <div className="w-full glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          {/* Away team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white"
              style={{ backgroundColor: awayTeam.primaryColor }}
            >
              {awayTeam.abbreviation.charAt(0)}
            </div>
            <span
              className={`text-sm font-bold tracking-wide ${
                awayWon ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {awayTeam.abbreviation}
            </span>
            <span className="text-xs text-text-muted">{awayTeam.city}</span>
            <span
              className={`font-mono text-4xl font-black tabular-nums ${
                awayWon ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {finalScore.away}
            </span>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-text-muted text-2xl font-light">-</span>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white"
              style={{ backgroundColor: homeTeam.primaryColor }}
            >
              {homeTeam.abbreviation.charAt(0)}
            </div>
            <span
              className={`text-sm font-bold tracking-wide ${
                homeWon ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {homeTeam.abbreviation}
            </span>
            <span className="text-xs text-text-muted">{homeTeam.city}</span>
            <span
              className={`font-mono text-4xl font-black tabular-nums ${
                homeWon ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {finalScore.home}
            </span>
          </div>
        </div>

        {/* Winner highlight */}
        {winnerTeam && (
          <div className="mt-4 pt-3 border-t border-border text-center">
            <span className="text-xs text-text-muted font-medium">Winner</span>
            <p
              className="text-sm font-bold mt-0.5"
              style={{ color: winnerTeam.primaryColor }}
            >
              {winnerTeam.name}
            </p>
          </div>
        )}
      </div>

      {/* MVP Highlight */}
      {mvp && (
        <div className="w-full glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="gold" size="sm">
              MVP
            </Badge>
            <span className="text-[11px] font-semibold text-text-secondary tracking-wider uppercase">
              Player of the Game
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center text-gold font-black text-sm">
              #{mvp.player.number}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">
                {mvp.player.name}
              </p>
              <p className="text-xs text-text-muted">
                {mvp.player.position}
              </p>
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {getMvpStatLines(mvp).map((stat, i) => (
              <div
                key={i}
                className="bg-surface/50 rounded-lg p-2 text-center"
              >
                <div className="text-sm font-mono font-black text-gold tabular-nums">
                  {stat.value}
                </div>
                <div className="text-[9px] text-text-muted font-medium uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring plays */}
      {boxScore && boxScore.scoringPlays.length > 0 && (
        <div className="w-full glass-card rounded-2xl p-4">
          <div className="text-[11px] font-bold text-text-secondary tracking-wider uppercase mb-3">
            Scoring Summary
          </div>
          <div className="space-y-2">
            {boxScore.scoringPlays.map((event, i) => (
              <ScoringPlayRow
                key={i}
                event={event}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full box score toggle */}
      {boxScore && (
        <div className="w-full">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setShowFullBoxScore(!showFullBoxScore)}
          >
            {showFullBoxScore ? 'Hide' : 'View'} Full Box Score
          </Button>

          {showFullBoxScore && (
            <div className="mt-3 glass-card rounded-2xl overflow-hidden">
              <BoxScore
                boxScore={boxScore}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            </div>
          )}
        </div>
      )}

      {/* Next game countdown */}
      {nextGameCountdown > 0 && (
        <div className="w-full glass-card rounded-2xl p-4 text-center">
          <span className="text-[11px] text-text-muted font-semibold tracking-wider uppercase">
            {isExpired ? 'Next game starting...' : 'Next game starts in'}
          </span>
          {!isExpired && (
            <div className="font-mono text-2xl font-black text-gold tabular-nums mt-1">
              {countdown}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scoring play row ─────────────────────────────────────────

function ScoringPlayRow({
  event,
  homeTeam,
  awayTeam,
}: {
  event: GameEvent;
  homeTeam: Team;
  awayTeam: Team;
}) {
  const { playResult, gameState } = event;
  const scoring = playResult.scoring;
  if (!scoring) return null;

  const scoringTeam = scoring.team === 'home' ? homeTeam : awayTeam;
  const scorerName = scoring.scorer?.name ?? 'Team';
  const points = scoring.points;

  const typeLabel =
    scoring.type === 'touchdown'
      ? 'TD'
      : scoring.type === 'field_goal'
        ? 'FG'
        : scoring.type === 'extra_point'
          ? 'XP'
          : scoring.type === 'two_point_conversion'
            ? '2PT'
            : scoring.type === 'safety'
              ? 'SAF'
              : scoring.type === 'defensive_touchdown'
                ? 'DEF TD'
                : scoring.type === 'pick_six'
                  ? 'PICK 6'
                  : scoring.type === 'fumble_recovery_td'
                    ? 'FUM TD'
                    : '';

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className="w-1 h-6 rounded-full flex-shrink-0"
        style={{ backgroundColor: scoringTeam.primaryColor }}
      />
      <span className="font-bold text-text-primary w-8 flex-shrink-0">
        {scoringTeam.abbreviation}
      </span>
      <span className="text-text-secondary flex-1 min-w-0 truncate">
        {scorerName} {typeLabel} ({points} pts)
      </span>
      <span className="text-[10px] text-text-muted font-mono tabular-nums flex-shrink-0">
        Q{gameState.quarter === 'OT' ? 'OT' : gameState.quarter} {formatClock(gameState.clock)}
      </span>
    </div>
  );
}

// ── MVP stat line builder ────────────────────────────────────

function getMvpStatLines(mvp: PlayerGameStats): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  // QB stats
  if (mvp.attempts > 0) {
    lines.push({
      label: 'Pass Yds',
      value: `${mvp.passingYards}`,
    });
    lines.push({
      label: 'Comp/Att',
      value: `${mvp.completions}/${mvp.attempts}`,
    });
    lines.push({
      label: 'Pass TD',
      value: `${mvp.passingTDs}`,
    });
  }

  // Rushing stats
  if (mvp.carries > 0 && lines.length < 3) {
    lines.push({
      label: 'Rush Yds',
      value: `${mvp.rushingYards}`,
    });
    if (lines.length < 3) {
      lines.push({
        label: 'Carries',
        value: `${mvp.carries}`,
      });
    }
    if (lines.length < 3 && mvp.rushingTDs > 0) {
      lines.push({
        label: 'Rush TD',
        value: `${mvp.rushingTDs}`,
      });
    }
  }

  // Receiving stats
  if (mvp.receptions > 0 && lines.length < 3) {
    lines.push({
      label: 'Rec Yds',
      value: `${mvp.receivingYards}`,
    });
    if (lines.length < 3) {
      lines.push({
        label: 'Rec',
        value: `${mvp.receptions}`,
      });
    }
    if (lines.length < 3 && mvp.receivingTDs > 0) {
      lines.push({
        label: 'Rec TD',
        value: `${mvp.receivingTDs}`,
      });
    }
  }

  // Defense stats
  if (mvp.sacks > 0 && lines.length < 3) {
    lines.push({ label: 'Sacks', value: `${mvp.sacks}` });
  }
  if (mvp.tackles > 0 && lines.length < 3) {
    lines.push({ label: 'Tackles', value: `${mvp.tackles}` });
  }

  // Kicking
  if (mvp.fieldGoalsMade > 0 && lines.length < 3) {
    lines.push({
      label: 'FG',
      value: `${mvp.fieldGoalsMade}/${mvp.fieldGoalsAttempted}`,
    });
  }

  // Ensure we have exactly 3 lines
  while (lines.length < 3) {
    lines.push({ label: '-', value: '-' });
  }

  return lines.slice(0, 3);
}
