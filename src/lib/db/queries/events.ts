import { db } from "@/lib/db";
import { gameEvents } from "@/lib/db/schema";
import { eq, asc, gt } from "drizzle-orm";

/** Get all events for a game in order */
export async function getGameEvents(gameId: string) {
  return db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(asc(gameEvents.eventNumber));
}

/** Get events after a specific event number (for polling fallback) */
export async function getEventsAfter(gameId: string, afterEventNumber: number) {
  return db
    .select()
    .from(gameEvents)
    .where(
      eq(gameEvents.gameId, gameId)
    )
    .orderBy(asc(gameEvents.eventNumber))
    .then((results) =>
      results.filter((e) => e.eventNumber > afterEventNumber)
    );
}

/** Store game events in batch */
export async function storeGameEvents(
  events: Array<{
    gameId: string;
    eventNumber: number;
    eventType: string;
    playResult: unknown;
    commentary: unknown;
    gameState: unknown;
    narrativeContext: unknown;
    displayTimestamp: number;
  }>
) {
  if (events.length === 0) return;

  // Insert in batches of 50 to avoid oversized queries
  const batchSize = 50;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await db.insert(gameEvents).values(batch);
  }
}

/** Get the total event count for a game */
export async function getEventCount(gameId: string): Promise<number> {
  const result = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId));
  return result.length;
}

/** Get the last event for a game */
export async function getLastEvent(gameId: string) {
  const events = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(asc(gameEvents.eventNumber));

  return events.length > 0 ? events[events.length - 1] : null;
}
