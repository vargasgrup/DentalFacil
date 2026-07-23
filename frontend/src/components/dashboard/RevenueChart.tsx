"use client";

import { useMemo } from "react";

interface RevenueChartProps {
  labels: string[];
  thisWeek: number[];
  lastWeek: number[];
}

/** Animated SVG line chart — esta semana vs semana pasada (sin deps externas). */
export function RevenueChart({ labels, thisWeek, lastWeek }: RevenueChartProps) {
  const { pathThis, pathLast, areaThis, maxY, pointsThis } = useMemo(() => {
    const w = 640;
    const h = 220;
    const padX = 12;
    const padY = 16;
    const all = [...thisWeek, ...lastWeek];
    const max = Math.max(1, ...all);
    const n = Math.max(labels.length, 1);
    const step = n <= 1 ? 0 : (w - padX * 2) / (n - 1);

    const toPoints = (series: number[]) =>
      series.map((v, i) => {
        const x = padX + i * step;
        const y = h - padY - (v / max) * (h - padY * 2);
        return { x, y, v };
      });

    const ptsThis = toPoints(thisWeek.length ? thisWeek : [0]);
    const ptsLast = toPoints(lastWeek.length ? lastWeek : [0]);

    const line = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    const area = (pts: { x: number; y: number }[]) => {
      if (!pts.length) return "";
      const base = h - padY;
      return `${line(pts)} L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
    };

    return {
      pathThis: line(ptsThis),
      pathLast: line(ptsLast),
      areaThis: area(ptsThis),
      maxY: max,
      pointsThis: ptsThis,
      width: w,
      height: h,
    };
  }, [labels, thisWeek, lastWeek]);

  return (
    <div className="relative h-56 w-full sm:h-64">
      <svg
        viewBox="0 0 640 240"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Tendencia de ingresos semanal"
      >
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c66e8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1c66e8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="12"
            x2="628"
            y1={16 + (1 - t) * 188}
            y2={16 + (1 - t) * 188}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
        <path
          d={pathLast}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="2"
          strokeDasharray="6 5"
          className="dash-chart-draw"
        />
        <path d={areaThis} fill="url(#revFill)" className="dash-chart-fade" />
        <path
          d={pathThis}
          fill="none"
          stroke="#1c66e8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dash-chart-draw"
        />
        {pointsThis.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4.5"
              fill="#1c66e8"
              stroke="#fff"
              strokeWidth="2"
              className="dash-chart-point"
              style={{ animationDelay: `${120 + i * 60}ms` }}
            >
              <title>
                {labels[i] || ""}: S/ {p.v.toFixed(2)}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[0.65rem] font-medium text-slate-400">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {maxY <= 1 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Sin ingresos registrados esta semana
        </p>
      )}
    </div>
  );
}
