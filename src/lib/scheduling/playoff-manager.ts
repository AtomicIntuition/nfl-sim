// ============================================================
// GridBlitz - Playoff Manager
// ============================================================
// Manages NFL playoff seeding, bracket generation, and round
// advancement from Wild Card through the Super Bowl.
//
// Playoff structure:
//   - 7 teams per conference qualify
//   - Seeds 1-4: division winners ranked by record
//   - Seeds 5-7: best 3 non-division-winner records (wild cards)
//   - Wild Card Round: #2 vs #7, #3 vs #6, #4 vs #5 (#1 bye)
//   - Divisional Round: #1 vs lowest remaining, other two play
//   - Conference Championship: winners meet
//   - Super Bowl: AFC champion vs NFC champion (neutral site)
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  TeamStanding,
  PlayoffBracket,
  PlayoffMatchup,
  PlayoffRound,
  Team,
  ScheduledGame,
  DivisionStandings,
  Conference,
  GameStatus,
} from '../simulation/types';

// ---------------------------------------------------------------------------
// Standing comparison / tiebreaking
// ---------------------------------------------------------------------------

/**
 * Win percentage calculation. Ties count as half a win.
 */
function winPct(standing: TeamStanding): number {
  const totalGames = standing.wins + standing.losses + standing.ties;
  if (totalGames === 0) return 0;
  return (standing.wins + standing.ties * 0.5) / totalGames;
}

/**
 * Division win percentage for tiebreaking.
 */
function divWinPct(standing: TeamStanding): number {
  const total = standing.divisionWins + standing.divisionLosses;
  if (total === 0) return 0;
  return standing.divisionWins / total;
}

/**
 * Conference win percentage for tiebreaking.
 */
function confWinPct(standing: TeamStanding): number {
  const total = standing.conferenceWins + standing.conferenceLosses;
  if (total === 0) return 0;
  return standing.conferenceWins / total;
}

/**
 * Point differential as the final tiebreaker proxy for strength of victory.
 */
function pointDiff(standing: TeamStanding): number {
  return standing.pointsFor - standing.pointsAgainst;
}

/**
 * Compare two teams for playoff seeding purposes.
 * Returns negative if `a` ranks higher (better) than `b`.
 *
 * Tiebreaker order:
 *   1. Win percentage (higher is better)
 *   2. Division record (higher is better)
 *   3. Conference record (higher is better)
 *   4. Point differential (higher is better, proxy for strength of victory)
 *   5. Points scored (higher is better)
 */
function compareStandings(a: TeamStanding, b: TeamStanding): number {
  // Win percentage (descending)
  const wpDiff = winPct(b) - winPct(a);
  if (Math.abs(wpDiff) > 0.001) return wpDiff;

  // Division record
  const divDiff = divWinPct(b) - divWinPct(a);
  if (Math.abs(divDiff) > 0.001) return divDiff;

  // Conference record
  const confDiff = confWinPct(b) - confWinPct(a);
  if (Math.abs(confDiff) > 0.001) return confDiff;

  // Point differential
  const pdDiff = pointDiff(b) - pointDiff(a);
  if (pdDiff !== 0) return pdDiff;

  // Points scored
  return b.pointsFor - a.pointsFor;
}

// ---------------------------------------------------------------------------
// Playoff seeding
// ---------------------------------------------------------------------------

/**
 * Calculate the 7 playoff seeds for each conference from the division standings.
 *
 * Seeds 1-4: Division winners, ranked by record (best gets #1 seed and first-round bye).
 * Seeds 5-7: Best three non-division-winner records in the conference.
 *
 * @param standings - All 8 division standings (4 AFC, 4 NFC)
 * @returns Seeded standings for each conference (7 teams each, ordered by seed)
 */
export function calculatePlayoffSeeds(
  standings: DivisionStandings[]
): { afc: TeamStanding[]; nfc: TeamStanding[] } {
  const result: { afc: TeamStanding[]; nfc: TeamStanding[] } = {
    afc: [],
    nfc: [],
  };

  for (const conference of ['AFC', 'NFC'] as Conference[]) {
    const confDivisions = standings.filter((d) => d.conference === conference);

    // Find each division winner
    const divisionWinners: TeamStanding[] = [];
    const nonWinners: TeamStanding[] = [];

    for (const div of confDivisions) {
      // Sort teams within the division
      const sorted = [...div.teams].sort(compareStandings);
      if (sorted.length > 0) {
        divisionWinners.push(sorted[0]);
        nonWinners.push(...sorted.slice(1));
      }
    }

    // Sort division winners by record to assign seeds 1-4
    divisionWinners.sort(compareStandings);

    // Sort non-winners to find wild card teams (seeds 5-7)
    nonWinners.sort(compareStandings);
    const wildCards = nonWinners.slice(0, 3);

    // Assign playoff seeds
    const seeded: TeamStanding[] = [];
    for (let i = 0; i < divisionWinners.length; i++) {
      seeded.push({
        ...divisionWinners[i],
        playoffSeed: i + 1,
        clinched: i === 0 ? 'bye' : 'division',
      });
    }
    for (let i = 0; i < wildCards.length; i++) {
      seeded.push({
        ...wildCards[i],
        playoffSeed: 5 + i,
        clinched: 'wild_card',
      });
    }

    // Mark eliminated teams
    const qualifiedIds = new Set(seeded.map((s) => s.teamId));
    for (const div of confDivisions) {
      for (const team of div.teams) {
        if (!qualifiedIds.has(team.teamId)) {
          team.clinched = 'eliminated';
        }
      }
    }

    if (conference === 'AFC') {
      result.afc = seeded;
    } else {
      result.nfc = seeded;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Wild Card matchup generation
// ---------------------------------------------------------------------------

/**
 * Generate Wild Card Round matchups for a single conference.
 *
 * #1 seed receives a first-round bye.
 * #2 vs #7, #3 vs #6, #4 vs #5 (higher seed always hosts).
 *
 * @param seeds - The 7 seeded teams for one conference
 * @returns 3 Wild Card matchups
 */
export function generateWildCardMatchups(seeds: TeamStanding[]): PlayoffMatchup[] {
  if (seeds.length < 7) {
    throw new Error(`Wild Card round requires 7 seeds, received ${seeds.length}`);
  }

  // Seeds are expected to be in order: index 0 = #1 seed, index 6 = #7 seed
  const matchups: PlayoffMatchup[] = [
    // #2 vs #7
    createPlayoffMatchup(seeds[1], seeds[6], 2, 7),
    // #3 vs #6
    createPlayoffMatchup(seeds[2], seeds[5], 3, 6),
    // #4 vs #5
    createPlayoffMatchup(seeds[3], seeds[4], 4, 5),
  ];

  return matchups;
}

function createPlayoffMatchup(
  homeSeedStanding: TeamStanding,
  awaySeedStanding: TeamStanding,
  homeSeedNum: number,
  awaySeedNum: number
): PlayoffMatchup {
  return {
    gameId: null,
    homeSeed: homeSeedNum,
    awaySeed: awaySeedNum,
    homeTeam: homeSeedStanding.team ?? null,
    awayTeam: awaySeedStanding.team ?? null,
    homeScore: null,
    awayScore: null,
    winner: null,
    status: 'scheduled' as GameStatus,
  };
}

// ---------------------------------------------------------------------------
// Divisional matchup generation
// ---------------------------------------------------------------------------

/**
 * Generate Divisional Round matchups for a single conference.
 *
 * The #1 seed (who had a bye) plays the lowest remaining seed.
 * The other two Wild Card winners play each other.
 *
 * @param topSeed - The #1 seed standing
 * @param wildCardWinners - The 3 teams that won their Wild Card games, with their original seeds
 * @returns 2 Divisional Round matchups
 */
export function generateDivisionalMatchups(
  topSeed: TeamStanding,
  wildCardWinners: TeamStanding[]
): PlayoffMatchup[] {
  if (wildCardWinners.length !== 3) {
    throw new Error(`Divisional round requires 3 Wild Card winners, received ${wildCardWinners.length}`);
  }

  // Sort winners by their original seed (ascending = lowest seed number first)
  const sorted = [...wildCardWinners].sort(
    (a, b) => (a.playoffSeed ?? 99) - (b.playoffSeed ?? 99)
  );

  // #1 seed plays the lowest remaining seed (highest seed number = worst record)
  const lowestRemaining = sorted[sorted.length - 1]; // Highest seed number among winners
  const remainingTwo = sorted.slice(0, 2); // The other two winners

  const matchups: PlayoffMatchup[] = [
    // #1 seed hosts the lowest remaining seed
    createPlayoffMatchup(topSeed, lowestRemaining, 1, lowestRemaining.playoffSeed ?? 0),
    // Higher remaining seed hosts lower remaining seed
    createPlayoffMatchup(remainingTwo[0], remainingTwo[1], remainingTwo[0].playoffSeed ?? 0, remainingTwo[1].playoffSeed ?? 0),
  ];

  return matchups;
}

// ---------------------------------------------------------------------------
// Bracket generation
// ---------------------------------------------------------------------------

/**
 * Generate the initial playoff bracket with Wild Card matchups populated.
 *
 * @param afcSeeds - 7 AFC seeded teams
 * @param nfcSeeds - 7 NFC seeded teams
 * @returns A PlayoffBracket with Wild Card matchups ready
 */
export function generatePlayoffBracket(
  afcSeeds: TeamStanding[],
  nfcSeeds: TeamStanding[]
): PlayoffBracket {
  const afcWildCard: PlayoffRound = {
    name: 'Wild Card Round',
    matchups: generateWildCardMatchups(afcSeeds),
  };

  const nfcWildCard: PlayoffRound = {
    name: 'Wild Card Round',
    matchups: generateWildCardMatchups(nfcSeeds),
  };

  // Create placeholder rounds for later stages
  const afcDivisional: PlayoffRound = {
    name: 'Divisional Round',
    matchups: [],
  };

  const nfcDivisional: PlayoffRound = {
    name: 'Divisional Round',
    matchups: [],
  };

  const afcChampionship: PlayoffRound = {
    name: 'AFC Championship',
    matchups: [],
  };

  const nfcChampionship: PlayoffRound = {
    name: 'NFC Championship',
    matchups: [],
  };

  return {
    afc: [afcWildCard, afcDivisional, afcChampionship],
    nfc: [nfcWildCard, nfcDivisional, nfcChampionship],
    superBowl: null,
  };
}

// ---------------------------------------------------------------------------
// Bracket advancement
// ---------------------------------------------------------------------------

/**
 * Advance the bracket after a playoff game completes.
 *
 * This updates the matchup with the final score and winner, then
 * generates next-round matchups when all games in a round are complete.
 *
 * @param bracket - Current playoff bracket state
 * @param gameId - The completed game's ID
 * @param winner - The winning team
 * @param homeScore - Final home score
 * @param awayScore - Final away score
 * @returns Updated bracket
 */
export function advancePlayoffBracket(
  bracket: PlayoffBracket,
  gameId: string,
  winner: Team,
  homeScore: number,
  awayScore: number
): PlayoffBracket {
  let updated = deepCloneBracket(bracket);

  // Find and update the matchup across all rounds and conferences
  let matchupFound = false;

  for (const conference of ['afc', 'nfc'] as const) {
    for (const round of updated[conference]) {
      for (const matchup of round.matchups) {
        if (matchup.gameId === gameId) {
          matchup.homeScore = homeScore;
          matchup.awayScore = awayScore;
          matchup.winner = winner;
          matchup.status = 'completed';
          matchupFound = true;
          break;
        }
      }
      if (matchupFound) break;
    }
    if (matchupFound) break;
  }

  // Check the Super Bowl as well
  if (!matchupFound && updated.superBowl?.gameId === gameId) {
    updated.superBowl.homeScore = homeScore;
    updated.superBowl.awayScore = awayScore;
    updated.superBowl.winner = winner;
    updated.superBowl.status = 'completed';
    matchupFound = true;
  }

  if (!matchupFound) {
    return bracket; // Game not found in bracket, return unchanged
  }

  // Check if Wild Card rounds are complete and generate Divisional matchups
  updated = maybeAdvanceToNextRound(updated);

  return updated;
}

/**
 * Check each stage and generate next-round matchups when a round completes.
 */
function maybeAdvanceToNextRound(bracket: PlayoffBracket): PlayoffBracket {
  for (const conference of ['afc', 'nfc'] as const) {
    const rounds = bracket[conference];

    // Wild Card -> Divisional
    const wildCardRound = rounds[0];
    const divisionalRound = rounds[1];
    if (
      wildCardRound.matchups.length > 0 &&
      wildCardRound.matchups.every((m) => m.status === 'completed') &&
      divisionalRound.matchups.length === 0
    ) {
      // Find the #1 seed (the team with bye)
      const allSeeds = getAllSeedsFromWildCard(wildCardRound);
      const wildCardWinners: TeamStanding[] = wildCardRound.matchups
        .filter((m) => m.winner !== null)
        .map((m) => {
          const isHomeWinner = m.winner!.id === m.homeTeam?.id;
          return {
            teamId: m.winner!.id,
            team: m.winner!,
            wins: 0,
            losses: 0,
            ties: 0,
            divisionWins: 0,
            divisionLosses: 0,
            conferenceWins: 0,
            conferenceLosses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            streak: '',
            clinched: null,
            playoffSeed: isHomeWinner ? m.homeSeed : m.awaySeed,
          };
        });

      // #1 seed was not in wild card (had bye)
      // We need the #1 seed team -- find it from the bracket metadata
      // The #1 seed's info is not stored in wild card matchups, so we
      // store it in the bracket structure. For now, we create placeholder
      // divisional matchups that will be populated externally.

      // Sort wild card winners by seed (ascending)
      wildCardWinners.sort((a, b) => (a.playoffSeed ?? 99) - (b.playoffSeed ?? 99));

      // Generate divisional matchups
      // Note: the #1 seed needs to be passed in from outside since the bracket
      // does not store them directly. We create matchups with the assumption
      // that the caller will populate the #1 seed team.
      const lowestWinner = wildCardWinners[wildCardWinners.length - 1];
      const otherTwoWinners = wildCardWinners.slice(0, 2);

      // #1 seed vs lowest remaining (we leave homeTeam null for #1 seed placeholder)
      divisionalRound.matchups = [
        {
          gameId: null,
          homeSeed: 1,
          awaySeed: lowestWinner.playoffSeed ?? 0,
          homeTeam: null, // #1 seed -- must be populated by caller
          awayTeam: lowestWinner.team ?? null,
          homeScore: null,
          awayScore: null,
          winner: null,
          status: 'scheduled',
        },
        {
          gameId: null,
          homeSeed: otherTwoWinners[0].playoffSeed ?? 0,
          awaySeed: otherTwoWinners[1].playoffSeed ?? 0,
          homeTeam: otherTwoWinners[0].team ?? null,
          awayTeam: otherTwoWinners[1].team ?? null,
          homeScore: null,
          awayScore: null,
          winner: null,
          status: 'scheduled',
        },
      ];
    }

    // Divisional -> Conference Championship
    const championshipRound = rounds[2];
    if (
      divisionalRound.matchups.length > 0 &&
      divisionalRound.matchups.every((m) => m.status === 'completed') &&
      championshipRound.matchups.length === 0
    ) {
      const divWinners = divisionalRound.matchups
        .filter((m) => m.winner !== null)
        .map((m) => {
          const isHomeWinner = m.winner!.id === m.homeTeam?.id;
          return {
            team: m.winner!,
            seed: isHomeWinner ? m.homeSeed : m.awaySeed,
          };
        });

      // Sort by seed to determine who hosts
      divWinners.sort((a, b) => a.seed - b.seed);

      if (divWinners.length === 2) {
        championshipRound.matchups = [
          {
            gameId: null,
            homeSeed: divWinners[0].seed,
            awaySeed: divWinners[1].seed,
            homeTeam: divWinners[0].team,
            awayTeam: divWinners[1].team,
            homeScore: null,
            awayScore: null,
            winner: null,
            status: 'scheduled',
          },
        ];
      }
    }
  }

  // Conference Championships -> Super Bowl
  const afcChampRound = bracket.afc[2];
  const nfcChampRound = bracket.nfc[2];
  if (
    afcChampRound.matchups.length > 0 &&
    afcChampRound.matchups.every((m) => m.status === 'completed') &&
    nfcChampRound.matchups.length > 0 &&
    nfcChampRound.matchups.every((m) => m.status === 'completed') &&
    bracket.superBowl === null
  ) {
    const afcChamp = afcChampRound.matchups[0]?.winner ?? null;
    const nfcChamp = nfcChampRound.matchups[0]?.winner ?? null;

    if (afcChamp && nfcChamp) {
      bracket.superBowl = {
        gameId: null,
        homeSeed: 0, // Neutral site
        awaySeed: 0,
        homeTeam: afcChamp, // AFC is traditionally the "home" team in odd years
        awayTeam: nfcChamp,
        homeScore: null,
        awayScore: null,
        winner: null,
        status: 'scheduled',
      };
    }
  }

  return bracket;
}

/**
 * Extract the seed information from wild card matchups for reference.
 */
function getAllSeedsFromWildCard(round: PlayoffRound): number[] {
  const seeds: number[] = [];
  for (const m of round.matchups) {
    seeds.push(m.homeSeed, m.awaySeed);
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Bracket display
// ---------------------------------------------------------------------------

/**
 * Get all playoff rounds for a specific conference for UI display.
 *
 * @param bracket - The full playoff bracket
 * @param conference - Which conference to display ('AFC' or 'NFC')
 * @returns The array of playoff rounds for that conference
 */
export function getConferenceBracketDisplay(
  bracket: PlayoffBracket,
  conference: Conference
): PlayoffRound[] {
  if (conference === 'AFC') {
    return bracket.afc;
  }
  return bracket.nfc;
}

// ---------------------------------------------------------------------------
// Deep clone utility
// ---------------------------------------------------------------------------

function deepCloneBracket(bracket: PlayoffBracket): PlayoffBracket {
  return {
    afc: bracket.afc.map((round) => ({
      ...round,
      matchups: round.matchups.map((m) => ({ ...m })),
    })),
    nfc: bracket.nfc.map((round) => ({
      ...round,
      matchups: round.matchups.map((m) => ({ ...m })),
    })),
    superBowl: bracket.superBowl ? { ...bracket.superBowl } : null,
  };
}
