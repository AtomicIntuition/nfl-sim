/**
 * Reset season data: wipe all seasons, games, game_events, standings, and predictions.
 * Keeps teams and players intact.
 *
 * Usage:
 *   npx tsx scripts/reset-season.ts          # Just reset
 *   npx tsx scripts/reset-season.ts --start  # Reset + trigger new season via API
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const autoStart = process.argv.includes('--start');

async function main() {
  const sql = postgres(DATABASE_URL!, { prepare: false });

  console.log('Resetting season data...');

  // Delete in order of foreign key dependencies
  await sql`DELETE FROM game_events`;
  console.log('  Cleared game_events');

  await sql`DELETE FROM predictions`;
  console.log('  Cleared predictions');

  await sql`DELETE FROM games`;
  console.log('  Cleared games');

  await sql`DELETE FROM standings`;
  console.log('  Cleared standings');

  await sql`DELETE FROM seasons`;
  console.log('  Cleared seasons');

  console.log('\nDone! All season data has been reset.');

  if (autoStart) {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const CRON_SECRET = process.env.CRON_SECRET ?? 'your-secret-here';
    console.log(`\nTriggering new season creation at ${APP_URL}/api/simulate ...`);

    try {
      const res = await fetch(`${APP_URL}/api/simulate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      console.log('Result:', JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to trigger simulate:', err);
      console.log('You can manually trigger: curl -X POST -H "Authorization: Bearer <CRON_SECRET>" <URL>/api/simulate');
    }
  } else {
    console.log('Trigger /api/simulate to create a new season with proper scheduling.');
    console.log('Or run with --start flag: npx tsx scripts/reset-season.ts --start');
  }

  await sql.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
