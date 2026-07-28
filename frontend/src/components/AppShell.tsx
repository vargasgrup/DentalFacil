"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BrandLogo } from "./BrandLogo";
import { MaintenanceAlert } from "./MaintenanceAlert";
import { MobileBottomNav } from "./MobileBottomNav";
import { SHELL_SIDEBAR_BRAND_CLASS, SHELL_SIDEBAR_WIDTH } from "./shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <MaintenanceAlert />

      {/* Desktop / tablet sidebar — stronger rail contrast vs content */}
      <aside
        className={`fixed left-0 top-0 z-30 hidden h-dvh ${SHELL_SIDEBAR_WIDTH} flex-col border-r border-slate-400/80 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-50 shadow-[10px_0_32px_-12px_rgba(15,23,42,0.38)] md:flex`}
        aria-label="Barra de navegación"
      >
        <div className={`${SHELL_SIDEBAR_BRAND_CLASS} shrink-0`}>
          <Link href="/dashboard" className="flex h-full w-full items-center" aria-label="Inicio">
            <BrandLogo variant="sidebar" className="!max-h-14" />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile / small drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition-opacity md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside
            className={`fixed left-0 top-0 z-50 flex h-screen w-[min(18.5rem,88vw)] flex-col border-r border-slate-400/80 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-50 shadow-2xl md:hidden`}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <div className={`${SHELL_SIDEBAR_BRAND_CLASS} justify-between gap-2`}>
              <Link
                href="/dashboard"
                onClick={() => setSidebarOpen(false)}
                className="flex min-w-0 flex-1 items-center"
                aria-label="Inicio"
              >
                <BrandLogo variant="sidebar" />
              </Link>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-smooth hover:bg-slate-50 hover:text-slate-900"
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      <div className={`flex min-w-0 flex-1 flex-col md:pl-64`}>
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-6">{children}</main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
