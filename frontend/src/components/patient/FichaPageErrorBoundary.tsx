"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Isolates a whole clinical page (ficha tabs) so one media/upload crash
 * cannot blank the entire AppShell main column in WebView2.
 */
export class FichaPageErrorBoundary extends Component<
  { children: ReactNode; title?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[FichaPageErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-950"
        >
          <p className="text-base font-semibold">
            {this.props.title || "La ficha se recuperó de un error"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-900/90">
            Un panel (p. ej. pruebas complementarias u odontograma) falló al
            cargar un archivo. La barra lateral sigue disponible.
          </p>
          <p className="mt-2 break-all font-mono text-[11px] text-amber-800/80">
            {this.state.error.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar panel
            </button>
            <button
              type="button"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              onClick={() => {
                try {
                  window.location.reload();
                } catch {
                  this.setState({ error: null });
                }
              }}
            >
              Recargar ficha
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
