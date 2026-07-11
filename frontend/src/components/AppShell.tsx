"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BrandLogo } from "./BrandLogo";
import { SHELL_HEADER_CLASS } from "./shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-56 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className={`${SHELL_HEADER_CLASS} px-3`}>
          <Link href="/dashboard" className="flex h-full w-full items-center" aria-label="Inicio">
            <BrandLogo variant="sidebar" />
          </Link>
        </div>
        <Sidebar />
      </aside>

      {/* Mobile sidebar (drawer) */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 transition-opacity lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside className="fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-slate-200 bg-white lg:hidden">
            <div className={`${SHELL_HEADER_CLASS} justify-between gap-2 px-3`}>
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-smooth hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
