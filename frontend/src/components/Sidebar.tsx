"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calendar, Wallet, BarChart3, Settings } from "lucide-react";

const principal = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/caja", label: "Caja", icon: Wallet },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

const sistema = [
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active =
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-smooth ${
        active
          ? "bg-brand-50 text-brand-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-600" />
      )}
      <Icon className={`h-[18px] w-[18px] ${active ? "text-brand-600" : "text-slate-400"}`} />
      {label}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
      <div>
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Principal
        </p>
        <div className="space-y-0.5">
          {principal.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Sistema
        </p>
        <div className="space-y-0.5">
          {sistema.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </nav>
  );
}
