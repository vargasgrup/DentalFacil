"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Isolates document/media UI faults so the clinic WebView does not blank out.
 */
export class MediaPanelErrorBoundary extends Component<
  { children: ReactNode; title?: string; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[MediaPanelErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">
            {this.props.title || "No se pudo mostrar el panel de medios"}
          </p>
          <p className="mt-1 text-xs text-amber-800/90">
            El visor falló de forma controlada. La ficha del paciente sigue disponible.
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
