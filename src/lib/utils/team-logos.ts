// ============================================================
// GridBlitz - NFL Team Logos via ESPN CDN
// ============================================================
// ESPN serves team logos at predictable CDN URLs.
// No API key required — these are public static assets.
// ============================================================

/**
 * Map our abbreviations to ESPN's CDN abbreviations.
 * Most match directly (lowercased), but a few differ.
 */
const ESPN_ABBREV_MAP: Record<string, string> = {
  ARI: 'ari',
  ATL: 'atl',
  BAL: 'bal',
  BUF: 'buf',
  CAR: 'car',
  CHI: 'chi',
  CIN: 'cin',
  CLE: 'cle',
  DAL: 'dal',
  DEN: 'den',
  DET: 'det',
  GB: 'gb',
  HOU: 'hou',
  IND: 'ind',
  JAX: 'jax',
  KC: 'kc',
  LAC: 'lac',
  LAR: 'lar',
  LV: 'lv',
  MIA: 'mia',
  MIN: 'min',
  NE: 'ne',
  NO: 'no',
  NYG: 'nyg',
  NYJ: 'nyj',
  PHI: 'phi',
  PIT: 'pit',
  SEA: 'sea',
  SF: 'sf',
  TB: 'tb',
  TEN: 'ten',
  WAS: 'wsh',
};

/**
 * Get the ESPN CDN logo URL for a team.
 * Returns a 500x500 PNG logo.
 *
 * @param abbreviation - Our team abbreviation (e.g. "KC", "BUF")
 * @param size - Logo size: 500 (default) or 100 for smaller variant
 */
export function getTeamLogoUrl(abbreviation: string, size: 500 | 100 = 500): string {
  const espnAbbrev = ESPN_ABBREV_MAP[abbreviation] ?? abbreviation.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/${size}/${espnAbbrev}.png`;
}

/**
 * Get the ESPN CDN scoreboard logo (dark background friendly).
 */
export function getTeamScoreboardLogoUrl(abbreviation: string): string {
  const espnAbbrev = ESPN_ABBREV_MAP[abbreviation] ?? abbreviation.toLowerCase();
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/scoreboard/${espnAbbrev}.png&h=96&w=96`;
}

/**
 * Teams whose ESPN logos contain text/letters that look wrong when
 * horizontally mirrored (scaleX(-1)). These logos should never be flipped.
 */
const NO_FLIP_LOGOS = new Set([
  'BAL', // "B" with wings
  'CIN', // Striped "B"
  'GB',  // "G" oval
  'KC',  // "KC" inside arrowhead
  'LAR', // "LA" monogram
  'LV',  // "RAIDERS" text
  'NYG', // "ny" script
  'NYJ', // "NY" with jet
  'PIT', // "Steelers" text
  'SF',  // "SF" oval
  'TEN', // Stylized "T" with flame
]);

/** Returns true if this team's logo can be safely mirrored. */
export function canFlipLogo(abbreviation: string): boolean {
  return !NO_FLIP_LOGOS.has(abbreviation);
}

// ============================================================
// Stadium Names by Team
// ============================================================

const STADIUMS: Record<string, string> = {
  ARI: 'State Farm Stadium',
  ATL: 'Mercedes-Benz Stadium',
  BAL: 'M&T Bank Stadium',
  BUF: 'Highmark Stadium',
  CAR: 'Bank of America Stadium',
  CHI: 'Soldier Field',
  CIN: 'Paycor Stadium',
  CLE: 'Huntington Bank Field',
  DAL: 'AT&T Stadium',
  DEN: 'Empower Field at Mile High',
  DET: 'Ford Field',
  GB: 'Lambeau Field',
  HOU: 'NRG Stadium',
  IND: 'Lucas Oil Stadium',
  JAX: 'EverBank Stadium',
  KC: 'GEHA Field at Arrowhead Stadium',
  LAC: 'SoFi Stadium',
  LAR: 'SoFi Stadium',
  LV: 'Allegiant Stadium',
  MIA: 'Hard Rock Stadium',
  MIN: 'U.S. Bank Stadium',
  NE: 'Gillette Stadium',
  NO: 'Caesars Superdome',
  NYG: 'MetLife Stadium',
  NYJ: 'MetLife Stadium',
  PHI: 'Lincoln Financial Field',
  PIT: 'Acrisure Stadium',
  SEA: 'Lumen Field',
  SF: 'Levi\'s Stadium',
  TB: 'Raymond James Stadium',
  TEN: 'Nissan Stadium',
  WAS: 'Northwest Stadium',
};

/** Get the stadium name for a team by abbreviation. */
export function getStadiumName(abbreviation: string): string {
  return STADIUMS[abbreviation] ?? 'Stadium';
}
