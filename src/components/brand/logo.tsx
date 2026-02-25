/**
 * GridBlitz inline SVG logo mark.
 * Shield + football + lightning bolt — works at any size.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
        <linearGradient id="logo-ball" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#a0522d" />
          <stop offset="100%" stopColor="#8B4513" />
        </linearGradient>
      </defs>

      {/* Shield */}
      <path
        d="M16 1 L28 5.5 C29.2 6 30 7.2 30 8.5 L30 18 C30 21.8 28 25.3 24.8 27.4 L17.2 32 C16.5 32.5 15.5 32.5 14.8 32 L7.2 27.4 C4 25.3 2 21.8 2 18 L2 8.5 C2 7.2 2.8 6 4 5.5 Z"
        fill="#0f1724"
        stroke="url(#logo-gold)"
        strokeWidth="1.2"
      />

      {/* Football */}
      <ellipse
        cx="15" cy="13.5" rx="7.5" ry="4.5"
        fill="url(#logo-ball)"
        transform="rotate(-30 15 13.5)"
      />

      {/* Laces */}
      <g transform="rotate(-30 15 13.5)">
        <line x1="11" y1="13.5" x2="19" y2="13.5" stroke="white" strokeWidth="0.7" strokeLinecap="round" />
        <line x1="13.2" y1="12.3" x2="13.2" y2="14.7" stroke="white" strokeWidth="0.6" strokeLinecap="round" />
        <line x1="15" y1="12.1" x2="15" y2="14.9" stroke="white" strokeWidth="0.6" strokeLinecap="round" />
        <line x1="16.8" y1="12.3" x2="16.8" y2="14.7" stroke="white" strokeWidth="0.6" strokeLinecap="round" />
      </g>

      {/* Lightning bolt */}
      <path
        d="M22 6 L20 11.5 L22.5 11.5 L19 18 L21.5 13 L19.5 13 L22 6Z"
        fill="url(#logo-gold)"
        opacity="0.85"
      />

      {/* Live dot */}
      <circle cx="24" cy="7" r="1.1" fill="#ef4444" />

      {/* GB text */}
      <text
        x="16" y="26.5"
        textAnchor="middle"
        fontFamily="system-ui,sans-serif"
        fontWeight="900"
        fontSize="6"
        letterSpacing="0.6"
        fill="url(#logo-gold)"
      >
        GB
      </text>
    </svg>
  );
}
