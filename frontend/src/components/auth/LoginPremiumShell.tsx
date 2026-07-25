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
 */
export function LoginPremiumShell({
  children,
  footer,
  panelEyebrow,
  panelTitle,
}: LoginPremiumShellProps) {
  return (
    <div className="login-premium relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        aria-hidden
        style={{
          background:
            "radial-gradient(1200px 600px at 12% 20%, rgba(85,187,249,0.18), transparent 55%), radial-gradient(900px 500px at 88% 80%, rgba(28,102,232,0.10), transparent 50%), #eef2f6",
        }}
      />

      <div className="login-premium__card relative z-[1] grid w-full max-w-[980px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_-28px_rgba(15,23,42,0.35),0_8px_24px_-12px_rgba(15,23,42,0.12)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Visual pane */}
        <aside className="relative hidden min-h-[280px] overflow-hidden lg:block lg:min-h-[560px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/login/dental-hud-bg.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
            decoding="async"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-900/10 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-6 pb-7">
            <div className="login-glass rounded-2xl border border-white/35 px-5 py-4 text-white shadow-[0_8px_32px_rgba(15,23,42,0.25)]">
              <p className="text-[0.8rem] font-medium tracking-wide text-white/85">
                {panelEyebrow}
              </p>
              <p className="mt-1 text-[1.35rem] font-bold leading-snug tracking-[-0.02em] text-balance">
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

        {/* Mobile hero strip */}
        <div className="relative h-[148px] overflow-hidden sm:h-[168px] lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/login/dental-hud-bg.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[70%_30%]"
            decoding="async"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="login-glass rounded-xl border border-white/30 px-3.5 py-2.5 text-white">
              <p className="text-[0.7rem] font-medium text-white/85">{panelEyebrow}</p>
              <p className="text-[1.05rem] font-bold leading-snug tracking-[-0.02em]">
                {panelTitle}
              </p>
            </div>
          </div>
        </div>

        {/* Form pane */}
        <div className="flex flex-col justify-center px-6 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          {children}
        </div>
      </div>

      <div className="relative z-[1] mt-6 w-full max-w-[980px]">{footer}</div>
    </div>
  );
}
