/**
 * Sugerencias de tratamiento por frecuencia local (sin LLM).
 */

const KEY = "nk-ds:ui:treatment-freq";

type Entry = { label: string; count: number };
type Store = Record<string, Entry>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function write(m: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function recordTreatmentUse(label: string) {
  const t = (label || "").trim();
  if (t.length < 2) return;
  const k = t.toLowerCase();
  const m = read();
  const prev = m[k];
  m[k] = { label: t, count: (prev?.count || 0) + 1 };
  write(m);
}

export function topLocalTreatments(limit = 8): string[] {
  const m = read();
  return Object.values(m)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => e.label);
}
