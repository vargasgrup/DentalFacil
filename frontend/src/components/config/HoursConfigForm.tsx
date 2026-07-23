"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";

interface HoursConfigFormProps {
  horaApertura: string;
  setHoraApertura: (v: string) => void;
  horaCierre: string;
  setHoraCierre: (v: string) => void;
  hoursMsg: string;
  onSubmit: (e: React.FormEvent) => void;
}

export function HoursConfigForm({
  horaApertura,
  setHoraApertura,
  horaCierre,
  setHoraCierre,
  hoursMsg,
  onSubmit,
}: HoursConfigFormProps) {
  return (
    <Card>
      <h2 className="mb-2 text-section-title text-slate-700">Horario de atención</h2>
      <p className="mb-4 text-sm text-slate-500">
        Define el rango visible en la grilla de Agenda. Las citas deben crearse dentro de este horario.
      </p>
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Input
          label="Apertura"
          type="time"
          value={horaApertura}
          onChange={(e) => setHoraApertura(e.target.value)}
          required
        />
        <Input
          label="Cierre"
          type="time"
          value={horaCierre}
          onChange={(e) => setHoraCierre(e.target.value)}
          required
        />
        <Button type="submit" className="w-full sm:w-auto">
          Guardar horario
        </Button>
      </form>
      {hoursMsg && <p className="mt-2 text-sm text-slate-500">{hoursMsg}</p>}
    </Card>
  );
}
