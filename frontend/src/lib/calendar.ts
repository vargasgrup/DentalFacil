/** Calendar grid utilities for Agenda */

export const SLOT_MINUTES = 30;
export const HOUR_HEIGHT_PX = 80;
export const DEFAULT_OPEN = "08:00";
export const DEFAULT_CLOSE = "20:00";

export interface CalendarAppointment {
  id: number;
  patient_id: number;
  doctor_id?: number | null;
  doctor_nombre?: string | null;
  patient_nombre?: string | null;
  fecha_hora: string;
  duracion_minutos: number;
  estado: string;
  especialidad?: string | null;
  notas?: string | null;
}

export interface PositionedAppointment extends CalendarAppointment {
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  startMin: number;
  endMin: number;
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** @deprecated Prefer formatMinutes12h from @/lib/datetime for UI labels */
export { formatMinutes12h } from "@/lib/datetime";


export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function snapToSlot(minutes: number, slot = SLOT_MINUTES): number {
  return Math.round(minutes / slot) * slot;
}

export function dateToLocalInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday as start of week (es-PE style work week). */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Visible range = clinic hours only (never expand to 1–3 a.m.). */
export function clinicVisibleRange(
  openHHMM: string,
  closeHHMM: string
): { startMin: number; endMin: number } {
  let startMin = parseHHMM(openHHMM);
  let endMin = parseHHMM(closeHHMM);
  if (endMin <= startMin) endMin = startMin + 12 * 60;
  return { startMin, endMin };
}

/** @deprecated Use clinicVisibleRange — grid must not expand past clinic hours. */
export function resolveVisibleRange(
  openHHMM: string,
  closeHHMM: string,
  _appointments?: CalendarAppointment[],
  _day?: Date
): { startMin: number; endMin: number } {
  return clinicVisibleRange(openHHMM, closeHHMM);
}

export function isWithinClinicHours(
  date: Date,
  openHHMM: string,
  closeHHMM: string
): boolean {
  const m = minutesFromMidnight(date);
  const { startMin, endMin } = clinicVisibleRange(openHHMM, closeHHMM);
  return m >= startMin && m < endMin;
}

export function appointmentsOutsideHours(
  appointments: CalendarAppointment[],
  openHHMM: string,
  closeHHMM: string,
  day?: Date
): CalendarAppointment[] {
  const { startMin, endMin } = clinicVisibleRange(openHHMM, closeHHMM);
  return appointments.filter((a) => {
    const start = new Date(a.fecha_hora);
    if (day && !isSameDay(start, day)) return false;
    const m = minutesFromMidnight(start);
    return m < startMin || m >= endMin;
  });
}


export function timeToTop(absMinutes: number, dayStartMin: number): number {
  return ((absMinutes - dayStartMin) / 60) * HOUR_HEIGHT_PX;
}

export function durationToHeight(durMinutes: number): number {
  return Math.max((durMinutes / 60) * HOUR_HEIGHT_PX, 18);
}

/**
 * Layout overlapping appointments side-by-side within a column.
 * Classic greedy column assignment.
 */
export function layoutOverlaps(
  appointments: CalendarAppointment[],
  dayStartMin: number
): PositionedAppointment[] {
  const items = appointments
    .map((a) => {
      const start = new Date(a.fecha_hora);
      const startMin = minutesFromMidnight(start);
      const endMin = startMin + a.duracion_minutos;
      return { ...a, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Assign columns
  const colEnds: number[] = [];
  const withCol: (typeof items[0] & { col: number })[] = [];

  for (const item of items) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > item.startMin) col++;
    if (col === colEnds.length) colEnds.push(item.endMin);
    else colEnds[col] = item.endMin;
    withCol.push({ ...item, col });
  }

  // Cluster: appointments that transitively overlap share totalCols
  const clusters: (typeof withCol)[] = [];
  let current: typeof withCol = [];
  let clusterEnd = -1;

  for (const item of withCol) {
    if (current.length === 0 || item.startMin < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMin);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.endMin;
    }
  }
  if (current.length) clusters.push(current);

  const result: PositionedAppointment[] = [];
  for (const cluster of clusters) {
    const totalCols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const item of cluster) {
      const { col, startMin, endMin, ...rest } = item;
      result.push({
        ...rest,
        startMin,
        endMin,
        top: timeToTop(startMin, dayStartMin),
        height: durationToHeight(endMin - startMin),
        leftPct: (col / totalCols) * 100,
        widthPct: (1 / totalCols) * 100,
      });
    }
  }
  return result;
}

export function hourMarks(startMin: number, endMin: number): number[] {
  const marks: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) marks.push(m);
  return marks;
}

export const estadoStyles: Record<string, string> = {
  programada:
    "bg-brand-50 border-brand-300 text-brand-800 shadow-sm hover:bg-brand-100 hover:border-brand-400",
  completada:
    "bg-success-50 border-success-300 text-success-800 shadow-sm hover:bg-success-100",
  cancelada:
    "bg-danger-50 border-danger-200 text-danger-600 opacity-60 line-through",
};

export const estadoBadgeVariant: Record<string, "info" | "success" | "danger"> = {
  programada: "info",
  completada: "success",
  cancelada: "danger",
};

export function getMonthMatrix(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = getWeekStart(first);
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    // Stop if we've passed the month and completed the week
    if (cursor.getMonth() !== anchor.getMonth() && cursor.getDay() === 1 && w >= 3) {
      // keep full 6 weeks for stable height like N&K, or break early
    }
  }
  return weeks;
}

export function appointmentsOnDay(
  appointments: CalendarAppointment[],
  day: Date
): CalendarAppointment[] {
  return appointments
    .filter((a) => isSameDay(new Date(a.fecha_hora), day))
    .sort(
      (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
    );
}
