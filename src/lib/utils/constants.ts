/** App-wide constants for GridIron Live */

export const APP_NAME = "GridIron Live";
export const APP_DESCRIPTION = "The always-on NFL simulation that never stops.";

/** Route paths */
export const ROUTES = {
  HOME: "/",
  GAME: (gameId: string) => `/game/${gameId}`,
  SCHEDULE: "/schedule",
  TEAM: (teamId: string) => `/teams/${teamId}`,
  LEADERBOARD: "/leaderboard",
  VERIFY: (gameId: string) => `/verify/${gameId}`,
} as const;

/** API route paths */
export const API_ROUTES = {
  GAME: (gameId: string) => `/api/game/${gameId}`,
  GAME_STREAM: (gameId: string) => `/api/game/${gameId}/stream`,
  CURRENT_GAME: "/api/game/current",
  SIMULATE: "/api/simulate",
  PREDICT: "/api/predict",
  VERIFY: (gameId: string) => `/api/verify/${gameId}`,
  SCHEDULE: "/api/schedule",
} as const;

/** Intermission durations (in ms) */
export const INTERMISSION = {
  BETWEEN_GAMES: 180_000, // 3 minutes
  BETWEEN_WEEKS: 300_000, // 5 minutes
  PLAYOFFS_BETWEEN: 240_000, // 4 minutes
  SUPER_BOWL_PREGAME: 600_000, // 10 minutes
  OFFSEASON: 1_800_000, // 30 minutes
} as const;

/** Breakpoints matching Tailwind defaults */
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  "2XL": 1536,
} as const;

/** Prediction scoring */
export const PREDICTION_POINTS = {
  CORRECT_WINNER: 10,
  CORRECT_MARGIN: 5, // within ±3 points
  EXACT_SCORE: 25,
  MARGIN_TOLERANCE: 3,
} as const;

/** SSE reconnection config */
export const SSE_CONFIG = {
  RECONNECT_DELAY: 2000,
  MAX_RECONNECT_DELAY: 30000,
  MAX_RETRIES: 10,
  HEARTBEAT_INTERVAL: 15000,
} as const;
