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
        {/* Mowed grass stripe pattern */}
        <pattern id="grass-stripes" patternUnits="userSpaceOnUse" width="100" height="534">
          <rect x="0" y="0" width="50" height="534" fill="#2d5a27" />
          <rect x="50" y="0" width="50" height="534" fill="#316130" />
        </pattern>
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

      {/* Away end zone (left) */}
      <rect x="0" y="0" width="100" height="534" fill={awayTeam.primaryColor} opacity="0.6" />
      <rect x="0" y="0" width="100" height="534" fill="rgba(0,0,0,0.15)" />

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

      {/* Away team logos — top and bottom of end zone */}
      <image
        href={getTeamLogoUrl(awayTeam.abbreviation)}
        x="15"
        y="10"
        width="55"
        height="55"
        opacity="0.5"
      />
      <image
        href={getTeamLogoUrl(awayTeam.abbreviation)}
        x="15"
        y="469"
        width="55"
        height="55"
        opacity="0.5"
      />

      {/* Home end zone (right) */}
      <rect x="1100" y="0" width="100" height="534" fill={homeTeam.primaryColor} opacity="0.6" />
      <rect x="1100" y="0" width="100" height="534" fill="rgba(0,0,0,0.15)" />

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

      {/* Home team logos — top and bottom of end zone */}
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="1130"
        y="10"
        width="55"
        height="55"
        opacity="0.5"
      />
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="1130"
        y="469"
        width="55"
        height="55"
        opacity="0.5"
      />

      {/* Midfield home team logo (home stadium branding) */}
      <image
        href={getTeamLogoUrl(homeTeam.abbreviation)}
        x="530"
        y="197"
        width="140"
        height="140"
        opacity="0.12"
      />

      {/* Goal lines */}
      <line x1="100" y1="0" x2="100" y2="534" stroke="white" strokeWidth="3" opacity="0.8" />
      <line x1="1100" y1="0" x2="1100" y2="534" stroke="white" strokeWidth="3" opacity="0.8" />

      {/* 10-yard lines */}
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
            opacity={isMidfield ? 0.5 : 0.3}
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

      {/* Field border inner shadow */}
      <rect
        x="0"
        y="0"
        width="1200"
        height="534"
        fill="none"
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="4"
        filter="url(#field-inner-shadow)"
      />
    </svg>
  );
}
