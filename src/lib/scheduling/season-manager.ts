// ============================================================
// GridIron Live - Season Manager
// ============================================================
// Manages the season lifecycle state machine that drives the
// entire platform from pre-season through the Super Bowl and
// into the offseason.
//
// Season lifecycle:
//   1. regular_season (weeks 1-18)
//   2. wild_card (week 19)
//   3. divisional (week 20)
//   4. conference_championship (week 21)
//   5. super_bowl (week 22)
//   6. offseason
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  Season,
  SeasonStatus,
  GameStatus,
  Team,
  WeekSchedule,
  DivisionStandings,
  TeamStanding,
  Conference,
  Division,
} from '../simulation/types';
import { generateSeasonSchedule } from './schedule-generator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGULAR_SEASON_WEEKS = 18;
const WILD_CARD_WEEK = 19;
const DIVISIONAL_WEEK = 20;
const CONFERENCE_CHAMPIONSHIP_WEEK = 21;
const SUPER_BOWL_WEEK = 22;

const DIVISIONS: Division[] = ['North', 'South', 'East', 'West'];
const CONFERENCES: Conference[] = ['AFC', 'NFC'];

// ---------------------------------------------------------------------------
// Season creation
// ---------------------------------------------------------------------------

/**
 * Initialise empty standings for all 8 divisions.
 */
function initializeStandings(teams: Team[]): DivisionStandings[] {
  const standings: DivisionStandings[] = [];

  for (const conf of CONFERENCES) {
    for (const div of DIVISIONS) {
      const divTeams = teams.filter(
        (t) => t.conference === conf && t.division === div
      );

      standings.push({
        conference: conf,
        division: div,
        teams: divTeams.map((t) => ({
          teamId: t.id,
          team: t,
          wins: 0,
          losses: 0,
          ties: 0,
          divisionWins: 0,
          divisionLosses: 0,
          conferenceWins: 0,
          conferenceLosses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          streak: 'W0',
          clinched: null,
          playoffSeed: null,
        })),
      });
    }
  }

  return standings;
}

/**
 * Create a brand-new season with a generated schedule and empty standings.
 *
 * @param seasonNumber - Incrementing season counter (Season 1, Season 2, ...)
 * @param teams - All 32 teams
 * @param seed - Master RNG seed for the season
 * @returns A fully initialised Season object
 */
export function createSeason(
  seasonNumber: number,
  teams: Team[],
  seed: string
): Season {
  // Generate the 18-week regular season schedule
  const weeklyGames = generateSeasonSchedule(teams, seed);

  // Convert to WeekSchedule objects
  const schedule: WeekSchedule[] = weeklyGames.map((games, index) => ({
    week: index + 1,
    games,
    featuredGameId: null,
    status: 'upcoming' as const,
  }));

  return {
    id: uuidv4(),
    seasonNumber,
    currentWeek: 1,
    status: 'regular_season',
    schedule,
    standings: initializeStandings(teams),
    playoffBracket: null,
    champion: null,
    mvp: null,
    seed,
    createdAt: new Date(),
    completedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Season advancement
// ---------------------------------------------------------------------------

/**
 * Advance the season to the next appropriate phase based on its current state.
 * This is the top-level state transition function.
 *
 * @param season - Current season state
 * @returns Updated season with the next phase applied
 */
export function advanceSeason(season: Season): Season {
  switch (season.status) {
    case 'regular_season': {
      if (season.currentWeek >= REGULAR_SEASON_WEEKS && isWeekComplete(season)) {
        return transitionToPlayoffs(season);
      }
      if (isWeekComplete(season)) {
        return advanceWeek(season);
      }
      return season;
    }

    case 'wild_card': {
      if (isWeekComplete(season)) {
        return {
          ...season,
          status: 'divisional',
          currentWeek: DIVISIONAL_WEEK,
        };
      }
      return season;
    }

    case 'divisional': {
      if (isWeekComplete(season)) {
        return {
          ...season,
          status: 'conference_championship',
          currentWeek: CONFERENCE_CHAMPIONSHIP_WEEK,
        };
      }
      return season;
    }

    case 'conference_championship': {
      if (isWeekComplete(season)) {
        return {
          ...season,
          status: 'super_bowl',
          currentWeek: SUPER_BOWL_WEEK,
        };
      }
      return season;
    }

    case 'super_bowl': {
      if (isWeekComplete(season)) {
        return {
          ...season,
          status: 'offseason',
          completedAt: new Date(),
        };
      }
      return season;
    }

    case 'offseason':
    default:
      return season;
  }
}

// ---------------------------------------------------------------------------
// Week-level queries and transitions
// ---------------------------------------------------------------------------

/**
 * Get the current week's schedule. Returns null if the season is in offseason
 * or the week number is out of range.
 */
export function getCurrentWeek(season: Season): WeekSchedule | null {
  const weekIdx = season.currentWeek - 1;
  if (weekIdx < 0 || weekIdx >= season.schedule.length) {
    return null;
  }
  return season.schedule[weekIdx];
}

/**
 * Check whether every game in the current week has been completed.
 */
export function isWeekComplete(season: Season): boolean {
  const currentWeek = getCurrentWeek(season);
  if (!currentWeek) return false;
  if (currentWeek.games.length === 0) return false;

  return currentWeek.games.every((g) => g.status === 'completed');
}

/**
 * Advance to the next week within the regular season.
 * Marks the current week as completed and moves the pointer forward.
 *
 * @param season - Current season state
 * @returns Updated season with currentWeek incremented
 */
export function advanceWeek(season: Season): Season {
  const currentWeek = getCurrentWeek(season);

  if (!currentWeek) return season;

  // Mark current week as completed
  const updatedSchedule = season.schedule.map((ws) => {
    if (ws.week === season.currentWeek) {
      return { ...ws, status: 'completed' as const };
    }
    return ws;
  });

  const nextWeek = season.currentWeek + 1;

  // Mark the next week as in_progress
  const finalSchedule = updatedSchedule.map((ws) => {
    if (ws.week === nextWeek) {
      return { ...ws, status: 'in_progress' as const };
    }
    return ws;
  });

  return {
    ...season,
    currentWeek: nextWeek,
    schedule: finalSchedule,
  };
}

// ---------------------------------------------------------------------------
// Playoff transition
// ---------------------------------------------------------------------------

/**
 * Transition the season from regular_season to the wild_card round.
 * This creates the playoff bracket entries in the schedule.
 *
 * @param season - Season that has completed all 18 regular season weeks
 * @returns Season in wild_card status with playoff week(s) appended
 */
export function transitionToPlayoffs(season: Season): Season {
  // Mark all regular season weeks as completed
  const updatedSchedule = season.schedule.map((ws) => {
    if (ws.week <= REGULAR_SEASON_WEEKS) {
      return { ...ws, status: 'completed' as const };
    }
    return ws;
  });

  // Add placeholder weeks for playoff rounds if not already present
  const playoffWeeks: WeekSchedule[] = [];
  const existingWeekNumbers = new Set(updatedSchedule.map((ws) => ws.week));

  for (const pw of [WILD_CARD_WEEK, DIVISIONAL_WEEK, CONFERENCE_CHAMPIONSHIP_WEEK, SUPER_BOWL_WEEK]) {
    if (!existingWeekNumbers.has(pw)) {
      playoffWeeks.push({
        week: pw,
        games: [],
        featuredGameId: null,
        status: 'upcoming',
      });
    }
  }

  return {
    ...season,
    status: 'wild_card',
    currentWeek: WILD_CARD_WEEK,
    schedule: [...updatedSchedule, ...playoffWeeks],
  };
}

// ---------------------------------------------------------------------------
// Broadcasting queries
// ---------------------------------------------------------------------------

/**
 * Find the next game that should be broadcast.
 *
 * Priority:
 * 1. A game currently in 'broadcasting' status (let it finish)
 * 2. The featured game for the current week if it is still 'scheduled'
 * 3. Any 'scheduled' game in the current week
 *
 * @returns The game ID to broadcast, or null if no games are ready
 */
export function getNextGameToBroadcast(season: Season): string | null {
  const currentWeek = getCurrentWeek(season);
  if (!currentWeek) return null;

  // If a game is already broadcasting, return it
  const broadcasting = currentWeek.games.find((g) => g.status === 'broadcasting');
  if (broadcasting) return broadcasting.id;

  // If a game is currently simulating, return it
  const simulating = currentWeek.games.find((g) => g.status === 'simulating');
  if (simulating) return simulating.id;

  // If the featured game is scheduled, it goes first
  if (currentWeek.featuredGameId) {
    const featured = currentWeek.games.find(
      (g) => g.id === currentWeek.featuredGameId && g.status === 'scheduled'
    );
    if (featured) return featured.id;
  }

  // Otherwise, return any scheduled game
  const scheduled = currentWeek.games.find((g) => g.status === 'scheduled');
  return scheduled?.id ?? null;
}

// ---------------------------------------------------------------------------
// Season completion queries
// ---------------------------------------------------------------------------

/**
 * Check whether the entire season (through Super Bowl) is complete.
 */
export function isSeasonComplete(season: Season): boolean {
  return season.status === 'offseason' && season.completedAt !== null;
}

/**
 * Get a human-readable display string for the current season status.
 */
export function getSeasonDisplayStatus(season: Season): string {
  switch (season.status) {
    case 'regular_season':
      return `Season ${season.seasonNumber} - Week ${season.currentWeek}`;

    case 'wild_card':
      return `Season ${season.seasonNumber} - Wild Card Round`;

    case 'divisional':
      return `Season ${season.seasonNumber} - Divisional Round`;

    case 'conference_championship':
      return `Season ${season.seasonNumber} - Conference Championships`;

    case 'super_bowl':
      return `Season ${season.seasonNumber} - Super Bowl`;

    case 'offseason': {
      if (season.champion) {
        return `Season ${season.seasonNumber} Complete - ${season.champion.name} are champions!`;
      }
      return `Season ${season.seasonNumber} - Offseason`;
    }

    default:
      return `Season ${season.seasonNumber}`;
  }
}
