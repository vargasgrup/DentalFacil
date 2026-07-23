"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Time12hSelect } from "@/components/config/Time12hSelect";

interface HoursConfigFormProps {
  horaApertura: string;
  setHoraApertura: (v: string) => void;
  horaCierre: string;
  setHoraCierre: (v: string) => void;
  hoursMsg: string;
  onSubmit: (e: React.FormEvent) => void;
  readOnly?: boolean;
}

export function HoursConfigForm({
  horaApertura,
  setHoraApertura,
  horaCierre,
  setHoraCierre,
  hoursMsg,
  onSubmit,
  readOnly = false,
}: HoursConfigFormProps) {
  return (
    <Card>
      <h2 className="mb-2 text-section-title text-slate-700">Horario de atención</h2>
      <p className="mb-4 text-sm text-slate-500">
        Define el rango visible en la grilla de Agenda. El sistema usa siempre formato de{" "}
        <strong className="font-medium text-slate-700">12 horas</strong> (a. m. / p. m.).
      </p>
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Time12hSelect
          label="Apertura"
          value={horaApertura}
          onChange={setHoraApertura}
          required
          disabled={readOnly}
        />
        <Time12hSelect
          label="Cierre"
          value={horaCierre}
          onChange={setHoraCierre}
          required
          disabled={readOnly}
        />
        {!readOnly && (
          <Button type="submit" className="w-full sm:w-auto">
            Guardar horario
          </Button>
        )}
      </form>
      {hoursMsg && <p className="mt-2 text-sm text-slate-500">{hoursMsg}</p>}
    </Card>
  );
}
