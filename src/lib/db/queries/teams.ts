import { db } from "@/lib/db";
import { teams, players, standings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Get all 32 teams */
export async function getAllTeams() {
  return db.select().from(teams);
}

/** Get a team by ID */
export async function getTeamById(teamId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return result[0] ?? null;
}

/** Get a team by abbreviation */
export async function getTeamByAbbreviation(abbreviation: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.abbreviation, abbreviation))
    .limit(1);
  return result[0] ?? null;
}

/** Get all players for a team */
export async function getTeamPlayers(teamId: string) {
  return db.select().from(players).where(eq(players.teamId, teamId));
}

/** Get all players for all teams (batch) */
export async function getAllPlayers() {
  return db.select().from(players);
}

/** Get standings for a season */
export async function getStandings(seasonId: string) {
  const result = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));

  // Hydrate with team data
  const allTeams = await getAllTeams();
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  return result.map((s) => ({
    ...s,
    team: teamMap.get(s.teamId) ?? null,
  }));
}

/** Update standings for a team after a game */
export async function updateStanding(
  seasonId: string,
  teamId: string,
  data: Partial<{
    wins: number;
    losses: number;
    ties: number;
    divisionWins: number;
    divisionLosses: number;
    conferenceWins: number;
    conferenceLosses: number;
    pointsFor: number;
    pointsAgainst: number;
    streak: string;
    playoffSeed: number | null;
    clinched: string | null;
  }>
) {
  await db
    .update(standings)
    .set(data)
    .where(eq(standings.seasonId, seasonId));
}

/** Seed teams into the database */
export async function seedTeams(
  teamData: Array<{
    name: string;
    abbreviation: string;
    city: string;
    mascot: string;
    conference: "AFC" | "NFC";
    division: "North" | "South" | "East" | "West";
    primaryColor: string;
    secondaryColor: string;
    offenseRating: number;
    defenseRating: number;
    specialTeamsRating: number;
    playStyle:
      | "balanced"
      | "pass_heavy"
      | "run_heavy"
      | "aggressive"
      | "conservative";
  }>
) {
  // Check if teams already exist
  const existing = await db.select().from(teams).limit(1);
  if (existing.length > 0) return;

  await db.insert(teams).values(teamData);
}

/** Seed players into the database */
export async function seedPlayers(
  playerData: Array<{
    teamId: string;
    name: string;
    position:
      | "QB"
      | "RB"
      | "WR"
      | "TE"
      | "OL"
      | "DL"
      | "LB"
      | "CB"
      | "S"
      | "K"
      | "P";
    number: number;
    rating: number;
    speed: number;
    strength: number;
    awareness: number;
    clutchRating: number;
    injuryProne: boolean;
  }>
) {
  // Check if players already exist
  const existing = await db.select().from(players).limit(1);
  if (existing.length > 0) return;

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < playerData.length; i += batchSize) {
    const batch = playerData.slice(i, i + batchSize);
    await db.insert(players).values(batch);
  }
}
