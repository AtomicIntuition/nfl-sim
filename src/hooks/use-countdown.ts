'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export function useCountdown(
  initialSeconds: number,
  isRunning: boolean
): {
  seconds: number;
  formatted: string;
  isExpired: boolean;
} {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync with external initial value changes (e.g., new play updates the clock)
  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  // Run the countdown when active
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isRunning || seconds <= 0) return;

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, seconds <= 0]);

  const formatTime = useCallback((secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    seconds,
    formatted: formatTime(seconds),
    isExpired: seconds <= 0,
  };
}
