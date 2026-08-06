import { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** h-4 w-full by default */
  className?: string;
};

/** Placeholder de carga consistente (shimmer o sólido si reduced-motion). */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`skeleton rounded-lg ${className || "h-4 w-full"}`}
      aria-hidden
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function SkeletonTableRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
