"use client";

import { Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Time12hSelect } from "@/components/config/Time12hSelect";
import { ConfigSection } from "@/components/config/ConfigSection";

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
    <ConfigSection
      title="Horario de atención"
      icon={<Clock className="h-4 w-4" aria-hidden />}
      description={
        <>
          Define el rango visible en la grilla de Agenda. El sistema usa siempre formato de{" "}
          <strong className="font-medium text-slate-700">12 horas</strong> (a. m. / p. m.).
        </>
      }
    >
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
      {hoursMsg ? (
        <p className="text-sm text-success-700" role="status">
          {hoursMsg}
        </p>
      ) : null}
    </ConfigSection>
  );
}
