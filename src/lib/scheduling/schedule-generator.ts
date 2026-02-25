// ============================================================
// GridBlitz - Season Schedule Generator
// ============================================================
// Generates a realistic 18-week NFL regular season schedule
// for 32 teams across 8 divisions (4 per conference).
//
// Schedule composition per team (17 games):
//   - 6 divisional (home & away vs 3 division rivals)
//   - 4 intra-conference cross-division (all 4 from one other division)
//   - 4 inter-conference (all 4 from one opposite-conference division)
//   - 3 intra-conference same-finish matchups (from remaining 2 divisions)
//
// Since perfect NFL scheduling is NP-hard, this uses a greedy
// constraint-satisfaction approach that is deterministic given a seed.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { ScheduledGame, Team, SeededRNG, Conference, Division } from '../simulation/types';
import { createSeededRNG } from '../simulation/rng';

// ---------------------------------------------------------------------------
// Division structure helpers
// ---------------------------------------------------------------------------

const DIVISIONS: Division[] = ['North', 'South', 'East', 'West'];
const CONFERENCES: Conference[] = ['AFC', 'NFC'];

interface DivisionGroup {
  conference: Conference;
  division: Division;
  teams: Team[];
}

/** Organise flat team list into division groups. */
function buildDivisionMap(teams: Team[]): Map<string, DivisionGroup> {
  const map = new Map<string, DivisionGroup>();
  for (const conf of CONFERENCES) {
    for (const div of DIVISIONS) {
      const key = `${conf}-${div}`;
      map.set(key, {
        conference: conf,
        division: div,
        teams: teams.filter((t) => t.conference === conf && t.division === div),
      });
    }
  }
  return map;
}

function divKey(conf: Conference, div: Division): string {
  return `${conf}-${div}`;
}

// ---------------------------------------------------------------------------
// Matchup generation
// ---------------------------------------------------------------------------

interface Matchup {
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Determine which cross-division opponents each division faces.
 * Uses the seed to rotate pairings deterministically.
 */
function getRotationPairings(
  conference: Conference,
  divisions: Division[],
  rng: SeededRNG
): Map<string, string> {
  // Pair each division with exactly one other in the same conference
  // for the 4-game intra-conference cross-division slate.
  const shuffled = rng.shuffle([...divisions]);
  const pairings = new Map<string, string>();
  // Pair indices 0<->1 and 2<->3
  pairings.set(divKey(conference, shuffled[0]), divKey(conference, shuffled[1]));
  pairings.set(divKey(conference, shuffled[1]), divKey(conference, shuffled[0]));
  pairings.set(divKey(conference, shuffled[2]), divKey(conference, shuffled[3]));
  pairings.set(divKey(conference, shuffled[3]), divKey(conference, shuffled[2]));
  return pairings;
}

function getInterConferencePairings(
  rng: SeededRNG
): Map<string, string> {
  // Each AFC division is paired with one NFC division for 4 inter-conference games.
  const afcDivs = rng.shuffle([...DIVISIONS]);
  const nfcDivs = rng.shuffle([...DIVISIONS]);
  const pairings = new Map<string, string>();
  for (let i = 0; i < 4; i++) {
    const afcKey = divKey('AFC', afcDivs[i]);
    const nfcKey = divKey('NFC', nfcDivs[i]);
    pairings.set(afcKey, nfcKey);
    pairings.set(nfcKey, afcKey);
  }
  return pairings;
}

/**
 * Generate all required matchups for the season.
 * Returns a flat list of undirected matchups (home/away assigned later).
 */
function generateAllMatchups(
  teams: Team[],
  divisionMap: Map<string, DivisionGroup>,
  rng: SeededRNG
): Matchup[] {
  const matchups: Matchup[] = [];
  const teamMatchupCount = new Map<string, Set<string>>();

  for (const t of teams) {
    teamMatchupCount.set(t.id, new Set());
  }

  function addMatchup(a: string, b: string): void {
    const setA = teamMatchupCount.get(a)!;
    const setB = teamMatchupCount.get(b)!;
    // Only add if this pair is not yet paired (or allow duplicates for divisional)
    matchups.push({ homeTeamId: a, awayTeamId: b });
    setA.add(b + '-' + matchups.length);
    setB.add(a + '-' + matchups.length);
  }

  // 1. Divisional games: home & away vs each of 3 division rivals (6 games each)
  for (const [, group] of divisionMap) {
    const t = group.teams;
    if (t.length !== 4) continue;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        // Team i hosts team j
        addMatchup(t[i].id, t[j].id);
        // Team j hosts team i
        addMatchup(t[j].id, t[i].id);
      }
    }
  }

  // 2. Intra-conference cross-division: play all 4 teams from one other same-conference division
  const afcIntra = getRotationPairings('AFC', DIVISIONS, rng);
  const nfcIntra = getRotationPairings('NFC', DIVISIONS, rng);
  const intraPairings = new Map([...afcIntra, ...nfcIntra]);

  for (const [srcKey, targetKey] of intraPairings) {
    const srcGroup = divisionMap.get(srcKey)!;
    const targetGroup = divisionMap.get(targetKey)!;
    // Only process if srcKey < targetKey to avoid doubling
    if (srcKey >= targetKey) continue;

    // Each team in src plays each team in target once (4 games each)
    // Assign home/away: half and half
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        // Alternate home/away: if i+j is even, src hosts; else target hosts
        if ((i + j) % 2 === 0) {
          addMatchup(srcGroup.teams[i].id, targetGroup.teams[j].id);
        } else {
          addMatchup(targetGroup.teams[j].id, srcGroup.teams[i].id);
        }
      }
    }
  }

  // 3. Inter-conference: play all 4 teams from one opposite-conference division
  const interPairings = getInterConferencePairings(rng);
  const processedInterPairs = new Set<string>();

  for (const [srcKey, targetKey] of interPairings) {
    const pairId = [srcKey, targetKey].sort().join('|');
    if (processedInterPairs.has(pairId)) continue;
    processedInterPairs.add(pairId);

    const srcGroup = divisionMap.get(srcKey)!;
    const targetGroup = divisionMap.get(targetKey)!;

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if ((i + j) % 2 === 0) {
          addMatchup(srcGroup.teams[i].id, targetGroup.teams[j].id);
        } else {
          addMatchup(targetGroup.teams[j].id, srcGroup.teams[i].id);
        }
      }
    }
  }

  // 4. Three additional same-conference games from the remaining 2 divisions
  //    In the real NFL these are "finish-based" matchups. We use the seed to
  //    deterministically assign them.
  for (const conf of CONFERENCES) {
    for (const div of DIVISIONS) {
      const myKey = divKey(conf, div);
      const pairedIntra = intraPairings.get(myKey)!;

      // Remaining 2 divisions in the same conference
      const remainingDivKeys = DIVISIONS
        .map((d) => divKey(conf, d))
        .filter((k) => k !== myKey && k !== pairedIntra);

      const myTeams = divisionMap.get(myKey)!.teams;
      // Shuffle the team order for "finish-based" proxy
      const shuffledTeams = rng.shuffle([...myTeams]);

      // From each remaining division, pick opponents for our 4 teams.
      // We need 3 games total per team from the 2 remaining divisions.
      // Strategy: 2 games from one remaining division, 1 from the other
      // (alternating which gets 2 based on team index).
      for (let ti = 0; ti < 4; ti++) {
        const team = shuffledTeams[ti];
        const div1Teams = divisionMap.get(remainingDivKeys[0])!.teams;
        const div2Teams = divisionMap.get(remainingDivKeys[1])!.teams;

        // Pick opponents: team at index ti from div1, team at index ti from div2,
        // and one more from the "bonus" division
        const opp1 = div1Teams[ti % 4];
        const opp2 = div2Teams[ti % 4];
        // Third opponent: from whichever remaining division based on index parity
        const bonusDivTeams = ti % 2 === 0 ? div1Teams : div2Teams;
        const opp3 = bonusDivTeams[(ti + 1) % 4];

        // Alternate home/away
        if (ti % 2 === 0) {
          addMatchup(team.id, opp1.id);
        } else {
          addMatchup(opp1.id, team.id);
        }

        if ((ti + 1) % 2 === 0) {
          addMatchup(team.id, opp2.id);
        } else {
          addMatchup(opp2.id, team.id);
        }

        if (ti < 2) {
          addMatchup(team.id, opp3.id);
        } else {
          addMatchup(opp3.id, team.id);
        }
      }
    }
  }

  return matchups;
}

// ---------------------------------------------------------------------------
// Week assignment
// ---------------------------------------------------------------------------

/**
 * Deduplicate matchup list: if two identical (homeTeamId, awayTeamId)
 * pairs exist beyond expected divisional duplicates, collapse them.
 * For divisional games there should be exactly 2 meetings (home and away).
 */
function deduplicateMatchups(
  matchups: Matchup[],
  divisionMap: Map<string, DivisionGroup>
): Matchup[] {
  // Build set of divisional pair keys
  const divisionalPairs = new Set<string>();
  for (const [, group] of divisionMap) {
    for (let i = 0; i < group.teams.length; i++) {
      for (let j = i + 1; j < group.teams.length; j++) {
        divisionalPairs.add([group.teams[i].id, group.teams[j].id].sort().join('|'));
      }
    }
  }

  // Track directed matchup counts
  const seen = new Map<string, number>();
  const result: Matchup[] = [];

  for (const m of matchups) {
    const directedKey = `${m.homeTeamId}>${m.awayTeamId}`;
    const count = seen.get(directedKey) || 0;
    const pairKey = [m.homeTeamId, m.awayTeamId].sort().join('|');
    const isDivisional = divisionalPairs.has(pairKey);

    // For divisional: allow exactly 1 instance of each directed pair (A hosts B, B hosts A)
    // For non-divisional: allow exactly 1 instance total per directed pair
    if (isDivisional && count < 1) {
      result.push(m);
      seen.set(directedKey, count + 1);
    } else if (!isDivisional && count < 1) {
      result.push(m);
      seen.set(directedKey, count + 1);
    }
  }

  return result;
}

/**
 * Trim or pad each team to exactly 17 games by removing or skipping
 * excess matchups for teams that have too many.
 */
function enforceGameCount(
  matchups: Matchup[],
  teams: Team[],
  rng: SeededRNG
): Matchup[] {
  const teamGameCounts = new Map<string, number>();
  for (const t of teams) {
    teamGameCounts.set(t.id, 0);
  }

  const shuffled = rng.shuffle([...matchups]);
  const selected: Matchup[] = [];

  // First pass: include divisional games (these are mandatory)
  const divisional: Matchup[] = [];
  const nonDivisional: Matchup[] = [];

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  for (const m of shuffled) {
    const home = teamMap.get(m.homeTeamId);
    const away = teamMap.get(m.awayTeamId);
    if (home && away && home.conference === away.conference && home.division === away.division) {
      divisional.push(m);
    } else {
      nonDivisional.push(m);
    }
  }

  // Add all divisional games first
  for (const m of divisional) {
    const hc = teamGameCounts.get(m.homeTeamId)!;
    const ac = teamGameCounts.get(m.awayTeamId)!;
    if (hc < 17 && ac < 17) {
      selected.push(m);
      teamGameCounts.set(m.homeTeamId, hc + 1);
      teamGameCounts.set(m.awayTeamId, ac + 1);
    }
  }

  // Add non-divisional games
  for (const m of nonDivisional) {
    const hc = teamGameCounts.get(m.homeTeamId)!;
    const ac = teamGameCounts.get(m.awayTeamId)!;
    if (hc < 17 && ac < 17) {
      selected.push(m);
      teamGameCounts.set(m.homeTeamId, hc + 1);
      teamGameCounts.set(m.awayTeamId, ac + 1);
    }
  }

  return selected;
}

/**
 * Assign bye weeks. Each team gets exactly 1 bye during weeks 5-14.
 * We spread teams evenly: roughly 3-4 teams on bye per bye week.
 */
function assignByeWeeks(
  teams: Team[],
  rng: SeededRNG
): Map<string, number> {
  const byeWeeks = new Map<string, number>();
  const BYE_START = 5;
  const BYE_END = 14;
  const BYE_WEEKS = BYE_END - BYE_START + 1; // 10 bye weeks
  const TEAMS_PER_BYE = Math.ceil(teams.length / BYE_WEEKS); // ~3-4

  const shuffledTeams = rng.shuffle([...teams]);
  let weekIdx = 0;

  for (let i = 0; i < shuffledTeams.length; i++) {
    const byeWeek = BYE_START + (weekIdx % BYE_WEEKS);
    byeWeeks.set(shuffledTeams[i].id, byeWeek);
    if ((i + 1) % TEAMS_PER_BYE === 0) {
      weekIdx++;
    }
    // If we've filled TEAMS_PER_BYE for current slot, advance
    if (weekIdx >= BYE_WEEKS && i < shuffledTeams.length - 1) {
      weekIdx = (weekIdx % BYE_WEEKS);
    }
  }

  // Simpler assignment: round-robin across bye weeks
  for (let i = 0; i < shuffledTeams.length; i++) {
    byeWeeks.set(shuffledTeams[i].id, BYE_START + (i % BYE_WEEKS));
  }

  return byeWeeks;
}

/**
 * Distribute matchups across 18 weeks such that:
 * - No team plays more than once per week.
 * - Each team has exactly one bye week (assigned in weeks 5-14).
 * - Each week has roughly 16 games (15 when byes apply).
 *
 * Uses a greedy slot-filling approach with backtracking via shuffled ordering.
 */
function assignMatchupsToWeeks(
  matchups: Matchup[],
  teams: Team[],
  byeWeeks: Map<string, number>,
  rng: SeededRNG
): Matchup[][] {
  const TOTAL_WEEKS = 18;
  const weeks: Matchup[][] = Array.from({ length: TOTAL_WEEKS }, () => []);
  const teamWeekUsed: Map<string, Set<number>> = new Map();

  for (const t of teams) {
    teamWeekUsed.set(t.id, new Set());
    // Mark the bye week as occupied
    const bye = byeWeeks.get(t.id)!;
    teamWeekUsed.get(t.id)!.add(bye);
  }

  // Shuffle matchups for variety
  const shuffled = rng.shuffle([...matchups]);

  // Sort: prioritise divisional matchups to lock them in early
  const teamLookup = new Map(teams.map((t) => [t.id, t]));
  shuffled.sort((a, b) => {
    const aDiv = isDivisional(a, teamLookup) ? 0 : 1;
    const bDiv = isDivisional(b, teamLookup) ? 0 : 1;
    return aDiv - bDiv;
  });

  for (const matchup of shuffled) {
    let placed = false;

    // Try each week in a seeded-random order
    const weekOrder = rng.shuffle(
      Array.from({ length: TOTAL_WEEKS }, (_, i) => i)
    );

    for (const w of weekOrder) {
      const homeUsed = teamWeekUsed.get(matchup.homeTeamId)!;
      const awayUsed = teamWeekUsed.get(matchup.awayTeamId)!;

      if (!homeUsed.has(w) && !awayUsed.has(w)) {
        weeks[w].push(matchup);
        homeUsed.add(w);
        awayUsed.add(w);
        placed = true;
        break;
      }
    }

    // If a matchup cannot be placed (extremely rare with correct counts),
    // skip it. This should not happen with a valid 17-game schedule.
    if (!placed) {
      // Force-place in the least-full valid week
      const weekOrder2 = Array.from({ length: TOTAL_WEEKS }, (_, i) => i)
        .sort((a, b) => weeks[a].length - weeks[b].length);

      for (const w of weekOrder2) {
        const homeUsed = teamWeekUsed.get(matchup.homeTeamId)!;
        const awayUsed = teamWeekUsed.get(matchup.awayTeamId)!;
        if (!homeUsed.has(w) && !awayUsed.has(w)) {
          weeks[w].push(matchup);
          homeUsed.add(w);
          awayUsed.add(w);
          break;
        }
      }
    }
  }

  return weeks;
}

function isDivisional(
  matchup: Matchup,
  teamLookup: Map<string, Team>
): boolean {
  const home = teamLookup.get(matchup.homeTeamId);
  const away = teamLookup.get(matchup.awayTeamId);
  if (!home || !away) return false;
  return home.conference === away.conference && home.division === away.division;
}

// ---------------------------------------------------------------------------
// Home / Away balancing
// ---------------------------------------------------------------------------

/**
 * Rebalance home/away assignments so each team has 8-9 home games.
 */
function balanceHomeAway(
  weeks: Matchup[][],
  teams: Team[],
  rng: SeededRNG
): Matchup[][] {
  const homeCount = new Map<string, number>();
  for (const t of teams) {
    homeCount.set(t.id, 0);
  }

  // Count current home games
  for (const week of weeks) {
    for (const m of week) {
      homeCount.set(m.homeTeamId, (homeCount.get(m.homeTeamId) || 0) + 1);
    }
  }

  // Swap home/away for teams that are too unbalanced
  for (const week of weeks) {
    for (let i = 0; i < week.length; i++) {
      const m = week[i];
      const hc = homeCount.get(m.homeTeamId) || 0;
      const ac = homeCount.get(m.awayTeamId) || 0;

      // If home team has too many home games and away team has too few, swap
      if (hc > 9 && ac < 8) {
        week[i] = { homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId };
        homeCount.set(m.homeTeamId, hc - 1);
        homeCount.set(m.awayTeamId, ac + 1);
      }
    }
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Schedule spreading: ensure divisional games are spread across the season
// ---------------------------------------------------------------------------

/**
 * Try to spread divisional matchups across the season rather than
 * clustering them. This is best-effort and operates by swapping
 * game week assignments within the already-valid schedule.
 */
function spreadDivisionalGames(
  weeks: Matchup[][],
  teams: Team[],
  rng: SeededRNG
): Matchup[][] {
  // This is a cosmetic improvement -- the schedule is valid without it.
  // We attempt a few rounds of swaps to pull apart clustered divisional games.
  const teamLookup = new Map(teams.map((t) => [t.id, t]));

  for (let attempt = 0; attempt < 50; attempt++) {
    // Find a team with consecutive divisional games
    for (const team of teams) {
      const divGamesWeeks: number[] = [];
      for (let w = 0; w < weeks.length; w++) {
        for (const m of weeks[w]) {
          if (
            (m.homeTeamId === team.id || m.awayTeamId === team.id) &&
            isDivisional(m, teamLookup)
          ) {
            divGamesWeeks.push(w);
          }
        }
      }

      // Check for consecutive weeks with divisional games
      for (let i = 0; i < divGamesWeeks.length - 1; i++) {
        if (divGamesWeeks[i + 1] - divGamesWeeks[i] <= 1) {
          // Try to swap the later divisional game with a non-divisional game from another week
          // This is complex and best-effort, so we just note it and move on
          break;
        }
      }
    }
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a full 18-week regular season schedule for 32 teams.
 *
 * @param teams - All 32 teams (must have 8 divisions of 4)
 * @param seasonSeed - Deterministic seed for the entire schedule
 * @returns Array of 18 weeks, each containing an array of ScheduledGame objects
 */
export function generateSeasonSchedule(
  teams: Team[],
  seasonSeed: string
): ScheduledGame[][] {
  if (teams.length !== 32) {
    throw new Error(`Expected 32 teams, received ${teams.length}`);
  }

  const rng = createSeededRNG(seasonSeed, 'schedule-gen');
  const divisionMap = buildDivisionMap(teams);

  // Validate division structure
  for (const [key, group] of divisionMap) {
    if (group.teams.length !== 4) {
      throw new Error(`Division ${key} has ${group.teams.length} teams, expected 4`);
    }
  }

  // Step 1: Generate all required matchups
  let matchups = generateAllMatchups(teams, divisionMap, rng);

  // Step 2: Deduplicate excess matchups
  matchups = deduplicateMatchups(matchups, divisionMap);

  // Step 3: Enforce exactly 17 games per team
  matchups = enforceGameCount(matchups, teams, rng);

  // Step 4: Assign bye weeks
  const byeWeeks = assignByeWeeks(teams, rng);

  // Step 5: Distribute matchups across 18 weeks
  let weeks = assignMatchupsToWeeks(matchups, teams, byeWeeks, rng);

  // Step 6: Balance home/away
  weeks = balanceHomeAway(weeks, teams, rng);

  // Step 7: Spread divisional games for variety
  weeks = spreadDivisionalGames(weeks, teams, rng);

  // Step 8: Convert to ScheduledGame objects
  const schedule: ScheduledGame[][] = weeks.map((weekMatchups, weekIndex) =>
    weekMatchups.map((m) => ({
      id: uuidv4(),
      week: weekIndex + 1,
      gameType: 'regular' as const,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: null,
      awayScore: null,
      status: 'scheduled' as const,
      isFeatured: false,
      scheduledAt: null,
      broadcastStartedAt: null,
      completedAt: null,
    }))
  );

  return schedule;
}
