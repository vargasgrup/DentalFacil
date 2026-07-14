"use client";

import { useEffect, useRef } from "react";
import {
  CalendarAppointment,
  PositionedAppointment,
  appointmentsOutsideHours,
  clinicVisibleRange,
  estadoStyles,
  formatHHMM,
  formatMinutes12h,
  hourMarks,
  layoutOverlaps,
  minutesFromMidnight,
  snapToSlot,
  timeToTop,
  HOUR_HEIGHT_PX,
  isSameDay,
} from "@/lib/calendar";
import { formatTime } from "@/lib/datetime";

interface Doctor {
  id: string;
  nombre: string;
}

interface DayGridProps {
  date: Date;
  appointments: CalendarAppointment[];
  doctors: Doctor[];
  openHHMM: string;
  closeHHMM: string;
  onSlotClick: (date: Date, timeHHMM: string, doctorId?: string) => void;
  onAppointmentClick: (apt: CalendarAppointment) => void;
}

function NowLine({ dayStartMin, dayEndMin, date }: { dayStartMin: number; dayEndMin: number; date: Date }) {
  if (!isSameDay(date, new Date())) return null;
  const now = minutesFromMidnight(new Date());
  if (now < dayStartMin || now > dayEndMin) return null;
  const top = timeToTop(now, dayStartMin);
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top }}
    >
      <span className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-danger-500 shadow-sm" />
      <div className="h-0.5 w-full bg-danger-500" />
    </div>
  );
}

function AppointmentBlock({
  apt,
  onClick,
}: {
  apt: PositionedAppointment;
  onClick: () => void;
}) {
  const style = estadoStyles[apt.estado] || estadoStyles.programada;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute z-10 overflow-hidden rounded-lg border-l-[3px] border px-2 py-1.5 text-left transition-smooth ${style}`}
      style={{
        top: apt.top + 1,
        height: Math.max(apt.height - 2, 28),
        left: `calc(${apt.leftPct}% + 4px)`,
        width: `calc(${apt.widthPct}% - 8px)`,
      }}
      title={`${apt.patient_nombre || "Paciente"} · ${formatMinutes12h(apt.startMin)} (${apt.duracion_minutos} min)`}
    >
      <p className="truncate text-xs font-semibold leading-tight">
        {apt.patient_nombre || "Paciente"}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-medium opacity-80">
        {formatMinutes12h(apt.startMin)} · {apt.duracion_minutos} min
      </p>
    </button>
  );
}

function Column({
  date,
  appointments,
  dayStartMin,
  dayEndMin,
  marks,
  doctorId,
  onSlotClick,
  onAppointmentClick,
}: {
  date: Date;
  appointments: CalendarAppointment[];
  dayStartMin: number;
  dayEndMin: number;
  marks: number[];
  doctorId?: string;
  onSlotClick: (date: Date, timeHHMM: string, doctorId?: string) => void;
  onAppointmentClick: (apt: CalendarAppointment) => void;
}) {
  const totalHeight = ((dayEndMin - dayStartMin) / 60) * HOUR_HEIGHT_PX;
  const inHours = appointments.filter((a) => {
    const m = minutesFromMidnight(new Date(a.fecha_hora));
    return m >= dayStartMin && m < dayEndMin;
  });
  const positioned = layoutOverlaps(inHours, dayStartMin);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = dayStartMin + (y / HOUR_HEIGHT_PX) * 60;
    const snapped = snapToSlot(minutes);
    const clamped = Math.max(dayStartMin, Math.min(snapped, dayEndMin - 30));
    onSlotClick(date, formatHHMM(clamped), doctorId);
  };

  return (
    <div
      className="relative flex-1 cursor-pointer border-l border-slate-200 bg-white transition-smooth hover:bg-brand-50/20"
      style={{ height: totalHeight }}
      onClick={handleClick}
    >
      {marks.slice(0, -1).map((m) => (
        <div
          key={m}
          className="pointer-events-none absolute left-0 right-0 border-t border-slate-200"
          style={{ top: timeToTop(m, dayStartMin) }}
        />
      ))}
      {marks.slice(0, -1).map((m) => (
        <div
          key={`h-${m}`}
          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-slate-100"
          style={{ top: timeToTop(m + 30, dayStartMin) }}
        />
      ))}
      <NowLine dayStartMin={dayStartMin} dayEndMin={dayEndMin} date={date} />
      {positioned.map((apt) => (
        <AppointmentBlock
          key={apt.id}
          apt={apt}
          onClick={() => onAppointmentClick(apt)}
        />
      ))}
    </div>
  );
}

export function DayGrid({
  date,
  appointments,
  doctors,
  openHHMM,
  closeHHMM,
  onSlotClick,
  onAppointmentClick,
}: DayGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const multi = doctors.length > 1;
  const columns = multi
    ? doctors
    : [{ id: doctors[0]?.id ?? 0, nombre: doctors[0]?.nombre ?? "Agenda" }];

  const dayAppts = appointments.filter((a) => isSameDay(new Date(a.fecha_hora), date));
  const { startMin, endMin } = clinicVisibleRange(openHHMM, closeHHMM);
  const marks = hourMarks(startMin, endMin);
  const totalHeight = ((endMin - startMin) / 60) * HOUR_HEIGHT_PX;
  const outOfHours = appointmentsOutsideHours(dayAppts, openHHMM, closeHHMM, date);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [date, startMin]);

  return (
    <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
      {outOfHours.length > 0 && (
        <div className="border-b border-warning-100 bg-warning-50 px-4 py-2.5">
          <p className="text-xs font-medium text-warning-800">
            {outOfHours.length} cita(s) fuera del horario de atención (
            {formatMinutes12h(startMin)} – {formatMinutes12h(endMin)}). La grilla
            muestra solo el horario configurado en el centro.
          </p>
          <ul className="mt-1.5 space-y-1">
            {outOfHours.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAppointmentClick(a)}
                  className="text-xs font-semibold text-warning-900 underline-offset-2 hover:underline"
                >
                  {a.patient_nombre || "Paciente"} · {formatTime(a.fecha_hora)} ·{" "}
                  {a.duracion_minutos} min
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {multi && (
        <div className="flex border-b border-slate-200 bg-surface-subtle">
          <div className="w-[4.5rem] shrink-0" />
          {columns.map((d) => (
            <div
              key={d.id}
              className="flex-1 border-l border-slate-200 px-2 py-2.5 text-center text-xs font-semibold text-slate-600"
            >
              {d.nombre}
            </div>
          ))}
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex max-h-[calc(100vh-16rem)] overflow-y-auto"
      >
        <div className="relative w-[4.5rem] shrink-0 bg-surface-subtle/50" style={{ height: totalHeight }}>
          {marks.slice(0, -1).map((m) => (
            <div
              key={m}
              className="absolute inset-x-0 flex items-center justify-end pr-2"
              style={{
                top: timeToTop(m, startMin),
                height: HOUR_HEIGHT_PX,
              }}
            >
              <span className="text-[11px] font-semibold leading-none text-slate-400">
                {formatMinutes12h(m)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-1" style={{ height: totalHeight }}>
          {columns.map((doc) => {
            const colAppts = multi
              ? dayAppts.filter((a) => a.doctor_id === doc.id)
              : dayAppts;
            return (
              <Column
                key={doc.id || "single"}
                date={date}
                appointments={colAppts}
                dayStartMin={startMin}
                dayEndMin={endMin}
                marks={marks}
                doctorId={multi ? doc.id : undefined}
                onSlotClick={onSlotClick}
                onAppointmentClick={onAppointmentClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
