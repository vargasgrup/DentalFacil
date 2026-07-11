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
}

const statColors = {
  default: "bg-brand-50 text-brand-600",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  info: "bg-info-50 text-info-600",
};

export function StatCard({ icon, label, value, subtext, variant = "default" }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${statColors[variant]}`}>
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
