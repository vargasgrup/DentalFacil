"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canAccessHref } from "@/lib/roles";
import { NAV_PRINCIPAL, NAV_SISTEMA, isNavActive, type NavItem } from "./navItems";

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: NavItem & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold tracking-tight transition-smooth",
        active
          ? "bg-brand-600 text-white shadow-sm shadow-brand-600/25"
          : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-smooth",
          active
            ? "bg-white/15 text-white"
            : "bg-slate-200/70 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600",
        ].join(" ")}
      >
        <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} aria-hidden />
      </span>
      <span className="truncate">{label}</span>
      {active && (
        <span className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
      )}
    </Link>
  );
}

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const principalVisible = NAV_PRINCIPAL.filter((item) => canAccessHref(user, item.href));
  const sistemaVisible = NAV_SISTEMA.filter((item) => canAccessHref(user, item.href));

  return (
    <nav
      className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      aria-label="Navegación principal"
    >
      <NavSection title="Principal" items={principalVisible} onNavigate={onNavigate} />
      <NavSection title="Sistema" items={sistemaVisible} onNavigate={onNavigate} />
      <div className="mt-auto rounded-xl border border-slate-200/80 bg-white/70 px-3 py-3">
        <p className="text-xs font-semibold text-slate-700">N&K DentalSoft</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          Use el menú para cambiar de módulo en un toque.
        </p>
      </div>
    </nav>
  );
}
