import type { Player } from "@/lib/simulation/types";

interface RosterListProps {
  players: Player[];
  teamColor: string;
}

const POSITION_GROUPS = [
  { label: "Offense", positions: ["QB", "RB", "WR", "TE", "OL"] },
  { label: "Defense", positions: ["DL", "LB", "CB", "S"] },
  { label: "Special Teams", positions: ["K", "P"] },
] as const;

export function RosterList({ players, teamColor }: RosterListProps) {
  return (
    <div className="space-y-6">
      {POSITION_GROUPS.map((group) => {
        const groupPlayers = players.filter((p) =>
          (group.positions as readonly string[]).includes(p.position)
        );
        if (groupPlayers.length === 0) return null;

        return (
          <div key={group.label}>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
              {group.label}
            </h3>
            <div className="grid gap-2">
              {groupPlayers
                .sort((a, b) => b.rating - a.rating)
                .map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    teamColor={teamColor}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRow({
  player,
  teamColor,
}: {
  player: Player;
  teamColor: string;
}) {
  const ratingColor =
    player.rating >= 90
      ? "text-gold"
      : player.rating >= 85
        ? "text-success"
        : player.rating >= 80
          ? "text-info"
          : player.rating >= 75
            ? "text-text-primary"
            : "text-text-secondary";

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated transition-colors">
      {/* Jersey number */}
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: teamColor }}
      >
        {player.number}
      </div>

      {/* Name and position */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {player.name}
        </div>
        <div className="text-xs text-text-muted">{player.position}</div>
      </div>

      {/* Rating */}
      <div className={`text-sm font-bold font-mono ${ratingColor}`}>
        {player.rating}
      </div>

      {/* Attribute bars */}
      <div className="hidden md:flex gap-1 items-center">
        <AttributeBar label="SPD" value={player.speed} />
        <AttributeBar label="STR" value={player.strength} />
        <AttributeBar label="AWR" value={player.awareness} />
        <AttributeBar label="CLT" value={player.clutchRating} />
      </div>

      {/* Injury prone indicator */}
      {player.injuryProne && (
        <span className="text-xs text-warning" title="Injury Prone">
          IP
        </span>
      )}
    </div>
  );
}

function AttributeBar({ label, value }: { label: string; value: number }) {
  const pct = ((value - 60) / 39) * 100; // Normalize 60-99 to 0-100%
  const color =
    value >= 90
      ? "bg-gold"
      : value >= 80
        ? "bg-success"
        : value >= 70
          ? "bg-info"
          : "bg-text-muted";

  return (
    <div className="w-12">
      <div className="text-[9px] text-text-muted text-center mb-0.5">
        {label}
      </div>
      <div className="h-1 rounded-full bg-surface-elevated overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
