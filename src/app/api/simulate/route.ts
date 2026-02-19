export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  games,
  seasons,
  teams,
  players,
  gameEvents,
  standings,
} from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { generateSeasonSchedule } from '@/lib/scheduling/schedule-generator';
import { calculatePlayoffSeeds } from '@/lib/scheduling/playoff-manager';
import { simulateGame } from '@/lib/simulation/engine';
import type {
  Team,
  Player as SimPlayer,
  GameType,
  DivisionStandings,
  TeamStanding,
} from '@/lib/simulation/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute timeout for simulation

/**
 * POST /api/simulate
 *
 * Cron-triggered endpoint that advances the simulation.
 * Verifies CRON_SECRET before executing any action.
 *
 * Actions determined by current season state:
 *   - create_season: No active season exists, generate a new one
 *   - start_game: Simulate the next featured game, store events, begin broadcast
 *   - complete_week: Simulate remaining non-featured games, update standings
 *   - advance_week: All games this week done, move to next week
 *   - start_playoffs: Regular season complete, transition to playoffs
 *   - season_complete: Super Bowl played, finalize season
 *   - idle: Nothing to do right now
 */
// Vercel Cron sends GET requests with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  return handleSimulate(request);
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return handleSimulate(request);
}

async function handleSimulate(request: NextRequest) {
  // ---- Verify cron secret ----
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const action = await determineNextAction();

    switch (action.type) {
      case 'create_season': {
        const result = await handleCreateSeason();
        return NextResponse.json({
          action: 'create_season',
          ...result,
        });
      }

      case 'start_game': {
        const result = await handleStartGame(action.seasonId, action.gameId);
        return NextResponse.json({
          action: 'start_game',
          ...result,
        });
      }

      case 'complete_week': {
        const result = await handleCompleteWeek(action.seasonId, action.week);
        return NextResponse.json({
          action: 'complete_week',
          ...result,
        });
      }

      case 'advance_week': {
        const result = await handleAdvanceWeek(action.seasonId);
        return NextResponse.json({
          action: 'advance_week',
          ...result,
        });
      }

      case 'season_complete': {
        const result = await handleSeasonComplete(action.seasonId);
        return NextResponse.json({
          action: 'season_complete',
          ...result,
        });
      }

      case 'idle':
      default:
        return NextResponse.json({
          action: 'idle',
          message: action.message ?? 'Nothing to do',
        });
    }
  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { error: 'Simulation failed', details: String(error) },
      { status: 500 }
    );
  }
}

// ============================================================
// Action determination
// ============================================================

type SimAction =
  | { type: 'create_season' }
  | { type: 'start_game'; seasonId: string; gameId: string }
  | { type: 'complete_week'; seasonId: string; week: number }
  | { type: 'advance_week'; seasonId: string }
  | { type: 'season_complete'; seasonId: string }
  | { type: 'idle'; message: string };

async function determineNextAction(): Promise<SimAction> {
  // Find the latest season
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  // No season exists -- create one
  if (seasonRows.length === 0) {
    return { type: 'create_season' };
  }

  const season = seasonRows[0];

  // Season is completed -- check if we should start a new one
  if (season.status === 'offseason') {
    // Check if enough time has passed since completion
    if (season.completedAt) {
      const timeSinceComplete = Date.now() - new Date(season.completedAt).getTime();
      const OFFSEASON_DURATION = 30 * 60 * 1000; // 30 minutes between seasons
      if (timeSinceComplete >= OFFSEASON_DURATION) {
        return { type: 'create_season' };
      }
    }
    return { type: 'idle', message: 'Offseason - waiting for next season' };
  }

  // Get all games for the current week
  const weekGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, season.id),
        eq(games.week, season.currentWeek)
      )
    );

  // Check if any game is currently broadcasting or simulating
  const activeGame = weekGames.find(
    (g) => g.status === 'broadcasting' || g.status === 'simulating'
  );

  if (activeGame) {
    if (activeGame.status === 'broadcasting' && activeGame.broadcastStartedAt) {
      const broadcastDuration = Date.now() - new Date(activeGame.broadcastStartedAt).getTime();

      // Query actual game event duration instead of using a fixed minimum
      const lastEvent = await db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.gameId, activeGame.id))
        .orderBy(desc(gameEvents.displayTimestamp))
        .limit(1);
      const gameDurationMs = lastEvent[0]?.displayTimestamp ?? 0;
      const MIN_BROADCAST = gameDurationMs + 60_000; // full event stream + 60s buffer

      if (broadcastDuration >= MIN_BROADCAST) {
        // Broadcast duration met — complete the game and update standings
        await db
          .update(games)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(games.id, activeGame.id));

        // Update standings now that the game is officially complete
        const [ht, at] = await Promise.all([
          db.select().from(teams).where(eq(teams.id, activeGame.homeTeamId)).limit(1),
          db.select().from(teams).where(eq(teams.id, activeGame.awayTeamId)).limit(1),
        ]);
        if (ht[0] && at[0]) {
          await updateStandings(
            season.id,
            ht[0],
            at[0],
            activeGame.homeScore ?? 0,
            activeGame.awayScore ?? 0
          );
        }
        // Fall through to find next action
      } else {
        return { type: 'idle', message: 'Game currently broadcasting' };
      }
    } else {
      return { type: 'idle', message: 'Game currently being simulated' };
    }
  }

  // ---- Intermission: 15 min pause after a featured broadcast finishes ----
  const INTERMISSION_MS = 15 * 60 * 1000;

  const lastFeaturedCompleted = weekGames
    .filter((g) => g.status === 'completed' && g.completedAt && g.isFeatured)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

  if (lastFeaturedCompleted?.completedAt) {
    const elapsed = Date.now() - lastFeaturedCompleted.completedAt.getTime();
    if (elapsed < INTERMISSION_MS) {
      // During intermission: complete background games but don't start next featured
      const hasScheduledBgGames = weekGames.some(
        (g) => !g.isFeatured && g.status === 'scheduled'
      );
      if (hasScheduledBgGames) {
        return {
          type: 'complete_week',
          seasonId: season.id,
          week: season.currentWeek,
        };
      }
      return {
        type: 'idle',
        message: `Intermission — next game in ${Math.ceil((INTERMISSION_MS - elapsed) / 60000)} min`,
      };
    }
  }

  // Check if the featured game for this week needs to be played
  const featuredGame = weekGames.find(
    (g) => g.isFeatured && g.status === 'scheduled'
  );

  if (featuredGame) {
    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: featuredGame.id,
    };
  }

  // Check if there are any scheduled game to pick as featured
  const scheduledGames = weekGames.filter((g) => g.status === 'scheduled');

  if (scheduledGames.length > 0) {
    // No featured game set -- check if featured game was already completed
    const featuredCompleted = weekGames.find(
      (g) => g.isFeatured && g.status === 'completed'
    );

    if (featuredCompleted) {
      // Featured game done, simulate remaining games as background
      return {
        type: 'complete_week',
        seasonId: season.id,
        week: season.currentWeek,
      };
    }

    // No featured game at all — pick the most appealing game to feature
    const bestGameId = await pickBestFeaturedGame(
      scheduledGames, season.id, season.currentWeek
    );
    await db
      .update(games)
      .set({ isFeatured: true })
      .where(eq(games.id, bestGameId));

    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: bestGameId,
    };
  }

  // All games this week are completed
  const allCompleted = weekGames.every((g) => g.status === 'completed');

  if (allCompleted && weekGames.length > 0) {
    // Check if this is the last week of the season phase
    const isPlayoffEnd =
      season.status === 'super_bowl' && allCompleted;

    if (isPlayoffEnd) {
      return { type: 'season_complete', seasonId: season.id };
    }

    // ---- Inter-week intermission: 30 min pause before advancing ----
    const WEEK_INTERMISSION_MS = 30 * 60 * 1000;
    const lastCompletedGame = weekGames
      .filter((g) => g.completedAt)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];

    if (lastCompletedGame?.completedAt) {
      const elapsed = Date.now() - lastCompletedGame.completedAt.getTime();
      if (elapsed < WEEK_INTERMISSION_MS) {
        const minsLeft = Math.ceil((WEEK_INTERMISSION_MS - elapsed) / 60000);
        return {
          type: 'idle',
          message: `Week ${season.currentWeek} complete — next week in ${minsLeft} min`,
        };
      }
    }

    return { type: 'advance_week', seasonId: season.id };
  }

  return { type: 'idle', message: 'Waiting for games to be scheduled' };
}

// ============================================================
// Action handlers
// ============================================================

async function handleCreateSeason() {
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
// Mappers: DB rows → simulation engine types
// ============================================================

function mapDbTeamToSim(t: typeof teams.$inferSelect): Team {
  return {
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
  };
}

function mapDbPlayerToSim(p: typeof players.$inferSelect): SimPlayer {
  return {
    id: p.id,
    teamId: p.teamId,
    name: p.name,
    position: p.position,
    number: p.number,
    rating: p.rating,
    speed: p.speed,
    strength: p.strength,
    awareness: p.awareness,
    clutchRating: p.clutchRating,
    injuryProne: p.injuryProne ?? false,
  };
}

async function handleStartGame(seasonId: string, gameId: string) {
  // Mark game as simulating
  await db
    .update(games)
    .set({ status: 'simulating' })
    .where(eq(games.id, gameId));

  // Fetch the game with team data
  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) {
    return { error: 'Game not found' };
  }

  const game = gameRows[0];

  // Get team data
  const [homeTeamRows, awayTeamRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
    db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
  ]);

  const homeTeam = homeTeamRows[0];
  const awayTeam = awayTeamRows[0];

  if (!homeTeam || !awayTeam) {
    return { error: 'Team data not found' };
  }

  // Fetch player rosters for both teams
  const [homePlayerRows, awayPlayerRows] = await Promise.all([
    db.select().from(players).where(eq(players.teamId, homeTeam.id)),
    db.select().from(players).where(eq(players.teamId, awayTeam.id)),
  ]);

  // Map DB rows to simulation engine types
  const simHomeTeam = mapDbTeamToSim(homeTeam);
  const simAwayTeam = mapDbTeamToSim(awayTeam);
  const simHomePlayers = homePlayerRows.map(mapDbPlayerToSim);
  const simAwayPlayers = awayPlayerRows.map(mapDbPlayerToSim);

  // Run the full simulation engine
  const simResult = simulateGame({
    homeTeam: simHomeTeam,
    awayTeam: simAwayTeam,
    homePlayers: simHomePlayers,
    awayPlayers: simAwayPlayers,
    gameType: game.gameType as GameType,
  });

  // Map engine events to DB event rows
  const dbEvents = simResult.events.map((event, idx) => ({
    gameId,
    eventNumber: idx + 1,
    eventType: event.playResult.type,
    playResult: event.playResult as unknown as Record<string, unknown>,
    commentary: event.commentary as unknown as Record<string, unknown>,
    gameState: event.gameState as unknown as Record<string, unknown>,
    narrativeContext: event.narrativeContext as unknown as Record<string, unknown>,
    displayTimestamp: event.timestamp,
  }));

  // Batch insert events
  if (dbEvents.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < dbEvents.length; i += BATCH_SIZE) {
      const batch = dbEvents.slice(i, i + BATCH_SIZE);
      await db.insert(gameEvents).values(batch);
    }
  }

  // Embed MVP in boxScore JSON so the stream endpoint can read it
  const boxScoreWithMvp = {
    ...simResult.boxScore as unknown as Record<string, unknown>,
    mvp: simResult.mvp,
  };

  // Update game to broadcasting status with final score and provably-fair seeds
  const now = new Date();
  await db
    .update(games)
    .set({
      status: 'broadcasting',
      homeScore: simResult.finalScore.home,
      awayScore: simResult.finalScore.away,
      boxScore: boxScoreWithMvp,
      totalPlays: simResult.totalPlays,
      broadcastStartedAt: now,
      serverSeedHash: simResult.serverSeedHash,
      serverSeed: simResult.serverSeed,
      clientSeed: simResult.clientSeed,
      nonce: simResult.nonce,
      mvpPlayerId: simResult.mvp?.player?.id ?? null,
    })
    .where(eq(games.id, gameId));

  return {
    gameId,
    homeTeam: homeTeam.abbreviation,
    awayTeam: awayTeam.abbreviation,
    totalEvents: dbEvents.length,
    finalScore: `${simResult.finalScore.home}-${simResult.finalScore.away}`,
    message: `Game ${homeTeam.abbreviation} vs ${awayTeam.abbreviation} is now broadcasting`,
  };
}

async function handleCompleteWeek(seasonId: string, week: number) {
  // Get all scheduled (non-featured) games for this week
  const scheduledGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.week, week),
        eq(games.status, 'scheduled')
      )
    );

  let gamesCompleted = 0;

  for (const game of scheduledGames) {
    // Get team data
    const [homeTeamRows, awayTeamRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
      db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
    ]);

    const homeTeam = homeTeamRows[0];
    const awayTeam = awayTeamRows[0];

    if (!homeTeam || !awayTeam) continue;

    // Generate a quick score result (no events needed for non-featured games)
    const homeRating =
      (homeTeam.offenseRating + homeTeam.defenseRating) / 2;
    const awayRating =
      (awayTeam.offenseRating + awayTeam.defenseRating) / 2;
    const homeAdv = 3; // Home field advantage

    const ratingDiff = homeRating - awayRating + homeAdv;
    const baseScore = 21;
    const variance = 14;

    const homeScore = Math.max(
      0,
      Math.round(baseScore + ratingDiff * 0.3 + (Math.random() - 0.5) * variance)
    );
    const awayScore = Math.max(
      0,
      Math.round(baseScore - ratingDiff * 0.3 + (Math.random() - 0.5) * variance)
    );

    // Update game as completed
    await db
      .update(games)
      .set({
        status: 'completed',
        homeScore,
        awayScore,
        completedAt: new Date(),
      })
      .where(eq(games.id, game.id));

    // Update standings for both teams
    await updateStandings(
      seasonId,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore
    );

    gamesCompleted++;
  }

  // Also mark any broadcasting games as completed if they exist
  const broadcastingGames = await db
    .select()
    .from(games)
    .where(
      and(
        eq(games.seasonId, seasonId),
        eq(games.week, week),
        eq(games.status, 'broadcasting')
      )
    );

  for (const bg of broadcastingGames) {
    // Check if broadcast duration has been long enough
    if (bg.broadcastStartedAt) {
      const elapsed =
        Date.now() - new Date(bg.broadcastStartedAt).getTime();

      // Query actual game event duration instead of using a fixed minimum
      const lastEvt = await db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.gameId, bg.id))
        .orderBy(desc(gameEvents.displayTimestamp))
        .limit(1);
      const bgDurationMs = lastEvt[0]?.displayTimestamp ?? 0;
      const MIN_BROADCAST_CW = bgDurationMs + 60_000; // full event stream + 60s buffer

      if (elapsed >= MIN_BROADCAST_CW) {
        await db
          .update(games)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(games.id, bg.id));

        // Update standings now that the game is officially complete
        const [ht, at] = await Promise.all([
          db.select().from(teams).where(eq(teams.id, bg.homeTeamId)).limit(1),
          db.select().from(teams).where(eq(teams.id, bg.awayTeamId)).limit(1),
        ]);

        if (ht[0] && at[0]) {
          await updateStandings(
            seasonId,
            ht[0],
            at[0],
            bg.homeScore ?? 0,
            bg.awayScore ?? 0
          );
        }
      }
    }
  }

  return {
    week,
    gamesCompleted,
    message: `Week ${week}: ${gamesCompleted} background games completed`,
  };
}

async function handleAdvanceWeek(seasonId: string) {
  const seasonRows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (seasonRows.length === 0) {
    return { error: 'Season not found' };
  }

  const season = seasonRows[0];

  // ==================================================================
  // Regular season -> Playoffs transition (week 18 complete)
  // ==================================================================
  if (season.status === 'regular_season' && season.currentWeek >= 18) {
    await db
      .update(seasons)
      .set({ status: 'wild_card', currentWeek: 19 })
      .where(eq(seasons.id, seasonId));

    // Generate Wild Card games based on standings
    const gamesCreated = await generateWildCardGames(seasonId);

    return {
      previousWeek: season.currentWeek,
      newWeek: 19,
      newStatus: 'wild_card',
      gamesCreated,
      message: 'Regular season complete. Wild Card games generated from standings!',
    };
  }

  // ==================================================================
  // Wild Card -> Divisional transition
  // ==================================================================
  if (season.status === 'wild_card') {
    await db
      .update(seasons)
      .set({ status: 'divisional', currentWeek: 20 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateDivisionalGames(seasonId);

    return {
      previousWeek: 19,
      newWeek: 20,
      newStatus: 'divisional',
      gamesCreated,
      message: 'Wild Card complete. Divisional matchups set!',
    };
  }

  // ==================================================================
  // Divisional -> Conference Championship transition
  // ==================================================================
  if (season.status === 'divisional') {
    await db
      .update(seasons)
      .set({ status: 'conference_championship', currentWeek: 21 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateConferenceChampionshipGames(seasonId);

    return {
      previousWeek: 20,
      newWeek: 21,
      newStatus: 'conference_championship',
      gamesCreated,
      message: 'Divisional round complete. Conference Championships set!',
    };
  }

  // ==================================================================
  // Conference Championship -> Super Bowl transition
  // ==================================================================
  if (season.status === 'conference_championship') {
    await db
      .update(seasons)
      .set({ status: 'super_bowl', currentWeek: 22 })
      .where(eq(seasons.id, seasonId));

    const gamesCreated = await generateSuperBowlGame(seasonId);

    return {
      previousWeek: 21,
      newWeek: 22,
      newStatus: 'super_bowl',
      gamesCreated,
      message: 'Conference Championships complete. Super Bowl is set!',
    };
  }

  // ==================================================================
  // Regular season week advance (games already exist from schedule generator)
  // ==================================================================
  const nextWeek = season.currentWeek + 1;
  await db
    .update(seasons)
    .set({ currentWeek: nextWeek })
    .where(eq(seasons.id, seasonId));

  // Pick a featured game for the next week if not already set
  const nextWeekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, seasonId), eq(games.week, nextWeek))
    );

  const hasFeatured = nextWeekGames.some((g) => g.isFeatured);
  if (!hasFeatured && nextWeekGames.length > 0) {
    const scheduled = nextWeekGames.filter((g) => g.status === 'scheduled');
    if (scheduled.length > 0) {
      const featuredId = await pickBestFeaturedGame(
        scheduled, seasonId, nextWeek
      );
      await db
        .update(games)
        .set({ isFeatured: true })
        .where(eq(games.id, featuredId));
    }
  }

  return {
    previousWeek: season.currentWeek,
    newWeek: nextWeek,
    message: `Advanced to week ${nextWeek}`,
  };
}

// ============================================================
// Playoff game generators — create games dynamically from standings
// ============================================================

/** Helper: Build division standings from DB for playoff seeding */
async function buildDivisionStandings(seasonId: string): Promise<DivisionStandings[]> {
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

/**
 * Generate Wild Card games from playoff seedings.
 * NFL format: #2 vs #7, #3 vs #6, #4 vs #5 in each conference.
 * #1 seed gets a first-round bye.
 */
async function generateWildCardGames(seasonId: string): Promise<number> {
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

/**
 * Generate Divisional Round games.
 * #1 seed (bye) plays the lowest remaining seed.
 * Other two WC winners play each other. Higher seed hosts.
 */
async function generateDivisionalGames(seasonId: string): Promise<number> {
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

/**
 * Generate Conference Championship games.
 * The two Divisional Round winners in each conference play each other.
 * Higher original seed hosts.
 */
async function generateConferenceChampionshipGames(seasonId: string): Promise<number> {
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

/**
 * Generate the Super Bowl game.
 * AFC champion vs NFC champion at a neutral site.
 */
async function generateSuperBowlGame(seasonId: string): Promise<number> {
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

async function handleSeasonComplete(seasonId: string) {
  await db
    .update(seasons)
    .set({
      status: 'offseason',
      completedAt: new Date(),
    })
    .where(eq(seasons.id, seasonId));

  return {
    message: 'Season complete! The offseason begins.',
  };
}

// ============================================================
// Helper: Update standings after a game
// ============================================================

async function updateStandings(
  seasonId: string,
  homeTeam: typeof teams.$inferSelect,
  awayTeam: typeof teams.$inferSelect,
  homeScore: number,
  awayScore: number
) {
  const homeWon = homeScore > awayScore;
  const tie = homeScore === awayScore;
  const sameDivision =
    homeTeam.conference === awayTeam.conference &&
    homeTeam.division === awayTeam.division;
  const sameConference = homeTeam.conference === awayTeam.conference;

  // Update home team standings
  const homeStandingRows = await db
    .select()
    .from(standings)
    .where(
      and(
        eq(standings.seasonId, seasonId),
        eq(standings.teamId, homeTeam.id)
      )
    )
    .limit(1);

  if (homeStandingRows.length > 0) {
    const hs = homeStandingRows[0];
    await db
      .update(standings)
      .set({
        wins: (hs.wins ?? 0) + (homeWon ? 1 : 0),
        losses: (hs.losses ?? 0) + (!homeWon && !tie ? 1 : 0),
        ties: (hs.ties ?? 0) + (tie ? 1 : 0),
        divisionWins:
          (hs.divisionWins ?? 0) + (sameDivision && homeWon ? 1 : 0),
        divisionLosses:
          (hs.divisionLosses ?? 0) +
          (sameDivision && !homeWon && !tie ? 1 : 0),
        conferenceWins:
          (hs.conferenceWins ?? 0) + (sameConference && homeWon ? 1 : 0),
        conferenceLosses:
          (hs.conferenceLosses ?? 0) +
          (sameConference && !homeWon && !tie ? 1 : 0),
        pointsFor: (hs.pointsFor ?? 0) + homeScore,
        pointsAgainst: (hs.pointsAgainst ?? 0) + awayScore,
        streak: homeWon
          ? `W${parseInt((hs.streak ?? 'W0').replace(/[WL]/, '')) + (hs.streak?.startsWith('W') ? 1 : 1)}`
          : tie
            ? hs.streak
            : `L${parseInt((hs.streak ?? 'L0').replace(/[WL]/, '')) + (hs.streak?.startsWith('L') ? 1 : 1)}`,
      })
      .where(eq(standings.id, hs.id));
  }

  // Update away team standings
  const awayStandingRows = await db
    .select()
    .from(standings)
    .where(
      and(
        eq(standings.seasonId, seasonId),
        eq(standings.teamId, awayTeam.id)
      )
    )
    .limit(1);

  if (awayStandingRows.length > 0) {
    const as_ = awayStandingRows[0];
    const awayWon = !homeWon && !tie;
    await db
      .update(standings)
      .set({
        wins: (as_.wins ?? 0) + (awayWon ? 1 : 0),
        losses: (as_.losses ?? 0) + (homeWon ? 1 : 0),
        ties: (as_.ties ?? 0) + (tie ? 1 : 0),
        divisionWins:
          (as_.divisionWins ?? 0) + (sameDivision && awayWon ? 1 : 0),
        divisionLosses:
          (as_.divisionLosses ?? 0) +
          (sameDivision && homeWon ? 1 : 0),
        conferenceWins:
          (as_.conferenceWins ?? 0) + (sameConference && awayWon ? 1 : 0),
        conferenceLosses:
          (as_.conferenceLosses ?? 0) +
          (sameConference && homeWon ? 1 : 0),
        pointsFor: (as_.pointsFor ?? 0) + awayScore,
        pointsAgainst: (as_.pointsAgainst ?? 0) + homeScore,
        streak: awayWon
          ? `W${parseInt((as_.streak ?? 'W0').replace(/[WL]/, '')) + (as_.streak?.startsWith('W') ? 1 : 1)}`
          : tie
            ? as_.streak
            : `L${parseInt((as_.streak ?? 'L0').replace(/[WL]/, '')) + (as_.streak?.startsWith('L') ? 1 : 1)}`,
      })
      .where(eq(standings.id, as_.id));
  }
}

// ============================================================
// Helper: Pick the most compelling featured game via appeal scoring
// ============================================================

/**
 * Score each scheduled game and return the ID of the most appealing one.
 *
 * Factors (mirrors src/lib/scheduling/featured-game-picker.ts):
 *   +30  Both teams in playoff contention
 *   +20  Division rivalry
 *   +15  Close records (within 2 wins)
 *   +15  Both teams have winning records
 *   +10  High combined ratings
 *   +10  Undefeated team involved
 *   +10  Winless team in danger
 *   +10  Late season (week 15+)
 *    +5  Super Bowl rematch proxy
 */
async function pickBestFeaturedGame(
  scheduledGames: (typeof games.$inferSelect)[],
  seasonId: string,
  currentWeek: number,
): Promise<string> {
  if (scheduledGames.length <= 1) return scheduledGames[0].id;

  const allTeamRows = await db.select().from(teams);
  const teamMap = new Map(allTeamRows.map((t) => [t.id, t]));

  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, seasonId));
  const standingMap = new Map(standingRows.map((s) => [s.teamId, s]));

  let bestId = scheduledGames[0].id;
  let bestScore = -1;

  for (const g of scheduledGames) {
    const home = teamMap.get(g.homeTeamId);
    const away = teamMap.get(g.awayTeamId);
    const hs = standingMap.get(g.homeTeamId);
    const as_ = standingMap.get(g.awayTeamId);

    let score = 0;

    // +30: Both in playoff contention (not eliminated)
    if (hs?.clinched !== 'eliminated' && as_?.clinched !== 'eliminated') {
      score += 30;
    }

    // +20: Division rivalry
    if (
      home && away &&
      home.conference === away.conference &&
      home.division === away.division
    ) {
      score += 20;
    }

    // +15: Close records (within 2 wins)
    if (hs && as_) {
      if (Math.abs((hs.wins ?? 0) - (as_.wins ?? 0)) <= 2) score += 15;
    }

    // +15: Both winning records
    if (
      hs && as_ &&
      (hs.wins ?? 0) > (hs.losses ?? 0) &&
      (as_.wins ?? 0) > (as_.losses ?? 0)
    ) {
      score += 15;
    }

    // +10: High combined ratings (>340)
    if (home && away) {
      const combined =
        home.offenseRating + home.defenseRating +
        away.offenseRating + away.defenseRating;
      if (combined > 340) score += 10;
    }

    // +10: Undefeated team involved
    if (
      (hs && (hs.losses ?? 0) === 0 && (hs.wins ?? 0) > 0) ||
      (as_ && (as_.losses ?? 0) === 0 && (as_.wins ?? 0) > 0)
    ) {
      score += 10;
    }

    // +10: Winless team in danger
    if (
      (hs && (hs.wins ?? 0) === 0 && (hs.losses ?? 0) > 0) ||
      (as_ && (as_.wins ?? 0) === 0 && (as_.losses ?? 0) > 0)
    ) {
      score += 10;
    }

    // +10: Late season (week 15+)
    if (currentWeek >= 15) score += 10;

    // +5: Super Bowl rematch proxy (both top-2 seeds, different conferences)
    if (
      hs?.playoffSeed != null && as_?.playoffSeed != null &&
      hs.playoffSeed <= 2 && as_.playoffSeed <= 2
    ) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = g.id;
    }
  }

  return bestId;
}

