import type { Team } from "@/lib/simulation/types";
import { formatRecord } from "@/lib/utils/formatting";

interface TeamHeaderProps {
  team: Team;
  wins: number;
  losses: number;
  ties: number;
  divisionRank: number;
  playoffSeed: number | null;
}

export function TeamHeader({
  team,
  wins,
  losses,
  ties,
  divisionRank,
  playoffSeed,
}: TeamHeaderProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={
        {
          "--team-primary": team.primaryColor,
          "--team-secondary": team.secondaryColor,
        } as React.CSSProperties
      }
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 50%, ${team.primaryColor} 100%)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/80 to-transparent" />

      {/* Content */}
      <div className="relative px-6 py-8 md:px-8 md:py-12">
        <div className="flex items-center gap-4">
          {/* Team color swatch */}
          <div
            className="w-16 h-16 md:w-20 md:h-20 rounded-xl shadow-lg flex items-center justify-center text-2xl md:text-3xl font-bold text-white"
            style={{ backgroundColor: team.primaryColor }}
          >
            {team.abbreviation}
          </div>

          <div className="flex-1">
            <h1 className="text-2xl md:text-4xl font-bold text-text-primary">
              {team.name}
            </h1>
            <p className="text-text-secondary text-sm md:text-base mt-1">
              {team.conference} {team.division}
            </p>
          </div>
        </div>

        {/* Record and rank */}
        <div className="mt-6 flex flex-wrap items-center gap-4 md:gap-6">
          <div className="text-center">
            <div className="text-3xl md:text-4xl font-bold font-mono text-text-primary">
              {formatRecord(wins, losses, ties)}
            </div>
            <div className="text-xs text-text-muted uppercase tracking-wider mt-1">
              Record
            </div>
          </div>

          <div className="w-px h-10 bg-border" />

          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">
              {formatOrdinalRank(divisionRank)}
            </div>
            <div className="text-xs text-text-muted uppercase tracking-wider mt-1">
              Division
            </div>
          </div>

          {playoffSeed && (
            <>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl font-bold text-gold">
                  #{playoffSeed}
                </div>
                <div className="text-xs text-text-muted uppercase tracking-wider mt-1">
                  Seed
                </div>
              </div>
            </>
          )}

          <div className="w-px h-10 bg-border" />

          {/* Ratings */}
          <div className="flex gap-3">
            <RatingBadge label="OFF" value={team.offenseRating} />
            <RatingBadge label="DEF" value={team.defenseRating} />
            <RatingBadge label="ST" value={team.specialTeamsRating} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingBadge({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90
      ? "text-gold"
      : value >= 85
        ? "text-success"
        : value >= 80
          ? "text-info"
          : "text-text-secondary";

  return (
    <div className="text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function formatOrdinalRank(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
