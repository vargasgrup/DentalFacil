"use client";

import { useEffect, useState } from "react";
import { KeyRound, UserX, UserCheck, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload, getToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/Input";
import { ESPECIALIDADES_ODONTOLOGICAS } from "@/lib/especialidades";
import { UbigeoSelect } from "@/components/UbigeoSelect";

interface User {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  created_at: string;
}

interface ClinicProfile {
  razon_social: string;
  nombre_comercial: string;
  ruc: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
  telefono: string;
  email: string;
  ticket_serie: string;
  eslogan: string;
  director_nombre: string;
  cop_registro: string;
  logo_url: string | null;
  has_custom_logo: boolean;
  nombre_publico: string;
  direccion_completa: string;
}

const emptyClinic: ClinicProfile = {
  razon_social: "",
  nombre_comercial: "",
  ruc: "",
  direccion: "",
  distrito: "",
  provincia: "",
  departamento: "",
  telefono: "",
  email: "",
  ticket_serie: "T001",
  eslogan: "",
  director_nombre: "",
  cop_registro: "",
  logo_url: null,
  has_custom_logo: false,
  nombre_publico: "",
  direccion_completa: "",
};

const rolVariant: Record<string, "brand" | "info" | "neutral"> = {
  ADMIN: "brand",
  DOCTOR: "info",
  ASISTENTE: "neutral",
};

export default function ConfiguracionPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("DOCTOR");

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  const [reminderHours, setReminderHours] = useState("24");
  const [reminderTemplate, setReminderTemplate] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");

  const [horaApertura, setHoraApertura] = useState("08:00");
  const [horaCierre, setHoraCierre] = useState("20:00");
  const [hoursMsg, setHoursMsg] = useState("");

  const [clinic, setClinic] = useState<ClinicProfile>(emptyClinic);
  const [clinicMsg, setClinicMsg] = useState("");
  const [clinicSaving, setClinicSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const [espItems, setEspItems] = useState<string[]>([...ESPECIALIDADES_ODONTOLOGICAS]);
  const [espSelected, setEspSelected] = useState<string>(ESPECIALIDADES_ODONTOLOGICAS[0] || "");
  const [espDraft, setEspDraft] = useState("");
  const [espMsg, setEspMsg] = useState("");
  const [espSaving, setEspSaving] = useState(false);
  const [espIsDefault, setEspIsDefault] = useState(true);

  const loadEspecialidades = async () => {
    try {
      const data = await apiFetch<{ items: string[]; is_default: boolean }>(
        "/api/config/especialidades"
      );
      setEspItems(data.items);
      setEspSelected(data.items[0] || "");
      setEspIsDefault(!!data.is_default);
    } catch {
      /* keep defaults */
      setEspSelected(ESPECIALIDADES_ODONTOLOGICAS[0] || "");
    }
  };

  const addEspecialidad = () => {
    const name = espDraft.trim();
    if (!name) return;
    if (espItems.some((e) => e.toLowerCase() === name.toLowerCase())) {
      setEspMsg("Esa especialidad ya está en el catálogo");
      return;
    }
    const next = [...espItems, name];
    setEspItems(next);
    setEspSelected(name);
    setEspDraft("");
    setEspMsg("");
    setEspIsDefault(false);
  };

  const removeEspecialidadByName = (name: string) => {
    if (!name) return;
    if (espItems.length <= 1) {
      setEspMsg("Debe quedar al menos una especialidad");
      return;
    }
    const next = espItems.filter((e) => e !== name);
    setEspItems(next);
    setEspSelected(next[0] || "");
    setEspMsg("");
    setEspIsDefault(false);
  };

  const saveEspecialidades = async () => {
    setEspMsg("");
    setEspSaving(true);
    try {
      const data = await apiFetch<{ items: string[]; is_default: boolean }>(
        "/api/config/especialidades",
        {
          method: "PUT",
          body: JSON.stringify({ items: espItems }),
        }
      );
      setEspItems(data.items);
      setEspSelected(data.items[0] || "");
      setEspIsDefault(!!data.is_default);
      setEspMsg("Especialidades guardadas. Se usan en evolución y agenda.");
    } catch (err: any) {
      setEspMsg(err.message);
    } finally {
      setEspSaving(false);
    }
  };

  const resetEspecialidades = async () => {
    setEspSaving(true);
    setEspMsg("");
    try {
      const data = await apiFetch<{ items: string[]; is_default: boolean }>(
        "/api/config/especialidades/reset",
        { method: "POST" }
      );
      setEspItems(data.items);
      setEspSelected(data.items[0] || "");
      setEspIsDefault(!!data.is_default);
      setEspMsg("Catálogo restablecido al valor por defecto.");
    } catch (err: any) {
      setEspMsg(err.message);
    } finally {
      setEspSaving(false);
    }
  };

  const loadClinicConfig = async () => {
    try {
      const cfg = await apiFetch<ClinicProfile>("/api/config/clinic");
      setClinic(cfg);
      if (cfg.logo_url) {
        const token = getToken();
        const res = await fetch(cfg.logo_url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const blob = await res.blob();
          setLogoPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      } else {
        setLogoPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }
    } catch {
      /* ignore */
    }
  };

  const saveClinicConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicMsg("");
    setClinicSaving(true);
    try {
      const updated = await apiFetch<ClinicProfile>("/api/config/clinic", {
        method: "PATCH",
        body: JSON.stringify({
          razon_social: clinic.razon_social,
          nombre_comercial: clinic.nombre_comercial,
          ruc: clinic.ruc,
          direccion: clinic.direccion,
          distrito: clinic.distrito,
          provincia: clinic.provincia,
          departamento: clinic.departamento,
          telefono: clinic.telefono,
          email: clinic.email,
          ticket_serie: clinic.ticket_serie,
          eslogan: clinic.eslogan,
          director_nombre: clinic.director_nombre,
          cop_registro: clinic.cop_registro,
        }),
      });
      setClinic(updated);
      setClinicMsg("Datos del centro guardados. Se usan en tickets, PDFs y recordatorios.");
    } catch (err: any) {
      setClinicMsg(err.message);
    } finally {
      setClinicSaving(false);
    }
  };

  const onLogoSelected = async (file: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    setClinicMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiUpload<ClinicProfile>("/api/config/clinic/logo", fd);
      setClinic(updated);
      const token = getToken();
      const res = await fetch(updated.logo_url || "/api/config/clinic/logo-file", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const blob = await res.blob();
        setLogoPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
      setClinicMsg("Logo actualizado. Aparecerá en los documentos impresos.");
    } catch (err: any) {
      setClinicMsg(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const clearLogo = async () => {
    setLogoBusy(true);
    setClinicMsg("");
    try {
      const updated = await apiFetch<ClinicProfile>("/api/config/clinic", {
        method: "PATCH",
        body: JSON.stringify({ clear_logo: true }),
      });
      setClinic(updated);
      setLogoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      // Recarga logo por defecto si existe
      await loadClinicConfig();
      setClinicMsg("Logo restablecido al predeterminado del sistema.");
    } catch (err: any) {
      setClinicMsg(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const loadReminderConfig = async () => {
    try {
      const cfg = await apiFetch<{ reminder_hours_before: number; reminder_template: string }>(
        "/api/config/reminders"
      );
      setReminderHours(String(cfg.reminder_hours_before));
      setReminderTemplate(cfg.reminder_template);
    } catch { /* ignore */ }
  };

  const loadHoursConfig = async () => {
    try {
      const cfg = await apiFetch<{ hora_apertura: string; hora_cierre: string }>(
        "/api/config/hours"
      );
      setHoraApertura(cfg.hora_apertura);
      setHoraCierre(cfg.hora_cierre);
    } catch { /* ignore */ }
  };

  const saveReminderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setReminderMsg("");
    try {
      await apiFetch("/api/config/reminders", {
        method: "PATCH",
        body: JSON.stringify({
          reminder_hours_before: parseInt(reminderHours),
          reminder_template: reminderTemplate,
        }),
      });
      setReminderMsg("Configuración guardada");
    } catch (err: any) {
      setReminderMsg(err.message);
    }
  };

  const saveHoursConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setHoursMsg("");
    try {
      await apiFetch("/api/config/hours", {
        method: "PATCH",
        body: JSON.stringify({
          hora_apertura: horaApertura,
          hora_cierre: horaCierre,
        }),
      });
      setHoursMsg("Horario guardado");
    } catch (err: any) {
      setHoursMsg(err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await apiFetch<User[]>("/api/users");
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadReminderConfig();
    loadHoursConfig();
    loadClinicConfig();
    loadEspecialidades();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ nombre, email, password, rol }),
      });
      setShowCreate(false);
      setNombre(""); setEmail(""); setPassword(""); setRol("DOCTOR");
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleActivo = async (u: User) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !u.activo }),
      });
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (u: User) => {
    const pwd = prompt(`Nueva contraseña para ${u.nombre}:`);
    if (!pwd) return;
    try {
      await apiFetch(`/api/users/${u.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: pwd }),
      });
      alert("Contraseña restablecida");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg("");
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      setPwdMsg("Contraseña cambiada correctamente");
      setOldPwd(""); setNewPwd("");
    } catch (err: any) {
      setPwdMsg(err.message);
    }
  };

  if (loading) {
    return (
      <PageContainer width="default">
        <div className="skeleton h-8 w-40 rounded-lg" />
        <div className="skeleton h-40 rounded-card" />
        <div className="skeleton h-40 rounded-card" />
      </PageContainer>
    );
  }

  const isAdmin = currentUser?.rol === "ADMIN";

  return (
    <PageContainer width="default">
      <div>
        <h1 className="text-page-title text-slate-800">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          Datos del centro, contraseña, horario, recordatorios y usuarios.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      {isAdmin && (
        <Card>
          <h2 className="mb-1 text-section-title text-slate-700">Datos del centro</h2>
          <p className="mb-4 text-sm text-slate-500">
            Información oficial del centro odontológico (Perú). Se usa en tickets, fichas,
            consentimiento, presupuestos y recordatorios WhatsApp.
          </p>
          <form onSubmit={saveClinicConfig} className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex h-20 w-44 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Logo del centro" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="px-2 text-center text-xs text-slate-400">Sin logo</span>
                )}
              </div>
              <div className="min-w-[200px] flex-1 space-y-2">
                <label className="block text-label text-slate-700">Logo del centro</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoBusy}
                  onChange={(e) => onLogoSelected(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
                />
                <p className="text-help text-slate-400">PNG, JPG o WebP · máx. 3 MB</p>
                {clinic.has_custom_logo && (
                  <button
                    type="button"
                    onClick={() => void clearLogo()}
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
                onChange={(e) => setClinic({ ...clinic, director_nombre: e.target.value })}
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
              <Button type="submit" loading={clinicSaving}>
                Guardar datos del centro
              </Button>
              {clinicMsg && (
                <span
                  className={`text-sm ${
                    clinicMsg.includes("guardados") || clinicMsg.includes("actualizado") || clinicMsg.includes("restablecido")
                      ? "text-success-600"
                      : "text-danger-600"
                  }`}
                >
                  {clinicMsg}
                </span>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-section-title text-slate-700">Mi contraseña</h2>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input
            label="Actual"
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            required
          />
          <Input
            label="Nueva"
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
          />
          <Button type="submit" className="w-full sm:w-auto">
            Cambiar
          </Button>
        </form>
        {pwdMsg && <p className="mt-2 text-sm text-slate-500">{pwdMsg}</p>}
      </Card>

      <Card>
        <h2 className="mb-2 text-section-title text-slate-700">Horario de atención</h2>
        <p className="mb-4 text-sm text-slate-500">
          Define el rango visible en la grilla de Agenda. Las citas deben crearse dentro de este horario.
        </p>
        <form onSubmit={saveHoursConfig} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
              onClick={() => void resetEspecialidades()}
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
                  onClick={() => removeEspecialidadByName(espSelected)}
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
                        addEspecialidad();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={addEspecialidad}
                >
                  Agregar
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" loading={espSaving} onClick={() => void saveEspecialidades()}>
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

          {!isAdmin && espMsg && (
            <p className="text-sm text-slate-500">{espMsg}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-section-title text-slate-700">Recordatorios de citas</h2>
        <p className="mb-4 text-sm text-slate-500">
          El sistema detecta citas próximas y prepara el mensaje de WhatsApp. El envío es manual (un clic).
        </p>
        <form onSubmit={saveReminderConfig} className="space-y-4">
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
              <strong className="font-medium text-slate-500">
                {"{nombre_centro}"}
              </strong>{" "}
              se toma de Datos del centro (nunca del nombre del sistema).
            </span>
          </label>
          <Button type="submit">Guardar</Button>
          {reminderMsg && <p className="text-sm text-slate-500">{reminderMsg}</p>}
        </form>
      </Card>

      {isAdmin && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-section-title text-slate-700">Usuarios del centro</h2>
            <Button
              variant={showCreate ? "ghost" : "primary"}
              onClick={() => setShowCreate(!showCreate)}
              icon={!showCreate ? <Plus className="h-4 w-4" /> : undefined}
            >
              {showCreate ? "Cancelar" : "Nuevo"}
            </Button>
          </div>

          {showCreate && (
            <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-lg bg-surface-subtle p-4">
              <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Rol</span>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="DOCTOR">DOCTOR</option>
                  <option value="ASISTENTE">ASISTENTE</option>
                </select>
              </label>
              <Button type="submit">Crear</Button>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Nombre</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Rol</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 transition-smooth hover:bg-brand-50/30">
                    <td className="px-3 py-3 font-medium text-slate-700">{u.nombre}</td>
                    <td className="px-3 py-3 text-slate-500">{u.email}</td>
                    <td className="px-3 py-3">
                      <Badge variant={rolVariant[u.rol] || "neutral"}>{u.rol}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={u.activo ? "success" : "danger"}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          className="text-xs"
                          icon={u.activo ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          onClick={() => toggleActivo(u)}
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          variant="secondary"
                          className="text-xs"
                          icon={<KeyRound className="h-3.5 w-3.5" />}
                          onClick={() => handleResetPassword(u)}
                        >
                          Resetear clave
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
