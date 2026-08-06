"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  Building2,
  Cloud,
  Clock,
  KeyRound,
  Search,
  Tag,
  User,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { ConfigEmbedCtx } from "@/components/config/configEmbedContext";

export type ConfigSectionId =
  | "datos"
  | "cuenta"
  | "usuarios"
  | "recuperacion"
  | "horario"
  | "especialidades"
  | "recordatorios"
  | "equipos"
  | "respaldo";

type NavItem = {
  id: ConfigSectionId;
  label: string;
  icon: LucideIcon;
  description: string;
  adminOnly?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Centro",
    items: [
      {
        id: "datos",
        label: "Datos del centro",
        icon: Building2,
        description:
          "Información oficial del centro odontológico. Se usa en tickets, fichas, consentimientos, presupuestos y recordatorios.",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Cuenta y accesos",
    items: [
      {
        id: "cuenta",
        label: "Mi cuenta",
        icon: User,
        description:
          "Actualice su nombre visible, usuario de acceso o contraseña. El correo solo se usa para recuperar la cuenta.",
      },
      {
        id: "usuarios",
        label: "Usuarios del centro",
        icon: Users,
        description:
          "Hasta 2 administradores. Asigna rol y marca los módulos permitidos por usuario.",
        adminOnly: true,
      },
      {
        id: "recuperacion",
        label: "Recuperación de contraseña",
        icon: KeyRound,
        description:
          "Códigos de recuperación pendientes para entregar al usuario de forma verbal o por WhatsApp.",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Operación",
    items: [
      {
        id: "horario",
        label: "Horario de atención",
        icon: Clock,
        description:
          "Rango visible en la grilla de Agenda. El sistema usa formato de 12 horas (a. m. / p. m.).",
      },
      {
        id: "especialidades",
        label: "Especialidades odontológicas",
        icon: Tag,
        description:
          "Catálogo del centro para evolución clínica y citas.",
      },
    ],
  },
  {
    title: "Automatización y conectividad",
    items: [
      {
        id: "recordatorios",
        label: "Recordatorios de citas",
        icon: Bell,
        description:
          "Anticipación y plantilla WhatsApp. El envío es manual (un clic).",
      },
      {
        id: "equipos",
        label: "Equipos conectados",
        icon: Wifi,
        description:
          "Disponible en el modo Escritorio (Server + Clients en la red local de la clínica).",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        id: "respaldo",
        label: "Respaldo y Migración",
        icon: Cloud,
        description:
          "Genera un paquete completo (base de datos + archivos) para USB o migrar a otra PC.",
        adminOnly: true,
      },
    ],
  },
];

type BadgeMap = Partial<Record<ConfigSectionId, { label: string; tone?: "info" | "warning" }>>;

type Props = {
  isAdmin: boolean;
  /** When true, Mi cuenta copy reflects shared-Admin DEMO lock. */
  demoMode?: boolean;
  badges?: BadgeMap;
  children: (section: ConfigSectionId, meta: NavItem) => ReactNode;
};

export function ConfigSettingsShell({
  isAdmin,
  demoMode = false,
  badges = {},
  children,
}: Props) {
  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .filter((it) => (it.adminOnly ? isAdmin : true))
        .map((it) => {
          if (it.id === "cuenta" && demoMode) {
            return {
              ...it,
              description:
                "Versión DEMO: puede actualizar el nombre visible. Correo y contraseña del Administrador están protegidos (acceso compartido).",
            };
          }
          return it;
        }),
    })).filter((g) => g.items.length > 0);
  }, [isAdmin, demoMode]);

  const allItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items),
    [visibleGroups],
  );

  const defaultId = allItems[0]?.id ?? "cuenta";
  const [activeId, setActiveId] = useState<ConfigSectionId>(defaultId);
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const safeActiveId = allItems.some((i) => i.id === activeId) ? activeId : defaultId;
  const safeActive = allItems.find((i) => i.id === safeActiveId) ?? allItems[0];

  if (!safeActive) return null;

  const Icon = safeActive.icon;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[272px_minmax(0,1fr)]">
      <nav
        className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm lg:sticky lg:top-4"
        aria-label="Secciones de configuración"
      >
        <label className="mb-3.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5 lg:py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar sección…"
            className="hidden w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 lg:block"
            aria-label="Filtrar secciones"
          />
          {/* Móvil/tablet: selector nativo — sin carrusel horizontal */}
          <select
            value={safeActiveId}
            onChange={(e) => setActiveId(e.target.value as ConfigSectionId)}
            className="w-full bg-transparent text-sm font-medium text-slate-800 outline-none lg:hidden"
            aria-label="Sección de configuración"
          >
            {allItems
              .filter((it) => (q ? it.label.toLowerCase().includes(q) : true))
              .map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
          </select>
        </label>

        <div className="hidden gap-1.5 lg:block lg:overflow-visible">
          {visibleGroups.map((group) => {
            const items = group.items.filter((it) =>
              q ? it.label.toLowerCase().includes(q) : true,
            );
            if (!items.length) return null;
            return (
              <div key={group.title} className="mb-4 last:mb-0">
                <p className="mb-1.5 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-400">
                  {group.title}
                </p>
                {items.map((it) => {
                  const selected = it.id === safeActiveId;
                  const ItemIcon = it.icon;
                  const badge = badges[it.id];
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setActiveId(it.id)}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2.5 text-left text-[13.5px] font-medium transition-all duration-150 ${
                        selected
                          ? "border-brand-600 bg-brand-50 font-bold text-brand-800"
                          : "border-transparent text-slate-700 hover:bg-slate-50"
                      }`}
                      aria-current={selected ? "page" : undefined}
                    >
                      <ItemIcon
                        className={`h-4 w-4 shrink-0 ${
                          selected ? "text-brand-600" : "text-slate-400"
                        }`}
                        aria-hidden
                        strokeWidth={1.75}
                      />
                      <span className="flex-1 leading-snug">{it.label}</span>
                      {badge ? (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                            badge.tone === "warning"
                              ? "bg-warning-50 text-warning-700"
                              : "bg-brand-50 text-brand-700"
                          }`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>

      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-600">
              <Icon className="h-5 w-5" aria-hidden strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-extrabold tracking-tight text-slate-900 text-wrap-balance">
                {safeActive.label}
              </h2>
              <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-slate-500 text-pretty">
                {safeActive.description}
              </p>
            </div>
          </div>
        </header>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <ConfigEmbedCtx.Provider value={true}>
            {children(safeActiveId, safeActive)}
          </ConfigEmbedCtx.Provider>
        </div>
      </section>
    </div>
  );
}
