'use client';

import { useState, useEffect } from 'react';

interface KickoffCountdownProps {
  /** ISO timestamp of projected kickoff */
  scheduledAt: string;
}

export function KickoffCountdown({ scheduledAt }: KickoffCountdownProps) {
  const [remaining, setRemaining] = useState(() => {
    const ms = new Date(scheduledAt).getTime() - Date.now();
    return Math.max(0, ms);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const ms = new Date(scheduledAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduledAt]);

  if (remaining <= 0) {
    return (
      <p className="text-xs text-gold tracking-wider uppercase font-bold animate-pulse">
        Starting soon...
      </p>
    );
  }

  const totalSec = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;

  const timeStr = hours > 0
    ? `${hours}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${min}:${String(sec).padStart(2, '0')}`;

  return (
    <div className="text-center">
      <p className="text-xs text-text-muted tracking-wider uppercase mb-1">
        Kickoff In
      </p>
      <p className="font-mono text-2xl sm:text-3xl font-black tabular-nums text-gold">
        {timeStr}
      </p>
    </div>
  );
}
