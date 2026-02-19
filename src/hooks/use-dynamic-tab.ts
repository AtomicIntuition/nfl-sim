'use client';

import { useEffect, useRef } from 'react';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface TabInfo {
  awayAbbrev: string;
  homeAbbrev: string;
  awayScore: number;
  homeScore: number;
  /** e.g. "Q3 12:45" or "FINAL" or "HALFTIME" */
  statusText: string;
}

/**
 * Dynamically updates the browser tab title and favicon
 * to show team logos + live score while watching a game.
 *
 * Restores original title/favicon on unmount.
 */
export function useDynamicTab(info: TabInfo | null) {
  const originalTitle = useRef<string>('');
  const originalFavicon = useRef<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Save originals on first mount
    originalTitle.current = document.title;
    const existingIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    originalFavicon.current = existingIcon?.href ?? '/favicon.ico';

    return () => {
      // Restore on unmount
      document.title = originalTitle.current;
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (icon) {
        icon.href = originalFavicon.current;
      }
    };
  }, []);

  useEffect(() => {
    if (!info) return;

    const { awayAbbrev, homeAbbrev, awayScore, homeScore, statusText } = info;

    // ── Update title ──
    document.title = `${awayAbbrev} ${awayScore} - ${homeAbbrev} ${homeScore} | ${statusText}`;

    // ── Draw combined favicon ──
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const awayLogo = new Image();
    const homeLogo = new Image();
    awayLogo.crossOrigin = 'anonymous';
    homeLogo.crossOrigin = 'anonymous';

    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded < 2) return;

      ctx.clearRect(0, 0, 32, 32);

      // Draw away logo on left half
      ctx.drawImage(awayLogo, 0, 0, 16, 16);
      // Draw home logo on right half
      ctx.drawImage(homeLogo, 16, 0, 16, 16);

      // Draw scores below logos
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(awayScore), 8, 28);
      ctx.fillText(String(homeScore), 24, 28);

      // Thin separator line
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(16, 32);
      ctx.stroke();

      // Apply as favicon
      const dataUrl = canvas.toDataURL('image/png');
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.type = 'image/png';
      link.href = dataUrl;
    };

    awayLogo.onload = onLoad;
    homeLogo.onload = onLoad;

    // Use smaller size for faster loading
    awayLogo.src = getTeamLogoUrl(awayAbbrev, 100);
    homeLogo.src = getTeamLogoUrl(homeAbbrev, 100);
  }, [info?.awayAbbrev, info?.homeAbbrev, info?.awayScore, info?.homeScore, info?.statusText]);
}
