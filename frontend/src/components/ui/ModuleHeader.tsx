import Link from "next/link";
import { ReactNode } from "react";

type Crumb = { label: string; href?: string };

interface ModuleHeaderProps {
  crumbs?: Crumb[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}

/**
 * Shared premium module header — presentation only (no business logic).
 * Keeps breadcrumbs + title + actions consistent across Agenda, Caja, Pacientes, etc.
 */
export function ModuleHeader({
  crumbs,
  title,
  description,
  actions,
  meta,
}: ModuleHeaderProps) {
  return (
    <header className="module-header flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Ruta" className="mb-1.5 flex flex-wrap items-center gap-1 text-sm text-slate-400">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-slate-300">/</span>}
                {c.href ? (
                  <Link href={c.href} className="transition-smooth hover:text-brand-600">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-600">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-page-title tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
