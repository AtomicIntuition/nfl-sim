interface TeamStatsProps {
  stats: {
    offenseRank?: number;
    defenseRank?: number;
    pointsPerGame?: number;
    pointsAllowedPerGame?: number;
    yardsPerGame?: number;
    yardsAllowedPerGame?: number;
    turnoverDifferential?: number;
    thirdDownPct?: number;
    redZonePct?: number;
  };
  teamColor: string;
}

export function TeamStats({ stats, teamColor }: TeamStatsProps) {
  const statItems = [
    {
      label: "Points/Game",
      value: stats.pointsPerGame?.toFixed(1) ?? "--",
      rank: stats.offenseRank,
    },
    {
      label: "Points Allowed/Game",
      value: stats.pointsAllowedPerGame?.toFixed(1) ?? "--",
      rank: stats.defenseRank,
    },
    {
      label: "Yards/Game",
      value: stats.yardsPerGame?.toFixed(1) ?? "--",
    },
    {
      label: "Yards Allowed/Game",
      value: stats.yardsAllowedPerGame?.toFixed(1) ?? "--",
    },
    {
      label: "Turnover Diff",
      value: stats.turnoverDifferential
        ? (stats.turnoverDifferential > 0 ? "+" : "") +
          stats.turnoverDifferential
        : "--",
    },
    {
      label: "3rd Down %",
      value: stats.thirdDownPct
        ? `${(stats.thirdDownPct * 100).toFixed(1)}%`
        : "--",
    },
    {
      label: "Red Zone %",
      value: stats.redZonePct
        ? `${(stats.redZonePct * 100).toFixed(1)}%`
        : "--",
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
        Season Statistics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {statItems.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface rounded-xl p-4 border border-border"
          >
            <div className="text-xs text-text-muted mb-1">{stat.label}</div>
            <div className="text-xl font-bold font-mono text-text-primary">
              {stat.value}
            </div>
            {stat.rank && (
              <div className="text-xs mt-1" style={{ color: teamColor }}>
                #{stat.rank} in NFL
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
