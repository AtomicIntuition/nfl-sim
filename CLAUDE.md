# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GridIron Live is an always-on NFL football simulation platform. It runs a complete 18-week season with playoffs through the Super Bowl, broadcasting one game at a time via Server-Sent Events. Games are fully deterministic (seeded HMAC-SHA256 RNG) and client-verifiable. Built with Next.js 15 App Router, TypeScript, Drizzle ORM on Supabase Postgres, and Tailwind CSS v4.

## Commands

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # Production build
npm run type-check       # tsc --noEmit
npm run lint             # ESLint

npm test                 # Vitest (unit + property-based)
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage via v8 (src/lib/**)
npm run test:statistical # Statistical tests only (tests/statistical/)
npm run test:e2e         # Playwright (Chrome, Mobile Safari, Mobile Chrome)

npm run db:generate      # Drizzle migration generation
npm run db:push          # Push schema to Postgres
npm run db:studio        # Drizzle Studio UI
npm run db:seed          # Seed teams + players (tsx scripts/seed.ts)
npm run db:reset-season  # Wipe seasons/games/events/standings, keep teams/players

npm run simulate         # Trigger one simulation cycle (tsx scripts/run-simulation.ts)
```

Run a single test file: `npx vitest run tests/unit/simulation/engine.test.ts`

## Architecture

### Simulation State Machine (`/api/simulate`)

The core loop is a cron-driven state machine at `src/app/api/simulate/route.ts`, authorized via `Authorization: Bearer <CRON_SECRET>`. It determines the next action based on season state:

1. **create_season** — No active season; generates 18-week schedule (236 games) via `generateSeasonSchedule()`
2. **start_game** — Picks next game, runs `simulateGame()`, stores all events, sets game to "broadcasting"
3. **idle** — Game is broadcasting (events streamed to clients), or in 15-min intermission between games, or 30-min break between weeks
4. **advance_week** — All games in current week complete; moves to next week
5. **start_playoffs / season_complete** — Playoff bracket generated dynamically per round; season finalized after Super Bowl

Every single game is fully simulated and broadcast one at a time. No games are bulk-completed.

### Auto-Advancement

`SimulationDriver` component (in root layout) polls the simulate endpoint every 30 seconds via a server action (`src/app/actions/simulate.ts`). Simulation advances while any user has the site open. It pauses when no users are connected.

### Game Engine (`src/lib/simulation/`)

`simulateGame()` in `engine.ts` is the master orchestrator. Given teams, players, and seeds, it produces a complete game deterministically:

- `rng.ts` — Seeded HMAC-SHA256 chain (provably fair)
- `play-caller.ts` — Down/distance/situation-based play selection
- `play-generator.ts` — Play resolution and outcome calculation
- `clock-manager.ts` — NFL clock rules (stoppages, 2-minute warning)
- `penalty-engine.ts` — Penalty detection and enforcement
- `turnover-engine.ts` — Fumbles, interceptions
- `special-teams.ts` — Kickoffs, punts, FGs, PATs, 2-pt conversions
- `injury-engine.ts` — In-game injuries
- `stats-tracker.ts` — Box score accumulation, MVP selection
- `overtime.ts` — NFL overtime rules

### Live Broadcasting (`/api/game/[gameId]/stream`)

SSE endpoint streams pre-simulated events to clients with realistic timing. The `use-game-stream` hook connects and handles states: connecting, catchup, live, game_over, intermission.

### Scheduling (`src/lib/scheduling/`)

- `schedule-generator.ts` — 18-week NFL schedule: divisional (6), cross-division (4), inter-conference (4), same-finish (3), bye weeks
- `playoff-manager.ts` — Seeding (div winners 1-4, wild cards 5-7), tiebreakers (win%, div win%, conf win%, point diff), bracket generation
- Playoff games created dynamically per round (WC → DIV → CC → SB)
- Regular season games all created upfront at season creation

### Commentary (`src/lib/commentary/`)

Post-hoc AI commentary via Anthropic Claude Sonnet. Rate-limited (10 req/min), batched (15 plays/request). Falls back to deterministic templates in `templates.ts` if API unavailable. Commentary never affects game outcomes.

### Database

- **ORM**: Drizzle ORM with `postgres.js` driver — **must use `prepare: false`** for Supabase connection pooler
- **Schema**: `src/lib/db/schema.ts` — teams, players, seasons, games, game_events, standings, predictions, user_scores
- **Connection**: Lazy-initialized singleton via Proxy in `src/lib/db/index.ts`
- **JSONB columns**: `boxScore`, `playResult`, `narrativeContext` stored as JSONB for flexibility
- **Queries**: `src/lib/db/queries/` — games.ts, teams.ts, events.ts, predictions.ts, leaderboard.ts

### UI Components

- `src/components/game/game-viewer.tsx` — Main broadcast viewer (field visual, momentum, play feed, box score)
- `src/components/game/scorebug.tsx` — NFL-style scorebug (oversized for lean-back viewing)
- `src/components/game/play-feed.tsx` — Real-time play-by-play
- `src/components/game/score-ticker.tsx` — Auto-scrolling score ticker on homepage

### Team Logos

ESPN CDN — `https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png` (public, no auth). Helper functions in `src/lib/utils/team-logos.ts`. Client components use `<img>` directly (not `next/image`) to avoid import chain issues.

## Key Gotchas

- **Supabase pooler requires `prepare: false`** on the postgres.js client
- **Team names use market names** not physical locations (e.g., "New England" not "Foxborough")
- **Turbopack cache** can cause hydration mismatches — clear `.next/` when debugging
- **Scripts need explicit DATABASE_URL** — `source .env.local` doesn't work; use `export DATABASE_URL=...` or let the script read `process.env`
- **Simulation auth**: Vercel cron and server action both use `Authorization: Bearer <CRON_SECRET>`, not `x-cron-secret`
- **Standings update timing**: Only updates after broadcast completes (5min delay), not when simulation starts, to prevent score spoilers
- **`maxDuration: 300`** on simulate route — games can take up to 5 minutes to simulate

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Supabase pooler connection string
- `CRON_SECRET` — Authorizes simulation endpoint
- `ANTHROPIC_API_KEY` — Commentary generation (graceful fallback if missing)
- `NEXT_PUBLIC_APP_URL` — Base URL for the app
- Clerk auth keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- Stripe keys (future monetization)

## Deployment

Deployed on Vercel. `vercel.json` configures daily cron at `0 0 * * *` hitting `/api/simulate`. The `SimulationDriver` handles continuous advancement when users are active between cron runs.
