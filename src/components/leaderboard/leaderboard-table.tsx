import type { UserScore } from "@/lib/simulation/types";

interface LeaderboardTableProps {
  users: (UserScore & { username?: string })[];
  currentUserId?: string;
}

export function LeaderboardTable({
  users,
  currentUserId,
}: LeaderboardTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
            <th className="px-4 py-3 text-left w-12">Rank</th>
            <th className="px-4 py-3 text-left">Predictor</th>
            <th className="px-4 py-3 text-right">Points</th>
            <th className="px-4 py-3 text-right hidden sm:table-cell">
              Record
            </th>
            <th className="px-4 py-3 text-right hidden sm:table-cell">
              Accuracy
            </th>
            <th className="px-4 py-3 text-right hidden md:table-cell">
              Streak
            </th>
            <th className="px-4 py-3 text-right hidden md:table-cell">
              Best
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, i) => {
            const isCurrentUser = user.userId === currentUserId;
            const rank = user.rank || i + 1;
            const accuracy =
              user.totalPredictions > 0
                ? (
                    (user.correctPredictions / user.totalPredictions) *
                    100
                  ).toFixed(1)
                : "0.0";

            return (
              <tr
                key={user.userId}
                className={`
                  border-b border-border/50 transition-colors
                  ${isCurrentUser ? "bg-gold/5 border-gold/20" : "hover:bg-surface-elevated"}
                `}
              >
                {/* Rank */}
                <td className="px-4 py-3">
                  <span
                    className={`font-bold font-mono ${
                      rank <= 3 ? "text-gold" : "text-text-secondary"
                    }`}
                  >
                    {rank <= 3 ? getRankMedal(rank) : `#${rank}`}
                  </span>
                </td>

                {/* Username */}
                <td className="px-4 py-3">
                  <span
                    className={`font-medium ${
                      isCurrentUser ? "text-gold" : "text-text-primary"
                    }`}
                  >
                    {user.username || `Predictor ${user.userId.slice(0, 8)}`}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs text-gold">(You)</span>
                    )}
                  </span>
                </td>

                {/* Points */}
                <td className="px-4 py-3 text-right">
                  <span className="font-bold font-mono text-text-primary">
                    {user.totalPoints.toLocaleString()}
                  </span>
                </td>

                {/* Record */}
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className="text-text-secondary font-mono text-xs">
                    {user.correctPredictions}-
                    {user.totalPredictions - user.correctPredictions}
                  </span>
                </td>

                {/* Accuracy */}
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className="text-text-secondary">{accuracy}%</span>
                </td>

                {/* Current Streak */}
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  <span
                    className={
                      user.currentStreak >= 5 ? "text-success font-medium" : "text-text-secondary"
                    }
                  >
                    {user.currentStreak > 0 ? `${user.currentStreak}W` : "-"}
                  </span>
                </td>

                {/* Best Streak */}
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  <span className="text-text-muted">
                    {user.bestStreak > 0 ? `${user.bestStreak}W` : "-"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {users.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No predictions yet. Be the first to make a pick!
        </div>
      )}
    </div>
  );
}

function getRankMedal(rank: number): string {
  switch (rank) {
    case 1:
      return "#1";
    case 2:
      return "#2";
    case 3:
      return "#3";
    default:
      return `#${rank}`;
  }
}
