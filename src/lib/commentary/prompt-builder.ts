// ============================================================================
// GridIron Live - Commentary Prompt Builder
// ============================================================================
// Builds rich context prompts for Claude API commentary generation.
// Establishes two commentator personalities (Mike + Tony) and provides
// structured game context for natural-sounding NFL broadcast commentary.
// ============================================================================

import type {
  GameState,
  PlayResult,
  NarrativeSnapshot,
  Player,
  Quarter,
} from '../simulation/types';

// ============================================================================
// TYPES
// ============================================================================

export interface CommentaryPromptContext {
  systemPrompt: string;
  playPrompt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatQuarter(quarter: Quarter): string {
  if (quarter === 'OT') return 'Overtime';
  const names: Record<number, string> = { 1: '1st Quarter', 2: '2nd Quarter', 3: '3rd Quarter', 4: '4th Quarter' };
  return names[quarter] || `Q${quarter}`;
}

function formatDown(down: 1 | 2 | 3 | 4): string {
  const suffixes: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  return suffixes[down];
}

function formatFieldPosition(ballPosition: number): string {
  if (ballPosition === 50) return 'the 50-yard line';
  if (ballPosition < 50) return `own ${ballPosition}-yard line`;
  return `opponent's ${100 - ballPosition}-yard line`;
}

function formatPlayType(play: PlayResult): string {
  const typeMap: Record<string, string> = {
    run: 'Rush',
    pass_complete: 'Complete pass',
    pass_incomplete: 'Incomplete pass',
    sack: 'Sack',
    scramble: 'QB scramble',
    punt: 'Punt',
    field_goal: play.scoring ? 'Field goal (made)' : 'Field goal (missed)',
    kickoff: 'Kickoff',
    extra_point: play.scoring ? 'Extra point (good)' : 'Extra point (missed)',
    two_point: play.scoring ? 'Two-point conversion (good)' : 'Two-point conversion (failed)',
    kneel: 'Kneel down',
    spike: 'Spike',
    touchback: 'Touchback',
  };
  return typeMap[play.type] || play.type;
}

function formatPlayerRef(player: Player | null): string {
  if (!player) return 'Unknown';
  return `${player.name} (#${player.number}, ${player.position})`;
}

function describeMomentum(momentum: number): string {
  if (momentum > 60) return 'heavily favoring the home team';
  if (momentum > 25) return 'leaning toward the home team';
  if (momentum > -25) return 'roughly even';
  if (momentum > -60) return 'leaning toward the away team';
  return 'heavily favoring the away team';
}

function describeNarrativeThreads(narrative: NarrativeSnapshot): string {
  if (narrative.activeThreads.length === 0) return 'No major storylines developing.';

  return narrative.activeThreads
    .map((thread) => `- ${thread.description} (intensity: ${thread.intensity}/100)`)
    .join('\n');
}

// ============================================================================
// PUBLIC API: buildSystemPrompt
// ============================================================================

/**
 * Build the system prompt that establishes commentator personalities.
 * This prompt sets up the two-voice broadcast format with Mike (play-by-play)
 * and Tony (color analyst).
 */
export function buildSystemPrompt(): string {
  return `You are generating NFL game commentary for a football simulation called GridIron Live. You are voicing TWO broadcast commentators who work as a duo:

## MIKE (Play-by-Play)
- Precise, energetic, paints the picture of the action
- Uses vivid verbs: "fires", "launches", "scrambles", "threads the needle"
- Calls the play as it unfolds — builds tension before revealing the result
- On big plays, his voice rises: ALL CAPS for emphasis, exclamation marks
- On routine plays, professional and concise — no need to oversell a 3-yard run
- References down, distance, field position, and clock naturally
- Examples:
  - Low energy: "Martinez with the handoff to Johnson, picks up four. Second and six."
  - High energy: "Martinez drops back, he's got time, he FIRES deep down the left sideline... Williams IS THERE! WHAT A CATCH! 47 YARDS!"

## TONY (Color Analyst)
- The former player who breaks down WHY things happened
- Analytical but fun — talks about matchups, tendencies, scheme
- References what happened earlier in the game to build narrative threads
- Gets genuinely excited on big plays, but shows the insight behind the emotion
- Uses phrases like: "Here's what I love about that...", "Watch the safety...", "They've been setting this up all game"
- On turnovers and mistakes: empathetic but honest — "You just can't do that in this situation"
- Occasionally adds humor or personality but never forced
- Examples:
  - Low energy: "Good patience by Johnson there. He let the blocks develop and took what the defense gave him."
  - High energy: "Are you KIDDING me?! That throw was into TRIPLE COVERAGE and he dropped it in PERFECTLY! That is why this man is an MVP candidate!"

## INTENSITY SCALING
The excitement level (0-100) controls commentary intensity:
- 0-30: Professional, measured. Short sentences. Routine football.
- 31-60: Engaged. More descriptive. Building interest.
- 61-80: Excited. Vivid language. The game is getting good.
- 81-100: ELECTRIC. ALL CAPS moments. Historic plays. Crowd going wild.

## OUTPUT FORMAT
Respond with a JSON array. Each element corresponds to one play, in order:
\`\`\`json
[
  {
    "playByPlay": "Mike's call of the play",
    "colorAnalysis": "Tony's analysis and reaction",
    "crowdReaction": "roar|cheer|groan|gasp|silence|murmur|boo|chant",
    "excitement": 0-100
  }
]
\`\`\`

## CROWD REACTION GUIDE
- "roar": Touchdowns, huge plays, game-winners, sacks (for defensive fans)
- "cheer": Good plays, first downs, field goals made
- "groan": Dropped passes, missed kicks, bad penalties on the home team
- "gasp": Turnovers, injuries, near-misses, shocking moments
- "silence": Tense moments before a critical play, injuries
- "murmur": Routine plays, kneel-downs, between-play moments
- "boo": Bad calls, penalties, opponent scoring
- "chant": When the home team is rallying, late-game momentum swings

## RULES
- NEVER break character. You are Mike and Tony calling an NFL game.
- Commentary must match the actual play result — don't describe a completion if it was incomplete.
- Use player names naturally — not every sentence needs the full name.
- Build on the narrative. If a player has been hot, mention it. If there's a comeback, sell it.
- Keep individual play commentary concise: Mike's call should be 1-3 sentences, Tony's analysis 1-2 sentences.
- On truly epic moments (game-winners, pick-sixes, 4th quarter comebacks), let the commentary breathe — it can be longer.
- Return ONLY the JSON array. No markdown fences, no extra text.`;
}

// ============================================================================
// PUBLIC API: buildBatchPrompt
// ============================================================================

/**
 * Build a prompt for a batch of plays to be processed in a single API call.
 * Includes full game context, narrative state, and individual play details.
 */
export function buildBatchPrompt(
  plays: Array<{
    play: PlayResult;
    state: GameState;
    narrative: NarrativeSnapshot;
    excitement: number;
  }>,
  homeTeam: { name: string; abbreviation: string },
  awayTeam: { name: string; abbreviation: string },
): string {
  const firstState = plays[0]?.state;
  const lastState = plays[plays.length - 1]?.state;
  const lastNarrative = plays[plays.length - 1]?.narrative;

  let prompt = `## GAME: ${awayTeam.name} (${awayTeam.abbreviation}) at ${homeTeam.name} (${homeTeam.abbreviation})\n\n`;

  // Game context from the most recent state
  if (lastState) {
    prompt += `### Current Game State\n`;
    prompt += `- Score: ${awayTeam.abbreviation} ${lastState.awayScore} - ${homeTeam.abbreviation} ${lastState.homeScore}\n`;
    prompt += `- ${formatQuarter(lastState.quarter)}, ${formatClock(lastState.clock)} remaining\n`;
    prompt += `- Possession: ${lastState.possession === 'home' ? homeTeam.name : awayTeam.name}\n`;
    prompt += `- Timeouts: ${homeTeam.abbreviation} ${lastState.homeTimeouts}, ${awayTeam.abbreviation} ${lastState.awayTimeouts}\n\n`;
  }

  // Narrative context
  if (lastNarrative) {
    prompt += `### Narrative Context\n`;
    prompt += `- Momentum: ${describeMomentum(lastNarrative.momentum)}\n`;
    prompt += `- Overall Excitement: ${lastNarrative.excitement}/100\n`;
    prompt += `- Comeback Brewing: ${lastNarrative.isComebackBrewing ? 'YES' : 'No'}\n`;
    prompt += `- Clutch Moment: ${lastNarrative.isClutchMoment ? 'YES' : 'No'}\n`;
    prompt += `- Blowout: ${lastNarrative.isBlowout ? 'Yes' : 'No'}\n`;
    if (lastNarrative.isDominatingPerformance) {
      prompt += `- Dominating Performance: ${lastNarrative.isDominatingPerformance.player.name} (${lastNarrative.isDominatingPerformance.stat})\n`;
    }
    prompt += `\n### Active Storylines\n${describeNarrativeThreads(lastNarrative)}\n\n`;
  }

  // Individual plays
  prompt += `### Plays to Commentate (${plays.length} plays)\n\n`;

  for (let i = 0; i < plays.length; i++) {
    const { play, state, excitement } = plays[i];
    prompt += `---\n**Play ${i + 1}**\n`;
    prompt += `- Situation: ${formatDown(state.down)} & ${state.yardsToGo} at ${formatFieldPosition(state.ballPosition)}\n`;
    prompt += `- ${formatQuarter(state.quarter)}, ${formatClock(state.clock)}\n`;
    prompt += `- Score: ${awayTeam.abbreviation} ${state.awayScore} - ${homeTeam.abbreviation} ${state.homeScore}\n`;
    prompt += `- Result: ${formatPlayType(play)}, ${play.yardsGained >= 0 ? '+' : ''}${play.yardsGained} yards\n`;
    prompt += `- Excitement Target: ${excitement}/100\n`;

    if (play.passer) prompt += `- Passer: ${formatPlayerRef(play.passer)}\n`;
    if (play.rusher) prompt += `- Rusher: ${formatPlayerRef(play.rusher)}\n`;
    if (play.receiver) prompt += `- Receiver: ${formatPlayerRef(play.receiver)}\n`;
    if (play.defender) prompt += `- Key Defender: ${formatPlayerRef(play.defender)}\n`;

    if (play.isTouchdown) prompt += `- *** TOUCHDOWN ***\n`;
    if (play.isSafety) prompt += `- *** SAFETY ***\n`;
    if (play.isFirstDown) prompt += `- First Down\n`;

    if (play.turnover) {
      prompt += `- TURNOVER: ${play.turnover.type}`;
      if (play.turnover.returnedForTD) prompt += ' (RETURNED FOR TD!)';
      prompt += `\n`;
    }

    if (play.penalty && !play.penalty.declined) {
      prompt += `- PENALTY: ${play.penalty.description}\n`;
    }

    if (play.injury) {
      prompt += `- INJURY: ${play.injury.player.name} — ${play.injury.description} (${play.injury.severity})\n`;
    }

    if (play.scoring) {
      prompt += `- SCORING: ${play.scoring.type} by ${play.scoring.team === 'home' ? homeTeam.name : awayTeam.name} (+${play.scoring.points})\n`;
    }

    prompt += `\n`;
  }

  prompt += `Generate commentary for all ${plays.length} plays above. Return a JSON array with exactly ${plays.length} elements, one per play, in the same order.`;

  return prompt;
}

// ============================================================================
// PUBLIC API: buildPlayPrompt
// ============================================================================

/**
 * Build a prompt for a single play with full context including recent history.
 * More detailed than the batch format — used for high-importance plays.
 */
export function buildPlayPrompt(
  play: PlayResult,
  state: GameState,
  narrative: NarrativeSnapshot,
  recentPlays: PlayResult[],
  excitement: number,
  homeTeam: { name: string; abbreviation: string },
  awayTeam: { name: string; abbreviation: string },
): string {
  let prompt = `## GAME: ${awayTeam.name} (${awayTeam.abbreviation}) at ${homeTeam.name} (${homeTeam.abbreviation})\n\n`;

  // Full game context
  prompt += `### Game State\n`;
  prompt += `- Score: ${awayTeam.abbreviation} ${state.awayScore} - ${homeTeam.abbreviation} ${state.homeScore}\n`;
  prompt += `- ${formatQuarter(state.quarter)}, ${formatClock(state.clock)} remaining\n`;
  prompt += `- Possession: ${state.possession === 'home' ? homeTeam.name : awayTeam.name}\n`;
  prompt += `- ${formatDown(state.down)} & ${state.yardsToGo} at ${formatFieldPosition(state.ballPosition)}\n`;
  prompt += `- Timeouts: ${homeTeam.abbreviation} ${state.homeTimeouts}, ${awayTeam.abbreviation} ${state.awayTimeouts}\n`;
  prompt += `- Clock Running: ${state.isClockRunning ? 'Yes' : 'No'}\n`;
  if (state.twoMinuteWarning) prompt += `- Two-Minute Warning has been taken\n`;
  prompt += `\n`;

  // Narrative context
  prompt += `### Narrative Context\n`;
  prompt += `- Momentum: ${describeMomentum(narrative.momentum)}\n`;
  prompt += `- Overall Excitement: ${narrative.excitement}/100\n`;
  prompt += `- Comeback Brewing: ${narrative.isComebackBrewing ? 'YES — build this into the commentary' : 'No'}\n`;
  prompt += `- Clutch Moment: ${narrative.isClutchMoment ? 'YES — the stakes are HIGH' : 'No'}\n`;
  prompt += `- Blowout: ${narrative.isBlowout ? 'Yes — the game is getting out of hand' : 'No'}\n`;
  if (narrative.isDominatingPerformance) {
    prompt += `- Dominating Performance: ${narrative.isDominatingPerformance.player.name} is putting on a SHOW (${narrative.isDominatingPerformance.stat})\n`;
  }
  prompt += `\n### Active Storylines\n${describeNarrativeThreads(narrative)}\n\n`;

  // Recent plays for context
  if (recentPlays.length > 0) {
    prompt += `### Recent Plays (for reference/callbacks)\n`;
    for (let i = 0; i < recentPlays.length; i++) {
      const rp = recentPlays[i];
      prompt += `${i + 1}. ${formatPlayType(rp)}: ${rp.yardsGained >= 0 ? '+' : ''}${rp.yardsGained} yds`;
      if (rp.passer) prompt += ` (${rp.passer.name}`;
      if (rp.receiver) prompt += ` to ${rp.receiver.name}`;
      if (rp.passer) prompt += ')';
      if (rp.rusher && !rp.passer) prompt += ` (${rp.rusher.name})`;
      if (rp.isTouchdown) prompt += ' — TD!';
      if (rp.turnover) prompt += ` — TURNOVER (${rp.turnover.type})`;
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  // The play to commentate
  prompt += `### THIS PLAY (generate commentary for this)\n`;
  prompt += `- Result: ${formatPlayType(play)}, ${play.yardsGained >= 0 ? '+' : ''}${play.yardsGained} yards\n`;
  prompt += `- Excitement Target: ${excitement}/100\n`;

  if (play.passer) prompt += `- Passer: ${formatPlayerRef(play.passer)}\n`;
  if (play.rusher) prompt += `- Rusher: ${formatPlayerRef(play.rusher)}\n`;
  if (play.receiver) prompt += `- Receiver: ${formatPlayerRef(play.receiver)}\n`;
  if (play.defender) prompt += `- Key Defender: ${formatPlayerRef(play.defender)}\n`;

  if (play.isTouchdown) prompt += `- *** TOUCHDOWN ***\n`;
  if (play.isSafety) prompt += `- *** SAFETY ***\n`;
  if (play.isFirstDown) prompt += `- First Down\n`;

  if (play.turnover) {
    prompt += `- TURNOVER: ${play.turnover.type}`;
    if (play.turnover.returnYards > 0) prompt += `, returned ${play.turnover.returnYards} yards`;
    if (play.turnover.returnedForTD) prompt += ' — RETURNED FOR TOUCHDOWN!';
    prompt += `\n`;
  }

  if (play.penalty && !play.penalty.declined) {
    prompt += `- PENALTY: ${play.penalty.description}\n`;
  }

  if (play.injury) {
    prompt += `- INJURY: ${play.injury.player.name} (${play.injury.player.position}) — ${play.injury.description} (${play.injury.severity})\n`;
    prompt += `  Note: Be respectful about the injury. Express concern.\n`;
  }

  if (play.scoring) {
    prompt += `- SCORING: ${play.scoring.type} by ${play.scoring.team === 'home' ? homeTeam.name : awayTeam.name} (+${play.scoring.points})\n`;
  }

  prompt += `\nGenerate commentary for this single play. Return a JSON array with exactly 1 element.`;

  return prompt;
}
