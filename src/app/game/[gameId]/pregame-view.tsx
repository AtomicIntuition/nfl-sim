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
  let userId = localStorage.getItem('gridblitz-user-id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('gridblitz-user-id', userId);
  }
  // Also set as cookie so server-side pages (leaderboard) can identify user
  document.cookie = `gridblitz-user-id=${userId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  return userId;
}

function getDisplayName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gridblitz-display-name');
}

function setDisplayName(name: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('gridblitz-display-name', name);
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
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [pendingPrediction, setPendingPrediction] = useState<{
    predictedWinner: 'home' | 'away';
    predictedHomeScore: number;
    predictedAwayScore: number;
  } | null>(null);

  // Load persisted prediction on mount
  useEffect(() => {
    setUserPrediction(getStoredPrediction(gameId));
  }, [gameId]);

  const submitPrediction = useCallback(
    async (prediction: {
      predictedWinner: 'home' | 'away';
      predictedHomeScore: number;
      predictedAwayScore: number;
    }) => {
      if (!homeTeam || !awayTeam) return;

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
    [gameId, homeTeam, awayTeam],
  );

  const handlePredict = useCallback(
    async (prediction: {
      predictedWinner: 'home' | 'away';
      predictedHomeScore: number;
      predictedAwayScore: number;
    }) => {
      if (submitting) return;

      // Check if user has set a display name
      const existingName = getDisplayName();
      if (!existingName) {
        // Show name prompt, save prediction for after
        setPendingPrediction(prediction);
        setShowNamePrompt(true);
        return;
      }

      await submitPrediction(prediction);
    },
    [submitting, submitPrediction],
  );

  const handleNameSubmit = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }
    if (trimmed.length > 30) {
      setNameError('Name must be 30 characters or fewer');
      return;
    }

    setNameError('');
    const userId = getUserId();

    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ displayName: trimmed }),
      });

      if (res.ok) {
        setDisplayName(trimmed);
        setShowNamePrompt(false);
        // Now submit the pending prediction
        if (pendingPrediction) {
          await submitPrediction(pendingPrediction);
          setPendingPrediction(null);
        }
      } else {
        const data = await res.json();
        setNameError(data.error || 'Failed to set name');
      }
    } catch {
      setNameError('Network error — please try again');
    }
  }, [nameInput, pendingPrediction, submitPrediction]);

  return (
    <div className="min-h-screen bg-midnight">
      {/* Header bar */}
      <header className="sticky top-0 z-40 glass-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link
            href={ROUTES.HOME}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; GridBlitz
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

        {/* Username prompt overlay */}
        {showNamePrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <Card variant="elevated" padding="lg" className="max-w-sm w-full">
              <h3 className="text-lg font-bold text-text-primary mb-1">
                Choose Your Name
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                Pick a display name for the prediction leaderboard.
              </p>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                placeholder="e.g. BlitzKing42"
                maxLength={30}
                autoFocus
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors mb-2"
              />
              {nameError && (
                <p className="text-xs text-live-red mb-2">{nameError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleNameSubmit}
                  className="flex-1 px-4 py-2 bg-gold text-midnight font-bold text-sm rounded-lg hover:bg-gold-bright transition-colors"
                >
                  Lock It In
                </button>
                <button
                  onClick={() => {
                    setShowNamePrompt(false);
                    setPendingPrediction(null);
                  }}
                  className="px-4 py-2 text-text-secondary text-sm rounded-lg border border-border hover:border-border-bright transition-colors"
                >
                  Cancel
                </button>
              </div>
            </Card>
          </div>
        )}

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
