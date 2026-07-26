"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canAccessHref } from "@/lib/roles";
import { NAV_PRINCIPAL, isNavActive } from "./navItems";

/** Thumb-friendly primary navigation on phones / small tablets. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = NAV_PRINCIPAL.filter((item) => canAccessHref(user, item.href)).slice(0, 5);

  if (items.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md md:hidden"
      aria-label="Navegación rápida"
    >
      <ul className="grid grid-cols-5 gap-0.5 px-1.5 py-1.5">
        {items.map(({ href, label, shortLabel, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-smooth",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-smooth",
                    active ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30" : "bg-transparent",
                  ].join(" ")}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} aria-hidden />
                </span>
                <span className="max-w-full truncate">{shortLabel || label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
