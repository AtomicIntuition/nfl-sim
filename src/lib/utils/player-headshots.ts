// ============================================================
// GridBlitz - NFL Player Headshots via ESPN CDN
// ============================================================
// ESPN serves player headshots at predictable CDN URLs.
// Requires the ESPN player ID stored during roster seeding.
// No API key required — these are public static assets.
// ============================================================

/**
 * Get the ESPN CDN headshot URL for a player.
 * Returns a full-size PNG headshot (~600px).
 *
 * @param espnId - The ESPN player ID (e.g. "3139477")
 */
export function getPlayerHeadshotUrl(espnId: string): string {
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
}

/**
 * Get a smaller ESPN CDN headshot for use in compact UIs.
 *
 * @param espnId - The ESPN player ID
 * @param size - Desired height/width in pixels (default 65)
 */
export function getPlayerHeadshotSmallUrl(espnId: string, size: number = 65): string {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espnId}.png&w=${size}&h=${size}`;
}
