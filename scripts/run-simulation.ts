/**
 * Local development simulation runner.
 * Calls /api/simulate every INTERVAL_MS to drive the season forward automatically.
 *
 * Usage: npx tsx scripts/run-simulation.ts
 */

const API_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? 'your-secret-here';
const INTERVAL_MS = 15_000; // 15 seconds for faster local dev (production would be 2 min)

async function tick() {
  const timestamp = new Date().toLocaleTimeString();
  try {
    const res = await fetch(`${API_URL}/api/simulate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    const action = data.action ?? 'unknown';

    // Color-code output by action type
    switch (action) {
      case 'create_season':
        console.log(`\x1b[33m[${timestamp}]\x1b[0m 🏈 ${data.message}`);
        break;
      case 'start_game':
        console.log(`\x1b[32m[${timestamp}]\x1b[0m 🎬 ${data.message} (${data.finalScore})`);
        break;
      case 'complete_week':
        console.log(`\x1b[36m[${timestamp}]\x1b[0m 📊 ${data.message}`);
        break;
      case 'advance_week':
        console.log(`\x1b[35m[${timestamp}]\x1b[0m ➡️  ${data.message}`);
        break;
      case 'season_complete':
        console.log(`\x1b[33m[${timestamp}]\x1b[0m 🏆 ${data.message}`);
        break;
      case 'idle':
        // Keep idle messages quieter
        process.stdout.write(`\x1b[90m[${timestamp}] ⏳ ${data.message}\x1b[0m\r`);
        return; // Don't print newline for idle
      default:
        console.log(`[${timestamp}] ${action}: ${data.message ?? JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error(`\x1b[31m[${timestamp}] Error: ${err}\x1b[0m`);
  }
}

console.log('');
console.log('  ╔══════════════════════════════════════════╗');
console.log('  ║     🏈 GridBlitz - Simulation Runner  ║');
console.log('  ╠══════════════════════════════════════════╣');
console.log(`  ║  API:      ${API_URL.padEnd(29)}║`);
console.log(`  ║  Interval: ${String(INTERVAL_MS / 1000 + 's').padEnd(29)}║`);
console.log('  ║  Press Ctrl+C to stop                    ║');
console.log('  ╚══════════════════════════════════════════╝');
console.log('');

// Run immediately, then on interval
tick();
setInterval(tick, INTERVAL_MS);
