"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  RefreshCw,
  PanelLeft,
  Rows2,
  Rows3,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { canAccessModule } from "@/lib/roles";
import { navigateToPacienteFicha } from "@/lib/pacienteRoutes";
import { requestAppRefresh } from "@/lib/appRefresh";
import { Button } from "./ui/Button";
import { openWhatsAppText, isValidPhone } from "@/lib/whatsapp";
import { formatFichaCode } from "@/lib/ficha";
import { SHELL_TOPBAR_CLASS } from "./shell";
import { useRealtimeSync, type RealtimeStatus } from "@/hooks/useRealtimeSync";
import { isLanDesktopRuntime } from "@/lib/runtimeMode";
import { useUiPreferences } from "@/lib/uiPreferences";
import type { SidebarMode } from "./SidebarContext";

function realtimeLabel(status: RealtimeStatus): {
  text: string;
  dot: string;
  pill: string;
} {
  if (status === "online") {
    return {
      text: "En línea",
      dot: "bg-success-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]",
      pill: "border-success-200/80 bg-success-50/90 text-success-800",
    };
  }
  if (status === "connecting" || status === "reconnecting") {
    return {
      text: "Reconectando",
      dot: "bg-warning-500 animate-pulse shadow-[0_0_0_3px_rgba(245,158,11,0.22)]",
      pill: "border-warning-200/80 bg-warning-50/90 text-warning-800",
    };
  }
  return {
    text: "Sin conexión",
    dot: "bg-danger-500 shadow-[0_0_0_3px_rgba(220,38,38,0.2)]",
    pill: "border-danger-200/80 bg-danger-50/90 text-danger-800",
  };
}

interface SearchResult {
  id: string;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
}

interface Reminder {
  id: string;
  appointment_id: string;
  patient_id: string;
  patient_nombre?: string;
  patient_telefono?: string;
  appointment_fecha?: string;
  mensaje_sugerido: string;
  estado: string;
}

const CTRL = "h-9";
const ICON_BTN =
  `inline-flex ${CTRL} w-9 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-smooth hover:border-slate-200/80 hover:bg-white hover:text-slate-800 hover:shadow-sm`;

export function Topbar({
  onMenuClick,
  onSidebarModeClick,
  sidebarMode,
}: {
  onMenuClick?: () => void;
  onSidebarModeClick?: () => void;
  sidebarMode?: SidebarMode;
}) {
  const { density, setDensity } = useUiPreferences();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isDashboard = pathname === "/dashboard";
  const [lanRealtime, setLanRealtime] = useState(false);
  useEffect(() => {
    setLanRealtime(isLanDesktopRuntime());
  }, []);
  const { status: realtimeStatus } = useRealtimeSync({
    enabled: Boolean(user) && lanRealtime,
  });
  const realtimeUi = realtimeLabel(realtimeStatus);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleGlobalRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    requestAppRefresh();
    void loadReminders();
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  };

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
    } catch {
      /* ignore */
    }
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
        const data = await apiFetch<SearchResult[]>(
          `/api/patients/search?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(data);
        setSearchOpen(true);
      } catch {
        /* ignore */
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectPatient = (p: SearchResult) => {
    setSearchQuery("");
    setSearchOpen(false);
    navigateToPacienteFicha(p.id);
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
    <header className={SHELL_TOPBAR_CLASS}>
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className={`inline-flex ${CTRL} shrink-0 items-center gap-1.5 rounded-xl border border-brand-200/80 bg-white/70 px-2 text-sm font-semibold text-brand-700 shadow-sm transition-smooth hover:border-brand-300 hover:bg-white sm:gap-2 sm:px-2.5 md:hidden`}
          aria-label="Abrir menú de navegación"
        >
          <Menu className="h-5 w-5" aria-hidden />
          <span className="hidden min-[400px]:inline pr-0.5">Menú</span>
        </button>
      )}

      {onSidebarModeClick && (
        <button
          type="button"
          onClick={onSidebarModeClick}
          className={`${ICON_BTN} hidden md:inline-flex`}
          title={
            sidebarMode === "expanded"
              ? "Compactar barra lateral"
              : sidebarMode === "collapsed"
                ? "Modo flotante (más espacio)"
                : "Expandir barra lateral"
          }
          aria-label="Cambiar modo de barra lateral"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
      )}

      <button
        type="button"
        onClick={() =>
          setDensity(density === "compact" ? "comfortable" : "compact")
        }
        className={`${ICON_BTN} hidden sm:inline-flex`}
        title={
          density === "compact"
            ? "Densidad: compacta (clic para cómoda)"
            : "Densidad: cómoda (clic para compacta)"
        }
        aria-label="Alternar densidad de interfaz"
        aria-pressed={density === "compact"}
      >
        {density === "compact" ? (
          <Rows2 className="h-4 w-4" aria-hidden />
        ) : (
          <Rows3 className="h-4 w-4" aria-hidden />
        )}
      </button>

      {/* Command search */}
      <div ref={searchRef} className="relative min-w-0 max-w-xl flex-1">
        <div className="group relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400 transition-smooth group-focus-within:text-brand-600"
            aria-hidden
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Abrir ficha: nombre, DNI o FC-00005…"
            className={`${CTRL} w-full rounded-xl border border-brand-100/90 bg-white/70 pl-10 pr-3 text-sm leading-none text-slate-700 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-smooth placeholder:text-slate-400 hover:border-brand-200 hover:bg-white focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15`}
            aria-label="Buscar y abrir ficha clínica"
          />
          <kbd className="pointer-events-none absolute right-2.5 hidden rounded-md border border-brand-100 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 shadow-sm lg:inline-block">
            ⌕
          </kbd>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200/90 bg-white/95 py-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-smooth hover:bg-brand-50/80"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200/80 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80">
                    {p.nombres[0]}
                    {p.apellidos[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">
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
          <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-slate-200/90 bg-white/95 p-3.5 text-sm text-slate-400 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md">
            No se encontraron pacientes
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Utility cluster */}
        <div className="flex items-center gap-0.5 rounded-2xl border border-brand-100/80 bg-white/55 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-1">
          <button
            type="button"
            onClick={handleGlobalRefresh}
            disabled={refreshing}
            className={`${ICON_BTN} disabled:opacity-50`}
            title="Actualizar"
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          </button>

          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className={ICON_BTN}
              title="Recordatorios pendientes"
              aria-label="Recordatorios pendientes"
            >
              <Bell className="h-[18px] w-[18px]" />
              {reminders.length > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {reminders.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md sm:w-96">
                <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">
                    Recordatorios pendientes {reminders.length > 0 && `(${reminders.length})`}
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {reminders.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">
                      Sin recordatorios pendientes
                    </p>
                  ) : (
                    reminders.map((r) => (
                      <div key={r.id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                        <p className="text-sm font-medium text-slate-800">{r.patient_nombre}</p>
                        {r.appointment_fecha && (
                          <p className="text-help text-slate-400">
                            Cita: {formatDateTime(r.appointment_fecha, { year: undefined })}
                          </p>
                        )}
                        <p className="mt-0.5 line-clamp-2 text-help text-slate-400">
                          {r.mensaje_sugerido}
                        </p>
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
        </div>

        {lanRealtime ? (
          <>
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight md:inline-flex ${realtimeUi.pill}`}
              title={realtimeUi.text}
            >
              <span className={`h-2 w-2 rounded-full ${realtimeUi.dot}`} aria-hidden />
              {realtimeUi.text}
            </span>
            <span
              className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full md:hidden ${realtimeUi.dot}`}
              title={realtimeUi.text}
              aria-label={realtimeUi.text}
            />
          </>
        ) : null}

        <div className="mx-0.5 hidden h-6 w-px bg-gradient-to-b from-transparent via-brand-200/80 to-transparent sm:block" aria-hidden />

        {/* Primary actions — compact on small screens */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {canAccessModule(user, "pacientes") && (
            <Link
              href="/pacientes/nuevo"
              className={
                isDashboard
                  ? `btn-float-brand inline-flex ${CTRL} items-center gap-1.5 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-2.5 text-sm font-semibold leading-none text-white shadow-[0_6px_16px_-4px_rgba(28,102,232,0.55)] hover:from-brand-600 hover:to-brand-700 sm:px-3.5`
                  : `inline-flex ${CTRL} items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-2.5 text-sm font-semibold leading-none text-white shadow-[0_4px_12px_-3px_rgba(28,102,232,0.45)] transition-smooth hover:from-brand-600 hover:to-brand-700 sm:px-3`
              }
            >
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden lg:inline">Nuevo paciente</span>
              <span className="hidden sm:inline lg:hidden">Paciente</span>
            </Link>
          )}
          {canAccessModule(user, "agenda") && (
            <Link
              href="/agenda?nueva=1"
              title="Nueva cita"
              aria-label="Nueva cita"
              className={`inline-flex ${CTRL} items-center gap-1.5 rounded-xl border border-brand-100 bg-white/80 px-2 text-sm font-medium leading-none text-slate-700 shadow-sm transition-smooth hover:border-brand-300 hover:bg-brand-50/80 hover:text-brand-700 sm:px-2.5`}
            >
              <Calendar className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden lg:inline">Nueva cita</span>
            </Link>
          )}
        </div>

        <div className="mx-0.5 hidden h-6 w-px bg-gradient-to-b from-transparent via-brand-200/80 to-transparent sm:block" aria-hidden />

        {/* Identity + compact logout */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <div ref={userRef} className="relative">
            <button
              type="button"
              onClick={() => setUserOpen(!userOpen)}
              className={`inline-flex ${CTRL} items-center gap-1.5 rounded-xl border border-brand-100/90 bg-white/80 px-1.5 shadow-sm transition-smooth hover:border-brand-200 hover:bg-white hover:shadow sm:gap-2 sm:pr-2`}
              aria-expanded={userOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-[0_2px_6px_-1px_rgba(28,102,232,0.45)] ring-2 ring-white">
                {initials}
              </span>
              <div className="hidden min-w-0 text-left leading-tight md:block">
                <p className="max-w-[6.5rem] truncate text-xs font-semibold text-slate-800 lg:max-w-28">
                  {user?.nombre}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {user?.rol}
                </p>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 md:inline" />
            </button>
            {userOpen && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-[min(14rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 py-1 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md"
              >
                <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-white px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-800">{user?.nombre}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email}</p>
                </div>
                {canAccessModule(user, "configuracion") && (
                  <Link
                    href="/configuracion"
                    role="menuitem"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-smooth hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4 text-slate-400" />
                    Configuración
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger-600 transition-smooth hover:bg-danger-50"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className={`inline-flex ${CTRL} w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-smooth hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700 hover:shadow-sm`}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
