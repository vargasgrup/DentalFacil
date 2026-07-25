"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { VENDOR_ABOUT } from "@/lib/vendorAbout";

interface AboutVendorModalProps {
  open: boolean;
  onClose: () => void;
}

function AboutField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-sm font-semibold text-slate-800">{label}</dt>
      <dd className="text-sm leading-relaxed text-slate-600">{children}</dd>
    </div>
  );
}

const linkClass =
  "text-brand-600 underline-offset-2 transition-smooth hover:text-brand-700 hover:underline";

export function AboutVendorModal({ open, onClose }: AboutVendorModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const v = VENDOR_ABOUT;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92vh,640px)] w-full max-w-[420px] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-card sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
          <header className="mb-5">
            <h2
              id={titleId}
              className="text-[1.35rem] font-bold tracking-tight text-slate-900"
            >
              Acerca de
            </h2>
            <p className="mt-1 text-[0.95rem] font-medium text-slate-600">
              {v.companyName}
            </p>
          </header>

          <dl className="space-y-4">
            <AboutField label="Razón Social">{v.razonSocial}</AboutField>
            <AboutField label="RUC">{v.ruc}</AboutField>
            <AboutField label="Dirección">{v.address}</AboutField>
            <AboutField label="Teléfono">
              <a href={v.phoneHref} className={linkClass}>
                {v.phoneDisplay}
              </a>
            </AboutField>
            <AboutField label="Email">
              <a href={`mailto:${v.email}`} className={linkClass}>
                {v.email}
              </a>
            </AboutField>
            <AboutField label="Sitio web">
              <a
                href={v.websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {v.websiteDisplay}
              </a>
            </AboutField>
            <AboutField label="Software">{v.software}</AboutField>
            <AboutField label="Año de fundación">{v.foundedYear}</AboutField>
            <AboutField label="Mensaje corporativo">
              <span className="italic text-slate-600">“{v.tagline}”</span>
            </AboutField>
          </dl>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-6 py-4">
          <Button ref={closeRef} type="button" onClick={onClose} className="min-w-[5.5rem]">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
