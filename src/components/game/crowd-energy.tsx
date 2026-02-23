'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { CrowdReaction } from '@/lib/simulation/types';

// ── Props ────────────────────────────────────────────────────

interface CrowdEnergyProps {
  /** Crowd excitement level, 0-100. */
  excitement: number;
  /** Current crowd reaction. */
  crowdReaction: CrowdReaction;
  /** Compact mode — mid-height bar with label row */
  compact?: boolean;
}

// ── Constants ────────────────────────────────────────────────

const BAR_COUNT = 32;
const ANIMATION_FPS = 30;
const FRAME_INTERVAL = 1000 / ANIMATION_FPS;

// ── Color helpers ────────────────────────────────────────────

/**
 * Returns an HSL color string based on the excitement level.
 * Cool blues (quiet) -> warm oranges (loud) -> hot reds (roaring).
 */
function getBarColor(excitement: number, barIntensity: number): string {
  const intensity = (excitement / 100) * barIntensity;

  if (intensity < 0.3) {
    // Cool blues
    const hue = 210 + (1 - intensity / 0.3) * 20; // 210-230
    const saturation = 50 + intensity * 100;
    const lightness = 30 + intensity * 60;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  if (intensity < 0.65) {
    // Warm oranges / yellows
    const t = (intensity - 0.3) / 0.35;
    const hue = 45 - t * 15; // 45 -> 30
    const saturation = 70 + t * 20;
    const lightness = 45 + t * 15;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  // Hot reds
  const t = (intensity - 0.65) / 0.35;
  const hue = 15 - t * 15; // 15 -> 0
  const saturation = 80 + t * 20;
  const lightness = 50 + t * 10;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Returns animation parameters per crowd reaction type:
 * - speed: how fast bars fluctuate
 * - chaos: how randomly bars differ from each other
 * - baseAmplitude: minimum bar height multiplier
 */
function getReactionParams(reaction: CrowdReaction): {
  speed: number;
  chaos: number;
  baseAmplitude: number;
} {
  switch (reaction) {
    case 'roar':
      return { speed: 2.5, chaos: 0.8, baseAmplitude: 0.7 };
    case 'cheer':
      return { speed: 1.8, chaos: 0.6, baseAmplitude: 0.5 };
    case 'gasp':
      return { speed: 3.0, chaos: 0.9, baseAmplitude: 0.4 };
    case 'groan':
      return { speed: 1.2, chaos: 0.5, baseAmplitude: 0.3 };
    case 'murmur':
      return { speed: 0.6, chaos: 0.3, baseAmplitude: 0.15 };
    case 'silence':
      return { speed: 0.3, chaos: 0.15, baseAmplitude: 0.05 };
    default:
      return { speed: 1.0, chaos: 0.4, baseAmplitude: 0.2 };
  }
}

function getReactionLabel(reaction: CrowdReaction): string {
  switch (reaction) {
    case 'roar':
      return 'CROWD ROAR';
    case 'cheer':
      return 'CHEERING';
    case 'gasp':
      return 'CROWD GASP';
    case 'groan':
      return 'CROWD GROAN';
    case 'murmur':
      return 'MURMURING';
    case 'silence':
      return 'SILENCE';
    default:
      return 'CROWD';
  }
}

function getReactionIcon(reaction: CrowdReaction): string {
  switch (reaction) {
    case 'roar': return '\u{1F525}';    // fire
    case 'cheer': return '\u{1F389}';   // party popper
    case 'gasp': return '\u{1F62E}';    // open mouth
    case 'groan': return '\u{1F614}';   // pensive
    case 'murmur': return '\u{1F4AC}';  // speech bubble
    case 'silence': return '\u{1F910}'; // zipper mouth
    default: return '\u{1F3DF}';        // stadium
  }
}

// ── Component ────────────────────────────────────────────────

export function CrowdEnergy({ excitement, crowdReaction, compact = false }: CrowdEnergyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  // Stable seed values for each bar so they oscillate uniquely
  const barSeeds = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => i * 1.37 + 0.42),
    []
  );

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const elapsed = timestamp - lastFrameRef.current;
      if (elapsed < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameRef.current = timestamp;
      timeRef.current += elapsed / 1000;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const { speed, chaos, baseAmplitude } = getReactionParams(crowdReaction);
      const excitementNorm = excitement / 100;
      const time = timeRef.current;

      const barWidth = rect.width / BAR_COUNT;
      const gap = Math.max(1, barWidth * 0.12);
      const actualBarWidth = barWidth - gap;
      const maxHeight = rect.height - 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        const seed = barSeeds[i];

        // Multi-frequency oscillation for organic feel
        const wave1 = Math.sin(time * speed * 1.0 + seed * 2.1) * 0.5 + 0.5;
        const wave2 = Math.sin(time * speed * 1.7 + seed * 3.4) * 0.3 + 0.5;
        const wave3 = Math.sin(time * speed * 0.5 + seed * 1.1) * 0.2 + 0.5;

        // Combine waves with chaos factor
        const waveValue = wave1 * (1 - chaos * 0.5) + wave2 * chaos * 0.3 + wave3 * chaos * 0.2;

        // Final bar height: base ambient + excitement-driven amplitude
        const amplitude = baseAmplitude + (1 - baseAmplitude) * excitementNorm;
        const height = Math.max(2, waveValue * amplitude * maxHeight);

        const x = i * barWidth + gap / 2;
        const y = rect.height - height;

        // Bar color depends on excitement and individual bar intensity
        const barIntensity = waveValue * 0.4 + 0.6;
        const color = getBarColor(excitement, barIntensity);

        // Draw bar with slight rounding
        const radius = Math.min(2, actualBarWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + actualBarWidth - radius, y);
        ctx.quadraticCurveTo(x + actualBarWidth, y, x + actualBarWidth, y + radius);
        ctx.lineTo(x + actualBarWidth, rect.height);
        ctx.lineTo(x, rect.height);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        // Glow effect for high-excitement bars
        if (excitementNorm > 0.6 && waveValue > 0.7) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 4 + excitementNorm * 6;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    },
    [excitement, crowdReaction, barSeeds]
  );

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  const reactionLabel = getReactionLabel(crowdReaction);
  const reactionIcon = getReactionIcon(crowdReaction);

  // Color for the label based on excitement
  const labelColor =
    excitement > 75
      ? 'text-red-400'
      : excitement > 50
        ? 'text-orange-400'
        : excitement > 25
          ? 'text-yellow-400'
          : 'text-blue-400';

  if (compact) {
    return (
      <div className="px-3 py-1.5">
        {/* Label row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] leading-none">{reactionIcon}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest ${labelColor}`}>
              {reactionLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-semibold uppercase tracking-widest text-text-muted">
              Energy
            </span>
            <span className={`text-[11px] font-mono font-black tabular-nums ${labelColor}`}>
              {excitement}
            </span>
          </div>
        </div>
        {/* Visualizer canvas — taller for more visual impact */}
        <div className="relative w-full h-10 sm:h-12 rounded-md overflow-hidden bg-surface-elevated/30">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
          />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-t from-midnight/40 to-transparent pointer-events-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Label and excitement reading */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none">{reactionIcon}</span>
          <span className={`text-[9px] font-black uppercase tracking-widest ${labelColor}`}>
            {reactionLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-semibold uppercase tracking-widest text-text-muted">
            Energy
          </span>
          <span
            className={`text-[10px] font-mono font-black tabular-nums ${labelColor}`}
          >
            {excitement}
          </span>
        </div>
      </div>

      {/* Visualizer canvas */}
      <div className="relative w-full h-16 sm:h-20 rounded-lg overflow-hidden bg-surface-elevated/30">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />

        {/* Subtle gradient overlay at the bottom for a polished fade */}
        <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-midnight/50 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
