// ============================================================
// GridIron Live - NFL Team Logos via ESPN CDN
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
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/scoreboard/${espnAbbrev}.png&h=40&w=40`;
}
