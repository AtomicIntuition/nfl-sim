// ============================================================
// GridBlitz - Database Seed Script
// ============================================================
// Seeds: 32 teams, ~832 players, Season 1, 18-week schedule,
// standings for all 32 teams.
//
// Usage: npx tsx scripts/seed.ts
// ============================================================

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '../src/lib/db/schema';
import { teamsSeedData } from '../src/lib/db/seed-data/teams';
import { generatePlayersFromESPN } from '../src/lib/db/seed-data/players';
import { generateSeasonSchedule } from '../src/lib/scheduling/schedule-generator';
import type { Team } from '../src/lib/simulation/types';

// ============================================================
// DATABASE CONNECTION
// ============================================================

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seed() {
  console.log('🏈 GridBlitz - Database Seeder');
  console.log('==================================\n');

  // ----------------------------------------------------------
  // 1. Seed Teams
  // ----------------------------------------------------------
  console.log('1/5 Seeding 32 NFL teams...');

  const insertedTeams: (typeof schema.teams.$inferSelect)[] = [];

  for (const teamData of teamsSeedData) {
    const [team] = await db
      .insert(schema.teams)
      .values({
        name: teamData.name,
        abbreviation: teamData.abbreviation,
        city: teamData.city,
        mascot: teamData.mascot,
        conference: teamData.conference,
        division: teamData.division,
        primaryColor: teamData.primaryColor,
        secondaryColor: teamData.secondaryColor,
        offenseRating: teamData.offenseRating,
        defenseRating: teamData.defenseRating,
        specialTeamsRating: teamData.specialTeamsRating,
        playStyle: teamData.playStyle,
      })
      .returning();

    insertedTeams.push(team);
  }

  console.log(`   ✓ ${insertedTeams.length} teams created`);

  // Build abbreviation → team ID map
  const teamIdMap = new Map<string, string>();
  for (const team of insertedTeams) {
    teamIdMap.set(team.abbreviation, team.id);
  }

  // ----------------------------------------------------------
  // 2. Seed Players
  // ----------------------------------------------------------
  console.log('2/5 Fetching real rosters from ESPN + generating ratings...');

  let totalPlayers = 0;

  for (let i = 0; i < teamsSeedData.length; i++) {
    const teamData = teamsSeedData[i];
    const teamId = teamIdMap.get(teamData.abbreviation)!;
    const roster = await generatePlayersFromESPN(teamData.abbreviation, i);

    // Insert in batches for performance
    const playerValues = roster.map((p) => ({
      teamId,
      name: p.name,
      position: p.position as typeof schema.positionEnum.enumValues[number],
      number: p.number,
      rating: p.rating,
      speed: p.speed,
      strength: p.strength,
      awareness: p.awareness,
      clutchRating: p.clutchRating,
      injuryProne: p.injuryProne,
      ...('espnId' in p && p.espnId ? { espnId: p.espnId } : {}),
    }));

    await db.insert(schema.players).values(playerValues);
    totalPlayers += roster.length;
    // Show progress for ESPN fetches
    process.stdout.write(`   ${teamData.abbreviation}`);
  }

  console.log(`\n   ✓ ${totalPlayers} players created (~${Math.round(totalPlayers / 32)} per team)`);

  // ----------------------------------------------------------
  // 3. Create Season 1
  // ----------------------------------------------------------
  console.log('3/5 Creating Season 1...');

  const seasonSeed = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');

  const [season] = await db
    .insert(schema.seasons)
    .values({
      seasonNumber: 1,
      currentWeek: 1,
      totalWeeks: 22,
      status: 'regular_season',
      seed: seasonSeed,
    })
    .returning();

  console.log(`   ✓ Season 1 created (id: ${season.id})`);

  // ----------------------------------------------------------
  // 4. Generate 18-Week Schedule
  // ----------------------------------------------------------
  console.log('4/5 Generating 18-week schedule (272 regular season games)...');

  // Build Team objects for the schedule generator
  const teamsForSchedule: Team[] = insertedTeams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    city: t.city,
    mascot: t.mascot,
    conference: t.conference as 'AFC' | 'NFC',
    division: t.division as 'North' | 'South' | 'East' | 'West',
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    offenseRating: t.offenseRating,
    defenseRating: t.defenseRating,
    specialTeamsRating: t.specialTeamsRating,
    playStyle: t.playStyle as Team['playStyle'],
  }));

  const weeklySchedule = generateSeasonSchedule(teamsForSchedule, seasonSeed);

  let totalGames = 0;

  for (const weekGames of weeklySchedule) {
    if (weekGames.length === 0) continue;

    const gameValues = weekGames.map((game) => ({
      seasonId: season.id,
      week: game.week,
      gameType: game.gameType as typeof schema.gameTypeEnum.enumValues[number],
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      status: 'scheduled' as const,
      isFeatured: false,
    }));

    await db.insert(schema.games).values(gameValues);
    totalGames += weekGames.length;
  }

  console.log(`   ✓ ${totalGames} games scheduled across ${weeklySchedule.length} weeks`);

  // ----------------------------------------------------------
  // 5. Initialize Standings
  // ----------------------------------------------------------
  console.log('5/5 Initializing standings for all 32 teams...');

  const standingsValues = insertedTeams.map((team) => ({
    seasonId: season.id,
    teamId: team.id,
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
  }));

  await db.insert(schema.standings).values(standingsValues);

  console.log(`   ✓ 32 standings entries created`);

  // ----------------------------------------------------------
  // Done!
  // ----------------------------------------------------------
  console.log('\n==================================');
  console.log('🎉 Seeding complete!');
  console.log(`   Teams:    ${insertedTeams.length}`);
  console.log(`   Players:  ${totalPlayers}`);
  console.log(`   Season:   1 (${season.status})`);
  console.log(`   Games:    ${totalGames}`);
  console.log(`   Weeks:    ${weeklySchedule.length}`);
  console.log(`   Standings: 32`);
  console.log('\nYour GridBlitz database is ready! 🏈\n');
}

// ============================================================
// RUN
// ============================================================

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  });
