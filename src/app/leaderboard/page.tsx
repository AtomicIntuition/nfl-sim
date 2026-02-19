export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { UserRankCard } from '@/components/leaderboard/user-rank-card';
import { getLeaderboard, getTotalPredictors } from '@/lib/db/queries/leaderboard';
import type { UserScore } from '@/lib/simulation/types';

export const metadata: Metadata = {
  title: 'Prediction Leaderboard',
  description:
    'Top prediction leaders on GridIron Live. Track accuracy, streaks, and total points.',
};

// ============================================================
// Data fetching
// ============================================================

async function getLeaderboardData() {
  try {
    const [leaderboardRows, totalUsers] = await Promise.all([
      getLeaderboard(100),
      getTotalPredictors(),
    ]);

    // Map DB rows to UserScore shape expected by the LeaderboardTable component
    const users: (UserScore & { username?: string })[] = leaderboardRows.map(
      (row) => ({
        userId: row.userId,
        totalPoints: row.totalPoints ?? 0,
        correctPredictions: row.correctPredictions ?? 0,
        totalPredictions: row.totalPredictions ?? 0,
        currentStreak: row.currentStreak ?? 0,
        bestStreak: row.bestStreak ?? 0,
        rank: row.rank ?? 0,
      })
    );

    return { users, totalUsers };
  } catch (error) {
    console.error('Failed to fetch leaderboard data:', error);
    return { users: [], totalUsers: 0 };
  }
}

// ============================================================
// Page component
// ============================================================

export default async function LeaderboardPage() {
  const { users, totalUsers } = await getLeaderboardData();

  // Current user score - null for now, auth integration comes later
  const currentUserScore: UserScore | null = null;
  const currentUserId: string | undefined = undefined;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
              Prediction Leaderboard
            </h1>
            <p className="text-text-secondary">
              Compete against other fans. Predict game outcomes, earn points,
              and climb the rankings.
            </p>
          </div>

          {/* User rank card */}
          <div className="mb-8">
            <UserRankCard
              userScore={currentUserScore}
              totalUsers={totalUsers}
            />
          </div>

          {/* Leaderboard stats bar */}
          {users.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">
                Top Predictors
              </h2>
              <span className="text-xs text-text-muted">
                {totalUsers} total{' '}
                {totalUsers === 1 ? 'predictor' : 'predictors'}
              </span>
            </div>
          )}

          {/* Leaderboard table */}
          <Card variant="default" padding="none">
            <LeaderboardTable
              users={users}
              currentUserId={currentUserId}
            />
          </Card>

          {/* Scoring explanation */}
          <Card variant="glass" padding="md" className="mt-8">
            <h3 className="text-sm font-bold mb-3 tracking-wider uppercase text-text-secondary">
              How Scoring Works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-lg font-mono font-black text-gold">+10</p>
                <p className="text-xs text-text-secondary">
                  Correct winner prediction
                </p>
              </div>
              <div>
                <p className="text-lg font-mono font-black text-success">+5</p>
                <p className="text-xs text-text-secondary">
                  Score margin within 3 points
                </p>
              </div>
              <div>
                <p className="text-lg font-mono font-black text-info">+25</p>
                <p className="text-xs text-text-secondary">
                  Exact final score prediction
                </p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
