"use client";

import { ReactNode } from "react";

interface LoginPremiumShellProps {
  children: ReactNode;
  footer: ReactNode;
  panelEyebrow: string;
  panelTitle: string;
}

/**
 * Split-pane auth shell that stays usable on short laptop viewports:
 * scrolls when needed, uses `safe center`, and densifies via CSS height queries.
 */
export function LoginPremiumShell({
  children,
  footer,
  panelEyebrow,
  panelTitle,
}: LoginPremiumShellProps) {
  return (
    <div className="login-premium relative flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        aria-hidden
        style={{
          background:
            "radial-gradient(1200px 600px at 50% 18%, rgba(85,187,249,0.18), transparent 55%), radial-gradient(900px 500px at 50% 85%, rgba(28,102,232,0.10), transparent 50%), #eef2f6",
        }}
      />

      {/* safe center: centers when it fits; top-aligns when content is taller than the screen */}
      <div className="relative z-[1] mx-auto flex w-full max-w-[min(980px,100%)] flex-1 flex-col justify-safe-center px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="login-premium__card grid w-full overflow-hidden rounded-[20px] bg-white shadow-[0_24px_80px_-28px_rgba(15,23,42,0.35),0_8px_24px_-12px_rgba(15,23,42,0.12)] sm:rounded-[24px] lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          {/* Visual pane — equipment crop (right of Odontologia-Moderna); height follows form */}
          <aside className="login-premium__visual relative hidden overflow-hidden lg:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/login/dental-hud-bg.webp"
              alt=""
              className="login-hero-img absolute inset-0 h-full w-full object-cover"
              decoding="async"
              fetchPriority="high"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-900/15 to-transparent"
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0 p-4 xl:p-5">
              <div className="login-glass rounded-2xl border border-white/35 px-4 py-3.5 text-white shadow-[0_8px_32px_rgba(15,23,42,0.25)] xl:px-5 xl:py-4">
                <p className="text-[0.75rem] font-medium tracking-wide text-white/85 xl:text-[0.8rem]">
                  {panelEyebrow}
                </p>
                <p className="mt-1 text-[1.1rem] font-bold leading-snug tracking-[-0.02em] text-balance xl:text-[1.25rem]">
                  {panelTitle}
                </p>
                <div className="mt-3 flex items-center gap-1.5" aria-hidden>
                  <span className="h-1.5 w-5 rounded-full bg-white" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                </div>
              </div>
            </div>
          </aside>

          {/* Compact hero for phones / narrow screens — hidden on short height via CSS */}
          <div className="login-premium__strip relative h-[112px] overflow-hidden sm:h-[128px] lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/login/dental-hud-bg.webp"
              alt=""
              className="login-hero-img absolute inset-0 h-full w-full object-cover"
              decoding="async"
              fetchPriority="high"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent"
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-3.5">
              <div className="login-glass rounded-xl border border-white/30 px-3 py-2 text-white sm:px-3.5 sm:py-2.5">
                <p className="text-[0.65rem] font-medium text-white/85 sm:text-[0.7rem]">
                  {panelEyebrow}
                </p>
                <p className="text-[0.95rem] font-bold leading-snug tracking-[-0.02em] sm:text-[1rem]">
                  {panelTitle}
                </p>
              </div>
            </div>
          </div>

          {/* Form pane */}
          <div className="login-premium__pane flex flex-col justify-center px-4 py-5 sm:px-7 sm:py-7 lg:px-9 lg:py-8 xl:px-11 xl:py-10">
            {children}
          </div>
        </div>

        <div className="login-premium__footer mt-4 w-full sm:mt-5">{footer}</div>
      </div>
    </div>
  );
}
