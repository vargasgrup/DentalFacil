"use client";

import {
  CalendarAppointment,
  appointmentsOnDay,
  getMonthMatrix,
  isSameDay,
  estadoBadgeVariant,
} from "@/lib/calendar";
import { formatTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface MonthGridProps {
  monthAnchor: Date;
  selectedDate: Date;
  appointments: CalendarAppointment[];
  onSelectDate: (d: Date) => void;
  onNavigateMonth: (delta: number) => void;
  onAppointmentClick: (apt: CalendarAppointment) => void;
  onCreateClick: () => void;
}

export function MonthGrid({
  monthAnchor,
  selectedDate,
  appointments,
  onSelectDate,
  onNavigateMonth,
  onAppointmentClick,
  onCreateClick,
}: MonthGridProps) {
  const weeks = getMonthMatrix(monthAnchor);
  const month = monthAnchor.getMonth();
  const today = new Date();
  const selectedDayAppts = appointmentsOnDay(appointments, selectedDate);
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const monthLabel = monthAnchor.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
      {/* Month calendar card */}
      <div className="module-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100/90 bg-gradient-to-r from-brand-50/50 to-transparent px-5 py-4">
          <button
            type="button"
            onClick={() => onNavigateMonth(-1)}
            className="module-nav-btn"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold capitalize tracking-tight text-slate-900">{monthLabel}</h3>
          <button
            type="button"
            onClick={() => onNavigateMonth(1)}
            className="module-nav-btn"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-1 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr">
          {weeks.flat().map((day, i) => {
            const inMonth = day.getMonth() === month;
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            const dayAppts = appointmentsOnDay(appointments, day).filter(
              (a) => a.estado !== "cancelada"
            );

            return (
              <button
                key={`${day.toISOString()}-${i}`}
                type="button"
                onClick={() => onSelectDate(day)}
                className={`cal-day-cell min-h-[88px] border-b border-r border-slate-100/90 p-1.5 text-left sm:min-h-[100px] ${
                  !inMonth ? "bg-slate-50/70" : "bg-white"
                } ${isSelected ? "is-selected" : ""}`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday
                      ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                      : isSelected
                        ? "text-brand-700"
                        : inMonth
                          ? "text-slate-700"
                          : "text-slate-300"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayAppts.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      className="cal-day-chip truncate"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(a);
                      }}
                    >
                      {formatTime(a.fecha_hora)}{" "}
                      {a.patient_nombre?.split(" ")[0]}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <p className="px-1 text-[10px] font-medium text-slate-400">
                      +{dayAppts.length - 3} más
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Próximas citas panel */}
      <aside className="module-surface overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/60 to-transparent px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Próximas citas
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-800">
            {selectedDate.toLocaleDateString("es-PE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {selectedDayAppts.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-300 ring-1 ring-brand-100">
              <Calendar className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-500">
              No hay citas en este día
            </p>
            <button
              type="button"
              onClick={onCreateClick}
              className="mt-4 text-sm font-semibold text-brand-600 transition-smooth hover:text-brand-700"
            >
              + Agendar cita
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 md:max-h-[28rem] md:overflow-y-auto">
            {selectedDayAppts.map((a) => {
              const est = estadoBadgeVariant[a.estado] || "info";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onAppointmentClick(a)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-smooth hover:bg-brand-50/60"
                  >
                    <div className="w-12 shrink-0 pt-0.5 text-center">
                      <p className="text-sm font-bold text-slate-800">
                        {formatTime(a.fecha_hora)}
                      </p>
                      <p className="text-[10px] text-slate-400">{a.duracion_minutos}m</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {a.patient_nombre || "Paciente"}
                      </p>
                      {a.doctor_nombre && (
                        <p className="truncate text-help text-slate-400">{a.doctor_nombre}</p>
                      )}
                      <div className="mt-1">
                        <Badge variant={est}>
                          {a.estado.charAt(0).toUpperCase() + a.estado.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
