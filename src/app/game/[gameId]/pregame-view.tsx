'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PredictionWidget } from '@/components/game/prediction-widget';
import { formatGameType } from '@/lib/utils/formatting';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';
import { ROUTES } from '@/lib/utils/constants';

// ============================================================
// Types
// ============================================================

interface TeamInfo {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
  mascot: string;
  primaryColor: string;
}

interface PregameViewProps {
  gameId: string;
  week: number;
  gameType: string;
  homeTeam: TeamInfo | null;
  awayTeam: TeamInfo | null;
}

interface StoredPrediction {
  predictedWinner: 'home' | 'away';
  predictedHomeScore: number;
  predictedAwayScore: number;
}

// ============================================================
// Helpers
// ============================================================

function getUserId(): string {
  if (typeof window === 'undefined') return '';
  let userId = localStorage.getItem('gridiron-user-id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('gridiron-user-id', userId);
  }
  return userId;
}

function getStoredPrediction(gameId: string): StoredPrediction | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`prediction-${gameId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ============================================================
// Component
// ============================================================

export function PregameView({
  gameId,
  week,
  gameType,
  homeTeam,
  awayTeam,
}: PregameViewProps) {
  const [userPrediction, setUserPrediction] = useState<StoredPrediction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load persisted prediction on mount
  useEffect(() => {
    setUserPrediction(getStoredPrediction(gameId));
  }, [gameId]);

  const handlePredict = useCallback(
    async (prediction: {
      predictedWinner: 'home' | 'away';
      predictedHomeScore: number;
      predictedAwayScore: number;
    }) => {
      if (!homeTeam || !awayTeam || submitting) return;

      setSubmitting(true);
      try {
        const userId = getUserId();
        const winnerId =
          prediction.predictedWinner === 'home' ? homeTeam.id : awayTeam.id;

        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({
            gameId,
            predictedWinner: winnerId,
            predictedHomeScore: prediction.predictedHomeScore,
            predictedAwayScore: prediction.predictedAwayScore,
          }),
        });

        if (res.ok || res.status === 409) {
          // Persist locally so it survives page reload
          const stored: StoredPrediction = {
            predictedWinner: prediction.predictedWinner,
            predictedHomeScore: prediction.predictedHomeScore,
            predictedAwayScore: prediction.predictedAwayScore,
          };
          localStorage.setItem(`prediction-${gameId}`, JSON.stringify(stored));
          setUserPrediction(stored);
        }
      } catch {
        // Silently fail - user can retry
      } finally {
        setSubmitting(false);
      }
    },
    [gameId, homeTeam, awayTeam, submitting],
  );

  return (
    <div className="min-h-screen bg-midnight">
      {/* Header bar */}
      <header className="sticky top-0 z-40 glass-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link
            href={ROUTES.HOME}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; GridIron Live
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted tracking-wider uppercase">
              Week {week}
            </span>
            {gameType !== 'regular' && (
              <Badge variant="gold" size="sm">
                {formatGameType(
                  gameType as
                    | 'regular'
                    | 'wild_card'
                    | 'divisional'
                    | 'conference_championship'
                    | 'super_bowl',
                )}
              </Badge>
            )}
            <Badge variant="upcoming" size="sm">
              UPCOMING
            </Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Team matchup display */}
        <Card variant="elevated" padding="lg" className="mb-6">
          <div className="flex items-center justify-center gap-6 sm:gap-12">
            {/* Away team */}
            <div className="flex flex-col items-center text-center">
              <img
                src={getTeamLogoUrl(awayTeam?.abbreviation ?? '???')}
                alt={awayTeam?.mascot ?? 'Away'}
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg mb-2"
              />
              <p className="text-xs sm:text-sm text-text-secondary">
                {awayTeam?.city ?? 'Unknown'}
              </p>
              <p className="text-sm sm:text-base font-bold">
                {awayTeam?.mascot ?? ''}
              </p>
            </div>

            {/* VS */}
            <div className="text-center">
              <p className="text-3xl sm:text-5xl font-black text-text-muted">
                VS
              </p>
              <p className="text-xs text-text-muted mt-2 tracking-wider uppercase">
                Kickoff Soon
              </p>
            </div>

            {/* Home team */}
            <div className="flex flex-col items-center text-center">
              <img
                src={getTeamLogoUrl(homeTeam?.abbreviation ?? '???')}
                alt={homeTeam?.mascot ?? 'Home'}
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg mb-2"
              />
              <p className="text-xs sm:text-sm text-text-secondary">
                {homeTeam?.city ?? 'Unknown'}
              </p>
              <p className="text-sm sm:text-base font-bold">
                {homeTeam?.mascot ?? ''}
              </p>
            </div>
          </div>
        </Card>

        {/* Prediction widget */}
        {homeTeam && awayTeam && (
          <div className="mb-6">
            <PredictionWidget
              gameStatus="pregame"
              homeTeam={{
                name: homeTeam.name,
                abbreviation: homeTeam.abbreviation,
                primaryColor: homeTeam.primaryColor,
              }}
              awayTeam={{
                name: awayTeam.name,
                abbreviation: awayTeam.abbreviation,
                primaryColor: awayTeam.primaryColor,
              }}
              homeProbability={50}
              userPrediction={userPrediction}
              onPredict={handlePredict}
            />
          </div>
        )}

        {/* View Schedule link */}
        <div className="text-center">
          <Link
            href={ROUTES.SCHEDULE}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors border border-border rounded-full"
          >
            View Full Schedule &rarr;
          </Link>
        </div>
      </main>
    </div>
  );
}
