// ============================================================
// GridBlitz - Playoff Game Generator
// ============================================================
// Creates playoff bracket games dynamically from standings
// after each playoff round is completed.
// ============================================================

import { db } from '@/lib/db';
import { games, teams, standings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { calculatePlayoffSeeds } from '@/lib/scheduling/playoff-manager';
import type { DivisionStandings, TeamStanding } from '@/lib/simulation/types';
import { pickBestFeaturedGame } from './featured-game-picker';

// ============================================================
// Helper: Build division standings from DB for playoff seeding
// ============================================================

export async function buildDivisionStandings(seasonId: string): Promise<DivisionStandings[]> {
  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));

  const divisionMap: Record<string, Record<string, TeamStanding[]>> = {};

  for (const s of standingRows) {
    const team = teamMap.get(s.teamId);
    if (!team) continue;
    const conf = team.conference;
    const div = team.division;
    if (!divisionMap[conf]) divisionMap[conf] = {};
    if (!divisionMap[conf][div]) divisionMap[conf][div] = [];
    divisionMap[conf][div].push({
      teamId: s.teamId,
      team: {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        city: team.city,
        mascot: team.mascot,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
        offenseRating: team.offenseRating,
        defenseRating: team.defenseRating,
        specialTeamsRating: team.specialTeamsRating,
        playStyle: team.playStyle,
      },
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      divisionWins: s.divisionWins ?? 0,
      divisionLosses: s.divisionLosses ?? 0,
      conferenceWins: s.conferenceWins ?? 0,
      conferenceLosses: s.conferenceLosses ?? 0,
      pointsFor: s.pointsFor ?? 0,
      pointsAgainst: s.pointsAgainst ?? 0,
      streak: s.streak ?? 'W0',
      clinched: null,
      playoffSeed: null,
    });
  }

  const result: DivisionStandings[] = [];
  for (const conf of ['AFC', 'NFC'] as const) {
    for (const div of ['North', 'South', 'East', 'West'] as const) {
      result.push({
        conference: conf,
        division: div,
        teams: divisionMap[conf]?.[div] ?? [],
      });
    }
  }
  return result;
}

// ============================================================
// Generate Wild Card games
// ============================================================

/**
 * Generate Wild Card games from playoff seedings.
 * NFL format: #2 vs #7, #3 vs #6, #4 vs #5 in each conference.
 * #1 seed gets a first-round bye.
 */
export async function generateWildCardGames(seasonId: string): Promise<number> {
  const divStandings = await buildDivisionStandings(seasonId);
  const seeds = calculatePlayoffSeeds(divStandings);

  // Update playoff seeds in the standings table
  for (const conf of [seeds.afc, seeds.nfc]) {
    for (const seeded of conf) {
      if (seeded.playoffSeed != null) {
        await db
          .update(standings)
          .set({
            playoffSeed: seeded.playoffSeed,
            clinched: seeded.clinched ?? null,
          })
          .where(
            and(
              eq(standings.seasonId, seasonId),
              eq(standings.teamId, seeded.teamId)
            )
          );
      }
    }
  }

  // Create the 6 Wild Card games (3 per conference)
  const wcGames: Array<{
    seasonId: string;
    week: number;
    gameType: 'wild_card';
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    status: 'scheduled';
    isFeatured: boolean;
  }> = [];

  for (const [confName, confSeeds] of [['AFC', seeds.afc], ['NFC', seeds.nfc]] as const) {
    // #2 vs #7 (higher seed hosts)
    wcGames.push({
      seasonId,
      week: 19,
      gameType: 'wild_card',
      homeTeamId: confSeeds[1].teamId, // #2 seed
      awayTeamId: confSeeds[6].teamId, // #7 seed
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });
    // #3 vs #6
    wcGames.push({
      seasonId,
      week: 19,
      gameType: 'wild_card',
      homeTeamId: confSeeds[2].teamId, // #3 seed
      awayTeamId: confSeeds[5].teamId, // #6 seed
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });
    // #4 vs #5
    wcGames.push({
      seasonId,
      week: 19,
      gameType: 'wild_card',
      homeTeamId: confSeeds[3].teamId, // #4 seed
      awayTeamId: confSeeds[4].teamId, // #5 seed
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });
  }

  if (wcGames.length > 0) {
    await db.insert(games).values(wcGames);
    const inserted = await db
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.week, 19)));
    if (inserted.length > 0) {
      const featuredId = await pickBestFeaturedGame(inserted, seasonId, 19);
      await db.update(games).set({ isFeatured: true }).where(eq(games.id, featuredId));
    }
  }

  return wcGames.length;
}

// ============================================================
// Generate Divisional Round games
// ============================================================

/**
 * Generate Divisional Round games.
 * #1 seed (bye) plays the lowest remaining seed.
 * Other two WC winners play each other. Higher seed hosts.
 */
export async function generateDivisionalGames(seasonId: string): Promise<number> {
  // Get the Wild Card game results
  const wcGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.week, 19),
        eq(games.status, 'completed')
      )
    );

  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  // Get playoff seeds from standings
  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));

  const divGames: Array<{
    seasonId: string;
    week: number;
    gameType: 'divisional';
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    status: 'scheduled';
    isFeatured: boolean;
  }> = [];

  for (const conf of ['AFC', 'NFC'] as const) {
    // Find #1 seed (had bye)
    const oneSeed = standingRows.find((s) => {
      const team = teamMap.get(s.teamId);
      return team?.conference === conf && s.playoffSeed === 1;
    });

    if (!oneSeed) continue;

    // Find WC winners for this conference
    const confWcGames = wcGames.filter((g) => {
      const homeTeam = teamMap.get(g.homeTeamId);
      return homeTeam?.conference === conf;
    });

    const wcWinners: Array<{ teamId: string; seed: number }> = [];
    for (const g of confWcGames) {
      if (g.homeScore !== null && g.awayScore !== null) {
        const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
        const winnerStanding = standingRows.find((s) => s.teamId === winnerId);
        wcWinners.push({
          teamId: winnerId,
          seed: winnerStanding?.playoffSeed ?? 99,
        });
      }
    }

    if (wcWinners.length !== 3) continue;

    // Sort by seed (ascending = best seed first)
    wcWinners.sort((a, b) => a.seed - b.seed);

    // #1 seed vs lowest remaining seed (highest seed number = worst record)
    const lowestSeed = wcWinners[wcWinners.length - 1];
    // Other two WC winners play each other
    const [higherWinner, lowerWinner] = [wcWinners[0], wcWinners[1]];

    divGames.push({
      seasonId,
      week: 20,
      gameType: 'divisional',
      homeTeamId: oneSeed.teamId,         // #1 seed hosts
      awayTeamId: lowestSeed.teamId,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });

    divGames.push({
      seasonId,
      week: 20,
      gameType: 'divisional',
      homeTeamId: higherWinner.teamId,    // Higher seed hosts
      awayTeamId: lowerWinner.teamId,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });
  }

  if (divGames.length > 0) {
    await db.insert(games).values(divGames);
    const inserted = await db
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.week, 20)));
    if (inserted.length > 0) {
      const featuredId = await pickBestFeaturedGame(inserted, seasonId, 20);
      await db.update(games).set({ isFeatured: true }).where(eq(games.id, featuredId));
    }
  }

  return divGames.length;
}

// ============================================================
// Generate Conference Championship games
// ============================================================

/**
 * Generate Conference Championship games.
 * The two Divisional Round winners in each conference play each other.
 * Higher original seed hosts.
 */
export async function generateConferenceChampionshipGames(seasonId: string): Promise<number> {
  const divGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.week, 20),
        eq(games.status, 'completed')
      )
    );

  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));

  const ccGames: Array<{
    seasonId: string;
    week: number;
    gameType: 'conference_championship';
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    status: 'scheduled';
    isFeatured: boolean;
  }> = [];

  for (const conf of ['AFC', 'NFC'] as const) {
    const confDivGames = divGames.filter((g) => {
      const homeTeam = teamMap.get(g.homeTeamId);
      return homeTeam?.conference === conf;
    });

    const winners: Array<{ teamId: string; seed: number }> = [];
    for (const g of confDivGames) {
      if (g.homeScore !== null && g.awayScore !== null) {
        const winnerId = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
        const winnerStanding = standingRows.find((s) => s.teamId === winnerId);
        winners.push({
          teamId: winnerId,
          seed: winnerStanding?.playoffSeed ?? 99,
        });
      }
    }

    if (winners.length !== 2) continue;

    // Higher seed (lower number) hosts
    winners.sort((a, b) => a.seed - b.seed);

    ccGames.push({
      seasonId,
      week: 21,
      gameType: 'conference_championship',
      homeTeamId: winners[0].teamId,
      awayTeamId: winners[1].teamId,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      isFeatured: false,
    });
  }

  if (ccGames.length > 0) {
    await db.insert(games).values(ccGames);
    const inserted = await db
      .select()
      .from(games)
      .where(and(eq(games.seasonId, seasonId), eq(games.week, 21)));
    if (inserted.length > 0) {
      const featuredId = await pickBestFeaturedGame(inserted, seasonId, 21);
      await db.update(games).set({ isFeatured: true }).where(eq(games.id, featuredId));
    }
  }

  return ccGames.length;
}

// ============================================================
// Generate Super Bowl game
// ============================================================

/**
 * Generate the Super Bowl game.
 * AFC champion vs NFC champion at a neutral site.
 */
export async function generateSuperBowlGame(seasonId: string): Promise<number> {
  const ccGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.week, 21),
        eq(games.status, 'completed')
      )
    );

  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  let afcChampId: string | null = null;
  let nfcChampId: string | null = null;

  for (const g of ccGames) {
    const winnerId =
      (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
    const winnerTeam = teamMap.get(winnerId);
    if (winnerTeam?.conference === 'AFC') {
      afcChampId = winnerId;
    } else if (winnerTeam?.conference === 'NFC') {
      nfcChampId = winnerId;
    }
  }

  if (!afcChampId || !nfcChampId) {
    return 0;
  }

  await db.insert(games).values({
    seasonId,
    week: 22,
    gameType: 'super_bowl',
    homeTeamId: afcChampId,   // AFC is traditionally "home" team
    awayTeamId: nfcChampId,
    homeScore: 0,
    awayScore: 0,
    status: 'scheduled',
    isFeatured: true,         // Super Bowl is always featured
  });

  return 1;
}
