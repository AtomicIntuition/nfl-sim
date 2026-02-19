export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { games, teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { GameViewer } from './game-viewer';

// ============================================================
// Dynamic metadata for OG tags
// ============================================================

interface PageProps {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { gameId } = await params;

  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) {
    return {
      title: 'Game Not Found',
    };
  }

  const game = gameRows[0];

  const [homeTeamRows, awayTeamRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
    db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
  ]);

  const homeTeam = homeTeamRows[0];
  const awayTeam = awayTeamRows[0];

  const homeName = homeTeam?.abbreviation ?? 'HOME';
  const awayName = awayTeam?.abbreviation ?? 'AWAY';

  const isLive = game.status === 'broadcasting';
  const isCompleted = game.status === 'completed';

  let title: string;
  let description: string;

  if (isLive) {
    title = `LIVE: ${awayName} ${game.awayScore ?? 0} @ ${homeName} ${game.homeScore ?? 0}`;
    description = `Watch ${awayTeam?.name ?? 'Away'} at ${homeTeam?.name ?? 'Home'} live on GridIron Live. Real-time play-by-play simulation.`;
  } else if (isCompleted) {
    title = `${awayName} ${game.awayScore ?? 0}, ${homeName} ${game.homeScore ?? 0} - Final`;
    description = `Final score: ${awayTeam?.name ?? 'Away'} ${game.awayScore ?? 0}, ${homeTeam?.name ?? 'Home'} ${game.homeScore ?? 0}. Replay the full game on GridIron Live.`;
  } else {
    title = `${awayName} @ ${homeName} - Preview`;
    description = `${awayTeam?.name ?? 'Away'} vs ${homeTeam?.name ?? 'Home'} coming up on GridIron Live. Make your predictions now.`;
  }

  return {
    title,
    description,
    openGraph: {
      title: `${title} | GridIron Live`,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | GridIron Live`,
      description,
    },
  };
}

// ============================================================
// Page component
// ============================================================

export default async function GamePage({ params }: PageProps) {
  const { gameId } = await params;

  // Verify the game exists (server-side check before rendering client component)
  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) {
    notFound();
  }

  const game = gameRows[0];

  // Fetch team data for initial render
  const [homeTeamRows, awayTeamRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, game.homeTeamId)).limit(1),
    db.select().from(teams).where(eq(teams.id, game.awayTeamId)).limit(1),
  ]);

  const initialData = {
    id: game.id,
    status: game.status,
    gameType: game.gameType,
    week: game.week,
    homeTeam: homeTeamRows[0]
      ? {
          id: homeTeamRows[0].id,
          name: homeTeamRows[0].name,
          abbreviation: homeTeamRows[0].abbreviation,
          city: homeTeamRows[0].city,
          mascot: homeTeamRows[0].mascot,
          primaryColor: homeTeamRows[0].primaryColor,
          secondaryColor: homeTeamRows[0].secondaryColor,
        }
      : null,
    awayTeam: awayTeamRows[0]
      ? {
          id: awayTeamRows[0].id,
          name: awayTeamRows[0].name,
          abbreviation: awayTeamRows[0].abbreviation,
          city: awayTeamRows[0].city,
          mascot: awayTeamRows[0].mascot,
          primaryColor: awayTeamRows[0].primaryColor,
          secondaryColor: awayTeamRows[0].secondaryColor,
        }
      : null,
    homeScore: game.homeScore ?? 0,
    awayScore: game.awayScore ?? 0,
    isFeatured: game.isFeatured,
    broadcastStartedAt: game.broadcastStartedAt?.toISOString() ?? null,
  };

  return <GameViewer gameId={gameId} initialData={initialData} />;
}
