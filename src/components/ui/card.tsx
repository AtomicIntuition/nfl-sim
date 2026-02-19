import { type HTMLAttributes, forwardRef } from "react";

type CardVariant = "default" | "glass" | "elevated" | "bordered" | "touchdown" | "turnover";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface border border-border",
  glass: "glass-card",
  elevated: "bg-surface-elevated border border-border shadow-lg shadow-black/20",
  bordered: "bg-transparent border border-border-bright",
  touchdown:
    "bg-surface border border-touchdown/30 shadow-lg shadow-touchdown/10",
  turnover:
    "bg-surface border border-turnover/30 shadow-lg shadow-turnover/10",
};

const paddingStyles: Record<string, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      padding = "md",
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`
          rounded-xl transition-colors duration-200
          ${variantStyles[variant]}
          ${paddingStyles[padding]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
