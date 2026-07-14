"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Bell,
  ChevronDown,
  Settings,
  LogOut,
  Calendar,
  Users,
  Menu,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { Button } from "./ui/Button";
import { openWhatsAppText, isValidPhone } from "@/lib/whatsapp";
import { formatFichaCode } from "@/lib/ficha";
import { SHELL_HEADER_CLASS } from "./shell";

interface SearchResult {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
}

interface Reminder {
  id: number;
  appointment_id: number;
  patient_id: number;
  patient_nombre?: string;
  patient_telefono?: string;
  appointment_fecha?: string;
  mensaje_sugerido: string;
  estado: string;
}

/** Uniform control height across search, icons, primary CTA, and user chip. */
const CTRL = "h-9";

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadReminders = async () => {
    try {
      const data = await apiFetch<Reminder[]>("/api/appointments/reminders/pending");
      setReminders(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadReminders();
    const interval = setInterval(loadReminders, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await apiFetch<SearchResult[]>(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
        setSearchOpen(true);
      } catch { /* ignore */ } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectPatient = (p: SearchResult) => {
    router.push(`/pacientes/${p.id}`);
    setSearchQuery("");
    setSearchOpen(false);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

    const sendReminder = async (r: Reminder) => {
    if (!isValidPhone(r.patient_telefono)) {
      alert("El paciente no tiene teléfono válido");
      return;
    }
    setSendingId(r.id);
    try {
      // Recargar pendientes para usar mensaje con datos actuales del centro
      const fresh = await apiFetch<Reminder[]>("/api/appointments/reminders/pending");
      const current = fresh.find((x) => x.id === r.id) || r;
      await openWhatsAppText(current.patient_telefono, current.mensaje_sugerido, async () => {
        await apiFetch(`/api/appointments/reminders/${r.id}/send`, { method: "POST" });
      });
      await loadReminders();
    } finally {
      setSendingId(null);
    }
  };

  const initials = (user?.nombre || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className={`${SHELL_HEADER_CLASS} sticky top-0 z-40 gap-3 px-4 sm:gap-4 sm:px-6`}>
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className={`flex ${CTRL} w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-smooth hover:bg-slate-100 lg:hidden`}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div ref={searchRef} className="relative min-w-0 max-w-xl flex-1">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Abrir ficha: nombre, DNI o FC-00005…"
            className={`${CTRL} w-full rounded-lg border border-slate-200 bg-surface-subtle pl-9 pr-3 text-sm leading-none text-slate-700 transition-smooth placeholder:text-slate-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-600`}
            aria-label="Buscar y abrir ficha clínica"
          />
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-dropdown">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-smooth hover:bg-brand-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                    {p.nombres[0]}{p.apellidos[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">
                      {p.nombres} {p.apellidos}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {formatFichaCode(p.numero_ficha)}
                      {p.numero_documento ? ` · DNI ${p.numero_documento}` : ""}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {searchOpen && !searchLoading && searchResults.length === 0 && searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-400 shadow-dropdown">
            No se encontraron pacientes
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className={`relative flex ${CTRL} w-9 items-center justify-center rounded-lg text-slate-500 transition-smooth hover:bg-slate-100 hover:text-slate-700`}
            title="Recordatorios pendientes"
            aria-label="Recordatorios pendientes"
          >
            <Bell className="h-[18px] w-[18px]" />
            {reminders.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-none text-white">
                {reminders.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-dropdown sm:w-96">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-700">
                  Recordatorios pendientes {reminders.length > 0 && `(${reminders.length})`}
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {reminders.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">Sin recordatorios pendientes</p>
                ) : (
                  reminders.map((r) => (
                    <div
                      key={r.id}
                      className="border-b border-slate-50 px-4 py-3 last:border-0"
                    >
                      <p className="text-sm font-medium text-slate-700">{r.patient_nombre}</p>
                      {r.appointment_fecha && (
                        <p className="text-help text-slate-400">
                          Cita: {formatDateTime(r.appointment_fecha, { year: undefined })}
                        </p>
                      )}
                      <p className="mt-0.5 line-clamp-2 text-help text-slate-400">{r.mensaje_sugerido}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="primary"
                          className="text-xs"
                          loading={sendingId === r.id}
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          onClick={() => sendReminder(r)}
                        >
                          Enviar
                        </Button>
                        <Link
                          href="/agenda"
                          onClick={() => setNotifOpen(false)}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          Ver agenda
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/pacientes/nuevo"
            className={`inline-flex ${CTRL} items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 text-sm font-medium leading-none text-white transition-smooth hover:bg-brand-700 sm:px-3`}
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden md:inline">Nuevo paciente</span>
            <span className="md:hidden">Paciente</span>
          </Link>
          <Link
            href="/agenda?nueva=1"
            className={`inline-flex ${CTRL} items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium leading-none text-slate-700 transition-smooth hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 sm:px-3`}
          >
            <Calendar className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden md:inline">Nueva cita</span>
            <span className="md:hidden">Cita</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className={`inline-flex ${CTRL} items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium leading-none text-slate-600 transition-smooth hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700 sm:px-3`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden lg:inline">Cerrar sesión</span>
            <span className="hidden sm:inline lg:hidden">Salir</span>
          </button>
        </div>

        <div className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

        <div ref={userRef} className="relative">
          <button
            type="button"
            onClick={() => setUserOpen(!userOpen)}
            className={`inline-flex ${CTRL} items-center gap-2 rounded-lg px-1.5 transition-smooth hover:bg-slate-100 sm:pr-2`}
            aria-expanded={userOpen}
            aria-haspopup="menu"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </span>
            <div className="hidden min-w-0 text-left leading-tight sm:block">
              <p className="max-w-28 truncate text-xs font-medium text-slate-700">{user?.nombre}</p>
              <p className="text-[10px] leading-none text-slate-400">{user?.rol}</p>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:inline" />
          </button>
          {userOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-1.5 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-dropdown"
            >
              <div className="border-b border-slate-100 px-4 py-2">
                <p className="truncate text-sm font-medium text-slate-700">{user?.nombre}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
              </div>
              <Link
                href="/configuracion"
                role="menuitem"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition-smooth hover:bg-slate-50"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Configuración
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger-600 transition-smooth hover:bg-danger-50"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
