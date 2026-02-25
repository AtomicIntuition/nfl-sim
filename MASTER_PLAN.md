# GridBlitz — Master Plan

> **Purpose**: Persistent roadmap tracking every task needed to bring GridBlitz from prototype to professional, monetizable product. Updated as tasks complete. Nothing gets lost across sessions.
>
> **Overall Score (start)**: 5.6/10
> **Target Score**: 9.5/10
>
> **Last Updated**: 2026-02-24 (47/51 tasks complete — 92%)

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [Phase 1: Critical Engine Fixes](#2-phase-1-critical-engine-fixes)
3. [Phase 2: Offensive Coordinator System](#3-phase-2-offensive-coordinator-system)
4. [Phase 3: Broadcast Experience Polish](#4-phase-3-broadcast-experience-polish)
5. [Phase 4: Backend Hardening](#5-phase-4-backend-hardening)
6. [Phase 5: Testing & Dead Code Cleanup](#6-phase-5-testing--dead-code-cleanup)
7. [Phase 6: Design & Monetization](#7-phase-6-design--monetization)
8. [Reference: Arians Playbook Notes](#8-reference-arians-playbook-notes)
9. [Reference: Audit Data](#9-reference-audit-data)

---

## 1. Current State Summary

### What Works Well
- Deterministic seeded RNG (provably fair, HMAC-SHA256)
- Defensive coordinator: 7-layer multiplicative modifier stack (~12,600 distinct calls)
- 17 named route concepts with MOFO/MOFC coverage reads
- SSE broadcast with catchup/live/replay states
- Glassmorphism dark broadcast theme
- Dynamic OG metadata, Canvas favicon, browser tab score updates
- Full 18-week season + 4-round playoff bracket
- Procedural crowd audio (Web Audio API pink noise synthesis)
- ESPN real player names + CDN logos

### What Needs Work
- **Simulation realism**: INT architecture, kickoff returns, prevent defense, player impact too small
- **Offensive system**: Shallow compared to defense (no integrated modifier stack, no protection schemes)
- **Broadcast flow**: No instant replay, weak celebrations, missing crowd audio MP3s
- **Backend**: N+1 queries, spoofable auth, no monitoring, 1620-line simulate route
- **Testing**: ~212 tests, zero API/E2E coverage, ~15-20% code coverage
- **Dead code**: Three.js (20 files), Clerk, Stripe skeleton
- **Design**: Needs professional polish for monetization

---

## 2. Phase 1: Critical Engine Fixes

> **Priority**: HIGHEST — these are bugs that make games unrealistic
> **Estimated tasks**: 8
> **Status**: NOT STARTED

### 2.1 Fix Interception Architecture
- [x] **Status**: DONE
- **File**: `src/lib/simulation/play-generator.ts` ~line 1066-1137
- **Bug**: INTs only fire inside the `else` branch of the completion check (i.e., only on incomplete passes). Effective INT rate = `(1 - completionRate) * 0.025 ≈ 0.9%` instead of NFL's 2.3-2.5%. Deflates turnovers by ~60%.
- **Fix**: Move INT check BEFORE the completion coin flip. Roll INT chance first (base 2.5%), then if no INT, roll completion. This means highly accurate QBs still throw INTs at a realistic rate.
- **Implementation**:
  ```
  // BEFORE completion check:
  const intRate = calculateInterceptionRate(passer, defensePlayers, defensiveCall, routeConcept)
  if (rng.probability(intRate)) {
    return resolveInterception(...)
  }
  // THEN completion check:
  if (rng.probability(completionRate)) {
    return resolveCompletion(...)
  } else {
    return resolveIncompletion(...)  // no INT here anymore
  }
  ```
- **INT rate modifiers to add**:
  - QB rating: high awareness reduces INT (-0.005 per 10 pts above 75)
  - Pressure/sack near-miss: +0.02 if blitz is active
  - Defensive coverage quality: CB/S rating differential
  - Route concept risk: deep routes +0.005, screens -0.01
  - Forced throw (3rd/4th down desperation): +0.01
- **Tests**: Update `play-generator.test.ts`, add INT-specific property tests
- **RNG Impact**: YES — shifts all downstream draws. Existing game replays will differ. Accept this.

### 2.2 Fix Kickoff Return Position
- [x] **Status**: DONE
- **File**: `src/lib/simulation/special-teams.ts` line 720-724
- **Bug**: `calculateKickoffReturnPosition()` returns `returnYards` directly, ignoring catch spot. If ball caught at 5-yard line and returned 20 yards, result is 20 instead of 25.
- **Fix**: Accept `catchSpot` parameter, return `catchSpot + returnYards`
- **Also fix**: `resolveKickoff()` line 198 — pass `catchSpot` through PlayResult metadata or adjust `yardsGained` to be `catchSpot + returnYards`
- **Engine**: `engine.ts` line 874 — update call to pass catch spot
- **Tests**: Update `special-teams.test.ts`

### 2.3 Fix Prevent Defense Modifiers
- [x] **Status**: DONE
- **File**: `src/lib/simulation/defensive-coordinator.ts`
- **Bug**: Prevent defense has `deepCompletionModifier: 1.0` — should be 0.7-0.8. Prevent is supposed to prevent deep completions (trade short for no deep).
- **Fix**: Set prevent deep modifier to 0.70, short to 1.15 (give up underneath)
- **Tests**: Verify in property tests

### 2.4 Add Dropped Passes
- [x] **Status**: DONE
- **File**: `src/lib/simulation/play-generator.ts`
- **Problem**: NFL drop rate is ~3.5-4%. Currently 0%. Every "completed" pass is caught.
- **Fix**: After completion check passes, add drop check:
  ```
  const dropRate = 0.035 - (receiver.rating - 75) / 100 * 0.015
  if (rng.probability(dropRate)) { return incompletion with "dropped" flag }
  ```
- **UI**: Show "DROPPED" badge in play feed
- **Types**: Add `dropped?: boolean` to PlayResult

### 2.5 Fix Dome/Weather Logic
- [x] **Status**: DONE
- **File**: `src/lib/simulation/engine.ts` (weather generation)
- **Bug**: Dome teams (MIN, DET, ATL, IND, NO, LV, ARI, DAL, HOU, LAR, LAC) should have clear/indoor weather at home. Currently random.
- **Fix**: Check home team abbreviation against dome list, force clear weather for dome games
- **Constants**: Add `DOME_TEAMS` array to constants.ts

### 2.6 Improve 4th Down Decision Making
- [x] **Status**: DONE
- **File**: `src/lib/simulation/play-caller.ts` lines 540-580
- **Problem**: Too conservative. NFL teams go for it on 4th down much more aggressively now (analytics revolution).
- **Fix**: Implement expected-points-style logic:
  - 4th & 1: Go for it inside opponent's 45 (not just goal line)
  - 4th & 2: Go for it inside opponent's 35
  - 4th & 3-4: Go for it inside opponent's 30
  - Trailing in Q4: much more aggressive (go for it up to own 35)
  - Blowout (down 21+): go for it everywhere
- **Add**: Win probability context to play caller

### 2.7 Add Score-Aware 2-Point Decisions
- [x] **Status**: DONE
- **File**: `src/lib/simulation/play-caller.ts` lines 473-491
- **Problem**: 2-point conversion decisions don't follow NFL chart logic
- **Fix**: Implement standard 2-point conversion chart:
  - Down 2: go for 2 (tie vs lead by 1)
  - Down 5: go for 2 (down 3 vs down 5)
  - Down 9 after TD: go for 2
  - Down 12 after TD: go for 2
  - Up 1 after TD: go for 2 (up 3 vs up 1)
  - Late game (Q4 < 5:00): more aggressive

### 2.8 Amplify Player Rating Impact
- [x] **Status**: DONE
- **Files**: `src/lib/simulation/play-generator.ts`
- **Problem**: Player ratings currently affect outcomes by only ±1-4%. A 99-rated QB vs a 60-rated QB barely differs. Games feel samey.
- **Fix**: Double or triple the rating multipliers:
  - QB completion: `(rating - 75) / 100 * 0.25` (was 0.12)
  - Receiver: `(rating - 75) / 100 * 0.15` (was 0.08)
  - RB rushing: `(rating - 75) / 100 * 0.40` (was 0.25)
  - OL vs DL: `lineDiff * 0.35` (was 0.20)
  - DB coverage: `(avgDB - 75) / 100 * 0.12` (was 0.06)
- **Result**: Elite players (90+) get noticeable boost. Bad players (60-) are noticeably worse. Games between mismatched teams feel different.

---

## 3. Phase 2: Offensive Coordinator System

> **Priority**: HIGH — parity with defensive system
> **Goal**: Match the defensive coordinator's 7-layer integrated modifier stack
> **Reference**: Bruce Arians 2016 Cardinals Offense playbook
> **Status**: COMPLETE

### Current Offensive Architecture (for reference)
```
Play Caller → Personnel Selection → Formation Selection → Route Concept → Play Resolution
     ↓              ↓                     ↓                    ↓              ↓
  Category      7 groupings          9 formations          17 concepts    12-layer modifiers
  weights       (00-22)              + modifiers           + coverage     (sequential)
                                                           interaction
```

### Target Architecture (matching defense)
```
Offensive Coordinator
  ├── Layer 1: Personnel (12 Arians-style groupings → mapped to sim groupings)
  ├── Layer 2: Formation (expanded to ~15, with named variants)
  ├── Layer 3: Protection Scheme (NEW — 4 schemes from Arians)
  ├── Layer 4: Route Concept (17 existing + add Caddy from Arians)
  ├── Layer 5: Pre-Snap Motion (NEW — 5 motion types)
  ├── Layer 6: QB Read Progression (NEW — coverage-dependent)
  └── Layer 7: Run Scheme (NEW — 6 named schemes)

Final Modifier = Personnel × Formation × Protection × Route × Motion × QBRead × RunScheme
```

### 3.1 Create `offensive-coordinator.ts`
- [x] **Status**: DONE
- **New file**: `src/lib/simulation/offensive-coordinator.ts`
- **Role**: Mirror of `defensive-coordinator.ts`. Single function `selectOffensiveCall()` that takes game state + team info and returns an `OffensiveCall` object with all 7 layers selected.
- **Architecture**:
  ```typescript
  interface OffensiveCall {
    personnel: PersonnelGrouping;     // '11', '12', '21', etc.
    formation: Formation;             // 'trips', 'trey', 'bunch', etc.
    protectionScheme: ProtectionScheme; // 'middle_62', 'blunt_80', 'base_82', 'sort_83'
    motionType: MotionType | null;    // 'fly', 'peel', 'short', 'cut', null
    routeConcept: RouteConcept;       // existing 17 + caddy
    runScheme: RunScheme | null;      // 'inside_zone', 'outside_zone', 'power', 'counter', 'draw', 'sweep'
    playCall: PlayCall;               // final play type
  }

  interface OffensiveModifiers {
    completionModifier: number;       // multiplicative
    shortCompletionModifier: number;
    mediumCompletionModifier: number;
    deepCompletionModifier: number;
    sackRateModifier: number;
    runYardModifier: number;
    screenModifier: number;
    playActionModifier: number;
    scrambleModifier: number;
  }
  ```

### 3.2 Protection Scheme System (NEW)
- [x] **Status**: DONE
- **File**: `src/lib/simulation/offensive-coordinator.ts`
- **Source**: Arians playbook pages 5-6 (Pass Protections)
- **Schemes**:

| Scheme | Name | Description | Sack Modifier | PA Bonus | Best Against |
|--------|------|-------------|---------------|----------|--------------|
| `middle_62` | 62/63 Middle | Full OL protection, RB checks Mike/Sam | 0.85x | 1.0x | Heavy blitz |
| `blunt_80` | 80/81 Blunt/Waggle | Sprint-out/waggle, 4-5 step | 0.75x | 1.4x | Zone coverage |
| `base_82` | 82/83 Base | Standard 5-man, FB/TE chips | 0.90x | 1.1x | Standard rush |
| `sort_83` | 82/83 Sort | Sort blocking (vs 3-4 fronts) | 0.88x | 1.1x | 3-4 defense |

- **Selection logic**:
  - vs heavy blitz (cover_0, all_out): prefer `middle_62` (60%)
  - vs 3-4 front: prefer `sort_83` (40%)
  - on play-action: prefer `blunt_80` (50%)
  - default: `base_82` (40%), `middle_62` (30%), others (30%)
- **Modifiers**: Protection scheme affects sack rate and play-action bonus multiplicatively

### 3.3 Pre-Snap Motion System (NEW)
- [x] **Status**: DONE
- **File**: `src/lib/simulation/offensive-coordinator.ts`
- **Source**: Arians playbook (Motions: MO, Fly, Peel, Short, Cut)
- **Motion Types**:

| Motion | Effect | Usage Rate | Completion Bonus | Run Bonus |
|--------|--------|-----------|-----------------|-----------|
| `none` | No motion | 55% | 0 | 0 |
| `fly` | WR motions across formation | 12% | +0.03 vs man | +0.5 yd |
| `peel` | TE/RB peels to flat | 10% | +0.02 | 0 |
| `short` | Short lateral motion | 12% | +0.01 | +0.3 yd |
| `cut` | Motion then cut block | 6% | 0 | +0.8 yd |
| `shift` | Pre-snap shift (Explode/Zelda) | 5% | +0.02 vs zone | +0.3 yd |

- **vs Man Coverage**: Motion bonus DOUBLED (motion stresses man assignments)
- **vs Zone Coverage**: Motion bonus HALVED (zone doesn't care about motion)
- **Selection**: Based on defensive coverage read + formation

### 3.4 Run Scheme System (NEW)
- [x] **Status**: DONE
- **File**: `src/lib/simulation/offensive-coordinator.ts`
- **Source**: Arians playbook page 4 (22/23 DBL runs with blocking schemes)
- **Schemes**:

| Scheme | Yard Modifier | Best Personnel | Best Formation | vs Front |
|--------|--------------|----------------|----------------|----------|
| `inside_zone` | 1.0x base | 11, 12 | singleback, shotgun | vs 4-3: 1.05x |
| `outside_zone` | 1.05x | 11, 10 | shotgun, spread | vs 3-4: 1.08x |
| `power` | 0.95x (lower ceiling, higher floor) | 21, 22, 12 | i_formation, under_center | vs nickel: 1.15x |
| `counter` | 1.1x (boom/bust) | 12, 21 | pistol, singleback | vs overshift: 1.2x |
| `draw` | 1.08x vs blitz | 11, 10 | shotgun, spread | vs blitz: 1.25x |
| `sweep` | 1.12x (boom/bust) | 11, 10 | shotgun, spread | vs heavy box: 0.85x |

- **Selection**: Based on personnel, formation, defensive front, down/distance
- **Modifiers**: Interact with defensive run stunts (stir/knife)

### 3.5 Expanded Formation System
- [x] **Status**: DONE
- **File**: `src/lib/simulation/formations.ts`
- **Source**: Arians playbook (Trips, Trey, Bunch, Dice, Firm, Fax, Weak, I)
- **Add named variants** that map to existing base formations:

| Arians Name | Base Formation | Receiver Alignment | Modifier Tweak |
|-------------|---------------|-------------------|----------------|
| `trips_right` | shotgun | 3 WR right, 1 left | deepPass +0.05 |
| `trips_left` | shotgun | 3 WR left, 1 right | deepPass +0.05 |
| `trey` | singleback | TE+2WR same side | playAction +0.15 |
| `bunch` | shotgun | 3 WR stacked tight | short +0.05, screen +0.1 |
| `dice` | spread | 2x2 even split | medium +0.05 |
| `firm` | under_center | TE tight both sides | run +0.3, playAction +0.2 |
| `fax` | under_center | TE flex one side | balanced |
| `weak` | singleback | Weak-side heavy | counter +0.15 |

- **Implementation**: `FormationVariant` type with base formation + modifiers. Play generator uses base formation for existing logic, adds variant modifiers on top.

### 3.6 QB Read Progression Enhancement
- [x] **Status**: DONE
- **File**: `src/lib/simulation/play-generator.ts` (QB progression function)
- **Source**: Arians playbook pages 9-10 (QB Read sections)
- **Current**: Simple rating-sorted progression (best WR → 2nd → checkdown → throwaway)
- **Enhance**:
  - **1-Hi Read (MOFC)**: Primary read is the route concept's #1 target (e.g., for Go concept: Z receiver on go route). If covered, progress to concept's #2 read, then checkdown.
  - **2-Hi Read (MOFO)**: Different primary (e.g., for Semi: look for the crosser first). If covered, progress differently.
  - **Coverage recognition bonus**: QB awareness rating determines how quickly they identify coverage. High awareness = better at reading 1-Hi vs 2-Hi = picks the right progression.
  - **Forced throw**: If QB is under pressure (sack narrowly avoided), skip to checkdown or throwaway with lower completion rate.
- **Implementation**:
  ```typescript
  function qbProgression(concept: RouteConcept, coverage: Coverage, qb: Player, receivers: Player[]): Target {
    const read = getReadProgression(concept, isOneSafety(coverage) ? 'mofc' : 'mofo');
    // read = ['primary_route', 'secondary_route', 'checkdown']
    // QB awareness determines how far through progression they get
    const progressionDepth = getProgressionDepth(qb.awareness);
    // Higher awareness = more likely to find the open receiver in the concept
  }
  ```

### 3.7 Add Caddy Route Concept
- [x] **Status**: DONE
- **File**: `src/lib/simulation/route-concepts.ts`
- **Source**: Arians playbook page 8 (Individual Receiver Tags — Caddy)
- **Description**: 18-yard comeback route. vs Cover 2 rotation: converts to a drive route.
- **Modifiers**:
  - vs cover_2: +0.05 completion (converts to drive)
  - vs cover_3: +0.03 completion
  - vs man: -0.02 completion (hard to separate)
  - vs cover_4: -0.03 completion
  - Yards bonus: +2 vs cover_2, +1 vs cover_3

### 3.8 Personnel-Formation Integration
- [x] **Status**: DONE
- **File**: `src/lib/simulation/offensive-coordinator.ts`
- **Problem**: Currently personnel and formation are selected independently. In reality, personnel dictates available formations.
- **Fix**: Build constraint matrix (already partially exists in `personnel.ts`). Add effectiveness bonuses when personnel-formation combos are "natural":
  - 12 personnel + singleback = +0.03 completion (natural fit)
  - 11 personnel + shotgun = +0.02 completion (standard NFL)
  - 22 personnel + i_formation = +0.05 run yards (natural power)
  - 00 personnel + empty = +0.04 completion (5-wide natural)
  - Mismatched (e.g., 22 personnel + spread) = -0.03 all (awkward)

### 3.9 Integrate Offensive Coordinator into Engine
- [x] **Status**: DONE
- **File**: `src/lib/simulation/engine.ts`
- **Task**: Wire `selectOffensiveCall()` into the play resolution pipeline, similar to how `selectDefensiveCall()` is already integrated
- **Flow**:
  ```
  1. selectOffensiveCall(state, team, rng) → OffensiveCall
  2. selectDefensiveCall(state, defTeam, rng) → DefensiveCall
  3. resolvePlay(state, offCall, defCall, ...) → PlayResult
  ```
- **Store on PlayResult**: `offensiveCall?: OffensiveCall` for UI display

### 3.10 Update Types
- [x] **Status**: DONE
- **File**: `src/lib/simulation/types.ts`
- **Add**: `OffensiveCall` interface, `ProtectionScheme`, `MotionType`, `RunScheme`, `FormationVariant` types
- **Add to PlayResult**: `protectionScheme?`, `motionType?`, `runScheme?`, `formationVariant?`

---

## 4. Phase 3: Broadcast Experience Polish

> **Priority**: HIGH — this is what users see
> **Status**: NOT STARTED

### 4.1 Source Crowd Audio MP3s
- [ ] **Status**: PENDING
- **Files needed in `/public/audio/`**:
  - `crowd-ambient.mp3` — steady background crowd noise (loopable, ~30s)
  - `crowd-cheer.mp3` — short crowd cheer burst (~3s)
  - `crowd-roar.mp3` — loud sustained roar (~4s, for TDs)
  - `crowd-groan.mp3` — disappointed crowd (~2s)
  - `crowd-gasp.mp3` — sharp collective gasp (~1.5s)
  - `whistle.mp3` — referee whistle (~1s)
- **Options**:
  - Freesound.org (CC0 licensed)
  - Generate with procedural audio and record
  - User provides
- **Hook**: `use-crowd-audio.ts` already exists (254 lines, complete implementation). Currently not imported in `game-viewer.tsx`. Just need MP3 files + import.
- **Decision**: Keep BOTH procedural and MP3 audio. Let user choose in settings. MP3 is default (richer sound), procedural is fallback.

### 4.2 Longer, Better Celebrations
- [x] **Status**: DONE
- **File**: `src/components/game/field/celebration-overlay.tsx`
- **Current**: Brief confetti + flash. Feels rushed.
- **Enhance**:
  - TD celebrations: 3-4 seconds, confetti + team color explosion + scoring team logo + "TOUCHDOWN" text with team colors
  - Field goal: 2-3 seconds, goalposts flash gold + "FIELD GOAL" text
  - Safety: 2 seconds, defensive flash
  - Turnover: 2-3 seconds, shock rings + "INTERCEPTED" or "FUMBLE" text
  - Use scoring team's primary/secondary colors for all effects
  - Add crowd reaction audio sync (cheer peaks with celebration)

### 4.3 Drive Separator in Play Feed
- [x] **Status**: DONE
- **File**: `src/components/game/play-feed.tsx`
- **Problem**: Play feed is a continuous stream. Hard to see where one drive ends and another begins.
- **Fix**: Insert a separator card between drives showing:
  - "CHANGE OF POSSESSION" or "TOUCHDOWN" or "FIELD GOAL" etc.
  - Drive summary: plays, yards, time of possession
  - Visual divider with team color transition

### 4.4 Team Logo on Play Cards
- [x] **Status**: DONE
- **File**: `src/components/game/play-feed.tsx`
- **Problem**: Play cards don't show which team is on offense
- **Fix**: Add small team logo (16x16) next to the play description, using the possessing team's logo

### 4.5 Pre-Play Tension Build
- [x] **Status**: DONE
- **File**: `src/components/game/field/play-scene.tsx`
- **Problem**: Pre-snap phase feels dead — just waiting
- **Fix**: During `pre_snap` phase:
  - Show formation name text briefly (fade in/out)
  - Show down & distance callout
  - Subtle crowd murmur audio increase
  - If 4th down: golden border pulse
  - If red zone: red zone glow intensifies
  - If 2-minute warning: clock graphic emphasis

### 4.6 Remove/Improve Web Speech TTS
- [x] **Status**: DONE (kept as-is, default off — future ElevenLabs integration)
- **File**: `src/hooks/use-broadcaster-audio.ts`
- **Current**: Web Speech API — robotic, varies wildly by browser/OS
- **Options**:
  1. **Remove entirely** (simplest, cleanest)
  2. **Keep but default OFF** (current state — acceptable)
  3. **Replace with ElevenLabs** (future — expensive but professional)
- **Decision**: Keep as-is for now (default off). Mark for future ElevenLabs integration when monetized. Add a tooltip explaining it's experimental.

### 4.7 Split PlayScene into Modules
- [x] **Status**: DONE
- **File**: `src/components/game/field/play-scene.tsx` (1,682 lines!)
- **Extract**:
  - `play-effects.ts` — Effect generators (TD flash, turnover shake, sack burst, etc.)
  - `play-animation.ts` — Ball/QB position calculation, easing functions, RAF loop
  - `play-timing.ts` — Already exists, expand with all timing constants
  - `kickoff-scene.tsx` — Kickoff-specific rendering (already partially extracted?)
  - `punt-scene.tsx` — Punt-specific rendering
- **Goal**: PlayScene under 600 lines, each module under 300

### 4.8 Add `prefers-reduced-motion` Support
- [x] **Status**: DONE
- **File**: `src/styles/globals.css`
- **Fix**: Wrap all `@keyframes` animations in:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

### 4.9 Virtual Scrolling for Play Feed
- [x] **Status**: DONE
- **File**: `src/components/game/play-feed.tsx`
- **Problem**: 100+ events in a game could cause jank on mobile
- **Fix**: Implement windowed rendering — only render visible play cards + 10 buffer. Use IntersectionObserver or a lightweight virtual scroll.

### 4.10 Game Start Ceremony Polish
- [x] **Status**: DONE
- **Current**: Kickoff intro overlay + coin flip animation
- **Enhance**:
  - Matchup graphic: team records, head-to-head, key player matchups
  - Weather conditions display
  - Stadium name (based on home team)
  - Smoother transition from ceremony → first play

---

## 5. Phase 4: Backend Hardening

> **Priority**: MEDIUM-HIGH — needed for monetization
> **Status**: NOT STARTED

### 5.1 Fix N+1 Query: getEventCount
- [x] **Status**: DONE
- **File**: `src/lib/db/queries/events.ts` lines 52-58
- **Bug**: Fetches ALL event rows just to return `.length`
- **Fix**: Use SQL `COUNT(*)`:
  ```typescript
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(gameEvents).where(eq(gameEvents.gameId, gameId));
  return result[0].count;
  ```

### 5.2 Fix N+1 Query: getTotalPredictors
- [x] **Status**: DONE
- **File**: `src/lib/db/queries/leaderboard.ts` lines 79-82
- **Same fix**: Use `COUNT(*)` instead of fetching all rows

### 5.3 Fix N+1 Query: recalculateRanks
- [x] **Status**: DONE
- **File**: `src/lib/db/queries/leaderboard.ts` lines 64-76
- **Bug**: Loops through ALL users, updating rank one at a time
- **Fix**: Use SQL window function:
  ```sql
  UPDATE user_scores SET rank = sub.row_num
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY total_score DESC) as row_num FROM user_scores) sub
  WHERE user_scores.id = sub.id
  ```

### 5.4 Fix N+1 Query: scorePredictions Loop
- [x] **Status**: DONE
- **File**: `src/lib/db/queries/predictions.ts` lines 68-104
- **Bug**: Updates each prediction individually in a loop
- **Fix**: Batch update with a single query using CASE/WHEN or batch VALUES

### 5.5 Fix getAllTeams Overfetching
- [x] **Status**: DONE
- **Files**: `src/lib/db/queries/games.ts` lines 85-86, `teams.ts` line 48
- **Bug**: Every game query fetches all 32 teams for hydration
- **Fix**: Join teams directly in the game query, or cache the team lookup (32 teams rarely change)

### 5.6 Split Simulate Route
- [x] **Status**: DONE
- **File**: `src/app/api/simulate/route.ts` (1,620 lines)
- **Extract to separate files**:
  - `src/lib/simulation/season-manager.ts` — `handleCreateSeason()`, `handleSeasonComplete()`
  - `src/lib/simulation/game-manager.ts` — `handleStartGame()`
  - `src/lib/simulation/week-manager.ts` — `handleAdvanceWeek()`
  - `src/lib/simulation/playoff-generator.ts` — All playoff bracket generation
  - `src/lib/scheduling/game-time-projector.ts` — `projectFutureGameTimes()`
- **Route handler**: Just auth check + `determineNextAction()` + dispatch to extracted modules. Under 100 lines.

### 5.7 Secure User Identity
- [x] **Status**: DONE
- **Files**: `src/app/api/predict/route.ts`, `src/app/api/user/route.ts`
- **Bug**: `x-user-id` header is spoofable — anyone can impersonate any user
- **Fix options**:
  1. **Signed cookies** (simplest): Generate userId server-side, sign with HMAC, verify on every request
  2. **JWT tokens**: Issue short-lived tokens
  3. **Activate Clerk**: Already installed, just needs wiring
- **Recommendation**: Signed cookies for MVP (no external dependency). Clerk for v2.

### 5.8 Add Health Check Endpoint
- [x] **Status**: DONE
- **New file**: `src/app/api/health/route.ts`
- **Returns**: `{ status: 'ok', version, uptime, dbConnected: boolean }`
- **Use**: Monitoring, uptime checks, deployment verification

### 5.9 Add Error Monitoring (Sentry)
- [x] **Status**: DONE
- **Install**: `@sentry/nextjs`
- **Configure**: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- **Add**: Error boundary component for graceful error UI
- **Free tier**: 5K events/month (sufficient for MVP)

### 5.10 Add Rate Limiting
- [x] **Status**: DONE
- **File**: `src/middleware.ts` (create)
- **Protect**: `/api/predict` (5 req/min per user), `/api/user` (10 req/min), `/api/simulate` (already auth-gated)
- **Implementation**: In-memory rate limiter with IP + userId key (Vercel Edge compatible)

---

## 6. Phase 5: Testing & Dead Code Cleanup

> **Priority**: MEDIUM — quality assurance
> **Status**: NOT STARTED

### 6.1 Remove Three.js Dead Code
- [x] **Status**: DONE
- **Delete**: Entire `src/components/game/field3d/` directory (20 files)
- **Remove from package.json**: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`
- **Saves**: ~50MB in node_modules

### 6.2 Remove Clerk Dead Code
- [x] **Status**: DONE
- **Remove from package.json**: `@clerk/nextjs`
- **Remove**: Any commented-out Clerk imports/references
- **Keep**: Cookie-based userId system (working fine)

### 6.3 Remove Stripe Skeleton
- [x] **Status**: DONE
- **Delete**: `src/app/api/webhooks/stripe/route.ts`
- **Remove from package.json**: `stripe`
- **Note**: Will re-add when monetization is implemented properly

### 6.4 Add API Route Tests
- [x] **Status**: DONE
- **New file**: `tests/unit/api/simulate.test.ts`
- **Test**: `determineNextAction()` pure function (already extracted to `scheduler.ts`)
- **New file**: `tests/unit/api/predict.test.ts`
- **Test**: Input validation, duplicate prediction handling, game state checks

### 6.5 Add Schedule Generator Tests
- [x] **Status**: DONE
- **New file**: `tests/unit/scheduling/schedule-generator.test.ts`
- **Test**: 18 weeks generated, bye weeks distributed, division games correct count

### 6.6 Expand Engine Tests
- [x] **Status**: DONE
- **File**: `tests/unit/simulation/engine.test.ts` (currently 12 tests)
- **Add**: Full game stat validation (realistic score ranges, drive counts, turnover rates)
- **Add**: Overtime scenario tests
- **Add**: Penalty impact tests
- **Add**: Weather effect tests
- **Target**: 40+ engine tests

### 6.7 Add INT Rate Property Test
- [x] **Status**: DONE
- **File**: `tests/property/simulation.property.test.ts`
- **Test**: Over 1000 simulated games, INT rate should be 2.0-3.0% of pass attempts
- **Test**: Over 1000 games, home team win rate should be 52-58% (home field advantage)

### 6.8 Add E2E Tests
- [x] **Status**: DONE
- **File**: `tests/e2e/game-flow.spec.ts`
- **Test**: Homepage loads → navigate to live game → play feed populates → game completes → redirect
- **Test**: Prediction submission flow
- **Test**: Schedule page navigation
- **Framework**: Playwright (already configured)

---

## 7. Phase 6: Design & Monetization

> **Priority**: LOWER (after engine + broadcast are solid)
> **Status**: NOT STARTED

### 7.1 SVG Logo/Branding + Rebrand
- [x] **Status**: DONE
- **Problem**: No proper app logo/favicon; "GridIron" name already taken
- **Fix**: Rebranded to **GridBlitz**. Created shield+football+lightning SVG logo with "GB" monogram. Full rebrand across 80+ files: metadata, headers, footers, cookies, extension, tests, comments.

### 7.2 Landing Page Redesign
- [x] **Status**: DONE
- **Problem**: Homepage feels like a dashboard, not a product
- **Fix**: Hero section with live game preview, value proposition, "Watch Live" CTA

### 7.3 Mobile Experience Audit
- [x] **Status**: DONE
- **Problem**: Field too small on mobile, text too dense
- **Fix**: Larger touch targets, simplified mobile play feed, swipeable tabs

### 7.4 Monetization Strategy
- [ ] **Status**: PENDING
- **Options**:
  1. **Freemium**: Free viewing, paid predictions/leaderboard
  2. **Ad-supported**: Display ads around broadcast
  3. **Subscription**: Full access for $X/month
  4. **Hybrid**: Free base + premium features (advanced stats, replay, predictions)
- **Decision**: TBD after product is polished

### 7.5 SEO & Social Sharing
- [x] **Status**: DONE
- **Add**: OpenGraph images with team logos + scores for completed games
- **Add**: Twitter Card meta tags
- **Add**: Structured data (JSON-LD) for sports events

---

## 8. Reference: Arians Playbook Notes

### Personnel Combinations (from playbook page 3)
| # | Name | Composition | Our Mapping |
|---|------|-------------|-------------|
| 1 | Regular | 2 RB, 2 WR, 1 TE | 21 |
| 2 | Kings | 1 RB, 1 TE, 3 WR | 11 |
| 3 | Tens | 2 RB, 1 WR, 2 TE | 22 (close) |
| 4 | Ace | 1 RB, 2 WR, 2 TE (1 TE as F) | 12 |
| 5 | Clubs | 1 RB, 1 WR, 3 TE | 13 |
| 6 | Jacks | 2 RB, 3 TE | 23 (new) |
| 7 | Flush | 1 RB, 4 WR | 10 |
| 8 | Royal | 0 RB, 4 WR, 1 TE (1 WR as H) | 01 (new) |
| 9 | Queens | 2 RB, 3 WR | 20 (new) |
| 10 | Joker | 0 RB, 4 WR, 1 TE (TE as H) | 01 |
| 11 | 5 Wides | 0 RB, 5 WR, 0 TE | 00 |
| 12 | Straight | 0 RB, 3 WR, 2 TE | 02 (new) |

### Protection Schemes (from playbook pages 5-6)
- **62/63 (Middle)**: Max protection. vs 4-3: "MIDDLE" call. vs 3-4: "SORT" both sides. RB checks Mike/Sam LB. Best pass protection, least receivers in pattern.
- **80/81 (Blunt Pass/Waggle)**: Sprint-out/bootleg. vs 4-3: "BASE" blocking. vs 3-4: "SORT"+"BASE". 4-5 step drop, QB moves laterally. Great for play-action.
- **82/83 (Base/Sort)**: Standard dropback. vs 4-3: "BASE". vs 3-4: "SORT"+"SORT". Most versatile, used on majority of passes.

### Hot/Sight Adjustments (from playbook page 6)
- **vs 3-Down Front**: 62/63 → Q reads Sam/Mike, sight to DB + Stack LB
- **vs 4-Down Front**: 62/63 → Q reads Sam/Mike, sight to DB + Will LB
- **80/81 and 82/83**: No Q read (protection handles it), sight to DB + Stack/Will LB

### Route Installation (from playbook page 7)
1. Go, 2. Semi, 3. Bench, 4. Curl, 5. Hitch, 6. Blinky, 7. Drive, 8. Pylon, 9. Caddy, 10. Cab, 11. X Ray (Post/In)

All 11 match our existing 17 concepts except **Caddy** (not yet in system).

### QB Reads (from playbook pages 9-10)
- **Trips RT 80 GO** (page 9):
  - 1 Hi (MOFC): Best Look → Delta → Checkdown
  - 2 Hi (MOFO): Delta → Hole Shot → Checkdown
  - QTRS: Think Delta → Go
- **Trey RT Z PL 62 Semi F Angle** (page 10):
  - 1 Hi: Best Look Side → Away Rotation → Semi → Angle → Delta
  - 2 Hi: Angle → Delta → Checkdown
  - COV 5: Backside Semi → Checkdown

### Individual Receiver Tags (from playbook page 8)
- **CAB**: 18-yard comeback. +2 split, vertical release on comeback, inside release on bench. vs Cover 2 rotation: run a bench instead.
- **CADDY**: 18-yard comeback. +2 split, vertical release. vs Cover 2 rotation: run a drive instead.

---

## 9. Reference: Audit Data

### File Size Reference
| File | Lines | Notes |
|------|-------|-------|
| `play-generator.ts` | 1,676 | Largest sim file |
| `engine.ts` | 1,539 | Main game loop |
| `simulate/route.ts` | 1,620 | API route (should split) |
| `play-scene.tsx` | 1,682 | Animation engine (should split) |
| `game-viewer.tsx` | 1,561 | Broadcast orchestrator |
| `defensive-coordinator.ts` | 810 | 7-layer defense |
| `special-teams.ts` | 744 | Kickoffs, punts, FGs |
| `constants.ts` | 741 | All game constants |
| `clock-manager.ts` | 742 | NFL clock rules |
| `play-caller.ts` | 667 | Play selection |
| `globals.css` | 998 | Theme + 70+ animations |
| `play-feed.tsx` | 329 | Play-by-play feed |
| `field-visual.tsx` | 435 | Field container |

### Current Test Coverage
```
Total tests: 212 across 11 files
Covered: simulation engine, RNG, clock, penalties, special teams, overtime, narrative
NOT covered: API routes, SSE streaming, scheduling, DB queries, UI components, E2E
Estimated coverage: ~15-20%
```

### Dead Code Inventory
| Package/Code | Size Impact | Files |
|-------------|-------------|-------|
| Three.js + R3F | ~50MB node_modules | 20 files in `field3d/` |
| @clerk/nextjs | ~5MB | 0 usage files |
| stripe | ~2MB | 1 skeleton route |
| use-crowd-audio.ts | 254 lines | Not imported anywhere |

### Performance Bottlenecks
1. `getEventCount()` — fetches all rows for count
2. `getTotalPredictors()` — fetches all rows for count
3. `recalculateRanks()` — N updates for N users
4. `scorePredictions()` — N updates for N predictions
5. `getAllTeams()` — called redundantly in multiple queries
6. PlayFeed — no virtual scrolling for 100+ events
7. Event array — unbounded memory growth during long games

---

## Progress Tracker

| Phase | Tasks | Done | % |
|-------|-------|------|---|
| Phase 1: Engine Fixes | 8 | 8 | 100% |
| Phase 2: Offensive Coordinator | 10 | 10 | 100% |
| Phase 3: Broadcast Polish | 10 | 9 | 90% |
| Phase 4: Backend Hardening | 10 | 10 | 100% |
| Phase 5: Testing & Cleanup | 8 | 7 | 88% |
| Phase 6: Design & Monetization | 5 | 3 | 60% |
| **TOTAL** | **51** | **47** | **92%** |

---

## Implementation Order (Recommended)

### Sprint 1: Foundation (Engine Fixes)
1. Fix INT architecture (2.1) — most impactful realism fix
2. Fix kickoff return position (2.2)
3. Fix prevent defense (2.3)
4. Add dropped passes (2.4)
5. Amplify player ratings (2.8)

### Sprint 2: Offensive Depth
6. Create offensive-coordinator.ts skeleton (3.1)
7. Protection scheme system (3.2)
8. Run scheme system (3.4)
9. Pre-snap motion system (3.3)
10. QB read progression (3.6)
11. Add Caddy route concept (3.7)
12. Personnel-formation integration (3.8)
13. Wire into engine (3.9)

### Sprint 3: Polish & Backend
14. Remove dead code (6.1, 6.2, 6.3)
15. Fix N+1 queries (5.1-5.5)
16. Split simulate route (5.6)
17. Celebration enhancements (4.2)
18. Drive separators (4.3)
19. PlayScene split (4.7)

### Sprint 4: Testing & Launch Prep
20. Expand engine tests (6.6)
21. Add INT rate property test (6.7)
22. API route tests (6.4)
23. Health check + monitoring (5.8, 5.9)
24. Secure user identity (5.7)

### Sprint 5: Monetization Ready
25. Source crowd audio (4.1)
26. Design overhaul (7.1-7.3)
27. SEO + social (7.5)
28. Monetization implementation (7.4)
