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
    <div className="min-w-0">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[0.9rem] leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

const linkClass =
  "font-medium text-brand-600 underline-offset-2 transition-smooth hover:text-brand-700 hover:underline";

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="about-modal w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_64px_-20px_rgba(15,23,42,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
          <header className="border-b border-slate-100 pb-4">
            <h2
              id={titleId}
              className="text-[1.25rem] font-bold tracking-tight text-slate-900 sm:text-[1.35rem]"
            >
              Acerca de
            </h2>
            <p className="mt-1 text-[0.95rem] font-semibold text-slate-700">
              {v.companyName}
            </p>
          </header>

          <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2">
            <AboutField label="Razón Social">{v.razonSocial}</AboutField>
            <AboutField label="RUC">{v.ruc}</AboutField>
            <div className="sm:col-span-2">
              <AboutField label="Dirección">{v.address}</AboutField>
            </div>
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
            <AboutField label="Año de fundación">{v.foundedYear}</AboutField>
            <div className="sm:col-span-2">
              <AboutField label="Software">{v.software}</AboutField>
            </div>
            <div className="sm:col-span-2">
              <AboutField label="Mensaje corporativo">
                <span className="italic text-slate-600">“{v.tagline}”</span>
              </AboutField>
            </div>
          </dl>
        </div>

        <div className="flex justify-start border-t border-slate-100 bg-slate-50/80 px-6 py-3.5 sm:px-7">
          <Button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-w-[5.5rem] rounded-lg"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
