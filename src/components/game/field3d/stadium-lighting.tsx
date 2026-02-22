'use client';

import type { WeatherConditions } from '@/lib/simulation/types';

interface StadiumLightingProps {
  weather?: WeatherConditions | null;
}

/**
 * Stadium lighting — ambient, hemisphere (sky+grass), and directional sun.
 * Adjusts based on weather conditions:
 *   Rain → darker ambient, reduced directional
 *   Snow → brighter ambient (reflection)
 *   Fog → reduced directional, warmer ambient
 *   Wind → slight flicker effect (simulated via intensity)
 */
export function StadiumLighting({ weather }: StadiumLightingProps) {
  const type = weather?.type ?? 'clear';

  // Weather-responsive intensity values
  let ambientIntensity = 0.4;
  let hemiIntensity = 0.6;
  let mainLightIntensity = 1;
  let fillLightIntensity = 0.3;
  let skyColor = '#87CEEB';

  switch (type) {
    case 'rain':
      ambientIntensity = 0.3;
      hemiIntensity = 0.4;
      mainLightIntensity = 0.6;
      fillLightIntensity = 0.2;
      skyColor = '#5a6a7a';
      break;
    case 'snow':
      ambientIntensity = 0.55;
      hemiIntensity = 0.7;
      mainLightIntensity = 0.85;
      fillLightIntensity = 0.4;
      skyColor = '#c0c8d0';
      break;
    case 'fog':
      ambientIntensity = 0.45;
      hemiIntensity = 0.5;
      mainLightIntensity = 0.4;
      fillLightIntensity = 0.15;
      skyColor = '#8a8a8a';
      break;
    case 'wind':
      // Wind doesn't change lighting much, just a slight flicker
      ambientIntensity = 0.38;
      mainLightIntensity = 0.95;
      break;
    case 'cloudy':
      ambientIntensity = 0.35;
      hemiIntensity = 0.5;
      mainLightIntensity = 0.7;
      skyColor = '#6a7a8a';
      break;
  }

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <hemisphereLight args={[skyColor, '#228B22', hemiIntensity]} />
      <directionalLight
        position={[30, 50, 20]}
        intensity={mainLightIntensity}
        castShadow={false}
      />
      <directionalLight
        position={[-30, 40, -15]}
        intensity={fillLightIntensity}
        castShadow={false}
      />
    </>
  );
}
