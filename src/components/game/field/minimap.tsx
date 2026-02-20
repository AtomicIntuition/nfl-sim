'use client';

interface MinimapProps {
  ballLeftPercent: number;
  firstDownLeftPercent: number;
  driveStartPercent: number;
  viewportCenter: number;
  zoomLevel: number;
  homeTeam: { primaryColor: string };
  awayTeam: { primaryColor: string };
  possession: 'home' | 'away';
}

/**
 * Small minimap in bottom-right corner showing full-field context
 * when the camera is zoomed in. Shows ball position, first-down line,
 * drive trail, and a viewport rectangle indicating visible area.
 */
export function Minimap({
  ballLeftPercent,
  firstDownLeftPercent,
  driveStartPercent,
  viewportCenter,
  zoomLevel,
  homeTeam,
  awayTeam,
  possession,
}: MinimapProps) {
  // Viewport width as percentage of full field at current zoom
  const viewportWidth = Math.min(100, (100 / zoomLevel));
  const viewportLeft = Math.max(0, Math.min(100 - viewportWidth, viewportCenter - viewportWidth / 2));

  const teamColor = possession === 'home' ? homeTeam.primaryColor : awayTeam.primaryColor;

  return (
    <div className="absolute bottom-2 right-2 z-30 pointer-events-none">
      <div
        className="rounded overflow-hidden border border-white/20"
        style={{ width: 160, height: 40, background: 'rgba(0,0,0,0.5)' }}
      >
        <svg viewBox="0 0 160 40" className="w-full h-full">
          {/* End zones */}
          <rect x="0" y="0" width="13.3" height="40" fill={awayTeam.primaryColor} opacity="0.4" />
          <rect x="146.7" y="0" width="13.3" height="40" fill={homeTeam.primaryColor} opacity="0.4" />

          {/* Playing field */}
          <rect x="13.3" y="0" width="133.4" height="40" fill="#2d5a27" opacity="0.5" />

          {/* Yard lines every 10 yards */}
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => {
            const x = 13.3 + (yd / 100) * 133.4;
            return (
              <line
                key={yd}
                x1={x} y1="0" x2={x} y2="40"
                stroke="white" strokeWidth="0.5" opacity="0.2"
              />
            );
          })}

          {/* 50-yard line slightly brighter */}
          <line
            x1={13.3 + 0.5 * 133.4} y1="0"
            x2={13.3 + 0.5 * 133.4} y2="40"
            stroke="white" strokeWidth="0.8" opacity="0.35"
          />

          {/* Drive trail */}
          {driveStartPercent !== ballLeftPercent && (
            <line
              x1={driveStartPercent / 100 * 160}
              y1="20"
              x2={ballLeftPercent / 100 * 160}
              y2="20"
              stroke={teamColor}
              strokeWidth="2"
              opacity="0.5"
            />
          )}

          {/* First down line */}
          <line
            x1={firstDownLeftPercent / 100 * 160}
            y1="0"
            x2={firstDownLeftPercent / 100 * 160}
            y2="40"
            stroke="#fbbf24"
            strokeWidth="1.5"
            opacity="0.6"
          />

          {/* Ball dot */}
          <circle
            cx={ballLeftPercent / 100 * 160}
            cy="20"
            r="3"
            fill="white"
          />

          {/* Viewport rectangle */}
          <rect
            x={viewportLeft / 100 * 160}
            y="0"
            width={viewportWidth / 100 * 160}
            height="40"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            opacity="0.5"
            rx="1"
          />
        </svg>
      </div>
    </div>
  );
}
