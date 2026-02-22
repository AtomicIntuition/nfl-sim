'use client';

import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface FieldSurfaceProps {
  homeTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  /** Which team has the ball — used for the possession arrow indicator */
  possession: 'home' | 'away';
}

/**
 * Pure SVG field rendering — grass gradient, end zones with team colors/logos,
 * yard lines, yard numbers, hash marks, and goal posts.
 *
 * ViewBox: 0 0 1200 534 (120 yards including end zones, proportional height)
 * End zones: 0-100 (away) and 1100-1200 (home), each 100 units = 10 yards
 * Playing field: 100-1100 (100 yards)
 */
export function FieldSurface({ homeTeam, awayTeam, possession }: FieldSurfaceProps) {
  const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

  return (
    <svg
      viewBox="0 0 1200 534"
      className="w-full h-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Mowed grass stripe pattern — sharper contrast */}
        <pattern id="grass-stripes" patternUnits="userSpaceOnUse" width="100" height="534">
          <rect x="0" y="0" width="50" height="534" fill="#2a5524" />
          <rect x="50" y="0" width="50" height="534" fill="#336b2e" />
        </pattern>
        {/* Scanline overlay pattern — LED display signature */}
        <pattern id="scanlines" patternUnits="userSpaceOnUse" width="1200" height="8">
          <rect x="0" y="0" width="1200" height="2" fill="rgba(0,0,0,0.06)" />
        </pattern>
        {/* Glow filter for yard lines */}
        <filter id="line-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Glow filter for goal lines */}
        <filter id="goal-line-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Neon border glow */}
        <filter id="border-glow" x="-2%" y="-2%" width="104%" height="104%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* End zone inner glow */}
        <linearGradient id="ez-glow-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="ez-glow-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Inner shadow for field border */}
        <filter id="field-inner-shadow">
          <feFlood floodColor="rgba(0,0,0,0.3)" />
          <feComposite in2="SourceAlpha" operator="in" />
          <feGaussianBlur stdDeviation="8" />
          <feComposite in2="SourceAlpha" operator="arithmetic" k2={-1} k3={1} />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background grass with stripe pattern */}
      <rect x="0" y="0" width="1200" height="534" fill="url(#grass-stripes)" />

      {/* Overall green tint overlay for richness */}
      <rect x="0" y="0" width="1200" height="534" fill="#2a5525" opacity="0.3" />

      {/* Away end zone (left) — brighter with inner glow */}
      <rect x="0" y="0" width="100" height="534" fill={awayTeam.primaryColor} opacity="0.7" />
      <rect x="0" y="0" width="100" height="534" fill="rgba(0,0,0,0.1)" />
      <rect x="0" y="0" width="100" height="534" fill="url(#ez-glow-left)" />

      {/* Away team abbreviation in end zone — rotated, centered */}
      <text
        x="50"
        y="267"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        opacity="0.3"
        fontSize="72"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        transform="rotate(-90, 50, 267)"
      >
        {awayTeam.abbreviation}
      </text>

      {/* Away team logos — top and bottom of end zone (aspect-ratio preserved) */}
      <image
        href={getTeamLogoUrl(awayTeam.abbreviation)}
        x="10"
        y="10"
        width="80"
        height="80"
        opacity="0.5"
        preserveAspectRatio="xMidYMid meet"
      />
      <image
        href={getTeamLogoUrl(awayTeam.abbreviation)}
        x="10"
        y="444"
        width="80"
        height="80"
        opacity="0.5"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Home end zone (right) — brighter with inner glow */}
      <rect x="1100" y="0" width="100" height="534" fill={homeTeam.primaryColor} opacity="0.7" />
      <rect x="1100" y="0" width="100" height="534" fill="rgba(0,0,0,0.1)" />
      <rect x="1100" y="0" width="100" height="534" fill="url(#ez-glow-right)" />

      {/* Home team abbreviation in end zone — rotated, centered */}
      <text
        x="1150"
        y="267"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        opacity="0.3"
        fontSize="72"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        transform="rotate(90, 1150, 267)"
      >
        {homeTeam.abbreviation}
      </text>

      {/* Home team logos — top and bottom of end zone (aspect-ratio preserved) */}
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="1110"
        y="10"
        width="80"
        height="80"
        opacity="0.5"
        preserveAspectRatio="xMidYMid meet"
      />
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="1110"
        y="444"
        width="80"
        height="80"
        opacity="0.5"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Midfield home team logo (home stadium branding) */}
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="510"
        y="177"
        width="180"
        height="180"
        opacity="0.12"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Goal lines — with glow */}
      <line x1="100" y1="0" x2="100" y2="534" stroke="white" strokeWidth="3" opacity="0.85" filter="url(#goal-line-glow)" />
      <line x1="1100" y1="0" x2="1100" y2="534" stroke="white" strokeWidth="3" opacity="0.85" filter="url(#goal-line-glow)" />

      {/* 10-yard lines — with subtle glow */}
      {Array.from({ length: 9 }, (_, i) => {
        const yardLine = (i + 1) * 10; // 10..90
        const x = 100 + yardLine * 10; // 200..1000
        const isMidfield = yardLine === 50;
        return (
          <line
            key={yardLine}
            x1={x}
            y1="0"
            x2={x}
            y2="534"
            stroke="white"
            strokeWidth={isMidfield ? 2.5 : 1.5}
            opacity={isMidfield ? 0.55 : 0.35}
            filter={isMidfield ? 'url(#line-glow)' : undefined}
          />
        );
      })}

      {/* Hash marks — every yard between the 10-yard lines */}
      {Array.from({ length: 99 }, (_, i) => {
        const yard = i + 1;
        if (yard % 10 === 0) return null; // Skip 10-yard lines
        const x = 100 + yard * 10;
        return (
          <g key={`hash-${yard}`}>
            {/* Top hash */}
            <line x1={x} y1="160" x2={x} y2="175" stroke="white" strokeWidth="1" opacity="0.15" />
            {/* Bottom hash */}
            <line x1={x} y1="359" x2={x} y2="374" stroke="white" strokeWidth="1" opacity="0.15" />
            {/* Top sideline tick */}
            <line x1={x} y1="20" x2={x} y2="32" stroke="white" strokeWidth="0.8" opacity="0.1" />
            {/* Bottom sideline tick */}
            <line x1={x} y1="502" x2={x} y2="514" stroke="white" strokeWidth="0.8" opacity="0.1" />
          </g>
        );
      })}

      {/* Yard numbers — top and bottom */}
      {yardNumbers.map((num, i) => {
        const yardLine = (i + 1) * 10;
        const x = 100 + yardLine * 10;
        return (
          <g key={`yardnum-${i}`}>
            {/* Top number */}
            <text
              x={x}
              y="80"
              textAnchor="middle"
              fill="white"
              opacity="0.18"
              fontSize="48"
              fontWeight="900"
              fontFamily="system-ui, sans-serif"
            >
              {num}
            </text>
            {/* Bottom number */}
            <text
              x={x}
              y="500"
              textAnchor="middle"
              fill="white"
              opacity="0.18"
              fontSize="48"
              fontWeight="900"
              fontFamily="system-ui, sans-serif"
            >
              {num}
            </text>
          </g>
        );
      })}

      {/* Goal posts — simple T-shape at each end */}
      {/* Away (left) goal post */}
      <g opacity="0.35">
        <line x1="96" y1="230" x2="96" y2="304" stroke="#FFD700" strokeWidth="3" />
        <line x1="96" y1="230" x2="96" y2="210" stroke="#FFD700" strokeWidth="2" />
        <line x1="96" y1="304" x2="96" y2="324" stroke="#FFD700" strokeWidth="2" />
        <line x1="96" y1="267" x2="88" y2="267" stroke="#FFD700" strokeWidth="2" />
      </g>
      {/* Home (right) goal post */}
      <g opacity="0.35">
        <line x1="1104" y1="230" x2="1104" y2="304" stroke="#FFD700" strokeWidth="3" />
        <line x1="1104" y1="230" x2="1104" y2="210" stroke="#FFD700" strokeWidth="2" />
        <line x1="1104" y1="304" x2="1104" y2="324" stroke="#FFD700" strokeWidth="2" />
        <line x1="1104" y1="267" x2="1112" y2="267" stroke="#FFD700" strokeWidth="2" />
      </g>

      {/* Possession indicator — small arrow at the bottom showing direction */}
      {possession === 'away' ? (
        /* Away team going right → */
        <g opacity="0.6">
          <polygon points="605,520 620,512 620,528" fill="white" />
          <line x1="585" y1="520" x2="615" y2="520" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ) : (
        /* Home team going left ← */
        <g opacity="0.6">
          <polygon points="595,520 580,512 580,528" fill="white" />
          <line x1="585" y1="520" x2="615" y2="520" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {/* Scanline overlay — LED display signature */}
      <rect x="0" y="0" width="1200" height="534" fill="url(#scanlines)" />

      {/* Glowing gold/neon field border */}
      <rect
        x="1"
        y="1"
        width="1198"
        height="532"
        fill="none"
        stroke="rgba(212, 175, 55, 0.35)"
        strokeWidth="2"
        filter="url(#border-glow)"
      />

      {/* Field border inner shadow */}
      <rect
        x="0"
        y="0"
        width="1200"
        height="534"
        fill="none"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="3"
        filter="url(#field-inner-shadow)"
      />
    </svg>
  );
}
