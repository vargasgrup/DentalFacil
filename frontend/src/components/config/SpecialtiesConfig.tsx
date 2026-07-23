"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";

interface SpecialtiesConfigProps {
  isAdmin: boolean;
  espItems: string[];
  espSelected: string;
  setEspSelected: (v: string) => void;
  espDraft: string;
  setEspDraft: (v: string) => void;
  espMsg: string;
  espSaving: boolean;
  espIsDefault: boolean;
  onAdd: () => void;
  onRemove: (name: string) => void;
  onSave: () => void;
  onReset: () => void;
}

export function SpecialtiesConfig({
  isAdmin,
  espItems,
  espSelected,
  setEspSelected,
  espDraft,
  setEspDraft,
  espMsg,
  espSaving,
  espIsDefault,
  onAdd,
  onRemove,
  onSave,
  onReset,
}: SpecialtiesConfigProps) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section-title text-slate-700">Especialidades odontológicas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Catálogo del centro. Se usa al registrar evolución clínica y al crear citas.
            {espIsDefault ? " (valores por defecto del sistema)" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            onClick={onReset}
            disabled={espSaving || espIsDefault}
          >
            Restablecer
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-label text-slate-700">
            Catálogo ({espItems.length} especialidad{espItems.length === 1 ? "" : "es"})
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={espSelected}
              onChange={(e) => setEspSelected(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-smooth focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              aria-label="Lista de especialidades odontológicas"
            >
              {espItems.length === 0 ? (
                <option value="">Sin especialidades</option>
              ) : (
                espItems.map((esp, idx) => (
                  <option key={`${esp}-${idx}`} value={esp}>
                    {esp}
                  </option>
                ))
              )}
            </select>
            {isAdmin && (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 text-danger-600 hover:border-danger-200 hover:bg-danger-50"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => onRemove(espSelected)}
                disabled={!espSelected || espItems.length <= 1}
                title="Eliminar especialidad seleccionada"
              >
                Eliminar
              </Button>
            )}
          </div>
        </label>

        {isAdmin && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Input
                  label="Nueva especialidad"
                  value={espDraft}
                  onChange={(e) => setEspDraft(e.target.value)}
                  placeholder="Ej: Periodoncia"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAdd();
                    }
                  }}
                />
              </div>
              <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" loading={espSaving} onClick={onSave}>
                Guardar especialidades
              </Button>
              {espMsg && (
                <span
                  className={`text-sm ${
                    espMsg.includes("guardadas") || espMsg.includes("restablecido")
                      ? "text-success-600"
                      : "text-danger-600"
                  }`}
                >
                  {espMsg}
                </span>
              )}
            </div>
          </>
        )}

        {!isAdmin && espMsg && <p className="text-sm text-slate-500">{espMsg}</p>}
      </div>
    </Card>
  );
}
