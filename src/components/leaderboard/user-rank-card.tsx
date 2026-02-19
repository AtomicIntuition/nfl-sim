import type { UserScore } from "@/lib/simulation/types";
import { Card } from "@/components/ui/card";

interface UserRankCardProps {
  userScore: UserScore | null;
  totalUsers: number;
}

export function UserRankCard({ userScore, totalUsers }: UserRankCardProps) {
  if (!userScore) {
    return (
      <Card variant="bordered" padding="lg">
        <div className="text-center">
          <p className="text-text-secondary">
            Make your first prediction to join the leaderboard!
          </p>
        </div>
      </Card>
    );
  }

  const accuracy =
    userScore.totalPredictions > 0
      ? (
          (userScore.correctPredictions / userScore.totalPredictions) *
          100
        ).toFixed(1)
      : "0.0";

  const percentile =
    totalUsers > 0
      ? Math.round(((totalUsers - userScore.rank) / totalUsers) * 100)
      : 0;

  return (
    <Card variant="glass" padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Your Ranking
        </h3>
        <span className="text-xs text-text-muted">
          Top {100 - percentile}% of {totalUsers} predictors
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox
          label="Rank"
          value={`#${userScore.rank}`}
          highlight={userScore.rank <= 10}
        />
        <StatBox
          label="Points"
          value={userScore.totalPoints.toLocaleString()}
          highlight
        />
        <StatBox
          label="Accuracy"
          value={`${accuracy}%`}
          sublabel={`${userScore.correctPredictions}/${userScore.totalPredictions}`}
        />
        <StatBox
          label="Best Streak"
          value={`${userScore.bestStreak}W`}
          sublabel={
            userScore.currentStreak > 0
              ? `Current: ${userScore.currentStreak}W`
              : undefined
          }
        />
      </div>
    </Card>
  );
}

function StatBox({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={`text-2xl font-bold font-mono ${highlight ? "text-gold" : "text-text-primary"}`}
      >
        {value}
      </div>
      <div className="text-xs text-text-muted uppercase tracking-wider mt-1">
        {label}
      </div>
      {sublabel && (
        <div className="text-xs text-text-secondary mt-0.5">{sublabel}</div>
      )}
    </div>
  );
}
