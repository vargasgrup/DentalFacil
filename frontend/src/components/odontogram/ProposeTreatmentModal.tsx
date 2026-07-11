"use client";

import { useEffect, useState } from "react";
import { conditionById } from "@/lib/odontogramConditions";
import {
  suggestTreatment,
  type PlanProposalItem,
} from "@/lib/odontogramTreatments";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";

interface Props {
  open: boolean;
  pieza: string;
  condicionId: string;
  onClose: () => void;
  onConfirm: (item: PlanProposalItem) => void;
}

export function ProposeTreatmentModal({
  open,
  pieza,
  condicionId,
  onClose,
  onConfirm,
}: Props) {
  const cond = conditionById(condicionId);
  const suggestion = suggestTreatment(condicionId);
  const [nombre, setNombre] = useState(suggestion.nombre);
  const [cantidad, setCantidad] = useState(1);
  const [costo, setCosto] = useState(suggestion.precio_default);

  useEffect(() => {
    if (!open) return;
    const s = suggestTreatment(condicionId);
    setNombre(`${s.nombre} (pieza ${pieza})`);
    setCantidad(1);
    setCosto(s.precio_default);
  }, [open, pieza, condicionId]);

  if (!open) return null;

  const total = cantidad * costo;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="propose-title"
        className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-4 shadow-xl"
      >
        <h3 id="propose-title" className="text-base font-semibold text-slate-900">
          Agregar al plan de tratamiento
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Pieza <span className="font-semibold tabular-nums">{pieza}</span>
          {cond ? ` · ${cond.label}` : ""}
        </p>

        <div className="mt-3">
          <TreatmentAutocomplete
            label="Tratamiento"
            value={nombre}
            onChange={setNombre}
            onSelect={(t) => {
              setNombre(`${t.nombre} (pieza ${pieza})`);
              if (t.precio_referencial) setCosto(t.precio_referencial);
            }}
            placeholder="Buscar tratamiento…"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-600">
            Cantidad
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Costo unitario
            <input
              type="number"
              min={0}
              step="0.01"
              value={costo}
              onChange={(e) => setCosto(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          Presupuesto:{" "}
          <span className="font-semibold text-slate-900">S/ {total.toFixed(2)}</span>
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm({
                item: nombre.trim() || suggestion.nombre,
                cantidad,
                costo_unitario: costo,
                estado: "pendiente",
                pieza_fdi: pieza,
                condicion_id: condicionId,
                origen: "odontogram",
              });
              onClose();
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Agregar al plan
          </button>
        </div>
      </div>
    </div>
  );
}
