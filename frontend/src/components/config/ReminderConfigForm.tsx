"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";

interface ReminderConfigFormProps {
  reminderHours: string;
  setReminderHours: (v: string) => void;
  reminderTemplate: string;
  setReminderTemplate: (v: string) => void;
  reminderMsg: string;
  onSubmit: (e: React.FormEvent) => void;
}

export function ReminderConfigForm({
  reminderHours,
  setReminderHours,
  reminderTemplate,
  setReminderTemplate,
  reminderMsg,
  onSubmit,
}: ReminderConfigFormProps) {
  return (
    <Card>
      <h2 className="mb-2 text-section-title text-slate-700">Recordatorios de citas</h2>
      <p className="mb-4 text-sm text-slate-500">
        El sistema detecta citas próximas y prepara el mensaje de WhatsApp. El envío es manual (un clic).
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Anticipación del recordatorio (horas antes de la cita)"
          type="number"
          value={reminderHours}
          onChange={(e) => setReminderHours(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-label text-slate-700">Plantilla de mensaje</span>
          <textarea
            value={reminderTemplate}
            onChange={(e) => setReminderTemplate(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
          <span className="mt-1 block text-help text-slate-400">
            Variables: {"{nombre_paciente}"}, {"{nombre_centro}"}, {"{fecha_cita}"}, {"{hora_cita}"}.
            {" "}
            <strong className="font-medium text-slate-500">{"{nombre_centro}"}</strong> se toma de
            Datos del centro (nunca del nombre del sistema).
          </span>
        </label>
        <Button type="submit">Guardar</Button>
        {reminderMsg && <p className="text-sm text-slate-500">{reminderMsg}</p>}
      </form>
    </Card>
  );
}
