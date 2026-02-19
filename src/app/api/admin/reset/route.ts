export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  gameEvents,
  predictions,
  games,
  standings,
  seasons,
} from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * POST /api/admin/reset
 *
 * Wipes all season data (seasons, games, events, standings, predictions)
 * and optionally triggers a new season creation.
 *
 * Requires CRON_SECRET authorization.
 *
 * Query params:
 *   ?start=true  - Also trigger /api/simulate to create a fresh season
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Delete in FK dependency order
    await db.delete(gameEvents);
    await db.delete(predictions);
    await db.delete(games);
    await db.delete(standings);
    await db.delete(seasons);

    const autoStart = request.nextUrl.searchParams.get('start') === 'true';
    let seasonResult = null;

    if (autoStart) {
      // Trigger the simulate endpoint to create a new season
      const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
      const host = request.headers.get('host') ?? 'localhost:3000';
      const simulateUrl = `${protocol}://${host}/api/simulate`;

      const res = await fetch(simulateUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      seasonResult = await res.json();
    }

    return NextResponse.json({
      message: 'All season data wiped successfully.',
      tablesCleared: [
        'game_events',
        'predictions',
        'games',
        'standings',
        'seasons',
      ],
      seasonCreated: autoStart ? seasonResult : null,
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json(
      { error: 'Reset failed', details: String(error) },
      { status: 500 }
    );
  }
}
