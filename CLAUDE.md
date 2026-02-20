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

The core loop is a cron-driven state machine at `src/app/api/simulate/route.ts`, authorized via `Authorization: Bearer <CRON_SECRET>`. The state machine logic is extracted as a pure function `determineNextAction()` in `src/lib/scheduling/scheduler.ts` (no DB side effects, fully testable). The route handler calls this and executes the returned action:

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
- `defensive-coordinator.ts` — Defensive AI: selects personnel (4-3, 3-4, nickel, dime, goal line, prevent), coverage scheme (cover 0–6, man press), and blitz package based on formation, down/distance, score, and clock; produces `DefensiveModifiers` multipliers for play resolution
- `formations.ts` — Offensive formation system with per-formation modifiers (sack rate, run yard bonus, play action bonus, scramble, screen, deep pass, quick release)

### Narrative Engine (`src/lib/narrative/`)

Post-play analysis layer that enriches the broadcast without affecting outcomes:

- `momentum.ts` — Continuous momentum tracker (-100 to +100), shifts on TDs/turnovers/sacks/big plays, applies up to ±3% probability modifier, natural decay per play
- `drama-detector.ts` — Per-play `DramaFlags` (clutch moment, comeback brewing, blowout, goal line stand, 2-minute drill, overtime thriller, red zone, game-winning drive) + composite `dramaLevel` 0–100
- `excitement-scorer.ts` — Per-play excitement score 0–100, maps to `CrowdReaction` sound cue
- `story-tracker.ts` — Tracks up to 5 active narrative threads (hot/cold streaks, comebacks, shootouts, defensive battles, record chases)

### Provably Fair Verification (`src/lib/fairness/`)

- `seed-manager.ts` — Server-side seed generation/management
- `verifier.ts` — Browser-compatible verification using Web Crypto API (SubtleCrypto). Exposes `verifyServerSeedBrowser()`, `verifyGameReplay()`, `computeValueAtNonce()` for client-side verification at `/verify/[gameId]`

### Live Broadcasting (`/api/game/[gameId]/stream`)

SSE endpoint streams pre-simulated events to clients with realistic timing. The `use-game-stream` hook connects and handles states: connecting, catchup, live, game_over, intermission.

### Scheduling (`src/lib/scheduling/`)

- `schedule-generator.ts` — 18-week NFL schedule: divisional (6), cross-division (4), inter-conference (4), same-finish (3), bye weeks
- `playoff-manager.ts` — Seeding (div winners 1-4, wild cards 5-7), tiebreakers (win%, div win%, conf win%, point diff), bracket generation
- `featured-game-picker.ts` — Scores game "appeal" (playoff contenders, division rivalry, close records, undefeated/winless drama, late-season weight) to select the featured game each week
- `scheduler.ts` — Pure function `determineNextAction()` + `getBroadcastState()` for homepage display
- Playoff games created dynamically per round (WC → DIV → CC → SB)
- Regular season games all created upfront at season creation

### Commentary (`src/lib/commentary/`)

Post-hoc AI commentary via Anthropic Claude Sonnet. Rate-limited (10 req/min), batched (15 plays/request). Falls back to deterministic templates in `templates.ts` if API unavailable. Commentary never affects game outcomes.

### Database

- **ORM**: Drizzle ORM with `postgres.js` driver — **must use `prepare: false`** for Supabase connection pooler
- **Schema**: `src/lib/db/schema.ts` — teams, players, seasons, games, game_events, standings, predictions, user_scores, jumbotron_messages
- **Connection**: Lazy-initialized singleton via Proxy in `src/lib/db/index.ts`
- **JSONB columns**: `boxScore`, `playResult`, `narrativeContext` stored as JSONB for flexibility
- **Queries**: `src/lib/db/queries/` — games.ts, teams.ts, events.ts, predictions.ts, leaderboard.ts
- **RLS**: `scripts/enable-rls.sql` enables Row Level Security — all tables public-read, writes via service_role key

### Client-Side Hooks (`src/hooks/`)

- `use-game-stream.ts` — SSE connection with exponential backoff, catchup playback, state management
- `use-momentum.ts` — Derives running momentum from accumulated events
- `use-dynamic-tab.ts` — Updates browser tab title to live score and draws a split favicon with both team logos using Canvas API
- `use-crowd-audio.ts` — Web Audio API: ambient crowd loop, reaction sounds (cheer/boo/gasp), peak sounds (TD roar). Audio files expected at `public/audio/*.mp3`
- `use-jumbotron.ts` — Polls jumbotron API every 10s, auto-clears expired messages
- `use-countdown.ts` — Generic countdown timer

### Route Structure

**Pages:**
- `/` — Homepage with division standings, hero cards, score ticker, auto-refresh
- `/live` — Redirects to current live/recent game; waiting screen if none
- `/schedule` — Schedule + standings with `?week=` param, playoff bracket view
- `/standings` — Dedicated standings page
- `/leaderboard` — Prediction leaderboard (top 100 + user rank)
- `/teams` — Teams listing; `/teams/[teamId]` — team profile (roster, stats, recent games)
- `/game/[gameId]` — Three-state page: `PregameView` (scheduled, with prediction widget), `GameViewer` (live broadcast), `GameRecapPage` (completed, with replay mode); dynamic OG metadata
- `/verify/[gameId]` — Provably fair verification UI

**API routes:**
- `GET /api/game/current` — Current live game (polled by HomeAutoRefresh)
- `GET /api/game/[gameId]` — Game detail
- `GET /api/game/[gameId]/events` — All events
- `GET /api/game/[gameId]/stream` — SSE broadcast
- `POST /api/simulate` — Cron/driver endpoint
- `POST /api/admin/reset` — Wipes season data (Bearer CRON_SECRET); `?start=true` creates new season
- `POST/GET/DELETE /api/admin/jumbotron` — Jumbotron management
- `GET /api/verify/[gameId]` — Provably fair seed data (after game completion)
- `POST /api/predict` — Prediction submission
- `GET /api/schedule` — Schedule data
- `GET/POST /api/user` — User display name (cookie-based userId)
- `POST /api/webhooks/stripe` — Stripe webhook (skeleton, not wired to users yet)

### UI Components

- `src/components/game/game-viewer.tsx` — Main broadcast viewer (field visual, momentum, play feed, box score)
- `src/components/game/field/` — Granular field rendering: `field-surface`, `ball-marker`, `down-distance-overlay`, `play-scene` (formation-accurate player dots), `coin-flip`, `celebration-overlay`, `drive-trail`, `player-highlight`, `play-call-overlay`, `crowd-atmosphere`, `field-commentary-overlay`, `minimap`
- `src/components/game/scorebug.tsx` — NFL-style scorebug (oversized for lean-back viewing)
- `src/components/game/play-feed.tsx` — Real-time play-by-play
- `src/components/game/score-ticker.tsx` — Auto-scrolling score ticker
- `src/components/game/prediction-widget.tsx` — Pick winner + score prediction form
- `src/components/game/game-over-summary.tsx` — Post-game summary with next game countdown
- `src/components/home/home-auto-refresh.tsx` — 4 polling strategies: intermission-end refresh, live game poll (15s), week_complete poll (30s), next_game auto-navigate with countdown banner
- `src/components/ui/` — Hand-rolled UI primitives (badge, button, card, modal, progress, skeleton) — no shadcn, broadcast dark theme
- `src/components/layout/` — Desktop header (`hidden md:block`) + `mobile-nav.tsx` bottom nav for mobile

### Team Logos

ESPN CDN — `https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png` (public, no auth). Helper functions in `src/lib/utils/team-logos.ts`. Client components use `<img>` directly (not `next/image`) to avoid import chain issues.

### Styling

CSS at `src/styles/globals.css` (imported from layout.tsx as `@/styles/globals.css`). Tailwind v4 `@theme` block defines the broadcast dark theme: brand colors (midnight, broadcast, surface, gold, live-red), play-type colors (touchdown, turnover, big-play, penalty-flag, first-down), glassmorphism variables, custom animation timing, and custom scrollbar styling.

### Live Box Score

`src/lib/utils/live-box-score.ts` — `buildLiveBoxScore()` reconstructs full team and player stats from raw event stream data client-side, avoiding server roundtrips during live games.

### User Identity

Predictions and leaderboard use a cookie-based `userId` (via `x-user-id` header or `userId` cookie), not Clerk. `POST /api/user` creates/updates `userScores` rows with optional display names. Clerk is installed but not actively integrated.

## Key Gotchas

- **Supabase pooler requires `prepare: false`** on the postgres.js client
- **Team names use market names** not physical locations (e.g., "New England" not "Foxborough")
- **Turbopack cache** can cause hydration mismatches — clear `.next/` when debugging
- **Scripts need explicit DATABASE_URL** — `source .env.local` doesn't work; use `export DATABASE_URL=...` or let the script read `process.env`
- **Simulation auth**: Vercel cron and server action both use `Authorization: Bearer <CRON_SECRET>`, not `x-cron-secret`
- **Standings update timing**: Only updates after broadcast completes (5min delay), not when simulation starts, to prevent score spoilers
- **`maxDuration: 300`** on simulate route — games can take up to 5 minutes to simulate
- **`seasons.totalWeeks` defaults to 22** (18 regular + 4 playoff weeks), not 18
- **Clerk is installed but unused** — user identity is cookie-based; no `<ClerkProvider>` in layout, no middleware

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` — Supabase pooler connection string
- `CRON_SECRET` — Authorizes simulation endpoint and admin APIs
- `ANTHROPIC_API_KEY` — Commentary generation (graceful fallback if missing)
- `NEXT_PUBLIC_APP_URL` — Base URL for the app
- Clerk auth keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) — installed but not yet active
- Stripe keys (future monetization)

### Quarter Break Overlays

The game viewer shows overlays at Q1→Q2 and Q3→Q4 transitions (10s duration, auto-dismiss). The halftime overlay at Q2→Q3 remains at 18s. Quarter transitions are detected by comparing `prevEvent.quarter` to `gameState.quarter`. A `Set` ref prevents showing the same quarter break twice.

### Jumbotron System

Admin messaging overlay displayed on the game broadcast field.

- **Schema**: `jumbotronMessages` table — `id`, `message`, `type`, `durationSeconds`, `expiresAt`, `createdAt`
- **API**: `POST/GET/DELETE /api/admin/jumbotron` — POST/DELETE require `Bearer CRON_SECRET` auth, GET is public
- **Hook**: `useJumbotron()` polls GET every 10s, auto-clears expired messages client-side
- **Overlay**: `<JumbotronOverlay />` renders gold banner at top of field (z-40)
- **Send via curl**: `curl -X POST https://site/api/admin/jumbotron -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d '{"message":"Hello!", "type":"info", "durationSeconds":60}'`

### Real Player Names (ESPN)

Player seeding fetches real rosters from ESPN's public API (`site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{id}/roster`). ESPN positions are mapped to our enum (OLB/ILB→LB, OT/OG/C→OL, DE/DT→DL, FS/SS→S, FB→RB). Falls back to generated names if ESPN data is unavailable. Ratings remain deterministic (seeded PRNG). ESPN team ID mapping in `src/lib/db/seed-data/players.ts` and `scripts/espn-team-map.ts`.

### Chrome Extension (`extension/`)

Manifest V3 extension for 24/7 keep-alive + admin controls. Vanilla HTML/CSS/JS, no build step.

- **Setup**: Load unpacked at `chrome://extensions` → select `extension/` folder → configure URL + secret in options page
- **Service worker**: `chrome.alarms` at 30s interval → `POST /api/simulate` with Bearer auth
- **Popup**: Shows connection status, current game (ESPN logos), season progress, "Simulate Now" button, jumbotron controls
- **Options**: Site URL + CRON_SECRET stored in `chrome.storage.sync`
- **Icons**: Placeholder PNGs in `extension/icons/`

## Testing

```
tests/
  helpers/test-utils.ts
  property/simulation.property.test.ts   # fast-check property-based tests
  unit/
    fairness/verifier.test.ts
    narrative/drama-detector.test.ts
    narrative/momentum.test.ts
    simulation/
      clock-manager.test.ts
      engine.test.ts
      overtime.test.ts
      penalty-engine.test.ts
      play-generator.test.ts
      rng.test.ts
      special-teams.test.ts
```

## Deployment

Deployed on Vercel. `vercel.json` configures daily cron at `0 0 * * *` hitting `/api/simulate`. The `SimulationDriver` handles continuous advancement when users are active between cron runs. The Chrome extension provides 24/7 keep-alive independent of browser tabs.
