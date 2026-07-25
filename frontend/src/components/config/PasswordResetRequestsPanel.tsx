"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ResetRequest[]>("/api/auth/password-reset-requests");
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30000);
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
    <Card className="mt-6 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-700" />
          <h2 className="text-sm font-semibold text-slate-800">
            Recuperación de contraseña pendiente
          </h2>
        </div>
        <Button type="button" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
          Actualizar
        </Button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Si un usuario olvida su clave y el correo no está configurado, aquí aparece el código de
        6 dígitos para indicárselo de forma verbal o por WhatsApp.
      </p>
      {msg && <p className="mb-2 text-xs text-brand-700">{msg}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No hay solicitudes activas.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {r.nombre}{" "}
                  <span className="font-normal text-slate-500">({r.email})</span>
                </p>
                <p className="text-xs text-slate-500">
                  Solicitado {formatDateTime(r.created_at)} · expira {formatDateTime(r.expires_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.email_sent ? "success" : "warning"}>
                  {r.email_sent ? "Correo enviado" : "Sin correo"}
                </Badge>
                <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm tracking-widest">
                  {r.code}
                </code>
                <Button
                  type="button"
                  variant="secondary"
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
    </Card>
  );
}
