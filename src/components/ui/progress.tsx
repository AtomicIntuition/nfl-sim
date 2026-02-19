interface ProgressProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  color?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

const sizeStyles = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

export function Progress({
  value,
  max = 100,
  className = "",
  color = "bg-info",
  showLabel = false,
  size = "md",
  animated = false,
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-text-muted">{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        className={`w-full bg-surface-elevated rounded-full overflow-hidden ${sizeStyles[size]}`}
      >
        <div
          className={`${sizeStyles[size]} rounded-full transition-all duration-500 ease-out ${color} ${
            animated ? "animate-pulse" : ""
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
