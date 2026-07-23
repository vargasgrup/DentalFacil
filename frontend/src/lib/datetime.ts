/** Display helpers — 12-hour clock (a. m. / p. m.) across the app. */

export const TIME_12H: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** e.g. "3:44 p. m." */
export function formatTime(value: Date | string | number): string {
  return toDate(value).toLocaleTimeString("es-PE", TIME_12H);
}

/** Date + time with 12h clock. Extra options merge on top. */
export function formatDateTime(
  value: Date | string | number,
  extra?: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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
