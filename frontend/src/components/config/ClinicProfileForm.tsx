"use client";

import { useRef } from "react";
import { Building2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { UbigeoSelect } from "@/components/UbigeoSelect";
import { ConfigSection } from "@/components/config/ConfigSection";
import { recoverClinicMainPaint } from "@/lib/desktopViewport";
import type { ClinicProfile } from "./types";

interface ClinicProfileFormProps {
  clinic: ClinicProfile;
  setClinic: (c: ClinicProfile) => void;
  logoPreview: string | null;
  logoBusy: boolean;
  clinicSaving: boolean;
  clinicMsg: string;
  onSubmit: (e: React.FormEvent) => void;
  onLogoSelected: (file: File | null) => void;
  onClearLogo: () => void;
}

export function ClinicProfileForm({
  clinic,
  setClinic,
  logoPreview,
  logoBusy,
  clinicSaving,
  clinicMsg,
  onSubmit,
  onLogoSelected,
  onClearLogo,
}: ClinicProfileFormProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);

  const openLogoPicker = () => {
    if (logoBusy) return;
    recoverClinicMainPaint();
    const input = logoInputRef.current;
    if (!input) return;
    // Reset so choosing the same file fires change again
    input.value = "";
    input.click();
  };

  return (
    <ConfigSection
      title="Datos del centro"
      icon={<Building2 className="h-4 w-4" aria-hidden />}
      description="Información oficial del centro odontológico (Perú). Se usa en tickets, fichas, consentimiento, presupuestos y recordatorios WhatsApp."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-20 w-44 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ring-1 ring-slate-100">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview}
                alt="Logo del centro"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="px-2 text-center text-xs text-slate-400">Sin logo</span>
            )}
          </div>
          <div className="min-w-[200px] flex-1 space-y-2">
            <span className="block text-label text-slate-700">Logo del centro</span>
            {/*
              Native <input type="file"> with styled file: button is unreliable in
              Edge/WebView2 (clicks on “Seleccionar archivo” do nothing). Use a
              real button that programmatically opens a hidden file input.
            */}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              disabled={logoBusy}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                onLogoSelected(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={logoBusy}
                onClick={openLogoPicker}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
                  logoBusy
                    ? "cursor-wait bg-brand-100 text-brand-700"
                    : "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
                ].join(" ")}
              >
                <ImagePlus className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                {logoBusy ? "Subiendo…" : "Seleccionar archivo"}
              </button>
              <span className="text-xs text-slate-500">
                {logoBusy
                  ? "Procesando imagen…"
                  : logoPreview
                    ? "Logo cargado"
                    : "Ningún archivo seleccionado"}
              </span>
            </div>
            <p className="text-help text-slate-400">PNG, JPG o WebP · máx. 10 MB</p>
            {clinic.has_custom_logo && (
              <button
                type="button"
                onClick={onClearLogo}
                disabled={logoBusy}
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                Restablecer logo predeterminado
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Razón social"
            value={clinic.razon_social}
            onChange={(e) => setClinic({ ...clinic, razon_social: e.target.value })}
            placeholder="M&D Odontología Especializada S.A.C."
            required
          />
          <Input
            label="Nombre comercial"
            value={clinic.nombre_comercial}
            onChange={(e) => setClinic({ ...clinic, nombre_comercial: e.target.value })}
            placeholder="M&D Odontología"
            hint="Aparece en documentos y recordatorios"
          />
          <Input
            label="RUC"
            value={clinic.ruc}
            onChange={(e) =>
              setClinic({
                ...clinic,
                ruc: e.target.value.replace(/\D/g, "").slice(0, 11),
              })
            }
            placeholder="20123456789"
            inputMode="numeric"
            maxLength={11}
          />
          <Input
            label="Serie de tickets"
            value={clinic.ticket_serie}
            onChange={(e) =>
              setClinic({
                ...clinic,
                ticket_serie: e.target.value.toUpperCase().slice(0, 10),
              })
            }
            placeholder="T001"
          />
        </div>

        <Input
          label="Dirección"
          value={clinic.direccion}
          onChange={(e) => setClinic({ ...clinic, direccion: e.target.value })}
          placeholder="Av. Ejemplo 123"
        />
        <UbigeoSelect
          value={{
            departamento: clinic.departamento,
            provincia: clinic.provincia,
            distrito: clinic.distrito,
          }}
          onChange={(ubigeo) =>
            setClinic({
              ...clinic,
              departamento: ubigeo.departamento,
              provincia: ubigeo.provincia,
              distrito: ubigeo.distrito,
            })
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Teléfono"
            value={clinic.telefono}
            onChange={(e) => setClinic({ ...clinic, telefono: e.target.value })}
            placeholder="01 1234567 / 999888777"
          />
          <Input
            label="Correo"
            type="email"
            value={clinic.email}
            onChange={(e) => setClinic({ ...clinic, email: e.target.value })}
            placeholder="contacto@clinica.pe"
          />
          <Input
            label="Director / responsable odontológico"
            value={clinic.director_nombre}
            onChange={(e) =>
              setClinic({ ...clinic, director_nombre: e.target.value })
            }
            placeholder="Dr. Nombre Apellido"
          />
          <Input
            label="Registro COP"
            value={clinic.cop_registro}
            onChange={(e) => setClinic({ ...clinic, cop_registro: e.target.value })}
            placeholder="COP 12345"
          />
        </div>
        <Input
          label="Eslogan / subtítulo (opcional)"
          value={clinic.eslogan}
          onChange={(e) => setClinic({ ...clinic, eslogan: e.target.value })}
          placeholder="Odontología especializada"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={clinicSaving} disabled={logoBusy}>
            Guardar datos del centro
          </Button>
          {clinicMsg && (
            <span
              className={`text-sm ${
                clinicMsg.includes("guardados") ||
                clinicMsg.includes("actualizado") ||
                clinicMsg.includes("restablecido")
                  ? "text-success-600"
                  : "text-danger-600"
              }`}
            >
              {clinicMsg}
            </span>
          )}
        </div>
      </form>
    </ConfigSection>
  );
}
