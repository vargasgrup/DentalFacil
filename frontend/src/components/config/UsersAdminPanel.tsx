"use client";

import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import { MAX_ADMINS, ROLE_LABELS, ROLES, roleLabel, type AppRole } from "@/lib/roles";
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
  formError?: string;
  creating?: boolean;
  onCreate: (e: React.FormEvent) => void;
  onToggleActivo: (u: User) => void;
  onResetPassword: (u: User) => void;
  onChangeRol: (u: User, rol: string) => void;
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
  formError,
  creating,
  onCreate,
  onToggleActivo,
  onResetPassword,
  onChangeRol,
}: UsersAdminPanelProps) {
  const adminCount = users.filter((u) => u.rol === "ADMIN").length;
  const adminSlotsLeft = Math.max(0, MAX_ADMINS - adminCount);
  const canSelectAdmin = adminSlotsLeft > 0 || rol === "ADMIN";

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-section-title text-slate-700">Usuarios del centro</h2>
          <p className="mt-1 text-sm text-slate-500">
            Hasta {MAX_ADMINS} administradores · Doctor, asistente y cajero con acceso filtrado
            por módulo. Administradores: {adminCount}/{MAX_ADMINS}.
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

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[720px] text-sm">
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
              <tr
                key={u.id}
                className="border-b border-slate-100 transition-smooth hover:bg-brand-50/30"
              >
                <td className="px-3 py-3 font-medium text-slate-700">{u.nombre}</td>
                <td className="px-3 py-3 text-slate-500">{u.email}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <Badge variant={rolVariant[u.rol] || "neutral"}>{roleLabel(u.rol)}</Badge>
                    <select
                      aria-label={`Cambiar rol de ${u.nombre}`}
                      value={u.rol}
                      onChange={(e) => onChangeRol(u, e.target.value)}
                      className="max-w-[11rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {ROLES.map((r) => {
                        const wouldExceed =
                          r === "ADMIN" &&
                          u.rol !== "ADMIN" &&
                          adminCount >= MAX_ADMINS;
                        return (
                          <option key={r} value={r} disabled={wouldExceed}>
                            {ROLE_LABELS[r as AppRole]}
                          </option>
                        );
                      })}
                    </select>
                  </div>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
