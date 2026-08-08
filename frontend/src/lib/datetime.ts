/** Display helpers — clinic wall clock America/Lima (Perú), fecha dd/mm/aaaa y 12 h a. m. / p. m. */

export const CLINIC_TIME_ZONE = "America/Lima";

export const TIME_12H: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export const DATE_DMY: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/**
 * Parse API timestamps correctly.
 * SQLite/SQLAlchemy often emit naive ISO (no Z). By convention those are UTC —
 * treating them as local (browser default) shifts Perú times by ~5 hours.
 */
export function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const raw = String(value).trim();
  if (!raw) return new Date(NaN);
  // Date-only → calendar day in clinic TZ noon to avoid off-by-one
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00-05:00`);
  }
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (!hasZone && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    return new Date(`${normalized}Z`);
  }
  return new Date(raw);
}

/** e.g. "08/08/2026" in clinic timezone */
export function formatDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString("es-PE", {
    timeZone: CLINIC_TIME_ZONE,
    ...DATE_DMY,
  });
}

/** e.g. "3:44 p. m." in clinic timezone */
export function formatTime(value: Date | string | number): string {
  return toDate(value).toLocaleTimeString("es-PE", {
    timeZone: CLINIC_TIME_ZONE,
    ...TIME_12H,
  });
}

/** Fecha + hora: "08/08/2026, 5:13 p. m." (America/Lima). Extra options merge on top. */
export function formatDateTime(
  value: Date | string | number,
  extra?: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleString("es-PE", {
    timeZone: CLINIC_TIME_ZONE,
    ...DATE_DMY,
    ...TIME_12H,
    ...extra,
  });
}

/** Minutes from midnight → "3:00 p. m." (calendar axis / blocks). */
export function formatMinutes12h(totalMinutes: number): string {
  const h24 = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24;
  const m = ((totalMinutes % 60) + 60) % 60;
  const d = new Date();
  d.setHours(h24, m, 0, 0);
  return formatTime(d);
}

/**
 * Build an ISO UTC string from a local calendar date + time (HH:mm),
 * avoiding `Date("YYYY-MM-DDTHH:mm")` parse ambiguities.
 */
export function localDateTimeToISO(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const parts = timeStr.split(":").map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;
  return new Date(y, mo - 1, d, hh, mm, ss, 0).toISOString();
}

/** Minutes from midnight for a local HH:mm string. */
export function localTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export type DayPeriod = "am" | "pm";

export interface Time12hParts {
  hour12: number; // 1–12
  minute: number; // 0–59
  period: DayPeriod;
}

/** Parse "HH:MM" (24h) into 12h parts for Perú UI. */
export function parseHHmmTo12h(hhmm: string): Time12hParts {
  const [hRaw, mRaw] = (hhmm || "08:00").split(":");
  let h = Number(hRaw);
  let m = Number(mRaw);
  if (!Number.isFinite(h) || h < 0 || h > 23) h = 8;
  if (!Number.isFinite(m) || m < 0 || m > 59) m = 0;
  const period: DayPeriod = h >= 12 ? "pm" : "am";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, period };
}

/** Build "HH:MM" (24h) from 12h parts. */
export function format12hToHHmm(hour12: number, minute: number, period: DayPeriod): string {
  let h = Math.min(12, Math.max(1, Math.floor(hour12) || 12));
  const m = Math.min(59, Math.max(0, Math.floor(minute) || 0));
  if (period === "am") {
    h = h === 12 ? 0 : h;
  } else {
    h = h === 12 ? 12 : h + 12;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
