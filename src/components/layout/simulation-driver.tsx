'use client';

import { useEffect, useRef } from 'react';

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Invisible component that drives the simulation forward.
 * Polls /api/simulate periodically while the user has the app open.
 * The simulation only advances when someone is watching — which is
 * exactly the right behavior for a live broadcast platform.
 */
export function SimulationDriver() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
    if (!cronSecret) return;

    async function tick() {
      // Don't tick if the tab is hidden (save resources)
      if (!isVisibleRef.current) return;

      try {
        await fetch('/api/simulate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cronSecret}`,
          },
        });
      } catch {
        // Silently ignore — will retry on next interval
      }
    }

    // Handle tab visibility
    function onVisibilityChange() {
      isVisibleRef.current = !document.hidden;
      // If tab becomes visible again, tick immediately
      if (isVisibleRef.current) {
        tick();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    // Initial tick after a short delay (let the page render first)
    const startTimer = setTimeout(tick, 3000);
    intervalRef.current = setInterval(tick, POLL_INTERVAL);

    return () => {
      clearTimeout(startTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null; // Renders nothing
}
