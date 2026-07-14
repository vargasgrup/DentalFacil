"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  EMPTY_SURFACES,
  type Denticion,
  type SurfaceKey,
} from "@/lib/odontogramConditions";
import { denticionOfPieza } from "@/lib/odontogramNumbering";

export interface OdontogramEntry {
  id?: string;
  patient_id?: string;
  pieza_fdi: string;
  estado: string;
  denticion?: string;
  superficies?: Record<SurfaceKey, string | null>;
  notas?: string | null;
  updated_at?: string | null;
}

export interface ChangeLogEntry {
  id: string;
  patient_id: string;
  pieza_fdi: string;
  denticion: string;
  estado_antes: string | null;
  estado_despues: string | null;
  superficies_antes: Record<string, string | null> | null;
  superficies_despues: Record<string, string | null> | null;
  user_id: string | null;
  user_name: string | null;
  accion: string;
  changed_at: string;
}

export interface OdontogramSnapshot {
  id: string;
  patient_id: string;
  denticion: string;
  label: string;
  entries: Array<{
    pieza_fdi: string;
    estado: string;
    superficies?: Record<string, string | null>;
    notas?: string | null;
  }>;
  taken_by: string | null;
  taken_by_name: string | null;
  evolution_entry_id: string | null;
  taken_at: string;
}

export interface CompareResult {
  snapshot_a: { id: string; label: string; taken_at: string; denticion: string };
  snapshot_b: { id: string; label: string; taken_at: string; denticion: string };
  diffs: Array<{
    pieza_fdi: string;
    status: "igual" | "cambio" | "solo_a" | "solo_b";
    estado_a?: string | null;
    estado_b?: string | null;
  }>;
  changed_count: number;
}

function emptySurfaces(): Record<SurfaceKey, string | null> {
  return { ...EMPTY_SURFACES };
}

export function isMarked(estado: string | null | undefined) {
  return Boolean(estado && estado !== "sano");
}

export function useOdontogramPatient(patientId: string) {
  const [denticion, setDenticion] = useState<Denticion>("permanente");
  const [tool, setTool] = useState<string>("caries");
  const [entries, setEntries] = useState<Record<string, OdontogramEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (denticion === "mixta") {
        const [perm, temp] = await Promise.all([
          apiFetch<OdontogramEntry[]>(`/api/odontogram/${patientId}?denticion=permanente`),
          apiFetch<OdontogramEntry[]>(`/api/odontogram/${patientId}?denticion=temporal`),
        ]);
        const map: Record<string, OdontogramEntry> = {};
        [...perm, ...temp].forEach((e) => {
          map[e.pieza_fdi] = {
            ...e,
            superficies: { ...emptySurfaces(), ...(e.superficies || {}) },
          };
        });
        setEntries(map);
      } else {
        const data = await apiFetch<OdontogramEntry[]>(
          `/api/odontogram/${patientId}?denticion=${denticion}`
        );
        const map: Record<string, OdontogramEntry> = {};
        data.forEach((e) => {
          map[e.pieza_fdi] = {
            ...e,
            superficies: { ...emptySurfaces(), ...(e.superficies || {}) },
          };
        });
        setEntries(map);
      }
    } catch {
      setEntries({});
    } finally {
      setLoading(false);
    }
  }, [patientId, denticion]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (
    pieza: string,
    estado: string | null,
    superficies: Record<SurfaceKey, string | null>,
    notas?: string | null
  ): Promise<OdontogramEntry | null> => {
    setSaving(true);
    const storeDent =
      denticion === "mixta" ? denticionOfPieza(pieza) : denticion;
    try {
      const updated = await apiFetch<OdontogramEntry>(
        `/api/odontogram/${patientId}/${pieza}`,
        {
          method: "PUT",
          body: JSON.stringify({
            estado: estado || "",
            denticion: storeDent,
            superficies,
            notas: notas !== undefined ? notas : entries[pieza]?.notas || null,
          }),
        }
      );
      const merged = {
        ...updated,
        superficies: { ...emptySurfaces(), ...(updated.superficies || {}) },
      };
      setEntries((prev) => ({ ...prev, [pieza]: merged }));
      return merged;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (
      !window.confirm(
        `¿Limpiar el odontograma (${denticion === "permanente" ? "Adulto" : "Niño"}) de este paciente?`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/odontogram/${patientId}?denticion=${denticion}`, {
        method: "DELETE",
      });
      setEntries({});
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const fetchHistory = useCallback(
    async (pieza?: string | null) => {
      const q = new URLSearchParams({ denticion, limit: "150" });
      if (pieza) q.set("pieza_fdi", pieza);
      return apiFetch<ChangeLogEntry[]>(`/api/odontogram/${patientId}/history?${q}`);
    },
    [patientId, denticion]
  );

  const fetchSnapshots = useCallback(async () => {
    return apiFetch<OdontogramSnapshot[]>(
      `/api/odontogram/${patientId}/snapshots?denticion=${denticion}`
    );
  }, [patientId, denticion]);

  const saveSnapshot = async (label?: string) => {
    setSaving(true);
    try {
      return await apiFetch<OdontogramSnapshot>(`/api/odontogram/${patientId}/snapshots`, {
        method: "POST",
        body: JSON.stringify({
          denticion,
          label: label || `Cita ${new Date().toLocaleString("es-VE")}`,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const compareSnapshots = async (a: string, b: string) => {
    return apiFetch<CompareResult>(
      `/api/odontogram/${patientId}/compare?a=${a}&b=${b}`
    );
  };

  return {
    denticion,
    setDenticion,
    tool,
    setTool,
    entries,
    loading,
    saving,
    load,
    persist,
    clearAll,
    emptySurfaces,
    fetchHistory,
    fetchSnapshots,
    saveSnapshot,
    compareSnapshots,
  };
}

export type OdontogramPatientApi = ReturnType<typeof useOdontogramPatient>;
