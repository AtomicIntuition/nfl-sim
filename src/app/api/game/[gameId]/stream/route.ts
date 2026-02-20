import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { games, gameEvents, seasons, teams } from '@/lib/db/schema';
import { eq, asc, and, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE streaming endpoint for live game broadcast.
 *
 * The stream supports three scenarios:
 *   1. Joining from the beginning -- all events stream with real-time delays
 *   2. Mid-game join -- catchup data is sent immediately, then live events stream
 *   3. Post-game join -- all events sent as catchup, then game_over
 *
 * Protocol:
 *   - Messages are sent as `data: {json}\n\n`
 *   - Message types: catchup, play, game_over, error
 *   - Heartbeat pings every 15 seconds to keep connection alive
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  // Fetch the game
  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'Game not found' })}\n\n`,
      {
        status: 404,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      }
    );
  }

  const game = gameRows[0];

  // Fetch all events for this game ordered by event number
  const events = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(asc(gameEvents.eventNumber));

  if (events.length === 0 && game.status === 'scheduled') {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'Game has not started yet' })}\n\n`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      }
    );
  }

  // Determine timing based on broadcast start
  const broadcastStartedAt = game.broadcastStartedAt
    ? new Date(game.broadcastStartedAt).getTime()
    : null;
  const now = Date.now();
  const elapsedMs = broadcastStartedAt ? now - broadcastStartedAt : 0;

  // Partition events into catchup (already happened) and future (to stream live)
  let catchupEvents: typeof events = [];
  let futureEvents: typeof events = [];

  if (game.status === 'completed') {
    // Game is over -- everything is catchup
    catchupEvents = events;
    futureEvents = [];
  } else if (broadcastStartedAt && elapsedMs > 0) {
    // Mid-game join -- split events based on elapsed time
    for (const event of events) {
      if (event.displayTimestamp <= elapsedMs) {
        catchupEvents.push(event);
      } else {
        futureEvents.push(event);
      }
    }
  } else {
    // Joining from the very beginning
    futureEvents = events;
  }

  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send an SSE message
      function send(data: Record<string, unknown>): boolean {
        if (abortSignal.aborted) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          return true;
        } catch {
          return false;
        }
      }

      // Helper to sleep with abort awareness
      function sleep(ms: number): Promise<boolean> {
        return new Promise((resolve) => {
          if (abortSignal.aborted) {
            resolve(false);
            return;
          }
          const timer = setTimeout(() => {
            resolve(!abortSignal.aborted);
          }, ms);
          abortSignal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve(false);
            },
            { once: true }
          );
        });
      }

      // Heartbeat interval to keep the connection alive
      const heartbeatInterval = setInterval(() => {
        if (abortSignal.aborted) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15_000);

      // Safety close timer: gracefully tell client to reconnect before Vercel's 300s hard limit
      const SAFETY_CLOSE_MS = 270_000; // 270s = 30s before 300s timeout
      const safetyTimer = setTimeout(() => {
        if (!abortSignal.aborted) {
          send({ type: 'reconnect' });
          clearInterval(heartbeatInterval);
          try { controller.close(); } catch { /* already closed */ }
        }
      }, SAFETY_CLOSE_MS);

      // Clean up all timers when client disconnects
      abortSignal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        clearTimeout(safetyTimer);
      }, { once: true });

      try {
        // ---- Step 1: Send catchup data ----
        if (catchupEvents.length > 0) {
          const lastCatchupEvent = catchupEvents[catchupEvents.length - 1];
          const ok = send({
            type: 'catchup',
            events: catchupEvents.map((e) => ({
              eventNumber: e.eventNumber,
              playResult: e.playResult,
              commentary: e.commentary,
              gameState: e.gameState,
              narrativeContext: e.narrativeContext,
              timestamp: e.displayTimestamp,
              driveNumber: (e.playResult as Record<string, unknown>)?.driveNumber ?? 0,
            })),
            gameState: lastCatchupEvent.gameState,
          });
          if (!ok) {
            clearInterval(heartbeatInterval);
            controller.close();
            return;
          }
        }

        // ---- Step 2: Stream future events with timing delays ----
        if (futureEvents.length > 0) {
          let lastTimestamp = catchupEvents.length > 0
            ? catchupEvents[catchupEvents.length - 1].displayTimestamp
            : 0;

          // If joining from the beginning, account for elapsed real time
          const streamStartTime = Date.now();
          const baseElapsed = broadcastStartedAt
            ? streamStartTime - broadcastStartedAt
            : 0;

          for (let i = 0; i < futureEvents.length; i++) {
            if (abortSignal.aborted) break;

            const event = futureEvents[i];

            // Calculate delay: time between this event and the last one
            // For the first future event after catchup, we need the gap from
            // real elapsed time to the event's display timestamp
            let delayMs: number;

            if (broadcastStartedAt) {
              // Calculate when this event should fire relative to now
              const eventAbsoluteTime = broadcastStartedAt + event.displayTimestamp;
              const currentTime = Date.now();
              delayMs = Math.max(0, eventAbsoluteTime - currentTime);
            } else {
              // No broadcast start time -- use inter-event spacing
              delayMs = Math.max(0, event.displayTimestamp - lastTimestamp);
            }

            // Cap the max delay to prevent extraordinarily long waits
            delayMs = Math.min(delayMs, 10_000);

            if (delayMs > 0) {
              const alive = await sleep(delayMs);
              if (!alive) break;
            }

            const ok = send({
              type: 'play',
              event: {
                eventNumber: event.eventNumber,
                playResult: event.playResult,
                commentary: event.commentary,
                gameState: event.gameState,
                narrativeContext: event.narrativeContext,
                timestamp: event.displayTimestamp,
                driveNumber: (event.playResult as Record<string, unknown>)?.driveNumber ?? 0,
              },
            });

            if (!ok) break;
            lastTimestamp = event.displayTimestamp;
          }
        }

        // ---- Step 3: Send game_over message ----
        if (!abortSignal.aborted && events.length > 0) {
          // Small pause before game over for dramatic effect
          await sleep(1500);

          send({
            type: 'game_over',
            boxScore: game.boxScore ?? null,
            finalScore: {
              home: game.homeScore ?? 0,
              away: game.awayScore ?? 0,
            },
            mvp: (game.boxScore as Record<string, unknown>)?.mvp ?? null
          });

          // ---- Step 4: Send intermission message with next game info ----
          if (!abortSignal.aborted) {
            await sleep(2000);

            try {
              // Find the current season
              const seasonRows = await db
                .select()
                .from(seasons)
                .orderBy(desc(seasons.seasonNumber))
                .limit(1);

              if (seasonRows.length > 0) {
                const season = seasonRows[0];
                // Find next scheduled game in the current week
                const nextGames = await db
                  .select()
                  .from(games)
                  .where(
                    and(
                      eq(games.seasonId, season.id),
                      eq(games.week, season.currentWeek),
                      eq(games.status, 'scheduled')
                    )
                  )
                  .limit(1);

                if (nextGames.length > 0) {
                  const nextGame = nextGames[0];
                  // Hydrate team abbreviations for the message
                  const [homeTeamRows, awayTeamRows] = await Promise.all([
                    db.select().from(teams).where(eq(teams.id, nextGame.homeTeamId)).limit(1),
                    db.select().from(teams).where(eq(teams.id, nextGame.awayTeamId)).limit(1),
                  ]);
                  const homeAbbr = homeTeamRows[0]?.abbreviation ?? '???';
                  const awayAbbr = awayTeamRows[0]?.abbreviation ?? '???';

                  send({
                    type: 'intermission',
                    message: `Up next: ${awayAbbr} @ ${homeAbbr}`,
                    nextGameId: nextGame.id,
                    countdown: 900, // 15 min intermission
                  });
                } else {
                  send({
                    type: 'intermission',
                    message: 'Week complete',
                    nextGameId: null,
                    countdown: 0,
                  });
                }
              }
            } catch {
              // Non-critical — intermission info is optional
            }
          }
        }

        clearInterval(heartbeatInterval);
        clearTimeout(safetyTimer);
        controller.close();
      } catch (error) {
        clearInterval(heartbeatInterval);
        clearTimeout(safetyTimer);
        console.error('SSE stream error:', error);
        try {
          send({ type: 'error', message: 'Stream error occurred' });
          controller.close();
        } catch {
          // Controller may already be closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
