"use client";

import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import {
  MAX_ADMINS,
  MODULE_LABELS,
  ROLE_LABELS,
  ROLES,
  SELECTABLE_MODULES,
  roleLabel,
  type AppModule,
  type AppRole,
} from "@/lib/roles";
import type { User } from "./types";
import { rolVariant } from "./types";

interface UsersAdminPanelProps {
  users: User[];
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  nombre: string;
  setNombre: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  rol: string;
  setRol: (v: string) => void;
  modulos: AppModule[];
  setModulos: (v: AppModule[]) => void;
  formError?: string;
  creating?: boolean;
  onCreate: (e: React.FormEvent) => void;
  onToggleActivo: (u: User) => void;
  onResetPassword: (u: User) => void;
  onChangeRol: (u: User, rol: string) => void;
  onChangeModulos: (u: User, modulos: AppModule[]) => void;
}

function ModuleCheckboxes({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: AppModule[];
  onChange: (next: AppModule[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const toggle = (mod: AppModule) => {
    if (disabled) return;
    if (value.includes(mod)) {
      onChange(value.filter((m) => m !== mod));
    } else {
      onChange([...value, mod]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-label text-slate-700">Módulos habilitados</p>
      <p className="text-help text-slate-500">
        El administrador elige a qué módulos puede entrar este usuario. Inicio siempre está
        disponible.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          <input type="checkbox" checked disabled className="rounded border-slate-300" />
          {MODULE_LABELS.dashboard}
        </label>
        {SELECTABLE_MODULES.map((mod) => {
          const checked = value.includes(mod);
          return (
            <label
              key={mod}
              htmlFor={`${idPrefix}-${mod}`}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-smooth ${
                checked
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                id={`${idPrefix}-${mod}`}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(mod)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              {MODULE_LABELS[mod]}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function UsersAdminPanel({
  users,
  showCreate,
  setShowCreate,
  nombre,
  setNombre,
  email,
  setEmail,
  password,
  setPassword,
  rol,
  setRol,
  modulos,
  setModulos,
  formError,
  creating,
  onCreate,
  onToggleActivo,
  onResetPassword,
  onChangeRol,
  onChangeModulos,
}: UsersAdminPanelProps) {
  const adminCount = users.filter((u) => u.rol === "ADMIN").length;
  const adminSlotsLeft = Math.max(0, MAX_ADMINS - adminCount);
  const canSelectAdmin = adminSlotsLeft > 0 || rol === "ADMIN";
  const createLocked = rol === "ADMIN";

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-section-title text-slate-700">Usuarios del centro</h2>
          <p className="mt-1 text-sm text-slate-500">
            Hasta {MAX_ADMINS} administradores. Asigna rol y marca los módulos permitidos
            (Pacientes, Agenda, Caja, Reportes, Configuración). Administradores: {adminCount}/
            {MAX_ADMINS}.
          </p>
        </div>
        <Button
          variant={showCreate ? "ghost" : "primary"}
          onClick={() => setShowCreate(!showCreate)}
          icon={!showCreate ? <Plus className="h-4 w-4" /> : undefined}
        >
          {showCreate ? "Cancelar" : "Nuevo"}
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={onCreate} className="mb-4 space-y-3 rounded-lg bg-surface-subtle p-4">
          <Input
            label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            hint="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Rol</span>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              {ROLES.map((r) => {
                const disabled = r === "ADMIN" && !canSelectAdmin;
                return (
                  <option key={r} value={r} disabled={disabled}>
                    {ROLE_LABELS[r]}
                    {r === "ADMIN" && disabled ? " (máx. 2)" : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <ModuleCheckboxes
            idPrefix="create-mod"
            value={modulos}
            onChange={setModulos}
            disabled={createLocked}
          />
          {createLocked && (
            <p className="text-help text-slate-500">
              El administrador tiene acceso completo a todos los módulos.
            </p>
          )}

          {formError && (
            <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {formError}
            </p>
          )}
          <Button type="submit" disabled={creating}>
            {creating ? "Creando…" : "Crear usuario"}
          </Button>
        </form>
      )}

      <div className="space-y-4">
        {users.map((u) => {
          const isAdminUser = u.rol === "ADMIN";
          const userMods = (u.modulos_acceso || []) as AppModule[];
          return (
            <div
              key={u.id}
              className="rounded-xl border border-slate-200 bg-white p-4 transition-smooth hover:border-brand-100"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">{u.nombre}</p>
                    <Badge variant={rolVariant[u.rol] || "neutral"}>{roleLabel(u.rol)}</Badge>
                    <Badge variant={u.activo ? "success" : "danger"}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">
                    Rol
                    <select
                      aria-label={`Cambiar rol de ${u.nombre}`}
                      value={u.rol}
                      onChange={(e) => onChangeRol(u, e.target.value)}
                      className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {ROLES.map((r) => {
                        const wouldExceed =
                          r === "ADMIN" && u.rol !== "ADMIN" && adminCount >= MAX_ADMINS;
                        return (
                          <option key={r} value={r} disabled={wouldExceed}>
                            {ROLE_LABELS[r as AppRole]}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    icon={
                      u.activo ? (
                        <UserX className="h-3.5 w-3.5" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() => onToggleActivo(u)}
                  >
                    {u.activo ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-xs"
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    onClick={() => onResetPassword(u)}
                  >
                    Resetear clave
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <ModuleCheckboxes
                  idPrefix={`user-${u.id}`}
                  value={userMods}
                  disabled={isAdminUser}
                  onChange={(next) => onChangeModulos(u, next)}
                />
                {isAdminUser && (
                  <p className="mt-2 text-help text-slate-500">
                    Los administradores siempre tienen todos los módulos.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
