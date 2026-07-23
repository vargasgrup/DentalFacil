"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch, apiUpload, getToken } from "@/lib/api";
import { PageContainer } from "@/components/ui/PageContainer";
import { ESPECIALIDADES_ODONTOLOGICAS } from "@/lib/especialidades";
import { ClinicProfileForm } from "@/components/config/ClinicProfileForm";
import { PasswordChangeForm } from "@/components/config/PasswordChangeForm";
import { HoursConfigForm } from "@/components/config/HoursConfigForm";
import { SpecialtiesConfig } from "@/components/config/SpecialtiesConfig";
import { ReminderConfigForm } from "@/components/config/ReminderConfigForm";
import { UsersAdminPanel } from "@/components/config/UsersAdminPanel";
import { emptyClinic, type ClinicProfile, type User } from "@/components/config/types";

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
  const [userFormError, setUserFormError] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

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
    } catch (err: unknown) {
      setEspMsg(err instanceof Error ? err.message : "Error al guardar");
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
    } catch (err: unknown) {
      setEspMsg(err instanceof Error ? err.message : "Error al restablecer");
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
    } catch (err: unknown) {
      setClinicMsg(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setClinicSaving(false);
    }
  };

  const onLogoSelected = async (file: File | null) => {
    if (!file) return;
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setClinicMsg("El logo no debe superar 10 MB");
      return;
    }
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
    } catch (err: unknown) {
      setClinicMsg(err instanceof Error ? err.message : "Error al subir logo");
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
      await loadClinicConfig();
      setClinicMsg("Logo restablecido al predeterminado del sistema.");
    } catch (err: unknown) {
      setClinicMsg(err instanceof Error ? err.message : "Error al restablecer logo");
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
    } catch {
      /* ignore */
    }
  };

  const loadHoursConfig = async () => {
    try {
      const cfg = await apiFetch<{ hora_apertura: string; hora_cierre: string }>(
        "/api/config/hours"
      );
      setHoraApertura(cfg.hora_apertura);
      setHoraCierre(cfg.hora_cierre);
    } catch {
      /* ignore */
    }
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
    } catch (err: unknown) {
      setReminderMsg(err instanceof Error ? err.message : "Error al guardar");
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
    } catch (err: unknown) {
      setHoursMsg(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  const loadUsers = async () => {
    try {
      const data = await apiFetch<User[]>("/api/users");
      setUsers(data);
      setError("");
    } catch (err: unknown) {
      // Solo admins gestionan usuarios; no mostrar error a otros roles
      if (currentUser?.rol === "ADMIN") {
        setError(err instanceof Error ? err.message : "Error al cargar usuarios");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminderConfig();
    loadHoursConfig();
    loadClinicConfig();
    loadEspecialidades();
    if (currentUser?.rol === "ADMIN") {
      void loadUsers();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.rol]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUserFormError("");
    if (password.trim().length < 6) {
      setUserFormError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setCreatingUser(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          password,
          rol,
        }),
      });
      setShowCreate(false);
      setNombre("");
      setEmail("");
      setPassword("");
      setRol("DOCTOR");
      await loadUsers();
    } catch (err: unknown) {
      setUserFormError(err instanceof Error ? err.message : "Error al crear usuario");
    } finally {
      setCreatingUser(false);
    }
  };

  const changeRol = async (u: User, nextRol: string) => {
    if (nextRol === u.rol) return;
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rol: nextRol }),
      });
      setError("");
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cambiar rol");
    }
  };

  const toggleActivo = async (u: User) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !u.activo }),
      });
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al actualizar usuario");
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al restablecer contraseña");
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
      setOldPwd("");
      setNewPwd("");
    } catch (err: unknown) {
      setPwdMsg(err instanceof Error ? err.message : "Error al cambiar contraseña");
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
        <ClinicProfileForm
          clinic={clinic}
          setClinic={setClinic}
          logoPreview={logoPreview}
          logoBusy={logoBusy}
          clinicSaving={clinicSaving}
          clinicMsg={clinicMsg}
          onSubmit={saveClinicConfig}
          onLogoSelected={onLogoSelected}
          onClearLogo={() => void clearLogo()}
        />
      )}

      <PasswordChangeForm
        oldPwd={oldPwd}
        setOldPwd={setOldPwd}
        newPwd={newPwd}
        setNewPwd={setNewPwd}
        pwdMsg={pwdMsg}
        onSubmit={handleChangePassword}
      />

      <HoursConfigForm
        horaApertura={horaApertura}
        setHoraApertura={setHoraApertura}
        horaCierre={horaCierre}
        setHoraCierre={setHoraCierre}
        hoursMsg={hoursMsg}
        onSubmit={saveHoursConfig}
        readOnly={!isAdmin}
      />

      <SpecialtiesConfig
        isAdmin={isAdmin}
        espItems={espItems}
        espSelected={espSelected}
        setEspSelected={setEspSelected}
        espDraft={espDraft}
        setEspDraft={setEspDraft}
        espMsg={espMsg}
        espSaving={espSaving}
        espIsDefault={espIsDefault}
        onAdd={addEspecialidad}
        onRemove={removeEspecialidadByName}
        onSave={() => void saveEspecialidades()}
        onReset={() => void resetEspecialidades()}
      />

      <ReminderConfigForm
        reminderHours={reminderHours}
        setReminderHours={setReminderHours}
        reminderTemplate={reminderTemplate}
        setReminderTemplate={setReminderTemplate}
        reminderMsg={reminderMsg}
        onSubmit={saveReminderConfig}
      />

      {isAdmin && (
        <UsersAdminPanel
          users={users}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          nombre={nombre}
          setNombre={setNombre}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          rol={rol}
          setRol={setRol}
          formError={userFormError}
          creating={creatingUser}
          onCreate={handleCreate}
          onToggleActivo={toggleActivo}
          onResetPassword={handleResetPassword}
          onChangeRol={changeRol}
        />
      )}
    </PageContainer>
  );
}
