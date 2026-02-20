'use client';

import { useMemo } from 'react';

interface CrowdAtmosphereProps {
  crowdReaction: string | null;
  excitement: number;
}

/**
 * Renders inset box-shadow edge effects on the field container
 * based on crowd reaction and excitement level.
 */
export function CrowdAtmosphere({ crowdReaction, excitement }: CrowdAtmosphereProps) {
  const shadowStyle = useMemo(() => {
    if (!crowdReaction || excitement < 30) return undefined;

    const intensity = Math.min(1, excitement / 100);

    switch (crowdReaction) {
      case 'roar': {
        const alpha = 0.15 + intensity * 0.2;
        return {
          boxShadow: `inset 0 0 60px rgba(255, 200, 50, ${alpha}), inset 0 0 120px rgba(255, 180, 30, ${alpha * 0.5})`,
        };
      }
      case 'cheer': {
        const alpha = 0.1 + intensity * 0.15;
        return {
          boxShadow: `inset 0 40px 60px -20px rgba(100, 200, 100, ${alpha})`,
        };
      }
      case 'gasp': {
        const alpha = 0.15 + intensity * 0.15;
        return {
          boxShadow: `inset 0 0 80px rgba(255, 255, 255, ${alpha})`,
        };
      }
      case 'groan':
      case 'boo': {
        const alpha = 0.05 + intensity * 0.1;
        return {
          boxShadow: `inset 0 0 60px rgba(239, 68, 68, ${alpha})`,
        };
      }
      case 'chant': {
        const alpha = 0.08 + intensity * 0.12;
        return {
          boxShadow: `inset 0 0 40px rgba(212, 175, 55, ${alpha})`,
        };
      }
      default:
        return undefined;
    }
  }, [crowdReaction, excitement]);

  if (!shadowStyle) return null;

  return (
    <div
      className="absolute inset-0 z-15 pointer-events-none rounded-xl"
      style={{
        ...shadowStyle,
        transition: 'box-shadow 600ms ease-out',
      }}
    />
  );
}
