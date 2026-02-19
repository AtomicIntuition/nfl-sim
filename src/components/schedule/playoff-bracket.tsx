'use client';

import type { PlayoffBracket, PlayoffMatchup, PlayoffRound } from '@/lib/simulation/types';

interface PlayoffBracketProps {
  bracket: PlayoffBracket | null;
  currentRound: string;
}

interface MatchupBoxProps {
  matchup: PlayoffMatchup;
  isCurrent: boolean;
  isSuperBowl?: boolean;
}

function MatchupBox({ matchup, isCurrent, isSuperBowl = false }: MatchupBoxProps) {
  const hasScores = matchup.homeScore !== null && matchup.awayScore !== null;
  const homeWon =
    hasScores && matchup.winner?.id === matchup.homeTeam?.id;
  const awayWon =
    hasScores && matchup.winner?.id === matchup.awayTeam?.id;

  return (
    <div
      className={`
        rounded-lg overflow-hidden border
        transition-all duration-200
        ${isSuperBowl ? 'border-gold/40 shadow-lg shadow-gold/10' : 'border-border'}
        ${isCurrent ? 'ring-1 ring-gold/30' : ''}
        ${matchup.status === 'broadcasting' ? 'ring-1 ring-live-red/40' : ''}
      `}
    >
      {/* Super Bowl label */}
      {isSuperBowl && (
        <div className="px-3 py-1.5 bg-gold/10 border-b border-gold/20 text-center">
          <span className="super-bowl-text text-[10px] font-bold tracking-[0.2em] uppercase">
            Super Bowl
          </span>
        </div>
      )}

      {/* Away (higher seed on top) */}
      <div
        className={`
          flex items-center justify-between px-3 py-2
          ${awayWon ? 'bg-surface-elevated' : 'bg-surface'}
          ${matchup.awayTeam ? '' : 'opacity-40'}
          border-b border-border/50
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-text-muted w-4 text-center shrink-0">
            {matchup.awaySeed}
          </span>
          {matchup.awayTeam && (
            <span
              className="w-1.5 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: matchup.awayTeam.primaryColor }}
            />
          )}
          <span
            className={`
              text-xs font-semibold truncate
              ${awayWon ? 'text-text-primary' : 'text-text-secondary'}
            `}
          >
            {matchup.awayTeam?.abbreviation ?? 'TBD'}
          </span>
        </div>
        {hasScores ? (
          <span
            className={`
              text-xs font-mono font-bold tabular-nums
              ${awayWon ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {matchup.awayScore}
          </span>
        ) : matchup.status === 'broadcasting' ? (
          <span className="flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-live-red opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-live-red" />
          </span>
        ) : null}
      </div>

      {/* Home (lower seed on bottom, typically the higher-seeded team) */}
      <div
        className={`
          flex items-center justify-between px-3 py-2
          ${homeWon ? 'bg-surface-elevated' : 'bg-surface'}
          ${matchup.homeTeam ? '' : 'opacity-40'}
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-text-muted w-4 text-center shrink-0">
            {matchup.homeSeed}
          </span>
          {matchup.homeTeam && (
            <span
              className="w-1.5 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: matchup.homeTeam.primaryColor }}
            />
          )}
          <span
            className={`
              text-xs font-semibold truncate
              ${homeWon ? 'text-text-primary' : 'text-text-secondary'}
            `}
          >
            {matchup.homeTeam?.abbreviation ?? 'TBD'}
          </span>
        </div>
        {hasScores ? (
          <span
            className={`
              text-xs font-mono font-bold tabular-nums
              ${homeWon ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {matchup.homeScore}
          </span>
        ) : matchup.status === 'broadcasting' ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-live-red opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-live-red" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RoundColumn({
  round,
  currentRound,
  side,
}: {
  round: PlayoffRound;
  currentRound: string;
  side: 'afc' | 'nfc';
}) {
  const isCurrent = round.name.toLowerCase().includes(currentRound.toLowerCase());

  return (
    <div className="flex flex-col gap-4">
      <h4
        className={`
          text-[10px] font-bold uppercase tracking-wider text-center
          ${isCurrent ? 'text-gold' : 'text-text-muted'}
        `}
      >
        {round.name}
      </h4>
      <div className="flex flex-col justify-around gap-4 flex-1">
        {round.matchups.map((matchup, i) => (
          <div key={`${side}-${round.name}-${i}`} className="bracket-line">
            <MatchupBox matchup={matchup} isCurrent={isCurrent} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayoffBracketView({ bracket, currentRound }: PlayoffBracketProps) {
  if (!bracket) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-text-muted text-sm">
          Playoff bracket will appear when the postseason begins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Desktop: Horizontal bracket */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="min-w-[900px] flex items-stretch gap-0">
          {/* AFC Side (left to center) */}
          <div className="flex-1">
            <div className="text-center mb-4">
              <span className="text-xs font-bold text-info uppercase tracking-widest">
                AFC
              </span>
            </div>
            <div className="flex gap-6 justify-end">
              {bracket.afc.map((round, i) => (
                <div key={`afc-${i}`} className="w-[160px]">
                  <RoundColumn round={round} currentRound={currentRound} side="afc" />
                </div>
              ))}
            </div>
          </div>

          {/* Super Bowl (center) */}
          <div className="w-[200px] flex flex-col items-center justify-center px-4">
            {bracket.superBowl ? (
              <MatchupBox
                matchup={bracket.superBowl}
                isCurrent={currentRound === 'super_bowl'}
                isSuperBowl
              />
            ) : (
              <div className="text-center">
                <span className="super-bowl-text text-xs font-bold tracking-[0.2em] uppercase">
                  Super Bowl
                </span>
                <p className="text-[10px] text-text-muted mt-1">TBD</p>
              </div>
            )}
          </div>

          {/* NFC Side (center to right) */}
          <div className="flex-1">
            <div className="text-center mb-4">
              <span className="text-xs font-bold text-danger uppercase tracking-widest">
                NFC
              </span>
            </div>
            <div className="flex gap-6">
              {[...bracket.nfc].reverse().map((round, i) => (
                <div key={`nfc-${i}`} className="w-[160px]">
                  <RoundColumn round={round} currentRound={currentRound} side="nfc" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Stacked vertical layout */}
      <div className="lg:hidden space-y-6">
        {/* Super Bowl */}
        {bracket.superBowl && (
          <div>
            <MatchupBox
              matchup={bracket.superBowl}
              isCurrent={currentRound === 'super_bowl'}
              isSuperBowl
            />
          </div>
        )}

        {/* AFC */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold text-info uppercase tracking-widest px-2">
              AFC Playoffs
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-4">
            {bracket.afc.map((round, ri) => (
              <div key={`afc-m-${ri}`}>
                <h4
                  className={`
                    text-[10px] font-bold uppercase tracking-wider mb-2
                    ${round.name.toLowerCase().includes(currentRound.toLowerCase()) ? 'text-gold' : 'text-text-muted'}
                  `}
                >
                  {round.name}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {round.matchups.map((matchup, mi) => (
                    <MatchupBox
                      key={`afc-m-${ri}-${mi}`}
                      matchup={matchup}
                      isCurrent={round.name.toLowerCase().includes(currentRound.toLowerCase())}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* NFC */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold text-danger uppercase tracking-widest px-2">
              NFC Playoffs
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-4">
            {bracket.nfc.map((round, ri) => (
              <div key={`nfc-m-${ri}`}>
                <h4
                  className={`
                    text-[10px] font-bold uppercase tracking-wider mb-2
                    ${round.name.toLowerCase().includes(currentRound.toLowerCase()) ? 'text-gold' : 'text-text-muted'}
                  `}
                >
                  {round.name}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {round.matchups.map((matchup, mi) => (
                    <MatchupBox
                      key={`nfc-m-${ri}-${mi}`}
                      matchup={matchup}
                      isCurrent={round.name.toLowerCase().includes(currentRound.toLowerCase())}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
