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
      title={label}
      className={[
        "group relative flex min-h-[2.75rem] items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold tracking-tight transition-smooth",
        active
          ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
          : "text-slate-600 hover:bg-white/90 hover:text-slate-900 hover:shadow-sm",
      ].join(" ")}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-white/90"
          aria-hidden
        />
      )}
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-smooth",
          active
            ? "bg-white/20 text-white"
            : "bg-slate-200/80 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-700",
        ].join(" ")}
      >
        <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2.35 : 2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
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
    <div className="space-y-1">
      <p className="sticky top-0 z-[1] bg-gradient-to-b from-slate-200 via-slate-200/95 to-slate-100/90 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 backdrop-blur-[2px]">
        {title}
      </p>
      <div className="space-y-0.5 px-0.5">
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
      className="sidebar-nav flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-2.5 py-3"
      aria-label="Navegación principal"
    >
      <NavSection title="Principal" items={principalVisible} onNavigate={onNavigate} />
      <NavSection title="Sistema" items={sistemaVisible} onNavigate={onNavigate} />
    </nav>
  );
}
