"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PERMANENT, TEMPORAL, type Denticion } from "@/lib/odontogramConditions";

interface PerioRow {
  id?: string;
  pieza_fdi: string;
  denticion: string;
  movilidad: number;
  recesion_mm: number;
  sondaje_v: number;
  sondaje_l: number;
  sondaje_m: number;
  sondaje_d: number;
  sangrado: boolean;
  placa: boolean;
  notas?: string | null;
}

/**
 * Periodontograma vinculado al odontograma: movilidad, recesión, sondaje, sangrado/placa.
 */
export function Periodontograma({ patientId }: { patientId: string }) {
  const [denticion, setDenticion] = useState<Denticion>("permanente");
  const [rows, setRows] = useState<Record<string, PerioRow>>({});
  const [pieza, setPieza] = useState("16");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PerioRow>({
    pieza_fdi: "16",
    denticion: "permanente",
    movilidad: 0,
    recesion_mm: 0,
    sondaje_v: 0,
    sondaje_l: 0,
    sondaje_m: 0,
    sondaje_d: 0,
    sangrado: false,
    placa: false,
    notas: "",
  });

  const arches = denticion === "temporal" ? TEMPORAL : PERMANENT;
  const piezas = [
    ...arches.upperRight,
    ...arches.upperLeft,
    ...arches.lowerRight,
    ...arches.lowerLeft,
  ];

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PerioRow[]>(
        `/api/periodontogram/${patientId}?denticion=${denticion === "mixta" ? "permanente" : denticion}`
      );
      const map: Record<string, PerioRow> = {};
      data.forEach((r) => {
        map[r.pieza_fdi] = r;
      });
      setRows(map);
    } catch {
      setRows({});
    }
  }, [patientId, denticion]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const existing = rows[pieza];
    if (existing) {
      setForm({ ...existing, notas: existing.notas || "" });
    } else {
      setForm({
        pieza_fdi: pieza,
        denticion: denticion === "mixta" ? "permanente" : denticion,
        movilidad: 0,
        recesion_mm: 0,
        sondaje_v: 0,
        sondaje_l: 0,
        sondaje_m: 0,
        sondaje_d: 0,
        sangrado: false,
        placa: false,
        notas: "",
      });
    }
  }, [pieza, rows, denticion]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<PerioRow>(
        `/api/periodontogram/${patientId}/${pieza}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...form,
            pieza_fdi: pieza,
            denticion: denticion === "mixta" ? "permanente" : denticion,
          }),
        }
      );
      setRows((prev) => ({ ...prev, [pieza]: updated }));
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Estado periodontal por pieza: movilidad (0–3), recesión, profundidad de sondaje (V/L/M/D),
        sangrado y placa. Vinculado al odontograma clínico.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDenticion("permanente")}
          className={`border px-3 py-1.5 text-xs font-semibold ${
            denticion === "permanente" ? "bg-emerald-100 border-emerald-700" : "border-slate-400"
          }`}
        >
          Adulto
        </button>
        <button
          type="button"
          onClick={() => setDenticion("temporal")}
          className={`border px-3 py-1.5 text-xs font-semibold ${
            denticion === "temporal" ? "bg-emerald-100 border-emerald-700" : "border-slate-400"
          }`}
        >
          Niño
        </button>
        <label className="ml-2 text-xs text-slate-600">
          Pieza
          <select
            value={pieza}
            onChange={(e) => setPieza(e.target.value)}
            className="ml-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {piezas.map((p) => (
              <option key={p} value={p}>
                {p}
                {rows[p] ? " ●" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-slate-600">
          Movilidad
          <select
            className={field}
            value={form.movilidad}
            onChange={(e) => setForm({ ...form, movilidad: Number(e.target.value) })}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Recesión (mm)
          <input
            type="number"
            step="0.5"
            min={0}
            className={field}
            value={form.recesion_mm}
            onChange={(e) => setForm({ ...form, recesion_mm: parseFloat(e.target.value) || 0 })}
          />
        </label>
        {(["sondaje_v", "sondaje_l", "sondaje_m", "sondaje_d"] as const).map((k) => (
          <label key={k} className="text-xs text-slate-600">
            Sondaje {k.slice(-1).toUpperCase()} (mm)
            <input
              type="number"
              step="0.5"
              min={0}
              className={field}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: parseFloat(e.target.value) || 0 })}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.sangrado}
            onChange={(e) => setForm({ ...form, sangrado: e.target.checked })}
          />
          Sangrado
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.placa}
            onChange={(e) => setForm({ ...form, placa: e.target.checked })}
          />
          Placa
        </label>
      </div>
      <textarea
        className={field}
        rows={2}
        placeholder="Notas periodontales…"
        value={form.notas || ""}
        onChange={(e) => setForm({ ...form, notas: e.target.value })}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Guardando…" : `Guardar periodontal pieza ${pieza}`}
      </button>

      {Object.keys(rows).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-1">Pieza</th>
                <th>Mov.</th>
                <th>Rec.</th>
                <th>Sondaje</th>
                <th>Sangrado</th>
                <th>Placa</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(rows)
                .sort((a, b) => a.pieza_fdi.localeCompare(b.pieza_fdi))
                .map((r) => (
                  <tr key={r.pieza_fdi} className="border-b border-slate-100">
                    <td className="py-1 font-semibold tabular-nums">{r.pieza_fdi}</td>
                    <td>{r.movilidad}</td>
                    <td>{r.recesion_mm}</td>
                    <td>
                      V{r.sondaje_v}/L{r.sondaje_l}/M{r.sondaje_m}/D{r.sondaje_d}
                    </td>
                    <td>{r.sangrado ? "Sí" : "—"}</td>
                    <td>{r.placa ? "Sí" : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
