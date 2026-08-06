/**
 * Cola offline en IndexedDB (no Caja).
 * Operaciones encolables: altas/ediciones de paciente, evolución clínica.
 * Sincroniza al recuperar /api/health con Idempotency-Key.
 */

const DB_NAME = "nk-ds-offline";
const STORE = "outbox";
const DB_VERSION = 1;

export type OfflineOpKind = "patient_patch" | "patient_create" | "evolution_create";

export interface OfflineOp {
  id: string;
  kind: OfflineOpKind;
  /** Path relativo ej. /api/patients/xyz */
  path: string;
  method: "POST" | "PATCH" | "PUT";
  body: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOfflineOp(
  partial: Omit<OfflineOp, "id" | "createdAt" | "attempts">
): Promise<OfflineOp> {
  const op: OfflineOp = {
    ...partial,
    id: uuid(),
    createdAt: Date.now(),
    attempts: 0,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return op;
}

export async function listOfflineOps(): Promise<OfflineOp[]> {
  const db = await openDb();
  const rows = await new Promise<OfflineOp[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as OfflineOp[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOfflineOp(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearOfflineOps(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function countOfflineOps(): Promise<number> {
  const all = await listOfflineOps();
  return all.length;
}

export type SyncResult = {
  ok: number;
  failed: number;
  remaining: number;
};

/**
 * Envía la cola. No incluye endpoints de Caja.
 */
export async function flushOfflineQueue(
  fetchFn: (
    path: string,
    init: RequestInit & { headers?: Record<string, string> }
  ) => Promise<Response>
): Promise<SyncResult> {
  const ops = await listOfflineOps();
  let ok = 0;
  let failed = 0;
  for (const op of ops) {
    // Hard ban: nunca reenviar caja
    if (op.path.includes("/api/cash/")) {
      await removeOfflineOp(op.id);
      continue;
    }
    try {
      const res = await fetchFn(op.path, {
        method: op.method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": op.id,
        },
        body: JSON.stringify(op.body),
      });
      if (res.ok || res.status === 409) {
        await removeOfflineOp(op.id);
        ok += 1;
      } else {
        failed += 1;
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const next = {
            ...op,
            attempts: op.attempts + 1,
            lastError: `HTTP ${res.status}`,
          };
          tx.objectStore(STORE).put(next);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }
    } catch (e) {
      failed += 1;
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const next = {
          ...op,
          attempts: op.attempts + 1,
          lastError: e instanceof Error ? e.message : "Error de red",
        };
        tx.objectStore(STORE).put(next);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }
  }
  const remaining = await countOfflineOps();
  return { ok, failed, remaining };
}

/** Claves locales conocidas para panel de privacidad */
export const LOCAL_STORAGE_UI_KEYS = [
  "nk-ds:ui:density",
  "nk-ds:ui:font-scale",
  "nk-ds:ui:reduced-motion",
  "nk-ds:ui:contrast",
  "nk-ds:ui:panel:sidebar",
  "nk-ds:ui:shortcuts",
  "nk-ds:ui:treatment-freq",
] as const;

export function clearLocalUiData(): void {
  for (const k of LOCAL_STORAGE_UI_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
