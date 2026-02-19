import type { Player, Position } from '../../simulation/types';

// ============================================================
// NAME POOLS (deterministic player name generation)
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
// ROSTER TEMPLATE
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
    // Fallback: any unused number 1-99
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
// PUBLIC API
// ============================================================

/**
 * Generate a full ~26-player roster for a single team.
 * Deterministic: same teamIndex always produces the same roster.
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
