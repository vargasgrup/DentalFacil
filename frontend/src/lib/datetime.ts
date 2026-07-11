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
