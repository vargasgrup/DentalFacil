"use client";

import {
  CalendarAppointment,
  addDays,
  appointmentsOutsideHours,
  clinicVisibleRange,
  estadoStyles,
  formatHHMM,
  formatMinutes12h,
  getWeekStart,
  hourMarks,
  isSameDay,
  layoutOverlaps,
  snapToSlot,
  timeToTop,
  HOUR_HEIGHT_PX,
  minutesFromMidnight,
} from "@/lib/calendar";
import { formatTime } from "@/lib/datetime";

interface WeekGridProps {
  weekAnchor: Date;
  appointments: CalendarAppointment[];
  openHHMM: string;
  closeHHMM: string;
  onSlotClick: (date: Date, timeHHMM: string) => void;
  onAppointmentClick: (apt: CalendarAppointment) => void;
}

export function WeekGrid({
  weekAnchor,
  appointments,
  openHHMM,
  closeHHMM,
  onSlotClick,
  onAppointmentClick,
}: WeekGridProps) {
  const weekStart = getWeekStart(weekAnchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const { startMin, endMin } = clinicVisibleRange(openHHMM, closeHHMM);
  const marks = hourMarks(startMin, endMin);
  const rowMarks = marks.slice(0, -1);
  const totalHeight = ((endMin - startMin) / 60) * HOUR_HEIGHT_PX;

  const outOfHours = appointmentsOutsideHours(appointments, openHHMM, closeHHMM).filter(
    (a) => {
      const d = new Date(a.fecha_hora);
      return days.some((day) => isSameDay(d, day));
    }
  );

  return (
    <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
      {outOfHours.length > 0 && (
        <div className="border-b border-warning-100 bg-warning-50 px-4 py-2.5">
          <p className="text-xs font-medium text-warning-800">
            {outOfHours.length} cita(s) fuera del horario de atención (
            {formatMinutes12h(startMin)} – {formatMinutes12h(endMin)}). La grilla
            muestra solo el horario configurado.
          </p>
          <ul className="mt-1.5 space-y-1">
            {outOfHours.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAppointmentClick(a)}
                  className="text-xs font-semibold text-warning-900 underline-offset-2 hover:underline"
                >
                  {a.patient_nombre || "Paciente"} · {formatTime(a.fecha_hora)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex border-b border-slate-200 bg-surface-subtle">
        <div className="w-16 shrink-0 sm:w-[4.5rem]" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`flex-1 border-l border-slate-200 px-1 py-2 text-center ${
                isToday ? "bg-brand-50" : ""
              }`}
            >
              <p className="text-[10px] font-medium uppercase text-slate-400">
                {day.toLocaleDateString("es-PE", { weekday: "short" })}
              </p>
              <p
                className={`text-sm font-semibold ${
                  isToday ? "text-brand-700" : "text-slate-700"
                }`}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-auto">
        <div className="relative w-16 shrink-0 sm:w-[4.5rem]" style={{ height: totalHeight }}>
          {rowMarks.map((m) => (
            <div
              key={m}
              className="absolute inset-x-0 flex items-center justify-end pr-1 sm:pr-2"
              style={{
                top: timeToTop(m, startMin),
                height: HOUR_HEIGHT_PX,
              }}
            >
              <span className="text-[10px] font-medium leading-none text-slate-400 sm:text-[11px]">
                {formatMinutes12h(m)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-[560px] flex-1">
          {days.map((day) => {
            const dayAppts = appointments.filter((a) => {
              if (!isSameDay(new Date(a.fecha_hora), day)) return false;
              const m = minutesFromMidnight(new Date(a.fecha_hora));
              return m >= startMin && m < endMin;
            });
            const positioned = layoutOverlaps(dayAppts, startMin);
            const isToday = isSameDay(day, today);
            const nowMin = minutesFromMidnight(new Date());
            const nowTop =
              isToday && nowMin >= startMin && nowMin <= endMin
                ? timeToTop(nowMin, startMin)
                : -1;

            return (
              <div
                key={day.toISOString()}
                className={`relative flex-1 cursor-pointer border-l border-slate-100 ${
                  isToday ? "bg-brand-50/20" : "bg-white hover:bg-slate-50/40"
                }`}
                style={{ height: totalHeight }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const minutes = startMin + (y / HOUR_HEIGHT_PX) * 60;
                  const snapped = snapToSlot(minutes);
                  const clamped = Math.max(startMin, Math.min(snapped, endMin - 30));
                  onSlotClick(day, formatHHMM(clamped));
                }}
              >
                {rowMarks.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: timeToTop(m, startMin) }}
                  />
                ))}
                {nowTop >= 0 && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-danger-500"
                    style={{ top: nowTop }}
                  />
                )}
                {positioned.map((apt) => {
                  const style = estadoStyles[apt.estado] || estadoStyles.programada;
                  return (
                    <button
                      key={apt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(apt);
                      }}
                      className={`absolute z-10 overflow-hidden rounded border px-1 py-0.5 text-left transition-smooth ${style}`}
                      style={{
                        top: apt.top,
                        height: apt.height,
                        left: `calc(${apt.leftPct}% + 1px)`,
                        width: `calc(${apt.widthPct}% - 2px)`,
                      }}
                      title={`${apt.patient_nombre} · ${formatMinutes12h(apt.startMin)}`}
                    >
                      <p className="truncate text-[10px] font-semibold leading-tight sm:text-xs">
                        {apt.patient_nombre || "Paciente"}
                      </p>
                      {apt.height >= 32 && (
                        <p className="truncate text-[9px] opacity-80">
                          {formatMinutes12h(apt.startMin)}
                          {apt.doctor_nombre ? ` · ${apt.doctor_nombre.split(" ")[0]}` : ""}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
