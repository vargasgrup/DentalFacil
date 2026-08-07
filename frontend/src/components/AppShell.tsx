"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight, PanelLeftOpen, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SidebarEdgeToggle } from "./SidebarEdgeToggle";
import { Topbar } from "./Topbar";
import { BrandLogo } from "./BrandLogo";
import { MaintenanceAlert } from "./MaintenanceAlert";
import { MobileBottomNav } from "./MobileBottomNav";
import {
  SHELL_SIDEBAR_BRAND_CLASS,
  SHELL_SIDEBAR_COLLAPSED_WIDTH,
  SHELL_SIDEBAR_WIDTH,
} from "./shell";
import { useAuth } from "@/lib/auth";
import {
  pinClinicShellHeight,
  recoverClinicMainPaint,
} from "@/lib/desktopViewport";
import { useSidebar } from "./SidebarContext";

const RAIL_SURFACE =
  "border-r border-slate-300/90 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-50";

/**
 * Shell: rail EN FLUJO + viewport altura fija.
 * html/body no scrollean. Solo `main.app-main` hace scroll vertical
 * (contenido de cada página fluye sin un segundo overflow anidado).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { demoMode } = useAuth();
  const {
    mode,
    setMode,
    cycleMode,
    open,
    openSidebar,
    closeSidebar,
    isIconRail,
    isFloatingOverlay,
  } = useSidebar();

  // Lock document scroll for the whole time the clinical shell is mounted
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("nk-app-shell");
    body.classList.add("nk-app-shell");
    pinClinicShellHeight();
    const onResize = () => pinClinicShellHeight();
    const onVis = () => {
      if (document.visibilityState === "visible") recoverClinicMainPaint();
    };
    const onFocus = () => recoverClinicMainPaint();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      html.classList.remove("nk-app-shell");
      body.classList.remove("nk-app-shell");
      html.style.removeProperty("--nk-shell-h");
    };
  }, []);

  // Keep drawer lock for nested dialogs without dropping shell class
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const docked = mode === "expanded" || mode === "collapsed";
  const railWidth =
    mode === "collapsed" ? SHELL_SIDEBAR_COLLAPSED_WIDTH : SHELL_SIDEBAR_WIDTH;

  return (
    <div className="flex h-[var(--nk-shell-h,100vh)] max-h-[var(--nk-shell-h,100vh)] min-h-0 w-full overflow-hidden bg-surface-muted">
      <MaintenanceAlert />

      {/* Desktop rail — in-flow, altura completa del viewport */}
      {docked && (
        <aside
          className={`nk-shell-rail relative z-30 hidden h-full min-h-0 shrink-0 flex-col overflow-visible ${railWidth} ${RAIL_SURFACE} shadow-[4px_0_24px_-12px_rgba(15,23,42,0.28)] transition-[width] duration-[var(--motion-duration,180ms)] ease-smooth md:flex`}
          aria-label="Barra de navegación"
          data-sidebar-mode={mode}
        >
          <div
            className={`${SHELL_SIDEBAR_BRAND_CLASS} shrink-0 ${
              isIconRail ? "justify-center px-1" : ""
            }`}
          >
            <Link
              href="/dashboard"
              className={`flex h-full items-center ${
                isIconRail ? "justify-center" : "w-full"
              }`}
              aria-label="Inicio"
            >
              {isIconRail ? (
                <BrandLogo
                  variant="sidebar"
                  className="!max-h-9 !max-w-[2.5rem]"
                />
              ) : (
                <BrandLogo variant="sidebar" className="!max-h-14" />
              )}
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Sidebar collapsed={isIconRail} />
          </div>

          <SidebarEdgeToggle
            collapsed={isIconRail}
            onToggle={() =>
              setMode(mode === "collapsed" ? "expanded" : "collapsed")
            }
          />
        </aside>
      )}

      {/* Floating: atajo para reabrir el overlay */}
      {mode === "floating" && !open && (
        <div className="fixed left-2 top-[4.75rem] z-40 hidden md:block">
          <button
            type="button"
            onClick={openSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-md transition-smooth hover:border-brand-300 hover:text-brand-700"
            aria-label="Mostrar navegación"
            title="Navegación flotante"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] md:hidden"
            onClick={closeSidebar}
            aria-hidden
          />
          <aside
            className={`fixed left-0 top-0 z-50 flex h-dvh w-[min(18.5rem,88vw)] flex-col ${RAIL_SURFACE} shadow-2xl md:hidden`}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <div className={`${SHELL_SIDEBAR_BRAND_CLASS} justify-between gap-2`}>
              <Link
                href="/dashboard"
                onClick={closeSidebar}
                className="flex min-w-0 flex-1 items-center"
                aria-label="Inicio"
              >
                <BrandLogo variant="sidebar" />
              </Link>
              <button
                type="button"
                onClick={closeSidebar}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-smooth hover:bg-slate-50 hover:text-slate-900"
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Sidebar onNavigate={closeSidebar} />
            </div>
          </aside>
        </>
      )}

      {/* Floating overlay (md+) */}
      {isFloatingOverlay && (
        <>
          <div
            className="fixed inset-0 z-40 hidden bg-slate-950/40 backdrop-blur-[2px] md:block"
            onClick={closeSidebar}
            aria-hidden
          />
          <aside
            className={`fixed left-0 top-0 z-50 hidden h-dvh w-64 flex-col ${RAIL_SURFACE} shadow-2xl md:flex`}
            role="dialog"
            aria-modal="true"
            aria-label="Navegación flotante"
          >
            <div className={`${SHELL_SIDEBAR_BRAND_CLASS} justify-between gap-2`}>
              <Link
                href="/dashboard"
                onClick={closeSidebar}
                className="flex min-w-0 flex-1 items-center"
                aria-label="Inicio"
              >
                <BrandLogo variant="sidebar" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode("expanded");
                  closeSidebar();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
                Anclar
              </button>
              <button
                type="button"
                onClick={closeSidebar}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Sidebar onNavigate={closeSidebar} />
            </div>
          </aside>
        </>
      )}

      {/* Columna de trabajo: altura acotada; scroll SOLO dentro de main children */}
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
        <Topbar
          onMenuClick={openSidebar}
          onSidebarModeClick={cycleMode}
          sidebarMode={mode}
        />
        {demoMode && (
          <div
            role="status"
            className="shrink-0 border-b border-amber-200/90 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950 sm:text-sm"
          >
            Versión DEMO — varios usuarios comparten el mismo acceso Admin; el
            usuario y la contraseña del Administrador son inmodificables.
          </div>
        )}
        <main className="app-main min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
