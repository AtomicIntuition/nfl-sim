export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  games,
  seasons,
  teams,
  gameEvents,
  standings,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

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
export async function POST(request: NextRequest) {
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
    // Check if broadcasting game has been going too long (stuck)
    if (activeGame.status === 'broadcasting' && activeGame.broadcastStartedAt) {
      const broadcastDuration = Date.now() - new Date(activeGame.broadcastStartedAt).getTime();
      const MAX_BROADCAST_DURATION = 20 * 60 * 1000; // 20 minutes max
      if (broadcastDuration > MAX_BROADCAST_DURATION) {
        // Force complete this game -- it's stuck
        await db
          .update(games)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(games.id, activeGame.id));
        // Fall through to find next action
      } else {
        return { type: 'idle', message: 'Game currently broadcasting' };
      }
    } else {
      return { type: 'idle', message: 'Game currently being simulated' };
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

    // No featured game at all -- pick the first scheduled game as featured
    const gameToFeature = scheduledGames[0];
    await db
      .update(games)
      .set({ isFeatured: true })
      .where(eq(games.id, gameToFeature.id));

    return {
      type: 'start_game',
      seasonId: season.id,
      gameId: gameToFeature.id,
    };
  }

  // All games this week are completed
  const allCompleted = weekGames.every((g) => g.status === 'completed');

  if (allCompleted && weekGames.length > 0) {
    // Check if this is the last week of the season phase
    const isRegularSeasonEnd =
      season.status === 'regular_season' && season.currentWeek >= 18;
    const isPlayoffEnd =
      season.status === 'super_bowl' && allCompleted;

    if (isPlayoffEnd) {
      return { type: 'season_complete', seasonId: season.id };
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

  // We need to generate the schedule and create game records.
  // For now, create placeholder games for week 1 based on team pairings.
  // The full schedule generation happens via the schedule-generator module.
  // Here we create a simple round-robin for week 1 as a starting point.

  // Create 16 games for week 1 (32 teams / 2 per game)
  const shuffledTeams = [...allTeams].sort(() => Math.random() - 0.5);
  const week1Games = [];

  for (let i = 0; i < shuffledTeams.length; i += 2) {
    if (i + 1 < shuffledTeams.length) {
      week1Games.push({
        seasonId,
        week: 1,
        gameType: 'regular' as const,
        homeTeamId: shuffledTeams[i].id,
        awayTeamId: shuffledTeams[i + 1].id,
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled' as const,
        isFeatured: i === 0, // First game is featured
      });
    }
  }

  if (week1Games.length > 0) {
    await db.insert(games).values(week1Games);
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
    gamesCreated: week1Games.length,
    message: `Season ${nextSeasonNumber} created with ${week1Games.length} week 1 games`,
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

  // Generate a simple simulated game result
  // In production, this calls the full simulation engine
  const { events, finalHomeScore, finalAwayScore, boxScore } =
    generateSimulatedEvents(homeTeam, awayTeam, gameId);

  // Store all events
  if (events.length > 0) {
    // Batch insert events (in chunks to avoid query size limits)
    const BATCH_SIZE = 50;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      await db.insert(gameEvents).values(batch);
    }
  }

  // Update game to broadcasting status with final score
  const now = new Date();
  await db
    .update(games)
    .set({
      status: 'broadcasting',
      homeScore: finalHomeScore,
      awayScore: finalAwayScore,
      boxScore,
      totalPlays: events.length,
      broadcastStartedAt: now,
    })
    .where(eq(games.id, gameId));

  return {
    gameId,
    homeTeam: homeTeam?.abbreviation,
    awayTeam: awayTeam?.abbreviation,
    totalEvents: events.length,
    finalScore: `${finalHomeScore}-${finalAwayScore}`,
    message: `Game ${homeTeam?.abbreviation} vs ${awayTeam?.abbreviation} is now broadcasting`,
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
      const MIN_BROADCAST = 5 * 60 * 1000; // 5 minutes minimum

      if (elapsed >= MIN_BROADCAST) {
        await db
          .update(games)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(games.id, bg.id));

        // Update standings for this game too
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
  const nextWeek = season.currentWeek + 1;

  // Check for season phase transitions
  if (season.status === 'regular_season' && season.currentWeek >= 18) {
    // Transition to playoffs
    await db
      .update(seasons)
      .set({
        status: 'wild_card',
        currentWeek: 19,
      })
      .where(eq(seasons.id, seasonId));

    return {
      previousWeek: season.currentWeek,
      newWeek: 19,
      newStatus: 'wild_card',
      message: 'Regular season complete. Playoffs begin!',
    };
  }

  if (season.status === 'wild_card') {
    await db
      .update(seasons)
      .set({ status: 'divisional', currentWeek: 20 })
      .where(eq(seasons.id, seasonId));

    return {
      previousWeek: 19,
      newWeek: 20,
      newStatus: 'divisional',
      message: 'Wild Card complete. Divisional round begins!',
    };
  }

  if (season.status === 'divisional') {
    await db
      .update(seasons)
      .set({ status: 'conference_championship', currentWeek: 21 })
      .where(eq(seasons.id, seasonId));

    return {
      previousWeek: 20,
      newWeek: 21,
      newStatus: 'conference_championship',
      message: 'Divisional round complete. Conference Championships!',
    };
  }

  if (season.status === 'conference_championship') {
    await db
      .update(seasons)
      .set({ status: 'super_bowl', currentWeek: 22 })
      .where(eq(seasons.id, seasonId));

    return {
      previousWeek: 21,
      newWeek: 22,
      newStatus: 'super_bowl',
      message: 'Conference Championships complete. Super Bowl time!',
    };
  }

  // Regular week advance
  await db
    .update(seasons)
    .set({ currentWeek: nextWeek })
    .where(eq(seasons.id, seasonId));

  // Create games for the next week if they don't exist
  const existingNextWeekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, seasonId), eq(games.week, nextWeek))
    );

  if (existingNextWeekGames.length === 0) {
    // Generate games for the next week
    const allTeams = await db.select().from(teams);
    const shuffledTeams = [...allTeams].sort(() => Math.random() - 0.5);
    const nextWeekGames = [];

    for (let i = 0; i < shuffledTeams.length; i += 2) {
      if (i + 1 < shuffledTeams.length) {
        nextWeekGames.push({
          seasonId,
          week: nextWeek,
          gameType: 'regular' as const,
          homeTeamId: shuffledTeams[i].id,
          awayTeamId: shuffledTeams[i + 1].id,
          homeScore: 0,
          awayScore: 0,
          status: 'scheduled' as const,
          isFeatured: i === 0,
        });
      }
    }

    if (nextWeekGames.length > 0) {
      await db.insert(games).values(nextWeekGames);
    }
  }

  return {
    previousWeek: season.currentWeek,
    newWeek: nextWeek,
    message: `Advanced to week ${nextWeek}`,
  };
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
// Helper: Generate simulated game events
// ============================================================

function generateSimulatedEvents(
  homeTeam: typeof teams.$inferSelect,
  awayTeam: typeof teams.$inferSelect,
  gameId: string
) {
  // Simplified simulation that generates realistic-looking events.
  // In the full version, this delegates to the complete simulation engine.

  const events: Array<{
    gameId: string;
    eventNumber: number;
    eventType: string;
    playResult: Record<string, unknown>;
    commentary: Record<string, unknown>;
    gameState: Record<string, unknown>;
    narrativeContext: Record<string, unknown>;
    displayTimestamp: number;
  }> = [];

  let homeScore = 0;
  let awayScore = 0;
  let eventNumber = 0;
  let timestampMs = 0;
  let possession: 'home' | 'away' = 'away'; // Away team receives opening kickoff
  let quarter = 1;
  let clock = 900;
  let ballPosition = 25;
  let down = 1;
  let yardsToGo = 10;

  const homeRating = (homeTeam.offenseRating + homeTeam.defenseRating) / 2;
  const awayRating = (awayTeam.offenseRating + awayTeam.defenseRating) / 2;

  // Simulate approximately 120-140 plays per game
  const totalPlays = 120 + Math.floor(Math.random() * 20);

  for (let play = 0; play < totalPlays; play++) {
    eventNumber++;
    timestampMs += 2000 + Math.floor(Math.random() * 3000); // 2-5 seconds between plays

    // Determine play outcome
    const offenseRating =
      possession === 'home' ? homeTeam.offenseRating : awayTeam.offenseRating;
    const defenseRating =
      possession === 'home' ? awayTeam.defenseRating : homeTeam.defenseRating;

    const advantageModifier = (offenseRating - defenseRating) / 100;
    const rand = Math.random();
    let yardsGained = 0;
    let playType = 'run';
    let playDescription = '';
    let scoring = null;
    let turnover = null;

    // Play type distribution
    if (rand < 0.45) {
      // Run play
      playType = 'run';
      yardsGained = Math.round(
        (Math.random() * 8 - 1 + advantageModifier * 3)
      );
      playDescription = `${possession === 'home' ? homeTeam.abbreviation : awayTeam.abbreviation} runs for ${yardsGained > 0 ? yardsGained : 'no'} yards`;
    } else if (rand < 0.85) {
      // Pass play
      const complete = Math.random() < 0.62 + advantageModifier * 0.1;
      if (complete) {
        playType = 'pass_complete';
        yardsGained = Math.round(Math.random() * 20 - 2 + advantageModifier * 5);
        playDescription = `Pass complete for ${yardsGained} yards`;
      } else {
        playType = 'pass_incomplete';
        yardsGained = 0;
        playDescription = 'Pass incomplete';
      }
    } else if (rand < 0.88) {
      // Sack
      playType = 'sack';
      yardsGained = -Math.floor(Math.random() * 8 + 1);
      playDescription = `Sack for a loss of ${Math.abs(yardsGained)} yards`;
    } else if (rand < 0.92) {
      // Turnover
      playType = Math.random() < 0.5 ? 'pass_incomplete' : 'run';
      turnover = {
        type: Math.random() < 0.6 ? 'interception' : 'fumble',
        recoveredBy: possession === 'home' ? 'away' : 'home',
        returnYards: Math.floor(Math.random() * 20),
        returnedForTD: false,
      };
      yardsGained = 0;
      playDescription = `TURNOVER! ${turnover.type === 'interception' ? 'Intercepted' : 'Fumble recovered'}!`;
    } else {
      // Penalty
      playType = 'run';
      yardsGained = 0;
      playDescription = 'Flag on the play - penalty assessed';
    }

    // Update ball position
    ballPosition += yardsGained;

    // Check for touchdown
    if (ballPosition >= 100 && !turnover) {
      ballPosition = 97; // Will be handled as TD
      scoring = {
        type: 'touchdown',
        team: possession,
        points: 7, // Assume extra point made
        scorer: null,
      };
      if (possession === 'home') {
        homeScore += 7;
      } else {
        awayScore += 7;
      }
      playDescription += ' - TOUCHDOWN!';
      ballPosition = 25; // Reset after TD
      down = 1;
      yardsToGo = 10;
      possession = possession === 'home' ? 'away' : 'home';
    } else if (turnover) {
      // Switch possession on turnover
      ballPosition = Math.max(1, Math.min(99, 100 - ballPosition));
      possession = possession === 'home' ? 'away' : 'home';
      down = 1;
      yardsToGo = 10;
    } else if (ballPosition <= 0) {
      // Safety
      ballPosition = 20;
      scoring = {
        type: 'safety',
        team: possession === 'home' ? 'away' : 'home',
        points: 2,
        scorer: null,
      };
      if (possession === 'home') {
        awayScore += 2;
      } else {
        homeScore += 2;
      }
      possession = possession === 'home' ? 'away' : 'home';
      down = 1;
      yardsToGo = 10;
    } else {
      // Normal play -- advance down
      yardsToGo -= yardsGained;
      if (yardsToGo <= 0) {
        // First down
        down = 1;
        yardsToGo = Math.min(10, 100 - ballPosition);
      } else {
        down++;
        if (down > 4) {
          // Turnover on downs or punt
          if (ballPosition > 60 && Math.random() < 0.3) {
            // Field goal attempt
            const fgGood = Math.random() < 0.8 - (100 - ballPosition) * 0.01;
            if (fgGood) {
              scoring = {
                type: 'field_goal',
                team: possession,
                points: 3,
                scorer: null,
              };
              if (possession === 'home') {
                homeScore += 3;
              } else {
                awayScore += 3;
              }
              playDescription = 'Field goal is GOOD!';
            } else {
              playDescription = 'Field goal attempt is NO GOOD';
            }
          } else {
            playDescription = 'Punt';
          }
          // Switch possession
          ballPosition = Math.max(
            10,
            Math.min(90, 100 - ballPosition + (Math.random() * 15 + 30))
          );
          possession = possession === 'home' ? 'away' : 'home';
          down = 1;
          yardsToGo = 10;
        }
      }
    }

    // Update clock
    const clockUsed = Math.floor(Math.random() * 35) + 5;
    clock -= clockUsed;
    if (clock <= 0) {
      quarter++;
      clock = 900;
      if (quarter > 4) {
        // Game over -- break out early
        break;
      }
    }

    ballPosition = Math.max(1, Math.min(99, Math.round(ballPosition)));

    const event = {
      gameId,
      eventNumber,
      eventType: playType,
      playResult: {
        type: playType,
        call: playType === 'run' ? 'run_inside' : 'pass_short',
        description: playDescription,
        yardsGained,
        passer: null,
        rusher: null,
        receiver: null,
        defender: null,
        turnover,
        penalty: null,
        injury: null,
        scoring,
        clockElapsed: clockUsed,
        isClockStopped: playType === 'pass_incomplete',
        isFirstDown: down === 1 && yardsToGo === 10,
        isTouchdown: !!scoring && scoring.type === 'touchdown',
        isSafety: !!scoring && scoring.type === 'safety',
      },
      commentary: {
        playByPlay: playDescription,
        colorAnalysis:
          scoring
            ? 'What a play! That changes the complexion of this game.'
            : 'Solid execution on that play.',
        crowdReaction: scoring ? 'roar' : 'murmur',
        excitement: scoring ? 85 : 30 + Math.floor(Math.random() * 30),
      },
      gameState: {
        id: gameId,
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name,
          abbreviation: homeTeam.abbreviation,
          city: homeTeam.city,
          mascot: homeTeam.mascot,
          conference: homeTeam.conference,
          division: homeTeam.division,
          primaryColor: homeTeam.primaryColor,
          secondaryColor: homeTeam.secondaryColor,
          offenseRating: homeTeam.offenseRating,
          defenseRating: homeTeam.defenseRating,
          specialTeamsRating: homeTeam.specialTeamsRating,
          playStyle: homeTeam.playStyle,
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name,
          abbreviation: awayTeam.abbreviation,
          city: awayTeam.city,
          mascot: awayTeam.mascot,
          conference: awayTeam.conference,
          division: awayTeam.division,
          primaryColor: awayTeam.primaryColor,
          secondaryColor: awayTeam.secondaryColor,
          offenseRating: awayTeam.offenseRating,
          defenseRating: awayTeam.defenseRating,
          specialTeamsRating: awayTeam.specialTeamsRating,
          playStyle: awayTeam.playStyle,
        },
        homeScore,
        awayScore,
        quarter: Math.min(quarter, 4) as 1 | 2 | 3 | 4,
        clock: Math.max(0, clock),
        playClock: 40,
        possession,
        down: Math.min(down, 4) as 1 | 2 | 3 | 4,
        yardsToGo: Math.max(1, yardsToGo),
        ballPosition,
        homeTimeouts: 3,
        awayTimeouts: 3,
        isClockRunning: playType !== 'pass_incomplete',
        twoMinuteWarning: clock <= 120,
        isHalftime: quarter === 2 && clock <= 0,
        kickoff: false,
        patAttempt: false,
      },
      narrativeContext: {
        momentum: homeScore > awayScore ? 30 : awayScore > homeScore ? -30 : 0,
        excitement: scoring ? 85 : 40,
        activeThreads: [],
        isComebackBrewing:
          Math.abs(homeScore - awayScore) >= 14 && quarter >= 3,
        isClutchMoment: quarter >= 4 && Math.abs(homeScore - awayScore) <= 7,
        isBlowout: Math.abs(homeScore - awayScore) >= 21,
        isDominatingPerformance: null,
      },
      displayTimestamp: timestampMs,
    };

    events.push(event);
  }

  const boxScore = {
    homeStats: {
      totalYards: 0,
      passingYards: 0,
      rushingYards: 0,
      firstDowns: 0,
      thirdDownConversions: 0,
      thirdDownAttempts: 0,
      fourthDownConversions: 0,
      fourthDownAttempts: 0,
      turnovers: 0,
      penalties: 0,
      penaltyYards: 0,
      timeOfPossession: 1800,
      sacks: 0,
      sacksAllowed: 0,
      redZoneAttempts: 0,
      redZoneTDs: 0,
    },
    awayStats: {
      totalYards: 0,
      passingYards: 0,
      rushingYards: 0,
      firstDowns: 0,
      thirdDownConversions: 0,
      thirdDownAttempts: 0,
      fourthDownConversions: 0,
      fourthDownAttempts: 0,
      turnovers: 0,
      penalties: 0,
      penaltyYards: 0,
      timeOfPossession: 1800,
      sacks: 0,
      sacksAllowed: 0,
      redZoneAttempts: 0,
      redZoneTDs: 0,
    },
  };

  return {
    events,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
    boxScore,
  };
}
