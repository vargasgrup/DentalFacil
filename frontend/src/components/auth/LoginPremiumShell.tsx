"use client";

import { ReactNode } from "react";

interface LoginPremiumShellProps {
  children: ReactNode;
  footer: ReactNode;
  panelEyebrow: string;
  panelTitle: string;
}

/**
 * Split-pane premium auth shell: cinematic dental HUD (left) + white form (right).
 * Always a centered column (card + footer) from 10" laptops to large desktops.
 */
export function LoginPremiumShell({
  children,
  footer,
  panelEyebrow,
  panelTitle,
}: LoginPremiumShellProps) {
  return (
    <div className="login-premium relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden px-3 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        aria-hidden
        style={{
          background:
            "radial-gradient(1200px 600px at 50% 18%, rgba(85,187,249,0.18), transparent 55%), radial-gradient(900px 500px at 50% 85%, rgba(28,102,232,0.10), transparent 50%), #eef2f6",
        }}
      />

      {/* Centered stack: card + footer share the same axis */}
      <div className="relative z-[1] mx-auto flex w-full max-w-[min(980px,100%)] flex-col items-center">
        <div className="login-premium__card grid w-full overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_-28px_rgba(15,23,42,0.35),0_8px_24px_-12px_rgba(15,23,42,0.12)] sm:rounded-[28px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* Visual pane — crop to dental chair (left), hide hand (right) */}
          <aside className="relative hidden min-h-[240px] overflow-hidden lg:block lg:min-h-[min(560px,72vh)]">
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
            <div className="absolute inset-x-0 bottom-0 p-5 pb-6 xl:p-6 xl:pb-7">
              <div className="login-glass rounded-2xl border border-white/35 px-5 py-4 text-white shadow-[0_8px_32px_rgba(15,23,42,0.25)]">
                <p className="text-[0.8rem] font-medium tracking-wide text-white/85">
                  {panelEyebrow}
                </p>
                <p className="mt-1 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-balance xl:text-[1.35rem]">
                  {panelTitle}
                </p>
                <div className="mt-3.5 flex items-center gap-1.5" aria-hidden>
                  <span className="h-1.5 w-5 rounded-full bg-white" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                </div>
              </div>
            </div>
          </aside>

          {/* Mobile / small laptop hero strip — same chair crop */}
          <div className="relative h-[132px] overflow-hidden sm:h-[152px] lg:hidden">
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
            <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
              <div className="login-glass rounded-xl border border-white/30 px-3.5 py-2.5 text-white">
                <p className="text-[0.7rem] font-medium text-white/85">{panelEyebrow}</p>
                <p className="text-[1rem] font-bold leading-snug tracking-[-0.02em] sm:text-[1.05rem]">
                  {panelTitle}
                </p>
              </div>
            </div>
          </div>

          {/* Form pane */}
          <div className="flex flex-col justify-center px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-12">
            {children}
          </div>
        </div>

        <div className="mt-5 w-full sm:mt-6">{footer}</div>
      </div>
    </div>
  );
}
