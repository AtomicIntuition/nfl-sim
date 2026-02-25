// ============================================================
// GridBlitz - Game Manager
// ============================================================
// Handles starting a game: simulation, event storage, and
// transition to broadcasting status.
// ============================================================

import { db } from '@/lib/db';
import { games, teams, players, gameEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { simulateGame } from '@/lib/simulation/engine';
import { projectFutureGameTimes } from '@/lib/scheduling/game-time-projector';
import type {
  Team,
  Player as SimPlayer,
  GameType,
} from '@/lib/simulation/types';

// ============================================================
// Mappers: DB rows -> simulation engine types
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
    ...(p.espnId ? { espnId: p.espnId } : {}),
  };
}

// ============================================================
// Start Game
// ============================================================

export async function handleStartGame(seasonId: string, gameId: string) {
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

  // Compute game duration from the last event's displayTimestamp
  const lastEventTimestamp = dbEvents.length > 0
    ? dbEvents[dbEvents.length - 1].displayTimestamp
    : 0;

  // Update game to broadcasting status with final score and provably-fair seeds
  const now = new Date();
  await db
    .update(games)
    .set({
      status: 'broadcasting',
      homeScore: simResult.finalScore.home,
      awayScore: simResult.finalScore.away,
      boxScore: boxScoreWithMvp,
      weather: simResult.weather as unknown as Record<string, unknown>,
      totalPlays: simResult.totalPlays,
      gameDurationMs: lastEventTimestamp,
      broadcastStartedAt: now,
      serverSeedHash: simResult.serverSeedHash,
      serverSeed: simResult.serverSeed,
      clientSeed: simResult.clientSeed,
      nonce: simResult.nonce,
      mvpPlayerId: simResult.mvp?.player?.id ?? null,
    })
    .where(eq(games.id, gameId));

  // Re-project future game times now that we know exact duration
  await projectFutureGameTimes(seasonId);

  return {
    gameId,
    homeTeam: homeTeam.abbreviation,
    awayTeam: awayTeam.abbreviation,
    totalEvents: dbEvents.length,
    finalScore: `${simResult.finalScore.home}-${simResult.finalScore.away}`,
    message: `Game ${homeTeam.abbreviation} vs ${awayTeam.abbreviation} is now broadcasting`,
  };
}
