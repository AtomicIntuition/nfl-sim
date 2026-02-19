export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { games, teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { GameViewer } from '@/components/game/game-viewer';
import { GameRecapPage } from './game-recap-page';
import { PregameView } from './pregame-view';
import type { Team, BoxScore, PlayerGameStats } from '@/lib/simulation/types';

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
    title = `LIVE: ${awayName} @ ${homeName}`;
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

  const homeTeam = homeTeamRows[0] ?? null;
  const awayTeam = awayTeamRows[0] ?? null;

  // Scheduled games get the pregame view with prediction widget
  if (game.status === 'scheduled') {
    return (
      <PregameView
        gameId={gameId}
        week={game.week}
        gameType={game.gameType}
        homeTeam={
          homeTeam
            ? {
                id: homeTeam.id,
                name: homeTeam.name,
                abbreviation: homeTeam.abbreviation,
                city: homeTeam.city,
                mascot: homeTeam.mascot,
                primaryColor: homeTeam.primaryColor,
              }
            : null
        }
        awayTeam={
          awayTeam
            ? {
                id: awayTeam.id,
                name: awayTeam.name,
                abbreviation: awayTeam.abbreviation,
                city: awayTeam.city,
                mascot: awayTeam.mascot,
                primaryColor: awayTeam.primaryColor,
              }
            : null
        }
      />
    );
  }

  // Completed games get the recap page with a replay toggle
  if (game.status === 'completed' && homeTeam && awayTeam) {
    const boxScoreData = game.boxScore as (BoxScore & { mvp?: PlayerGameStats }) | null;
    const mvpData = boxScoreData?.mvp ?? null;

    const mapTeam = (t: typeof homeTeam): Team => ({
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      city: t.city,
      mascot: t.mascot,
      conference: t.conference as Team['conference'],
      division: t.division as Team['division'],
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
      offenseRating: t.offenseRating,
      defenseRating: t.defenseRating,
      specialTeamsRating: t.specialTeamsRating,
      playStyle: t.playStyle as Team['playStyle'],
    });

    return (
      <GameRecapPage
        gameId={gameId}
        homeTeam={mapTeam(homeTeam)}
        awayTeam={mapTeam(awayTeam)}
        finalScore={{
          home: game.homeScore ?? 0,
          away: game.awayScore ?? 0,
        }}
        boxScore={boxScoreData ?? null}
        mvp={mvpData}
      />
    );
  }

  // Simulating / broadcasting games get the live viewer
  return <GameViewer gameId={gameId} />;
}
