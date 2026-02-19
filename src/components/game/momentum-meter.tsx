'use client';

interface MomentumMeterProps {
  /** Range: -100 (away) to 100 (home). */
  momentum: number;
  homeColor: string;
  awayColor: string;
  homeAbbrev: string;
  awayAbbrev: string;
}

export function MomentumMeter({
  momentum,
  homeColor,
  awayColor,
  homeAbbrev,
  awayAbbrev,
}: MomentumMeterProps) {
  const absMomentum = Math.abs(momentum);
  const isExtreme = absMomentum >= 75;

  // Convert momentum (-100 to 100) to position (0% to 100%)
  const indicatorPosition = ((momentum + 100) / 200) * 100;

  // Fill widths: away fills from left toward center, home fills from right toward center
  const awayFillWidth = momentum < 0 ? (absMomentum / 100) * 50 : 0;
  const homeFillWidth = momentum > 0 ? (absMomentum / 100) * 50 : 0;

  return (
    <div className="w-full px-3 py-1.5">
      {/* Labels */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-[9px] font-bold tracking-wider uppercase"
          style={{ color: awayColor }}
        >
          {awayAbbrev}
        </span>
        <span className="text-[8px] text-text-muted font-medium tracking-wider uppercase">
          Momentum
        </span>
        <span
          className="text-[9px] font-bold tracking-wider uppercase"
          style={{ color: homeColor }}
        >
          {homeAbbrev}
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-2 rounded-full bg-surface-elevated overflow-hidden">
        {/* Away fill (left side, growing from center toward left) */}
        {awayFillWidth > 0 && (
          <div
            className={`absolute top-0 bottom-0 rounded-l-full transition-all duration-700 ease-out ${
              isExtreme ? 'momentum-extreme' : ''
            }`}
            style={{
              right: '50%',
              width: `${awayFillWidth}%`,
              backgroundColor: awayColor,
              opacity: 0.8,
              color: awayColor,
            }}
          />
        )}

        {/* Home fill (right side, growing from center toward right) */}
        {homeFillWidth > 0 && (
          <div
            className={`absolute top-0 bottom-0 rounded-r-full transition-all duration-700 ease-out ${
              isExtreme ? 'momentum-extreme' : ''
            }`}
            style={{
              left: '50%',
              width: `${homeFillWidth}%`,
              backgroundColor: homeColor,
              opacity: 0.8,
              color: homeColor,
            }}
          />
        )}

        {/* Center line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-text-muted/40 -translate-x-px z-10" />

        {/* Indicator dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out"
          style={{ left: `${indicatorPosition}%` }}
        >
          <div
            className={`w-3 h-3 rounded-full border-2 border-white shadow-md ${
              isExtreme ? 'momentum-extreme' : ''
            }`}
            style={{
              backgroundColor: momentum > 0 ? homeColor : momentum < 0 ? awayColor : '#64748b',
              color: momentum > 0 ? homeColor : momentum < 0 ? awayColor : '#64748b',
              boxShadow: `0 0 6px ${
                momentum > 0 ? homeColor : momentum < 0 ? awayColor : 'transparent'
              }`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
