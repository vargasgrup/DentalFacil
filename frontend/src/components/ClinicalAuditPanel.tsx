"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface AuditRow {
  id: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_name: string | null;
  created_at: string;
  detail: Record<string, unknown> | null;
}

/** Trazabilidad legal — quién modificó qué y cuándo */
export function ClinicalAuditPanel({ patientId }: { patientId: number }) {
  const [rows, setRows] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AuditRow[]>(`/api/audit/${patientId}?limit=80`);
      setRows(data);
    } catch {
      setRows([]);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Registro normativo de modificaciones clínicas (plan, consentimiento, periodontal, medios,
          odontograma).
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="border border-slate-400 px-2 py-1 text-xs"
        >
          Actualizar
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin eventos de auditoría aún.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li key={r.id} className="rounded border border-slate-200 bg-white px-2 py-1.5">
              <span className="font-semibold">{r.entity_type}</span> · {r.action}
              {r.entity_id ? ` · ${r.entity_id}` : ""}
              <span className="float-right text-slate-500">
                {new Date(r.created_at).toLocaleString("es-VE")}
              </span>
              <div className="text-slate-500">{r.user_name || "sistema"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
