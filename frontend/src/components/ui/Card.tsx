import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, padding = "md", className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white shadow-card transition-smooth ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "info";
  /** Makes the whole card clickable (e.g. open a detail panel). */
  onClick?: () => void;
  className?: string;
}

const statColors = {
  default: "bg-brand-50 text-brand-600",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  info: "bg-info-50 text-info-600",
};

export function StatCard({
  icon,
  label,
  value,
  subtext,
  variant = "default",
  onClick,
  className = "",
}: StatCardProps) {
  const interactive = Boolean(onClick);
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`flex items-center gap-4 ${
        interactive
          ? "cursor-pointer hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          : ""
      } ${className}`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${statColors[variant]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-help text-slate-400">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {subtext && <p className="text-help text-slate-400">{subtext}</p>}
      </div>
    </Card>
  );
}
