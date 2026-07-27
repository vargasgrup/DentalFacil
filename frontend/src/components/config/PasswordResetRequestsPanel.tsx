"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfigSection } from "@/components/config/ConfigSection";
import { formatDateTime } from "@/lib/datetime";

interface ResetRequest {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  code: string;
  email_sent: boolean;
  expires_at: string;
  created_at: string;
}

export function PasswordResetRequestsPanel() {
  const [rows, setRows] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<ResetRequest[]>("/api/auth/password-reset-requests");
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ silent: false });
    const t = window.setInterval(() => void load({ silent: true }), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg("Código copiado. Indíqueselo al usuario por un canal seguro.");
    } catch {
      setMsg(`Código: ${code}`);
    }
  };

  return (
    <ConfigSection
      title="Recuperación de contraseña pendiente"
      icon={<KeyRound className="h-4 w-4" aria-hidden />}
      description="Si un usuario olvida su clave y el correo no está configurado, aquí aparece el código de 6 dígitos para indicárselo de forma verbal o por WhatsApp."
      actions={
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => void load({ silent: false })}
        >
          Actualizar
        </Button>
      }
    >
      {msg && <p className="text-sm text-brand-700">{msg}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No hay solicitudes activas.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{r.nombre}</p>
                <p className="text-xs text-slate-500">{r.email}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Creado {formatDateTime(r.created_at)} · Expira {formatDateTime(r.expires_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.email_sent ? "success" : "warning"}>
                  {r.email_sent ? "Correo enviado" : "Sin correo"}
                </Badge>
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold tracking-widest text-slate-800">
                  {r.code}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-3 !py-1.5 text-xs"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyCode(r.code)}
                >
                  Copiar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ConfigSection>
  );
}
