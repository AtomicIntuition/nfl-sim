'use client';

import type { DivisionStandings, TeamStanding } from '@/lib/simulation/types';

interface StandingsTableProps {
  standings: DivisionStandings;
}

function getClinchPrefix(clinched: TeamStanding['clinched']): string {
  switch (clinched) {
    case 'bye':
      return 'z-';
    case 'division':
      return 'y-';
    case 'wild_card':
      return 'x-';
    case 'eliminated':
      return 'e-';
    default:
      return '';
  }
}

function getWinPct(team: TeamStanding): string {
  const total = team.wins + team.losses + team.ties;
  if (total === 0) return '.000';
  const pct = (team.wins + team.ties * 0.5) / total;
  return pct.toFixed(3).replace(/^0/, '');
}

function getPointsDiff(team: TeamStanding): number {
  return team.pointsFor - team.pointsAgainst;
}

function sortTeams(teams: TeamStanding[]): TeamStanding[] {
  return [...teams].sort((a, b) => {
    // Sort by wins descending
    if (b.wins !== a.wins) return b.wins - a.wins;
    // Tiebreaker: point differential
    const aDiff = getPointsDiff(a);
    const bDiff = getPointsDiff(b);
    if (bDiff !== aDiff) return bDiff - aDiff;
    // Further tiebreaker: points for
    return b.pointsFor - a.pointsFor;
  });
}

export function StandingsTable({ standings }: StandingsTableProps) {
  const sorted = sortTeams(standings.teams);
  const leaderId = sorted[0]?.teamId;

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden">
      {/* Division Header */}
      <div className="px-4 py-3 bg-surface-elevated border-b border-border">
        <h3 className="text-sm font-bold tracking-wide text-text-primary">
          {standings.conference} {standings.division}
        </h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 px-4 font-medium text-xs uppercase tracking-wider w-[40%]">
                Team
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider">
                W
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider">
                L
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider">
                T
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider">
                PCT
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">
                PF
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider hidden sm:table-cell">
                PA
              </th>
              <th className="text-center py-2 px-2 font-medium text-xs uppercase tracking-wider hidden md:table-cell">
                STRK
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => {
              const isLeader = team.teamId === leaderId;
              const clinchPrefix = getClinchPrefix(team.clinched);
              const isEliminated = team.clinched === 'eliminated';

              return (
                <tr
                  key={team.teamId}
                  className={`
                    border-b border-border/50 last:border-b-0
                    transition-colors duration-150
                    hover:bg-surface-hover
                    ${isLeader ? 'bg-gold/5' : ''}
                    ${isEliminated ? 'opacity-60' : ''}
                  `}
                >
                  {/* Team Name */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      {/* Playoff seed */}
                      {team.playoffSeed && !isEliminated && (
                        <span className="text-[10px] font-bold text-gold bg-gold/15 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                          {team.playoffSeed}
                        </span>
                      )}
                      {/* Team color dot */}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            team.team?.primaryColor ?? '#6b7280',
                        }}
                      />
                      {/* Name with clinch prefix */}
                      <span
                        className={`
                          font-semibold truncate
                          ${isLeader ? 'text-text-primary' : 'text-text-secondary'}
                        `}
                      >
                        {clinchPrefix && (
                          <span className="text-text-muted text-xs">
                            {clinchPrefix}
                          </span>
                        )}
                        {team.team?.abbreviation ?? team.teamId}
                      </span>
                    </div>
                  </td>
                  {/* W */}
                  <td className="text-center py-2.5 px-2 font-mono font-semibold tabular-nums text-text-primary">
                    {team.wins}
                  </td>
                  {/* L */}
                  <td className="text-center py-2.5 px-2 font-mono tabular-nums text-text-secondary">
                    {team.losses}
                  </td>
                  {/* T */}
                  <td className="text-center py-2.5 px-2 font-mono tabular-nums text-text-muted">
                    {team.ties}
                  </td>
                  {/* PCT */}
                  <td className="text-center py-2.5 px-2 font-mono tabular-nums text-text-secondary">
                    {getWinPct(team)}
                  </td>
                  {/* PF */}
                  <td className="text-center py-2.5 px-2 font-mono tabular-nums text-text-secondary hidden sm:table-cell">
                    {team.pointsFor}
                  </td>
                  {/* PA */}
                  <td className="text-center py-2.5 px-2 font-mono tabular-nums text-text-secondary hidden sm:table-cell">
                    {team.pointsAgainst}
                  </td>
                  {/* Streak */}
                  <td className="text-center py-2.5 px-2 hidden md:table-cell">
                    <span
                      className={`
                        text-xs font-semibold font-mono
                        ${team.streak.startsWith('W') ? 'text-success' : ''}
                        ${team.streak.startsWith('L') ? 'text-danger' : ''}
                        ${team.streak.startsWith('T') ? 'text-text-muted' : ''}
                      `}
                    >
                      {team.streak}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
