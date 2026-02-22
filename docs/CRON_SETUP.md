# External Cron Setup

GridIron Live requires periodic calls to `POST /api/simulate` to advance the simulation. Vercel's free tier only provides 1 daily cron, so you need an external cron service for 24/7 operation.

## Option 1: cron-job.org (Recommended)

Free tier supports 1-minute intervals.

1. Sign up at [cron-job.org](https://cron-job.org)
2. Create a new cron job:
   - **URL**: `https://YOUR_APP_URL/api/simulate`
   - **Method**: POST
   - **Schedule**: Every 1 minute (`* * * * *`)
3. Add a custom header:
   - **Name**: `Authorization`
   - **Value**: `Bearer YOUR_CRON_SECRET`
4. Save and enable the job

## Option 2: UptimeRobot

Free tier supports 5-minute intervals (also provides uptime monitoring).

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add a new monitor:
   - **Monitor Type**: HTTP(s) - Keyword
   - **URL**: `https://YOUR_APP_URL/api/simulate`
   - **Monitoring Interval**: 5 minutes
3. Note: UptimeRobot sends GET requests. The simulate endpoint accepts both GET and POST.
4. Add the Authorization header in the monitor's advanced settings.

## Option 3: Chrome Extension (Bundled)

The repo includes a Chrome extension at `extension/` that pings the simulate endpoint every 30 seconds while Chrome is running. See the extension README for setup.

## Verifying It Works

After setting up your cron, you can verify it's working by checking the simulate endpoint response:

```bash
curl -X POST https://YOUR_APP_URL/api/simulate \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected responses:
- `{"action":"idle","message":"..."}` — Nothing to do right now
- `{"action":"start_game",...}` — A new game is being simulated
- `{"action":"advance_week",...}` — Moving to the next week
- `{"action":"create_season",...}` — Creating a new season

## Timing

The simulation uses these intervals between events:
- **Between games (same week)**: 15 minutes
- **Between weeks**: 30 minutes
- **Between seasons**: 30 minutes
- **Game broadcast duration**: ~30-45 minutes

A typical 18-week season with playoffs takes roughly 2-3 days of real time with 1-minute cron intervals.
