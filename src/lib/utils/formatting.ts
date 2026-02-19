/**
 * Formatting utilities for GridIron Live
 * Converts raw game data into broadcast-quality display strings
 */

/** Format game clock as M:SS (e.g., "4:32", "0:07", "15:00") */
export function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Format quarter display (e.g., "1st", "2nd", "3rd", "4th", "OT") */
export function formatQuarter(quarter: 1 | 2 | 3 | 4 | "OT"): string {
  if (quarter === "OT") return "OT";
  const suffixes = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" } as const;
  return suffixes[quarter];
}

/** Format down and distance (e.g., "1st & 10", "3rd & Goal", "4th & Inches") */
export function formatDownAndDistance(
  down: 1 | 2 | 3 | 4,
  yardsToGo: number,
  ballPosition: number
): string {
  const downStr = formatDown(down);
  let distanceStr: string;

  if (ballPosition + yardsToGo >= 100) {
    distanceStr = "Goal";
  } else if (yardsToGo <= 0) {
    distanceStr = "Inches";
  } else {
    distanceStr = `${yardsToGo}`;
  }

  return `${downStr} & ${distanceStr}`;
}

/** Format just the down number (e.g., "1st", "2nd") */
export function formatDown(down: 1 | 2 | 3 | 4): string {
  const suffixes = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" } as const;
  return suffixes[down];
}

/**
 * Format yard line for display
 * Ball position is 0-100 (own 0 to opponent endzone 100)
 * Display: "OWN 25", "50", "OPP 35"
 */
export function formatYardLine(
  ballPosition: number,
  possessionAbbrev?: string,
  opponentAbbrev?: string
): string {
  if (ballPosition === 50) return "50";

  if (ballPosition < 50) {
    const yardLine = ballPosition;
    const prefix = possessionAbbrev || "OWN";
    return `${prefix} ${yardLine}`;
  }

  const yardLine = 100 - ballPosition;
  const prefix = opponentAbbrev || "OPP";
  return `${prefix} ${yardLine}`;
}

/** Format field position for the score bug (e.g., "KC 35") */
export function formatFieldPosition(
  ballPosition: number,
  homeAbbrev: string,
  awayAbbrev: string,
  possession: "home" | "away"
): string {
  if (ballPosition === 50) return "50";

  if (ballPosition < 50) {
    // On own side of field
    return `${possession === "home" ? homeAbbrev : awayAbbrev} ${ballPosition}`;
  }

  // On opponent's side
  const yardLine = 100 - ballPosition;
  return `${possession === "home" ? awayAbbrev : homeAbbrev} ${yardLine}`;
}

/** Format time of possession as M:SS */
export function formatTimeOfPossession(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Format yards with sign (e.g., "+15", "-7", "No Gain") */
export function formatYards(yards: number): string {
  if (yards === 0) return "No Gain";
  if (yards > 0) return `+${yards}`;
  return `${yards}`;
}

/** Format win-loss record (e.g., "10-3", "10-3-1") */
export function formatRecord(
  wins: number,
  losses: number,
  ties: number = 0
): string {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

/** Format streak (e.g., "W3", "L1") */
export function formatStreak(streak: string): string {
  return streak;
}

/** Format win percentage */
export function formatWinPct(
  wins: number,
  losses: number,
  ties: number = 0
): string {
  const total = wins + losses + ties;
  if (total === 0) return ".000";
  const pct = (wins + ties * 0.5) / total;
  return pct.toFixed(3).replace(/^0/, "");
}

/** Format passer rating */
export function formatPasserRating(
  completions: number,
  attempts: number,
  yards: number,
  tds: number,
  ints: number
): string {
  if (attempts === 0) return "0.0";

  const a = Math.min(Math.max(((completions / attempts - 0.3) * 5), 0), 2.375);
  const b = Math.min(Math.max(((yards / attempts - 3) * 0.25), 0), 2.375);
  const c = Math.min(Math.max(((tds / attempts) * 20), 0), 2.375);
  const d = Math.min(Math.max((2.375 - (ints / attempts) * 25), 0), 2.375);

  const rating = ((a + b + c + d) / 6) * 100;
  return rating.toFixed(1);
}

/** Format large numbers with commas */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/** Format ordinal (1st, 2nd, 3rd, 4th, etc.) */
export function formatOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Format game type for display */
export function formatGameType(
  gameType: "regular" | "wild_card" | "divisional" | "conference_championship" | "super_bowl"
): string {
  const labels = {
    regular: "Regular Season",
    wild_card: "Wild Card Round",
    divisional: "Divisional Round",
    conference_championship: "Conference Championship",
    super_bowl: "Super Bowl",
  } as const;
  return labels[gameType];
}

/** Format season status for display */
export function formatSeasonStatus(
  status: string,
  week?: number
): string {
  switch (status) {
    case "regular_season":
      return week ? `Week ${week} — Regular Season` : "Regular Season";
    case "wild_card":
      return "Wild Card Round";
    case "divisional":
      return "Divisional Round";
    case "conference_championship":
      return "Conference Championships";
    case "super_bowl":
      return "Super Bowl";
    case "offseason":
      return "Off-Season";
    default:
      return status;
  }
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}
