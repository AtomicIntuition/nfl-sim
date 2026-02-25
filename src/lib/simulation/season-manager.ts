// ============================================================
// GridBlitz - Season Manager (DB-aware)
// ============================================================
// Handles season creation and completion within the simulate
// route's state machine. Operates directly on the database.
// ============================================================

import { db } from '@/lib/db';
import { games, seasons, teams, standings } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateSeasonSchedule } from '@/lib/scheduling/schedule-generator';
import { projectFutureGameTimes } from '@/lib/scheduling/game-time-projector';
import { pickBestFeaturedGame } from './featured-game-picker';
import type { Team } from '@/lib/simulation/types';

// ============================================================
// Create Season
// ============================================================

export async function handleCreateSeason() {
  // Count existing seasons to determine season number
  const existingSeasons = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const nextSeasonNumber =
    existingSeasons.length > 0 ? existingSeasons[0].seasonNumber + 1 : 1;

  // Generate a random seed for the season
  const seed = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  // Create the season record
  const newSeason = await db
    .insert(seasons)
    .values({
      seasonNumber: nextSeasonNumber,
      currentWeek: 1,
      totalWeeks: 22,
      status: 'regular_season',
      seed,
    })
    .returning();

  const seasonId = newSeason[0].id;

  // Get all teams
  const allTeams = await db.select().from(teams);

  if (allTeams.length < 32) {
    return {
      seasonId,
      seasonNumber: nextSeasonNumber,
      message: `Season created but only ${allTeams.length} teams found (need 32)`,
    };
  }

  // Map DB teams to the Team type expected by schedule-generator
  const typedTeams: Team[] = allTeams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    city: t.city,
    mascot: t.mascot,
    conference: t.conference,
    division: t.division,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    offenseRating: t.offenseRating,
    defenseRating: t.defenseRating,
    specialTeamsRating: t.specialTeamsRating,
    playStyle: t.playStyle,
  }));

  // Generate proper 18-week NFL schedule using the schedule generator
  // This creates all regular season matchups with divisional, cross-division,
  // inter-conference games, and bye weeks — just like the real NFL.
  const weeklySchedule = generateSeasonSchedule(typedTeams, seed);

  // Insert all regular season games into the database
  let totalGamesCreated = 0;
  for (let weekIdx = 0; weekIdx < weeklySchedule.length; weekIdx++) {
    const weekGames = weeklySchedule[weekIdx];
    if (weekGames.length === 0) continue;

    const gameValues = weekGames.map((g) => ({
      seasonId,
      week: g.week,
      gameType: 'regular' as const,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled' as const,
      isFeatured: false,
    }));

    await db.insert(games).values(gameValues);
    totalGamesCreated += gameValues.length;
  }

  // Pick the most appealing game in week 1 as featured
  const week1Games = await db
    .select()
    .from(games)
    .where(and(eq(games.seasonId, seasonId), eq(games.week, 1)));

  if (week1Games.length > 0) {
    const featuredId = await pickBestFeaturedGame(week1Games, seasonId, 1);
    await db
      .update(games)
      .set({ isFeatured: true })
      .where(eq(games.id, featuredId));
  }

  // Project game times for the entire season
  await projectFutureGameTimes(seasonId);

  // Initialize standings for all teams
  const standingsValues = allTeams.map((team) => ({
    seasonId,
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

  await db.insert(standings).values(standingsValues);

  return {
    seasonId,
    seasonNumber: nextSeasonNumber,
    gamesCreated: totalGamesCreated,
    message: `Season ${nextSeasonNumber} created with full 18-week schedule (${totalGamesCreated} games)`,
  };
}

// ============================================================
// Season Complete
// ============================================================

export async function handleSeasonComplete(seasonId: string) {
  // Determine the Super Bowl winner (champion)
  let championTeamId: string | null = null;
  const superBowlGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.gameType, 'super_bowl'),
        eq(games.status, 'completed')
      )
    )
    .limit(1);

  if (superBowlGames.length > 0) {
    const sb = superBowlGames[0];
    championTeamId =
      (sb.homeScore ?? 0) >= (sb.awayScore ?? 0) ? sb.homeTeamId : sb.awayTeamId;
  }

  await db
    .update(seasons)
    .set({
      status: 'offseason',
      completedAt: new Date(),
      ...(championTeamId ? { championTeamId } : {}),
    })
    .where(eq(seasons.id, seasonId));

  let message = 'Season complete! The offseason begins.';
  if (championTeamId) {
    const champTeam = await db.select().from(teams).where(eq(teams.id, championTeamId)).limit(1);
    if (champTeam[0]) {
      message = `Season complete! The ${champTeam[0].city} ${champTeam[0].mascot} are Super Bowl champions!`;
    }
  }

  return { message, championTeamId };
}
