// ============================================================
// GridIron Live - Drizzle ORM Schema for Neon Postgres
// ============================================================

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  bigserial,
  text,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// ENUMS
// ============================================================

export const conferenceEnum = pgEnum('conference', ['AFC', 'NFC']);

export const divisionEnum = pgEnum('division', ['North', 'South', 'East', 'West']);

export const playStyleEnum = pgEnum('play_style', [
  'balanced',
  'pass_heavy',
  'run_heavy',
  'aggressive',
  'conservative',
]);

export const positionEnum = pgEnum('position', [
  'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P',
]);

export const gameTypeEnum = pgEnum('game_type', [
  'regular',
  'wild_card',
  'divisional',
  'conference_championship',
  'super_bowl',
]);

export const gameStatusEnum = pgEnum('game_status', [
  'scheduled',
  'simulating',
  'broadcasting',
  'completed',
]);

export const seasonStatusEnum = pgEnum('season_status', [
  'regular_season',
  'wild_card',
  'divisional',
  'conference_championship',
  'super_bowl',
  'offseason',
]);

export const predictionResultEnum = pgEnum('prediction_result', [
  'pending',
  'won',
  'lost',
]);

// ============================================================
// TABLES
// ============================================================

// ---- Teams ----

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 5 }).notNull(),
  city: varchar('city', { length: 50 }).notNull(),
  mascot: varchar('mascot', { length: 50 }).notNull(),
  conference: conferenceEnum('conference').notNull(),
  division: divisionEnum('division').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).notNull(),
  secondaryColor: varchar('secondary_color', { length: 7 }).notNull(),
  offenseRating: integer('offense_rating').notNull(),
  defenseRating: integer('defense_rating').notNull(),
  specialTeamsRating: integer('special_teams_rating').notNull(),
  playStyle: playStyleEnum('play_style').notNull().default('balanced'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---- Players ----

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id),
  name: varchar('name', { length: 100 }).notNull(),
  position: positionEnum('position').notNull(),
  number: integer('number').notNull(),
  rating: integer('rating').notNull(),
  speed: integer('speed').notNull(),
  strength: integer('strength').notNull(),
  awareness: integer('awareness').notNull(),
  clutchRating: integer('clutch_rating').notNull(),
  injuryProne: boolean('injury_prone').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---- Seasons ----

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonNumber: integer('season_number').notNull(),
  currentWeek: integer('current_week').notNull().default(1),
  totalWeeks: integer('total_weeks').notNull().default(22),
  status: seasonStatusEnum('status').notNull().default('regular_season'),
  championTeamId: uuid('champion_team_id').references(() => teams.id),
  mvpPlayerId: uuid('mvp_player_id').references(() => players.id),
  seed: varchar('seed', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// ---- Games ----

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id),
    week: integer('week').notNull(),
    gameType: gameTypeEnum('game_type').notNull().default('regular'),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id),
    homeScore: integer('home_score').default(0),
    awayScore: integer('away_score').default(0),
    status: gameStatusEnum('status').notNull().default('scheduled'),
    isFeatured: boolean('is_featured').default(false),
    serverSeedHash: varchar('server_seed_hash', { length: 64 }),
    serverSeed: varchar('server_seed', { length: 64 }),
    clientSeed: varchar('client_seed', { length: 64 }),
    nonce: integer('nonce'),
    totalPlays: integer('total_plays'),
    mvpPlayerId: uuid('mvp_player_id').references(() => players.id),
    boxScore: jsonb('box_score'),
    scheduledAt: timestamp('scheduled_at'),
    broadcastStartedAt: timestamp('broadcast_started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    seasonWeekIdx: index('games_season_week_idx').on(table.seasonId, table.week),
    statusIdx: index('games_status_idx').on(table.status),
    featuredStatusIdx: index('games_featured_status_idx').on(table.isFeatured, table.status),
  }),
);

// ---- Game Events ----

export const gameEvents = pgTable(
  'game_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    eventNumber: integer('event_number').notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    playResult: jsonb('play_result').notNull(),
    commentary: jsonb('commentary').notNull(),
    gameState: jsonb('game_state').notNull(),
    narrativeContext: jsonb('narrative_context'),
    displayTimestamp: integer('display_timestamp').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    gameEventNumberIdx: uniqueIndex('game_events_game_event_number_idx').on(
      table.gameId,
      table.eventNumber,
    ),
  }),
);

// ---- Standings ----

export const standings = pgTable(
  'standings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    wins: integer('wins').default(0),
    losses: integer('losses').default(0),
    ties: integer('ties').default(0),
    divisionWins: integer('division_wins').default(0),
    divisionLosses: integer('division_losses').default(0),
    conferenceWins: integer('conference_wins').default(0),
    conferenceLosses: integer('conference_losses').default(0),
    pointsFor: integer('points_for').default(0),
    pointsAgainst: integer('points_against').default(0),
    streak: varchar('streak', { length: 10 }).default('W0'),
    playoffSeed: integer('playoff_seed'),
    clinched: varchar('clinched', { length: 20 }),
  },
  (table) => ({
    seasonTeamIdx: uniqueIndex('standings_season_team_idx').on(
      table.seasonId,
      table.teamId,
    ),
  }),
);

// ---- Predictions ----

export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 100 }).notNull(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    predictedWinner: uuid('predicted_winner')
      .notNull()
      .references(() => teams.id),
    predictedHomeScore: integer('predicted_home_score').notNull(),
    predictedAwayScore: integer('predicted_away_score').notNull(),
    pointsEarned: integer('points_earned').default(0),
    result: predictionResultEnum('result').default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userGameIdx: uniqueIndex('predictions_user_game_idx').on(
      table.userId,
      table.gameId,
    ),
  }),
);

// ---- User Scores ----

export const userScores = pgTable('user_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 100 }).notNull().unique(),
  totalPoints: integer('total_points').default(0),
  correctPredictions: integer('correct_predictions').default(0),
  totalPredictions: integer('total_predictions').default(0),
  currentStreak: integer('current_streak').default(0),
  bestStreak: integer('best_streak').default(0),
  rank: integer('rank'),
});

// ============================================================
// RELATIONS
// ============================================================

export const teamsRelations = relations(teams, ({ many }) => ({
  players: many(players),
  homeGames: many(games, { relationName: 'homeTeam' }),
  awayGames: many(games, { relationName: 'awayTeam' }),
  standings: many(standings),
}));

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  championTeam: one(teams, {
    fields: [seasons.championTeamId],
    references: [teams.id],
  }),
  mvpPlayer: one(players, {
    fields: [seasons.mvpPlayerId],
    references: [players.id],
  }),
  games: many(games),
  standings: many(standings),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  season: one(seasons, {
    fields: [games.seasonId],
    references: [seasons.id],
  }),
  homeTeam: one(teams, {
    fields: [games.homeTeamId],
    references: [teams.id],
    relationName: 'homeTeam',
  }),
  awayTeam: one(teams, {
    fields: [games.awayTeamId],
    references: [teams.id],
    relationName: 'awayTeam',
  }),
  mvpPlayer: one(players, {
    fields: [games.mvpPlayerId],
    references: [players.id],
  }),
  events: many(gameEvents),
  predictions: many(predictions),
}));

export const gameEventsRelations = relations(gameEvents, ({ one }) => ({
  game: one(games, {
    fields: [gameEvents.gameId],
    references: [games.id],
  }),
}));

export const standingsRelations = relations(standings, ({ one }) => ({
  season: one(seasons, {
    fields: [standings.seasonId],
    references: [seasons.id],
  }),
  team: one(teams, {
    fields: [standings.teamId],
    references: [teams.id],
  }),
}));

export const predictionsRelations = relations(predictions, ({ one }) => ({
  game: one(games, {
    fields: [predictions.gameId],
    references: [games.id],
  }),
  predictedWinnerTeam: one(teams, {
    fields: [predictions.predictedWinner],
    references: [teams.id],
  }),
}));
