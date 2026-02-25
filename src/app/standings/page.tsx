export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { seasons, teams, standings } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { StandingsTable } from '@/components/schedule/standings-table';
import { formatSeasonStatus } from '@/lib/utils/formatting';
import type { DivisionStandings, TeamStanding } from '@/lib/simulation/types';

export const metadata: Metadata = {
  title: 'Standings | GridBlitz',
  description: 'Division and conference standings for the current GridBlitz season.',
};

export default async function StandingsPage() {
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const season = seasonRows[0] ?? null;

  if (!season) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">No Active Season</h1>
            <p className="text-text-secondary">
              Standings will appear once a season begins.
            </p>
          </div>
        </main>
      </>
    );
  }

  const allTeams = await db.select().from(teams);
  const teamMap = new Map(allTeams.map((t) => [t.id, t]));

  const standingRows = await db
    .select()
    .from(standings)
    .where(eq(standings.seasonId, season.id));

  const divisionMap: Record<string, Record<string, TeamStanding[]>> = {};

  for (const s of standingRows) {
    const team = teamMap.get(s.teamId);
    const conf = team?.conference ?? 'Unknown';
    const div = team?.division ?? 'Unknown';
    if (!divisionMap[conf]) divisionMap[conf] = {};
    if (!divisionMap[conf][div]) divisionMap[conf][div] = [];
    divisionMap[conf][div].push({
      teamId: s.teamId,
      team: team
        ? {
            id: team.id,
            name: team.name,
            abbreviation: team.abbreviation,
            city: team.city,
            mascot: team.mascot,
            conference: team.conference,
            division: team.division,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
            offenseRating: team.offenseRating,
            defenseRating: team.defenseRating,
            specialTeamsRating: team.specialTeamsRating,
            playStyle: team.playStyle,
          }
        : undefined,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      divisionWins: s.divisionWins ?? 0,
      divisionLosses: s.divisionLosses ?? 0,
      conferenceWins: s.conferenceWins ?? 0,
      conferenceLosses: s.conferenceLosses ?? 0,
      pointsFor: s.pointsFor ?? 0,
      pointsAgainst: s.pointsAgainst ?? 0,
      streak: s.streak ?? 'W0',
      clinched: (s.clinched as TeamStanding['clinched']) ?? null,
      playoffSeed: s.playoffSeed ?? null,
    });
  }

  const divisionStandings: DivisionStandings[] = [];
  for (const conf of ['AFC', 'NFC'] as const) {
    for (const div of ['North', 'South', 'East', 'West'] as const) {
      const divTeams = divisionMap[conf]?.[div] ?? [];
      if (divTeams.length > 0) {
        divisionStandings.push({
          conference: conf,
          division: div,
          teams: divTeams,
        });
      }
    }
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-midnight max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
            Standings
          </h1>
          <p className="text-text-secondary">
            Season {season.seasonNumber} &mdash;{' '}
            {formatSeasonStatus(season.status, season.currentWeek)}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {['AFC', 'NFC'].map((conf) => (
            <div key={conf}>
              <h2 className="text-lg font-bold text-text-primary mb-4 tracking-wider">
                {conf}
              </h2>
              <div className="space-y-4">
                {divisionStandings
                  .filter((ds) => ds.conference === conf)
                  .map((ds) => (
                    <StandingsTable
                      key={`${ds.conference}-${ds.division}`}
                      standings={ds}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
