interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = "",
  variant = "text",
  width,
  height,
}: SkeletonProps) {
  const variantStyles = {
    text: "rounded-md h-4",
    circular: "rounded-full",
    rectangular: "rounded-xl",
  };

  return (
    <div
      className={`
        animate-pulse bg-surface-elevated
        ${variantStyles[variant]}
        ${className}
      `}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

export function ScoreBugSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton variant="rectangular" width={120} height={48} />
      <Skeleton variant="text" width={80} />
      <Skeleton variant="rectangular" width={120} height={48} />
    </div>
  );
}

export function PlayCardSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="40%" />
    </div>
  );
}

export function GameCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={100} />
        <Skeleton variant="text" width={60} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width={140} />
          <Skeleton variant="text" width={30} />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width={140} />
          <Skeleton variant="text" width={30} />
        </div>
      </div>
    </div>
  );
}
