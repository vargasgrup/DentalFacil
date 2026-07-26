/**
 * Patient ficha routes for Next.js `output: "export"`.
 *
 * Only `pacientes/_` is pre-rendered; FastAPI serves that HTML for any real id.
 * Client soft-nav cannot invent new dynamic segments — use full document loads.
 */

export function pacienteFichaPath(patientId: string): string {
  const id = String(patientId || "").trim();
  return `/pacientes/${encodeURIComponent(id)}/`;
}

/** Full navigation so FastAPI SPA fallback can serve `pacientes/_/index.html`. */
export function navigateToPacienteFicha(patientId: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(pacienteFichaPath(patientId));
}

/**
 * Resolve the real patient id: static export embeds `params.id === "_"`.
 * Prefer the URL path segment after a deep link / hard navigation.
 */
export function resolvePacienteIdFromRoute(
  paramId: string | string[] | undefined,
  pathname?: string
): string {
  const raw = Array.isArray(paramId) ? paramId[0] : paramId;
  if (raw && raw !== "_") return String(raw);

  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const m = path.match(/\/pacientes\/([^/]+)/i);
  const seg = m?.[1] ? decodeURIComponent(m[1]) : "";
  if (seg && seg !== "_" && seg !== "nuevo") return seg;
  return raw && raw !== "_" ? String(raw) : "";
}
