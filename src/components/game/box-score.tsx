'use client';

import { useState, useEffect, useRef } from 'react';
import type { BoxScore as BoxScoreType, Team, PlayerGameStats } from '@/lib/simulation/types';
import { formatTimeOfPossession } from '@/lib/utils/formatting';

interface BoxScoreProps {
  boxScore: BoxScoreType | null;
  homeTeam: Team;
  awayTeam: Team;
}

export function BoxScore({ boxScore, homeTeam, awayTeam }: BoxScoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!boxScore) {
    return (
      <div className="px-4 py-3">
        <button
          className="w-full text-left text-xs font-semibold text-text-muted tracking-wider uppercase"
          disabled
        >
          Team Stats
        </button>
        <div className="text-center text-text-muted text-xs py-4">
          Stats will appear once the game begins
        </div>
      </div>
    );
  }

  const { homeStats, awayStats, homePlayerStats, awayPlayerStats } = boxScore;

  const stats: StatRow[] = [
    {
      label: 'Total Yards',
      home: homeStats.totalYards,
      away: awayStats.totalYards,
    },
    {
      label: 'Passing',
      home: homeStats.passingYards,
      away: awayStats.passingYards,
    },
    {
      label: 'Rushing',
      home: homeStats.rushingYards,
      away: awayStats.rushingYards,
    },
    {
      label: 'First Downs',
      home: homeStats.firstDowns,
      away: awayStats.firstDowns,
    },
    {
      label: '3rd Down',
      home: homeStats.thirdDownConversions,
      away: awayStats.thirdDownConversions,
      homeDisplay: `${homeStats.thirdDownConversions}/${homeStats.thirdDownAttempts}`,
      awayDisplay: `${awayStats.thirdDownConversions}/${awayStats.thirdDownAttempts}`,
    },
    {
      label: 'Turnovers',
      home: homeStats.turnovers,
      away: awayStats.turnovers,
      invertBar: true,
    },
    {
      label: 'Possession',
      home: homeStats.timeOfPossession,
      away: awayStats.timeOfPossession,
      homeDisplay: formatTimeOfPossession(homeStats.timeOfPossession),
      awayDisplay: formatTimeOfPossession(awayStats.timeOfPossession),
    },
    {
      label: 'Penalties',
      home: homeStats.penalties,
      away: awayStats.penalties,
      homeDisplay: `${homeStats.penalties}-${homeStats.penaltyYards}`,
      awayDisplay: `${awayStats.penalties}-${awayStats.penaltyYards}`,
      invertBar: true,
    },
    {
      label: 'Sacks',
      home: homeStats.sacks,
      away: awayStats.sacks,
    },
    {
      label: 'Red Zone',
      home: homeStats.redZoneTDs,
      away: awayStats.redZoneTDs,
      homeDisplay: `${homeStats.redZoneTDs}/${homeStats.redZoneAttempts}`,
      awayDisplay: `${awayStats.redZoneTDs}/${awayStats.redZoneAttempts}`,
    },
  ];

  // Get leaders
  const passLeaderHome = getPassingLeader(homePlayerStats);
  const passLeaderAway = getPassingLeader(awayPlayerStats);
  const rushLeaderHome = getRushingLeader(homePlayerStats);
  const rushLeaderAway = getRushingLeader(awayPlayerStats);
  const recLeaderHome = getReceivingLeader(homePlayerStats);
  const recLeaderAway = getReceivingLeader(awayPlayerStats);

  return (
    <div className="px-3">
      {/* Toggle header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <span className="text-[11px] font-bold text-text-secondary tracking-wider uppercase">
          Team Stats
        </span>
        <span
          className={`text-text-muted text-xs transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          {'\u25BC'}
        </span>
      </button>

      {/* Always show a condensed preview */}
      {!isExpanded && (
        <div className="space-y-1.5 pb-3">
          {stats.slice(0, 4).map((stat) => (
            <CompactStatRow
              key={stat.label}
              stat={stat}
              homeColor={homeTeam.primaryColor}
              awayColor={awayTeam.primaryColor}
            />
          ))}
        </div>
      )}

      {/* Expanded view */}
      {isExpanded && (
        <div className="space-y-1.5 pb-3">
          {/* Team header */}
          <div className="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase text-text-muted mb-2">
            <span style={{ color: awayTeam.primaryColor }}>{awayTeam.abbreviation}</span>
            <span>{''}</span>
            <span style={{ color: homeTeam.primaryColor }}>{homeTeam.abbreviation}</span>
          </div>

          {/* All stats */}
          {stats.map((stat) => (
            <CompactStatRow
              key={stat.label}
              stat={stat}
              homeColor={homeTeam.primaryColor}
              awayColor={awayTeam.primaryColor}
            />
          ))}

          {/* Divider */}
          <div className="border-t border-border my-3" />

          {/* Player Leaders */}
          <div className="text-[11px] font-bold text-text-secondary tracking-wider uppercase mb-2">
            Leaders
          </div>

          {/* Passing */}
          <LeaderRow
            label="Passing"
            awayPlayer={passLeaderAway}
            homePlayer={passLeaderHome}
            awayStat={
              passLeaderAway
                ? `${passLeaderAway.completions}/${passLeaderAway.attempts}, ${passLeaderAway.passingYards} yds, ${passLeaderAway.passingTDs} TD`
                : '-'
            }
            homeStat={
              passLeaderHome
                ? `${passLeaderHome.completions}/${passLeaderHome.attempts}, ${passLeaderHome.passingYards} yds, ${passLeaderHome.passingTDs} TD`
                : '-'
            }
            awayColor={awayTeam.primaryColor}
            homeColor={homeTeam.primaryColor}
          />

          {/* Rushing */}
          <LeaderRow
            label="Rushing"
            awayPlayer={rushLeaderAway}
            homePlayer={rushLeaderHome}
            awayStat={
              rushLeaderAway
                ? `${rushLeaderAway.carries} car, ${rushLeaderAway.rushingYards} yds, ${rushLeaderAway.rushingTDs} TD`
                : '-'
            }
            homeStat={
              rushLeaderHome
                ? `${rushLeaderHome.carries} car, ${rushLeaderHome.rushingYards} yds, ${rushLeaderHome.rushingTDs} TD`
                : '-'
            }
            awayColor={awayTeam.primaryColor}
            homeColor={homeTeam.primaryColor}
          />

          {/* Receiving */}
          <LeaderRow
            label="Receiving"
            awayPlayer={recLeaderAway}
            homePlayer={recLeaderHome}
            awayStat={
              recLeaderAway
                ? `${recLeaderAway.receptions} rec, ${recLeaderAway.receivingYards} yds, ${recLeaderAway.receivingTDs} TD`
                : '-'
            }
            homeStat={
              recLeaderHome
                ? `${recLeaderHome.receptions} rec, ${recLeaderHome.receivingYards} yds, ${recLeaderHome.receivingTDs} TD`
                : '-'
            }
            awayColor={awayTeam.primaryColor}
            homeColor={homeTeam.primaryColor}
          />
        </div>
      )}
    </div>
  );
}

// ── Supporting types and components ──────────────────────────────

interface StatRow {
  label: string;
  home: number;
  away: number;
  homeDisplay?: string;
  awayDisplay?: string;
  /** When true, a lower number is better (e.g., turnovers). */
  invertBar?: boolean;
}

function CompactStatRow({
  stat,
  homeColor,
  awayColor,
}: {
  stat: StatRow;
  homeColor: string;
  awayColor: string;
}) {
  const total = stat.home + stat.away;
  const homePercent = total > 0 ? (stat.home / total) * 100 : 50;
  const awayPercent = total > 0 ? (stat.away / total) * 100 : 50;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <AnimatedNumber
          value={stat.awayDisplay ?? stat.away}
          className="text-[11px] font-mono font-bold tabular-nums text-text-primary w-12"
        />
        <span className="text-[10px] text-text-muted font-medium flex-1 text-center">
          {stat.label}
        </span>
        <AnimatedNumber
          value={stat.homeDisplay ?? stat.home}
          className="text-[11px] font-mono font-bold tabular-nums text-text-primary w-12 text-right"
        />
      </div>
      {/* Proportion bar */}
      <div className="flex h-1 rounded-full overflow-hidden bg-surface-elevated gap-px">
        <div
          className="rounded-l-full transition-all duration-500 ease-out"
          style={{
            width: `${awayPercent}%`,
            backgroundColor: awayColor,
            opacity: stat.invertBar ? (stat.away > stat.home ? 0.4 : 0.8) : 0.8,
          }}
        />
        <div
          className="rounded-r-full transition-all duration-500 ease-out"
          style={{
            width: `${homePercent}%`,
            backgroundColor: homeColor,
            opacity: stat.invertBar ? (stat.home > stat.away ? 0.4 : 0.8) : 0.8,
          }}
        />
      </div>
    </div>
  );
}

function AnimatedNumber({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      setShouldAnimate(true);
      prevValue.current = value;
      const t = setTimeout(() => setShouldAnimate(false), 350);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span className={`${className} ${shouldAnimate ? 'stat-update' : ''}`}>
      {value}
    </span>
  );
}

function LeaderRow({
  label,
  awayPlayer,
  homePlayer,
  awayStat,
  homeStat,
  awayColor,
  homeColor,
}: {
  label: string;
  awayPlayer: PlayerGameStats | null;
  homePlayer: PlayerGameStats | null;
  awayStat: string;
  homeStat: string;
  awayColor: string;
  homeColor: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="text-[9px] text-text-muted font-semibold tracking-wider uppercase mb-1">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Away leader */}
        <div className="flex flex-col">
          {awayPlayer ? (
            <>
              <span className="text-[11px] font-semibold text-text-primary truncate">
                <span
                  className="inline-block w-1 h-3 rounded-full mr-1 align-middle"
                  style={{ backgroundColor: awayColor }}
                />
                {awayPlayer.player.name}
              </span>
              <span className="text-[10px] text-text-muted">{awayStat}</span>
            </>
          ) : (
            <span className="text-[10px] text-text-muted">-</span>
          )}
        </div>
        {/* Home leader */}
        <div className="flex flex-col text-right">
          {homePlayer ? (
            <>
              <span className="text-[11px] font-semibold text-text-primary truncate">
                {homePlayer.player.name}
                <span
                  className="inline-block w-1 h-3 rounded-full ml-1 align-middle"
                  style={{ backgroundColor: homeColor }}
                />
              </span>
              <span className="text-[10px] text-text-muted">{homeStat}</span>
            </>
          ) : (
            <span className="text-[10px] text-text-muted">-</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Leader finders ────────────────────────────────────────────

function getPassingLeader(stats: PlayerGameStats[]): PlayerGameStats | null {
  const passers = stats.filter((s) => s.attempts > 0);
  if (passers.length === 0) return null;
  return passers.reduce((best, cur) =>
    cur.passingYards > best.passingYards ? cur : best
  );
}

function getRushingLeader(stats: PlayerGameStats[]): PlayerGameStats | null {
  const rushers = stats.filter((s) => s.carries > 0);
  if (rushers.length === 0) return null;
  return rushers.reduce((best, cur) =>
    cur.rushingYards > best.rushingYards ? cur : best
  );
}

function getReceivingLeader(stats: PlayerGameStats[]): PlayerGameStats | null {
  const receivers = stats.filter((s) => s.receptions > 0);
  if (receivers.length === 0) return null;
  return receivers.reduce((best, cur) =>
    cur.receivingYards > best.receivingYards ? cur : best
  );
}
