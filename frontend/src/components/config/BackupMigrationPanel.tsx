"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Archive,
  Download,
  FolderOpen,
  RefreshCw,
  Trash2,
  Upload,
  ShieldAlert,
} from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError, getToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/Input";
import { formatDateTime } from "@/lib/datetime";

interface BackupSettings {
  auto_backup_enabled: boolean;
  frequency: string;
  preferred_hour: string;
  retention_count: number;
  keep_manual: boolean;
  backup_directory: string;
  effective_backup_directory: string;
  last_backup_at: string | null;
}

interface ChooseDirectoryResult {
  cancelled: boolean;
  path: string | null;
  settings: BackupSettings | null;
}

interface SuggestedDirectory {
  label: string;
  path: string;
}

interface BackupRow {
  id: string;
  filename: string;
  triggered_by: string;
  status: string;
  error_message: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  keep: boolean;
  created_at: string;
}

interface ValidateResult {
  ok: boolean;
  manifest: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const triggeredLabel: Record<string, string> = {
  manual: "Manual",
  scheduled: "Automático",
  pre_restore_safety: "Pre-restauración",
};

export function BackupMigrationPanel() {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [history, setHistory] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [showManualPath, setShowManualPath] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedDirectory[]>([]);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [preferredHour, setPreferredHour] = useState("22:00");
  const [retention, setRetention] = useState(10);
  const [backupDirectory, setBackupDirectory] = useState("");

  const [validateFile, setValidateFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState<string>("");

  const applySettings = (s: BackupSettings) => {
    setSettings(s);
    setAutoEnabled(s.auto_backup_enabled);
    setFrequency(s.frequency);
    setPreferredHour(s.preferred_hour);
    setRetention(s.retention_count);
    setBackupDirectory(s.backup_directory || "");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const errors: string[] = [];
    try {
      const s = await apiFetch<BackupSettings>("/api/backup/settings");
      applySettings(s);
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "No se pudo cargar la configuración de respaldo"
      );
    }
    try {
      const h = await apiFetch<BackupRow[]>("/api/backup/history");
      setHistory(h);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "No se pudo cargar el historial");
    }
    if (errors.length) {
      setErr(errors.join(" · "));
    }
    setLoading(false);
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const rows = await apiFetch<SuggestedDirectory[]>("/api/backup/suggested-directories");
      setSuggestions(rows);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSuggestions();
  }, [load, loadSuggestions]);

  const chooseFolder = async () => {
    setPickingFolder(true);
    setMsg(
      "Se abrió el selector de carpetas de Windows. Si no lo ve, revise la barra de tareas."
    );
    setErr("");
    try {
      const result = await apiFetch<ChooseDirectoryResult>("/api/backup/choose-directory", {
        method: "POST",
      });
      if (result.cancelled) {
        setMsg("No se cambió la carpeta (selección cancelada).");
        return;
      }
      if (result.settings) {
        applySettings(result.settings);
      } else if (result.path) {
        setBackupDirectory(result.path);
      }
      setShowManualPath(false);
      setMsg(
        result.path
          ? `Carpeta de backups guardada: ${result.path}`
          : "Carpeta de backups guardada."
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const friendly =
        !raw ||
        /^internal server error$/i.test(raw.trim()) ||
        raw.toLowerCase().includes("internal server error")
          ? "No se pudo abrir el selector de Windows. Elija una carpeta sugerida abajo o escriba la ruta manualmente."
          : raw;
      setErr(friendly);
      setMsg("");
      setShowManualPath(true);
      void loadSuggestions();
    } finally {
      setPickingFolder(false);
    }
  };

  const applySuggestedPath = async (path: string) => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const s = await apiFetch<BackupSettings>("/api/backup/apply-directory", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      applySettings(s);
      setShowManualPath(false);
      setMsg(`Carpeta de backups guardada: ${s.effective_backup_directory || path}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo aplicar la carpeta");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const s = await apiFetch<BackupSettings>("/api/backup/settings", {
        method: "PATCH",
        body: JSON.stringify({
          auto_backup_enabled: autoEnabled,
          frequency,
          preferred_hour: preferredHour,
          retention_count: retention,
          backup_directory: backupDirectory.trim(),
        }),
      });
      applySettings(s);
      setMsg("Configuración de respaldo guardada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const useDefaultFolder = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const s = await apiFetch<BackupSettings>("/api/backup/settings", {
        method: "PATCH",
        body: JSON.stringify({ backup_directory: "" }),
      });
      applySettings(s);
      setMsg("Se usará la carpeta predeterminada del sistema.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al restablecer la carpeta");
    } finally {
      setSaving(false);
    }
  };

  const generateNow = async () => {
    setGenerating(true);
    setMsg("");
    setErr("");
    try {
      await apiFetch("/api/backup/generate", { method: "POST" });
      setMsg("Backup generado correctamente.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al generar backup");
    } finally {
      setGenerating(false);
    }
  };

  const downloadRow = async (row: BackupRow) => {
    try {
      const blob = await apiFetchBlob(`/api/backup/${row.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = row.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al descargar");
    }
  };

  const deleteRow = async (row: BackupRow) => {
    if (!window.confirm(`¿Eliminar el backup «${row.filename}»?`)) return;
    try {
      await apiFetch(`/api/backup/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const runValidate = async () => {
    if (!validateFile) return;
    setErr("");
    setValidation(null);
    setRestoreReport("");
    const fd = new FormData();
    fd.append("file", validateFile);
    const token = getToken();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/backup/validate`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new ApiError(
          typeof body.detail === "string" ? body.detail : "Validación fallida",
          res.status
        );
      }
      setValidation(body as ValidateResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al validar");
    }
  };

  const runRestore = async () => {
    if (!validateFile || confirmText.trim().toUpperCase() !== "CONFIRMAR") return;
    setRestoring(true);
    setErr("");
    setRestoreReport("");
    const fd = new FormData();
    fd.append("file", validateFile);
    fd.append("confirm_token", "CONFIRMAR");
    const token = getToken();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/backup/restore`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new ApiError(
          typeof body.detail === "string" ? body.detail : "Restauración fallida",
          res.status
        );
      }
      setRestoreReport(
        body.message ||
          `Restaurado: ${body.tables_restored || "—"} tablas, ${body.files_restored || 0} archivos.`
      );
      setMsg(
        "Restauración completada. Reinicie N&K Dental Soft e inicie sesión con un usuario del backup."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al restaurar");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section-title text-slate-800">Respaldo y Migración</h2>
          <p className="mt-1 text-help text-slate-500">
            Genera un paquete completo (base de datos + archivos) para USB o migrar a otra PC.
            Solo administradores.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          loading={generating}
          icon={<Archive className="h-4 w-4" />}
          onClick={() => void generateNow()}
        >
          Generar backup ahora
        </Button>
      </div>

      {loading && <p className="text-sm text-slate-400">Cargando…</p>}
      {msg && (
        <p role="status" className="mb-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800">
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="mb-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {err}
        </p>
      )}

      {settings && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2">
            <p className="text-help text-slate-500">Último backup</p>
            <p className="text-sm font-medium text-slate-800">
              {settings.last_backup_at
                ? formatDateTime(settings.last_backup_at)
                : "Aún no hay respaldos"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2">
            <p className="text-help text-slate-500">Automático</p>
            <p className="text-sm font-medium text-slate-800">
              {settings.auto_backup_enabled ? "Activado" : "Desactivado"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2">
            <p className="text-help text-slate-500">Retención automáticos</p>
            <p className="text-sm font-medium text-slate-800">
              Últimos {settings.retention_count}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2 sm:col-span-2 lg:col-span-1">
            <p className="text-help text-slate-500">Carpeta de almacenamiento</p>
            <p
              className="truncate text-sm font-medium text-slate-800"
              title={settings.effective_backup_directory}
            >
              {settings.effective_backup_directory || "Predeterminada"}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={saveSettings} className="mb-6 space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Backups automáticos</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => setAutoEnabled(e.target.checked)}
          />
          Activar backups automáticos
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Frecuencia</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="daily">Diario</option>
              <option value="every_12h">Cada 12 horas</option>
              <option value="weekly">Semanal</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Hora preferida (automático)</span>
            <input
              type="time"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={preferredHour}
              onChange={(e) => setPreferredHour(e.target.value)}
            />
            <span className="mt-1 block text-help text-slate-400">
              Hora de Perú en que se generará el backup automático (no es la hora actual del sistema).
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Conservar (automáticos)</span>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value) || 10)}
            />
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-surface-subtle/60 p-3">
          <p className="text-sm font-medium text-slate-800">Dónde guardar los backups</p>
          <p className="text-help text-slate-500">
            Pulse <strong>Elegir carpeta…</strong> (selector de Windows) o use una carpeta sugerida.
            La ruta se guarda al instante.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              loading={pickingFolder}
              disabled={saving}
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => void chooseFolder()}
            >
              {pickingFolder ? "Esperando carpeta…" : "Elegir carpeta…"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving || pickingFolder || !backupDirectory}
              onClick={() => void useDefaultFolder()}
            >
              Usar predeterminada
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 4).map((s) => (
                <Button
                  key={s.path}
                  type="button"
                  variant="secondary"
                  className="!px-2.5 !py-1.5 text-xs"
                  disabled={saving || pickingFolder}
                  title={s.path}
                  onClick={() => void applySuggestedPath(s.path)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-help text-slate-500">Carpeta actual</p>
            <p
              className="break-all font-mono text-[13px] text-slate-800"
              title={settings?.effective_backup_directory || backupDirectory || undefined}
            >
              {settings?.effective_backup_directory ||
                backupDirectory ||
                "Carpeta predeterminada del sistema"}
            </p>
          </div>
          <details
            className="text-sm text-slate-600"
            open={showManualPath}
            onToggle={(e) => setShowManualPath((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">
              Escribir ruta manualmente (avanzado)
            </summary>
            <div className="mt-2 space-y-2">
              <input
                type="text"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px]"
                placeholder="D:\Backups\NKDentalSoft"
                value={backupDirectory}
                onChange={(e) => setBackupDirectory(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={saving || !backupDirectory.trim()}
                onClick={() => void applySuggestedPath(backupDirectory.trim())}
              >
                Usar esta ruta
              </Button>
              <p className="text-help text-slate-500">
                Preferible un disco externo o Documentos. No use Program Files.
              </p>
            </div>
          </details>
        </div>
        <Button type="submit" variant="secondary" loading={saving}>
          Guardar configuración
        </Button>
      </form>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Historial</h3>
          <Button type="button" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Sin backups todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Origen</th>
                  <th className="px-3 py-2 font-medium">Tamaño</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2">
                      {triggeredLabel[row.triggered_by] || row.triggered_by}
                    </td>
                    <td className="px-3 py-2">{formatBytes(row.size_bytes)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={row.status === "success" ? "success" : "danger"}>
                        {row.status === "success" ? "Éxito" : "Error"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!px-2 !py-1"
                          disabled={row.status !== "success"}
                          icon={<Download className="h-3.5 w-3.5" />}
                          onClick={() => void downloadRow(row)}
                        >
                          Descargar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="!px-2 !py-1"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => void deleteRow(row)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-warning-200 bg-warning-50/40 p-4">
        <div className="mb-2 flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-warning-700" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Restaurar desde backup</h3>
            <p className="text-help text-slate-600">
              Reemplaza todos los datos y archivos de esta instalación. Úselo para migrar de una
              PC a otra. Se creará un backup de seguridad previo automáticamente.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <Upload className="h-4 w-4" />
            {validateFile ? validateFile.name : "Elegir archivo .zip"}
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={(e) => {
                setValidateFile(e.target.files?.[0] || null);
                setValidation(null);
                setConfirmText("");
                setRestoreReport("");
              }}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!validateFile}
            onClick={() => void runValidate()}
          >
            Validar paquete
          </Button>
        </div>

        {validation && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            {validation.ok ? (
              <p className="font-medium text-success-700">Paquete válido</p>
            ) : (
              <p className="font-medium text-danger-700">
                Paquete inválido: {validation.errors.join("; ")}
              </p>
            )}
            {validation.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-warning-800">
                {validation.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {validation.manifest && (
              <p className="mt-2 text-slate-600">
                Origen: {String(validation.manifest.created_at || "—")} · Motor:{" "}
                {String(validation.manifest.source_db_engine || "—")} · Revisión:{" "}
                {String(validation.manifest.source_head_revision || "—")} · Archivos:{" "}
                {String(validation.manifest.uploads_file_count ?? "—")}
              </p>
            )}
            {validation.ok && (
              <div className="mt-3 space-y-2">
                <Input
                  label='Escriba CONFIRMAR para reemplazar todos los datos'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <Button
                  type="button"
                  variant="danger"
                  loading={restoring}
                  disabled={confirmText.trim().toUpperCase() !== "CONFIRMAR"}
                  onClick={() => void runRestore()}
                >
                  Restaurar y reemplazar todos los datos
                </Button>
              </div>
            )}
          </div>
        )}
        {restoreReport && (
          <p role="status" className="mt-3 text-sm text-success-800">
            {restoreReport}
          </p>
        )}
      </div>
    </Card>
  );
}
