export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { teams, standings, seasons } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { TeamLogo } from '@/components/team/team-logo';
import { formatRecord } from '@/lib/utils/formatting';
import { ROUTES } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: 'Teams | GridBlitz',
  description: 'All 32 NFL teams in the GridBlitz simulation.',
};

export default async function TeamsPage() {
  const allTeams = await db.select().from(teams);

  // Get latest season standings
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const season = seasonRows[0] ?? null;

  let standingsMap = new Map<string, { wins: number; losses: number; ties: number }>();

  if (season) {
    const standingRows = await db
      .select()
      .from(standings)
      .where(eq(standings.seasonId, season.id));

    for (const s of standingRows) {
      standingsMap.set(s.teamId, {
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
      });
    }
  }

  // Group by conference and division
  const conferences = ['AFC', 'NFC'] as const;
  const divisions = ['North', 'South', 'East', 'West'] as const;

  return (
    <>
      <Header />
      <main className="min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-text-primary mb-8">All 32 Teams</h1>

        {conferences.map((conf) => (
          <div key={conf} className="mb-10">
            <h2 className="text-lg font-bold text-gold tracking-wider uppercase mb-4">
              {conf}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {divisions.map((div) => {
                const divTeams = allTeams
                  .filter((t) => t.conference === conf && t.division === div)
                  .sort((a, b) => {
                    const aRecord = standingsMap.get(a.id);
                    const bRecord = standingsMap.get(b.id);
                    return (bRecord?.wins ?? 0) - (aRecord?.wins ?? 0);
                  });

                return (
                  <div key={`${conf}-${div}`}>
                    <h3 className="text-xs font-bold text-text-muted tracking-wider uppercase mb-2">
                      {conf} {div}
                    </h3>
                    <div className="space-y-2">
                      {divTeams.map((team) => {
                        const record = standingsMap.get(team.id);
                        return (
                          <Link key={team.id} href={ROUTES.TEAM(team.id)}>
                            <Card
                              variant="default"
                              padding="sm"
                              className="hover:border-border-bright transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <TeamLogo
                                  abbreviation={team.abbreviation}
                                  teamName={team.name}
                                  size={40}
                                  className="w-10 h-10 object-contain flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold truncate">
                                    {team.city} {team.mascot}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {team.abbreviation}
                                  </p>
                                </div>
                                {record && (
                                  <span className="text-sm font-mono font-bold tabular-nums text-text-secondary">
                                    {formatRecord(record.wins, record.losses, record.ties)}
                                  </span>
                                )}
                              </div>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
