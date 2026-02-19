'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  Team,
  BoxScore as BoxScoreType,
  PlayerGameStats,
} from '@/lib/simulation/types';
import { GameViewer } from '@/components/game/game-viewer';
import { GameOverSummary } from '@/components/game/game-over-summary';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';

interface GameRecapPageProps {
  gameId: string;
  homeTeam: Team;
  awayTeam: Team;
  finalScore: { home: number; away: number };
  boxScore: BoxScoreType | null;
  mvp: PlayerGameStats | null;
}

export function GameRecapPage({
  gameId,
  homeTeam,
  awayTeam,
  finalScore,
  boxScore,
  mvp,
}: GameRecapPageProps) {
  const [mode, setMode] = useState<'recap' | 'replay'>('recap');

  if (mode === 'replay') {
    return (
      <div className="flex flex-col min-h-dvh">
        {/* Replay toolbar */}
        <div className="flex items-center justify-between px-4 py-2 scorebug-glass border-b border-white/[0.06] flex-shrink-0 z-50">
          <button
            onClick={() => setMode('recap')}
            className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
          >
            <span className="text-sm">{'\u2190'}</span>
            Back to Recap
          </button>
          <div className="flex items-center gap-2">
            <img src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)} alt="" className="w-4 h-4 object-contain" />
            <span className="text-xs font-bold text-text-primary">
              {awayTeam.abbreviation} {finalScore.away}
            </span>
            <span className="text-xs text-text-muted">-</span>
            <span className="text-xs font-bold text-text-primary">
              {finalScore.home} {homeTeam.abbreviation}
            </span>
            <img src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)} alt="" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-[10px] font-bold text-gold tracking-wider uppercase">
            REPLAY
          </span>
        </div>

        {/* Full game viewer replay */}
        <div className="flex-1 min-h-0">
          <GameViewer gameId={gameId} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 scorebug-glass border-b border-white/[0.06]">
        <Link
          href="/"
          className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
        >
          {'\u2190'} Home
        </Link>
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">
          Game Recap
        </span>
        <Link
          href="/schedule"
          className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
        >
          Schedule
        </Link>
      </div>

      {/* Recap content */}
      <div className="pb-4">
        <GameOverSummary
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          finalScore={finalScore}
          boxScore={boxScore}
          mvp={mvp}
          nextGameCountdown={0}
        />

        {/* Watch replay button */}
        <div className="max-w-lg mx-auto px-4 mt-2">
          <button
            onClick={() => setMode('replay')}
            className="w-full glass-card rounded-xl py-3.5 text-center text-sm font-bold text-gold hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-base">{'\u25B6'}</span>
            Watch Full Replay
          </button>
        </div>
      </div>
    </div>
  );
}
