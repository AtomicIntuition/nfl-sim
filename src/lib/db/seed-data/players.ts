import type { Player, Position } from '../../simulation/types';

// ============================================================
// ESPN TEAM ID MAPPING
// ============================================================

const ESPN_TEAM_IDS: Record<string, number> = {
  ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5,
  DAL: 6, DEN: 7, DET: 8, GB: 9, HOU: 34, IND: 11, JAX: 30, KC: 12,
  LAC: 24, LAR: 14, LV: 13, MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19,
  NYJ: 20, PHI: 21, PIT: 23, SEA: 26, SF: 25, TB: 27, TEN: 10, WAS: 28,
};

// ============================================================
// ESPN POSITION MAPPING → Our Position enum
// ============================================================

const ESPN_POSITION_MAP: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OL: 'OL', OT: 'OL', OG: 'OL', C: 'OL', G: 'OL', T: 'OL',
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL',
  LB: 'LB', OLB: 'LB', ILB: 'LB', MLB: 'LB',
  CB: 'CB',
  S: 'S', FS: 'S', SS: 'S', DB: 'S',
  K: 'K', PK: 'K',
  P: 'P', LS: 'P',
};

// ============================================================
// NAME POOLS (fallback for missing ESPN data)
// ============================================================

const FIRST_NAMES = [
  'James', 'Marcus', 'Darius', 'Tyrell', 'Brandon', 'Jaylen', 'Malik',
  'Caleb', 'Devonte', 'Andre', 'Isaiah', 'Cameron', 'Justin', 'Lamar',
  'Derrick', 'Travis', 'Micah', 'Jalen', 'Devin', 'Patrick', 'Aaron',
  'Chris', 'Trevon', 'Zach', 'Tyler', 'Jordan', 'Kyle', 'DeAndre',
  'Davante', 'CeeDee', 'Amari', 'Stefon', 'Rashod', 'Cooper', 'Garrett',
  'Josh', 'Daniel', 'Ryan', 'Tua', 'Trevor', 'Kenny', 'Brock', 'Matthew',
  'Derek', 'Russell', 'Geno', 'Sam', 'Kirk', 'Deshaun', 'Joe', 'Dak',
  'Jared', 'Mac', 'Davis', 'Bryce', 'Anthony', 'Will', 'CJ', 'Aidan',
  'Drake',
] as const;

const LAST_NAMES = [
  'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Wilson', 'Anderson',
  'Thomas', 'Jackson', 'White', 'Harris', 'Robinson', 'Lewis', 'Walker',
  'Allen', 'Young', 'King', 'Wright', 'Hill', 'Green', 'Adams', 'Baker',
  'Nelson', 'Carter', 'Mitchell', 'Campbell', 'Roberts', 'Turner',
  'Phillips', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris',
  'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Cooper',
  'Richardson', 'Howard', 'Ward', 'Watson', 'Brooks', 'Sanders', 'Price',
  'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins',
  'Perry', 'Powell', 'Sullivan', 'Long', 'Patterson', 'Hughes', 'Simmons',
  'Foster', 'Bryant', 'Alexander', 'Griffin', 'Hayes', 'Hunt', 'Henry',
  'Marshall', 'Graham', 'Kelce', 'Bosa', 'Watt', 'Parsons', 'Garrett',
  'Donald', 'Ramsey', 'Diggs',
] as const;

// ============================================================
// ROSTER TEMPLATE (defines position counts + rating ranges)
// ============================================================

interface RosterSlot {
  position: Position;
  ratingMin: number;
  ratingMax: number;
}

const ROSTER_TEMPLATE: RosterSlot[] = [
  // Quarterbacks
  { position: 'QB', ratingMin: 80, ratingMax: 95 },
  { position: 'QB', ratingMin: 65, ratingMax: 78 },
  // Running backs
  { position: 'RB', ratingMin: 78, ratingMax: 92 },
  { position: 'RB', ratingMin: 68, ratingMax: 80 },
  // Wide receivers
  { position: 'WR', ratingMin: 82, ratingMax: 95 },
  { position: 'WR', ratingMin: 76, ratingMax: 88 },
  { position: 'WR', ratingMin: 70, ratingMax: 82 },
  // Tight end
  { position: 'TE', ratingMin: 75, ratingMax: 88 },
  // Offensive line
  { position: 'OL', ratingMin: 74, ratingMax: 88 },
  { position: 'OL', ratingMin: 74, ratingMax: 88 },
  { position: 'OL', ratingMin: 74, ratingMax: 88 },
  { position: 'OL', ratingMin: 74, ratingMax: 88 },
  { position: 'OL', ratingMin: 74, ratingMax: 88 },
  // Defensive line
  { position: 'DL', ratingMin: 74, ratingMax: 90 },
  { position: 'DL', ratingMin: 74, ratingMax: 90 },
  { position: 'DL', ratingMin: 74, ratingMax: 90 },
  { position: 'DL', ratingMin: 74, ratingMax: 90 },
  // Linebackers
  { position: 'LB', ratingMin: 74, ratingMax: 90 },
  { position: 'LB', ratingMin: 74, ratingMax: 90 },
  { position: 'LB', ratingMin: 74, ratingMax: 90 },
  // Cornerbacks
  { position: 'CB', ratingMin: 74, ratingMax: 90 },
  { position: 'CB', ratingMin: 74, ratingMax: 90 },
  // Safeties
  { position: 'S', ratingMin: 74, ratingMax: 88 },
  { position: 'S', ratingMin: 74, ratingMax: 88 },
  // Kicker
  { position: 'K', ratingMin: 75, ratingMax: 92 },
  // Punter
  { position: 'P', ratingMin: 72, ratingMax: 85 },
];

// ============================================================
// JERSEY NUMBER RANGES
// ============================================================

const JERSEY_RANGES: Record<Position, number[][]> = {
  QB: [[1, 19]],
  RB: [[20, 49]],
  WR: [[1, 19], [80, 89]],
  TE: [[80, 89]],
  OL: [[60, 79]],
  DL: [[90, 99], [50, 59]],
  LB: [[40, 59]],
  CB: [[20, 39]],
  S: [[20, 49]],
  K: [[1, 19]],
  P: [[1, 19]],
};

// ============================================================
// ALL 32 TEAM ABBREVIATIONS
// ============================================================

const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
] as const;

// ============================================================
// DETERMINISTIC PRNG (mulberry32)
// ============================================================

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickJerseyNumber(
  rng: () => number,
  position: Position,
  usedNumbers: Set<number>,
): number {
  const ranges = JERSEY_RANGES[position];
  const candidates: number[] = [];
  for (const [lo, hi] of ranges) {
    for (let n = lo; n <= hi; n++) {
      if (!usedNumbers.has(n)) candidates.push(n);
    }
  }
  if (candidates.length === 0) {
    for (let n = 1; n <= 99; n++) {
      if (!usedNumbers.has(n)) candidates.push(n);
    }
  }
  const chosen = candidates[Math.floor(rng() * candidates.length)];
  usedNumbers.add(chosen);
  return chosen;
}

function pickName(rng: () => number): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

// ============================================================
// ESPN ROSTER FETCHING
// ============================================================

interface ESPNAthlete {
  id: string;
  fullName: string;
  jersey?: string;
  position: { abbreviation: string };
}

interface ESPNRosterResponse {
  athletes: Array<{
    position: string;
    items: ESPNAthlete[];
  }>;
}

/**
 * Fetch real roster from ESPN public API for a given team abbreviation.
 * Returns null if the fetch fails (caller should fall back to generated names).
 */
async function fetchESPNRoster(teamAbbreviation: string): Promise<ESPNAthlete[] | null> {
  const espnId = ESPN_TEAM_IDS[teamAbbreviation];
  if (!espnId) return null;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${espnId}/roster`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const data = (await res.json()) as ESPNRosterResponse;
    const allAthletes: ESPNAthlete[] = [];
    for (const group of data.athletes ?? []) {
      for (const athlete of group.items ?? []) {
        allAthletes.push(athlete);
      }
    }
    return allAthletes;
  } catch {
    return null;
  }
}

/**
 * Map ESPN athletes to our position enum, grouped by position.
 */
function groupESPNByPosition(athletes: ESPNAthlete[]): Map<Position, ESPNAthlete[]> {
  const grouped = new Map<Position, ESPNAthlete[]>();

  for (const athlete of athletes) {
    const espnPos = athlete.position?.abbreviation;
    if (!espnPos) continue;

    const ourPos = ESPN_POSITION_MAP[espnPos];
    if (!ourPos) continue;

    if (!grouped.has(ourPos)) grouped.set(ourPos, []);
    grouped.get(ourPos)!.push(athlete);
  }

  return grouped;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Generate a full ~26-player roster for a single team.
 * Deterministic: same teamIndex always produces the same roster.
 * (Fallback when ESPN data is unavailable)
 */
export function generatePlayersForTeam(
  teamAbbreviation: string,
  teamIndex: number,
): Omit<Player, 'id' | 'teamId'>[] {
  const rng = createRng((teamIndex + 1) * 7919);
  const usedNumbers = new Set<number>();
  const players: Omit<Player, 'id' | 'teamId'>[] = [];

  for (const slot of ROSTER_TEMPLATE) {
    const name = pickName(rng);
    const number = pickJerseyNumber(rng, slot.position, usedNumbers);
    const rating = randInt(rng, slot.ratingMin, slot.ratingMax);

    const speed = clamp(rating + randInt(rng, -8, 8), 60, 99);
    const strength = clamp(rating + randInt(rng, -8, 8), 60, 99);
    const awareness = clamp(rating + randInt(rng, -6, 6), 60, 99);
    const clutchRating = clamp(rating + randInt(rng, -10, 10), 60, 99);
    const injuryProne = rng() < 0.1;

    players.push({
      name,
      position: slot.position,
      number,
      rating,
      speed,
      strength,
      awareness,
      clutchRating,
      injuryProne,
    });
  }

  return players;
}

/**
 * Generate a roster using real ESPN player names.
 * Falls back to generated names for any positions where ESPN data is missing.
 * Ratings are still generated deterministically (seeded PRNG).
 */
export async function generatePlayersFromESPN(
  teamAbbreviation: string,
  teamIndex: number,
): Promise<Omit<Player, 'id' | 'teamId'>[]> {
  const espnAthletes = await fetchESPNRoster(teamAbbreviation);

  if (!espnAthletes || espnAthletes.length === 0) {
    return generatePlayersForTeam(teamAbbreviation, teamIndex);
  }

  const grouped = groupESPNByPosition(espnAthletes);
  const rng = createRng((teamIndex + 1) * 7919);
  const usedNumbers = new Set<number>();
  const players: Omit<Player, 'id' | 'teamId'>[] = [];

  // Track how many ESPN players we've consumed per position
  const positionCursor = new Map<Position, number>();

  for (const slot of ROSTER_TEMPLATE) {
    const cursor = positionCursor.get(slot.position) ?? 0;
    const espnPool = grouped.get(slot.position) ?? [];
    const espnPlayer = espnPool[cursor];

    positionCursor.set(slot.position, cursor + 1);

    // Use ESPN name + jersey if available, otherwise fall back
    let name: string;
    let number: number;
    let espnIdValue: string | undefined;

    if (espnPlayer) {
      name = espnPlayer.fullName;
      espnIdValue = espnPlayer.id;
      const espnJersey = espnPlayer.jersey ? parseInt(espnPlayer.jersey, 10) : NaN;

      if (!isNaN(espnJersey) && espnJersey >= 0 && espnJersey <= 99 && !usedNumbers.has(espnJersey)) {
        number = espnJersey;
        usedNumbers.add(number);
      } else {
        number = pickJerseyNumber(rng, slot.position, usedNumbers);
      }
    } else {
      name = pickName(rng);
      number = pickJerseyNumber(rng, slot.position, usedNumbers);
    }

    // Ratings are always generated deterministically
    const rating = randInt(rng, slot.ratingMin, slot.ratingMax);
    const speed = clamp(rating + randInt(rng, -8, 8), 60, 99);
    const strength = clamp(rating + randInt(rng, -8, 8), 60, 99);
    const awareness = clamp(rating + randInt(rng, -6, 6), 60, 99);
    const clutchRating = clamp(rating + randInt(rng, -10, 10), 60, 99);
    const injuryProne = rng() < 0.1;

    players.push({
      name,
      position: slot.position,
      number,
      rating,
      speed,
      strength,
      awareness,
      clutchRating,
      injuryProne,
      ...(espnIdValue ? { espnId: espnIdValue } : {}),
    });
  }

  return players;
}

/**
 * Generate rosters for all 32 NFL teams.
 * Returns a map of team abbreviation → player array.
 */
export function generateAllPlayers(): Map<string, Omit<Player, 'id' | 'teamId'>[]> {
  const result = new Map<string, Omit<Player, 'id' | 'teamId'>[]>();
  for (let i = 0; i < NFL_TEAMS.length; i++) {
    result.set(NFL_TEAMS[i], generatePlayersForTeam(NFL_TEAMS[i], i));
  }
  return result;
}

/**
 * Generate a flat array of all players across all 32 teams (~832 players).
 */
export function generateAllPlayersFlat(): Omit<Player, 'id' | 'teamId'>[] {
  const all: Omit<Player, 'id' | 'teamId'>[] = [];
  for (let i = 0; i < NFL_TEAMS.length; i++) {
    all.push(...generatePlayersForTeam(NFL_TEAMS[i], i));
  }
  return all;
}
