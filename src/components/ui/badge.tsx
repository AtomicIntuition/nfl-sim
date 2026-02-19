import { type HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "live"
  | "final"
  | "upcoming"
  | "touchdown"
  | "turnover"
  | "penalty"
  | "big-play"
  | "first-down"
  | "gold";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  pulse?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-elevated text-text-secondary border border-border",
  live: "bg-live-red text-white font-bold tracking-wider",
  final: "bg-surface-elevated text-text-secondary border border-border",
  upcoming: "bg-info/20 text-info border border-info/30",
  touchdown: "bg-touchdown/20 text-touchdown border border-touchdown/30",
  turnover: "bg-turnover/20 text-turnover border border-turnover/30",
  penalty: "bg-penalty-flag/20 text-penalty-flag border border-penalty-flag/30",
  "big-play": "bg-big-play/20 text-big-play border border-big-play/30",
  "first-down": "bg-first-down/20 text-first-down border border-first-down/30",
  gold: "bg-gold/20 text-gold border border-gold/30",
};

const sizeStyles: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({
  variant = "default",
  size = "md",
  pulse = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium uppercase tracking-wide
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
