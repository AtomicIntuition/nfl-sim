// GridBlitz Keep-Alive Service Worker
// Pings /api/simulate every 30s to keep the simulation advancing.

const ALARM_NAME = 'gridblitz-keepalive';
const ALARM_PERIOD_MINUTES = 0.5; // 30 seconds (Chrome MV3 minimum)

// ── Setup alarm on install/startup ──────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  console.log('[GridBlitz] Keep-alive alarm created');
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

// ── Handle alarm ────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  try {
    const { siteUrl, cronSecret } = await chrome.storage.sync.get(['siteUrl', 'cronSecret']);

    if (!siteUrl || !cronSecret) {
      await chrome.storage.local.set({
        lastError: 'Missing siteUrl or cronSecret. Open extension options to configure.',
        lastPing: new Date().toISOString(),
      });
      return;
    }

    const baseUrl = siteUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json().catch(() => ({}));

    await chrome.storage.local.set({
      lastPing: new Date().toISOString(),
      lastAction: data.action ?? data.status ?? 'unknown',
      lastError: res.ok ? null : `HTTP ${res.status}`,
      lastResponse: JSON.stringify(data).slice(0, 500),
    });
  } catch (err) {
    await chrome.storage.local.set({
      lastPing: new Date().toISOString(),
      lastError: err.message ?? 'Network error',
    });
  }
});
