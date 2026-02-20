import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userScores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user?userId=xxx
 *
 * Returns the user's display name and score info.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(userScores)
    .where(eq(userScores.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      userId: rows[0].userId,
      displayName: rows[0].displayName,
      totalPoints: rows[0].totalPoints,
      rank: rows[0].rank,
    },
  });
}

/**
 * POST /api/user
 *
 * Set or update the user's display name.
 * Body: { displayName: string }
 * Header: x-user-id: string
 */
export async function POST(request: NextRequest) {
  const userId =
    request.headers.get('x-user-id') ??
    request.cookies.get('userId')?.value;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 401 });
  }

  const body = await request.json();
  const { displayName } = body;

  if (!displayName || typeof displayName !== 'string') {
    return NextResponse.json(
      { error: 'displayName is required' },
      { status: 400 },
    );
  }

  // Sanitize: trim, limit length, strip non-printable chars
  const cleaned = displayName.trim().replace(/[^\x20-\x7E]/g, '').slice(0, 30);
  if (cleaned.length < 2) {
    return NextResponse.json(
      { error: 'Display name must be at least 2 characters' },
      { status: 400 },
    );
  }

  // Check if user score row exists
  const existing = await db
    .select()
    .from(userScores)
    .where(eq(userScores.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userScores)
      .set({ displayName: cleaned })
      .where(eq(userScores.userId, userId));
  } else {
    // Create a fresh user score entry with the display name
    await db.insert(userScores).values({
      userId,
      displayName: cleaned,
      totalPoints: 0,
      correctPredictions: 0,
      totalPredictions: 0,
      currentStreak: 0,
      bestStreak: 0,
      rank: 0,
    });
  }

  return NextResponse.json({ displayName: cleaned });
}
