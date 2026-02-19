'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ── Props ────────────────────────────────────────────────────

interface TeamInfo {
  name: string;
  abbreviation: string;
  primaryColor: string;
}

interface UserPrediction {
  predictedWinner: 'home' | 'away';
  predictedHomeScore: number;
  predictedAwayScore: number;
  pointsEarned?: number;
  result?: 'pending' | 'won' | 'lost';
}

interface PredictionWidgetProps {
  gameStatus: 'pregame' | 'live' | 'final';
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  /** Home team win probability, 0-100. */
  homeProbability: number;
  userPrediction: UserPrediction | null;
  onPredict: (prediction: {
    predictedWinner: 'home' | 'away';
    predictedHomeScore: number;
    predictedAwayScore: number;
  }) => void;
}

// ── Component ────────────────────────────────────────────────

export function PredictionWidget({
  gameStatus,
  homeTeam,
  awayTeam,
  homeProbability,
  userPrediction,
  onPredict,
}: PredictionWidgetProps) {
  return (
    <Card variant="glass" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-text-primary">
          Prediction
        </span>
        {gameStatus === 'live' && (
          <Badge variant="live" size="sm" pulse>
            LIVE
          </Badge>
        )}
        {gameStatus === 'final' && (
          <Badge variant="final" size="sm">
            FINAL
          </Badge>
        )}
      </div>

      <div className="px-4 pb-4">
        {gameStatus === 'pregame' && !userPrediction && (
          <PregameForm
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            onPredict={onPredict}
          />
        )}

        {gameStatus === 'pregame' && userPrediction && (
          <PredictionLocked
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            prediction={userPrediction}
          />
        )}

        {gameStatus === 'live' && (
          <LiveProbability
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeProbability={homeProbability}
            userPrediction={userPrediction}
          />
        )}

        {gameStatus === 'final' && (
          <FinalResult
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            userPrediction={userPrediction}
          />
        )}
      </div>
    </Card>
  );
}

// ── Pregame Form ─────────────────────────────────────────────

function PregameForm({
  homeTeam,
  awayTeam,
  onPredict,
}: {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  onPredict: PredictionWidgetProps['onPredict'];
}) {
  const [selectedWinner, setSelectedWinner] = useState<'home' | 'away' | null>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');

  const canSubmit =
    selectedWinner !== null &&
    homeScore !== '' &&
    awayScore !== '' &&
    !isNaN(Number(homeScore)) &&
    !isNaN(Number(awayScore));

  const handleSubmit = () => {
    if (!canSubmit || selectedWinner === null) return;
    onPredict({
      predictedWinner: selectedWinner,
      predictedHomeScore: Number(homeScore),
      predictedAwayScore: Number(awayScore),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Pick the winner and predict the final score.</p>

      {/* Winner pick buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSelectedWinner('away')}
          className={`
            relative rounded-lg border p-3 transition-all duration-200
            ${
              selectedWinner === 'away'
                ? 'border-white/30 bg-white/10 ring-1 ring-white/20'
                : 'border-border/50 bg-surface/40 hover:bg-surface-hover/40'
            }
          `}
        >
          <div
            className="w-2 h-2 rounded-full mb-1.5 mx-auto"
            style={{ backgroundColor: awayTeam.primaryColor }}
          />
          <span className="block text-sm font-bold text-text-primary">{awayTeam.abbreviation}</span>
          <span className="block text-[10px] text-text-muted truncate">{awayTeam.name}</span>
          {selectedWinner === 'away' && (
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                boxShadow: `inset 0 0 12px ${awayTeam.primaryColor}20`,
                borderColor: awayTeam.primaryColor,
              }}
            />
          )}
        </button>

        <button
          onClick={() => setSelectedWinner('home')}
          className={`
            relative rounded-lg border p-3 transition-all duration-200
            ${
              selectedWinner === 'home'
                ? 'border-white/30 bg-white/10 ring-1 ring-white/20'
                : 'border-border/50 bg-surface/40 hover:bg-surface-hover/40'
            }
          `}
        >
          <div
            className="w-2 h-2 rounded-full mb-1.5 mx-auto"
            style={{ backgroundColor: homeTeam.primaryColor }}
          />
          <span className="block text-sm font-bold text-text-primary">{homeTeam.abbreviation}</span>
          <span className="block text-[10px] text-text-muted truncate">{homeTeam.name}</span>
          {selectedWinner === 'home' && (
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                boxShadow: `inset 0 0 12px ${homeTeam.primaryColor}20`,
                borderColor: homeTeam.primaryColor,
              }}
            />
          )}
        </button>
      </div>

      {/* Score prediction inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-semibold uppercase tracking-widest text-text-muted block mb-1">
            {awayTeam.abbreviation} Score
          </label>
          <input
            type="number"
            min="0"
            max="99"
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            placeholder="0"
            className="w-full bg-surface-elevated/60 border border-border/50 rounded-md px-3 py-1.5 text-center text-sm font-mono font-bold text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-gold/40 focus:border-gold/40 transition-colors"
          />
        </div>
        <div>
          <label className="text-[9px] font-semibold uppercase tracking-widest text-text-muted block mb-1">
            {homeTeam.abbreviation} Score
          </label>
          <input
            type="number"
            min="0"
            max="99"
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            placeholder="0"
            className="w-full bg-surface-elevated/60 border border-border/50 rounded-md px-3 py-1.5 text-center text-sm font-mono font-bold text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-gold/40 focus:border-gold/40 transition-colors"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`
          w-full rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200
          ${
            canSubmit
              ? 'bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 cursor-pointer'
              : 'bg-surface-elevated/40 text-text-muted border border-border/30 cursor-not-allowed'
          }
        `}
      >
        Lock In Prediction
      </button>
    </div>
  );
}

// ── Prediction Locked (pregame, already predicted) ───────────

function PredictionLocked({
  homeTeam,
  awayTeam,
  prediction,
}: {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  prediction: UserPrediction;
}) {
  const pickedTeam = prediction.predictedWinner === 'home' ? homeTeam : awayTeam;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: pickedTeam.primaryColor }}
        />
        <span className="text-sm font-bold text-text-primary">
          {pickedTeam.name}
        </span>
        <Badge variant="gold" size="sm">LOCKED</Badge>
      </div>
      <div className="text-xs text-text-secondary font-mono tabular-nums">
        Predicted score: {awayTeam.abbreviation} {prediction.predictedAwayScore} - {homeTeam.abbreviation} {prediction.predictedHomeScore}
      </div>
      <p className="text-[10px] text-text-muted">
        Your prediction is locked in. Watch the game to see how it plays out.
      </p>
    </div>
  );
}

// ── Live Win Probability ─────────────────────────────────────

function LiveProbability({
  homeTeam,
  awayTeam,
  homeProbability,
  userPrediction,
}: {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeProbability: number;
  userPrediction: UserPrediction | null;
}) {
  const awayProbability = 100 - homeProbability;

  return (
    <div className="space-y-3">
      {/* Probability bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: awayTeam.primaryColor }}
            />
            <span className="text-xs font-bold text-text-primary">
              {awayTeam.abbreviation}
            </span>
            <span className="text-xs font-mono font-black tabular-nums text-text-secondary">
              {awayProbability}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-black tabular-nums text-text-secondary">
              {homeProbability}%
            </span>
            <span className="text-xs font-bold text-text-primary">
              {homeTeam.abbreviation}
            </span>
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: homeTeam.primaryColor }}
            />
          </div>
        </div>

        {/* The bar itself */}
        <div className="relative w-full h-3 rounded-full overflow-hidden bg-surface-elevated">
          <div
            className="absolute left-0 top-0 bottom-0 transition-all duration-700 ease-out rounded-l-full"
            style={{
              width: `${awayProbability}%`,
              backgroundColor: awayTeam.primaryColor,
              opacity: 0.8,
            }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 transition-all duration-700 ease-out rounded-r-full"
            style={{
              width: `${homeProbability}%`,
              backgroundColor: homeTeam.primaryColor,
              opacity: 0.8,
            }}
          />
          {/* Center divider */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white/30"
            style={{
              left: `${awayProbability}%`,
              transform: 'translateX(-50%)',
            }}
          />
        </div>
      </div>

      {/* User prediction indicator */}
      {userPrediction && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/30">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted">
            Your pick
          </span>
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor:
                userPrediction.predictedWinner === 'home'
                  ? homeTeam.primaryColor
                  : awayTeam.primaryColor,
            }}
          />
          <span className="text-[11px] font-bold text-text-secondary">
            {userPrediction.predictedWinner === 'home'
              ? homeTeam.abbreviation
              : awayTeam.abbreviation}
          </span>
          <span className="text-[10px] text-text-muted font-mono tabular-nums">
            ({awayTeam.abbreviation} {userPrediction.predictedAwayScore} - {homeTeam.abbreviation} {userPrediction.predictedHomeScore})
          </span>
        </div>
      )}
    </div>
  );
}

// ── Final Result ─────────────────────────────────────────────

function FinalResult({
  homeTeam,
  awayTeam,
  userPrediction,
}: {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  userPrediction: UserPrediction | null;
}) {
  if (!userPrediction) {
    return (
      <div className="text-center py-2">
        <p className="text-xs text-text-muted">No prediction was made for this game.</p>
      </div>
    );
  }

  const isWin = userPrediction.result === 'won';
  const points = userPrediction.pointsEarned ?? 0;
  const pickedTeam =
    userPrediction.predictedWinner === 'home' ? homeTeam : awayTeam;

  return (
    <div className="space-y-3">
      {/* Result badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: pickedTeam.primaryColor }}
          />
          <span className="text-sm font-bold text-text-primary">
            {pickedTeam.abbreviation}
          </span>
        </div>
        <Badge
          variant={isWin ? 'big-play' : 'turnover'}
          size="md"
        >
          {isWin ? 'CORRECT' : 'WRONG'}
        </Badge>
      </div>

      {/* Score prediction vs actual */}
      <div className="text-xs text-text-secondary font-mono tabular-nums">
        Predicted: {awayTeam.abbreviation} {userPrediction.predictedAwayScore} - {homeTeam.abbreviation} {userPrediction.predictedHomeScore}
      </div>

      {/* Points earned */}
      <div
        className={`
          flex items-center justify-center gap-2 rounded-lg py-2
          ${
            isWin
              ? 'bg-big-play/10 border border-big-play/20'
              : 'bg-surface-elevated/40 border border-border/30'
          }
        `}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          Points Earned
        </span>
        <span
          className={`text-lg font-mono font-black tabular-nums ${
            isWin ? 'text-big-play' : 'text-text-muted'
          }`}
        >
          +{points}
        </span>
      </div>
    </div>
  );
}
