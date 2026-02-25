// ============================================================
// GridBlitz - Featured Game Picker
// ============================================================
// Selects the most compelling game to broadcast live each week
// based on team records, rivalries, playoff implications, and
// overall entertainment value.
//
// Appeal scoring factors:
//   +30  Both teams in playoff contention
//   +20  Division rivalry (same division)
//   +15  Close records (within 2 wins of each other)
//   +15  Both teams have winning records
//   +10  High combined ratings (offense + defense)
//   +10  Undefeated team involved
//   +10  Winless team in danger (drama!)
//   +10  Late season (week 15+) playoff implications
//    +5  Super Bowl rematch
// ============================================================

import type { ScheduledGame, TeamStanding, Season } from '../simulation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a team's standing by team ID. Returns null if not found.
 */
function findStanding(
  teamId: string,
  standings: TeamStanding[]
): TeamStanding | null {
  return standings.find((s) => s.teamId === teamId) ?? null;
}

/**
 * Check if a team is in playoff contention based on their standing.
 * A team is in contention if they are not eliminated.
 */
function isPlayoffContender(standing: TeamStanding | null): boolean {
  if (!standing) return false;
  return standing.clinched !== 'eliminated';
}

/**
 * Check if a team has a winning record (more wins than losses).
 */
function hasWinningRecord(standing: TeamStanding | null): boolean {
  if (!standing) return false;
  return standing.wins > standing.losses;
}

/**
 * Check if a team is undefeated (zero losses, at least one game played).
 */
function isUndefeated(standing: TeamStanding | null): boolean {
  if (!standing) return false;
  return standing.losses === 0 && standing.wins > 0;
}

/**
 * Check if a team is winless (zero wins, at least one game played).
 */
function isWinless(standing: TeamStanding | null): boolean {
  if (!standing) return false;
  return standing.wins === 0 && standing.losses > 0;
}

/**
 * Determine if two teams are in the same division by looking up
 * their team objects on the standings.
 */
function areDivisionRivals(
  homeStanding: TeamStanding | null,
  awayStanding: TeamStanding | null,
  season: Season
): boolean {
  if (!homeStanding || !awayStanding) return false;

  // Find both teams' division membership from the season standings structure
  let homeConf: string | null = null;
  let homeDiv: string | null = null;
  let awayConf: string | null = null;
  let awayDiv: string | null = null;

  for (const divStanding of season.standings) {
    for (const ts of divStanding.teams) {
      if (ts.teamId === homeStanding.teamId) {
        homeConf = divStanding.conference;
        homeDiv = divStanding.division;
      }
      if (ts.teamId === awayStanding.teamId) {
        awayConf = divStanding.conference;
        awayDiv = divStanding.division;
      }
    }
  }

  return (
    homeConf !== null &&
    homeConf === awayConf &&
    homeDiv !== null &&
    homeDiv === awayDiv
  );
}

/**
 * Check if this game could be a "Super Bowl rematch" scenario.
 * Since we do not have historical data in the first season, this
 * checks if both teams were top-2 seeds in their conference (a proxy).
 */
function isSuperBowlRematch(
  homeStanding: TeamStanding | null,
  awayStanding: TeamStanding | null
): boolean {
  if (!homeStanding || !awayStanding) return false;
  // Both teams had/have a playoff seed of 1 or 2 (conference leaders)
  const homeSeed = homeStanding.playoffSeed;
  const awaySeed = awayStanding.playoffSeed;
  return (
    homeSeed !== null &&
    awaySeed !== null &&
    homeSeed <= 2 &&
    awaySeed <= 2
  );
}

// ---------------------------------------------------------------------------
// Appeal scoring
// ---------------------------------------------------------------------------

/**
 * Score a game's broadcast appeal on a 0-100+ point scale.
 *
 * @param game - The scheduled game to evaluate
 * @param homeStanding - Home team's current standing (null if not available)
 * @param awayStanding - Away team's current standing (null if not available)
 * @param season - Current season state for context
 * @returns Numeric appeal score (higher = more compelling broadcast)
 */
export function scoreGameAppeal(
  game: ScheduledGame,
  homeStanding: TeamStanding | null,
  awayStanding: TeamStanding | null,
  season: Season
): number {
  let score = 0;

  // +30: Both teams in playoff contention
  if (isPlayoffContender(homeStanding) && isPlayoffContender(awayStanding)) {
    score += 30;
  }

  // +20: Division rivalry
  if (areDivisionRivals(homeStanding, awayStanding, season)) {
    score += 20;
  }

  // +15: Close records (within 2 wins of each other)
  if (homeStanding && awayStanding) {
    const winDiff = Math.abs(homeStanding.wins - awayStanding.wins);
    if (winDiff <= 2) {
      score += 15;
    }
  }

  // +15: Both teams have winning records
  if (hasWinningRecord(homeStanding) && hasWinningRecord(awayStanding)) {
    score += 15;
  }

  // +10: High combined ratings (team ratings sum > 340 out of ~400 max)
  if (game.homeTeam && game.awayTeam) {
    const combinedRating =
      game.homeTeam.offenseRating +
      game.homeTeam.defenseRating +
      game.awayTeam.offenseRating +
      game.awayTeam.defenseRating;
    if (combinedRating > 340) {
      score += 10;
    }
  } else if (homeStanding?.team && awayStanding?.team) {
    const combinedRating =
      homeStanding.team.offenseRating +
      homeStanding.team.defenseRating +
      awayStanding.team.offenseRating +
      awayStanding.team.defenseRating;
    if (combinedRating > 340) {
      score += 10;
    }
  }

  // +10: Undefeated team involved
  if (isUndefeated(homeStanding) || isUndefeated(awayStanding)) {
    score += 10;
  }

  // +10: Winless team in danger (drama factor)
  if (isWinless(homeStanding) || isWinless(awayStanding)) {
    score += 10;
  }

  // +10: Late season bonus (week 15+) for playoff implications
  if (game.week >= 15) {
    score += 10;
  }

  // +5: Super Bowl rematch (top-2 seeds from different conferences)
  if (isSuperBowlRematch(homeStanding, awayStanding)) {
    score += 5;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Featured game selection
// ---------------------------------------------------------------------------

/**
 * Pick the best game to feature as the live broadcast for a given week.
 *
 * During the regular season, evaluates all games in the week using the
 * appeal scoring system and returns the game with the highest score.
 *
 * During playoffs, ALL games are featured (but this function still returns
 * the most appealing one for primary broadcast emphasis).
 *
 * @param games - All games in the current week
 * @param standings - All team standings for context
 * @param season - Current season state
 * @returns The game ID of the most compelling matchup
 */
export function pickFeaturedGame(
  games: ScheduledGame[],
  standings: TeamStanding[],
  season: Season
): string {
  if (games.length === 0) {
    throw new Error('Cannot pick a featured game from an empty game list');
  }

  // During Super Bowl, there is only one game
  if (season.status === 'super_bowl') {
    return games[0].id;
  }

  let bestGameId = games[0].id;
  let bestScore = -1;

  for (const game of games) {
    // Only consider games that haven't been completed
    if (game.status === 'completed') continue;

    const homeStanding = findStanding(game.homeTeamId, standings);
    const awayStanding = findStanding(game.awayTeamId, standings);

    const appealScore = scoreGameAppeal(game, homeStanding, awayStanding, season);

    if (appealScore > bestScore) {
      bestScore = appealScore;
      bestGameId = game.id;
    }
  }

  return bestGameId;
}
