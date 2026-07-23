"use client";

export function MoneyCard({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone?: "success" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-success-600"
      : tone === "warning"
        ? "text-warning-600"
        : "text-slate-800";
  return (
    <div className="rounded-card border border-slate-200 bg-surface-subtle p-4">
      <p className="text-help tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-normal ${color}`}>
        S/ {(value ?? 0).toFixed(2)}
      </p>
    </div>
  );
}
