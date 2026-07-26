"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MonitorSmartphone, RefreshCw, Users, Wifi } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { roleLabel } from "@/lib/roles";
import { formatDateTime } from "@/lib/datetime";

type ConnectionRow = {
  user_id: string;
  nombre: string;
  email: string;
  role: string;
  client_ips: string[];
  sockets: number;
  connected_at?: string | null;
  last_seen?: string | null;
};

type ConnectionsPayload = {
  total_users: number;
  total_sockets: number;
  by_role: Record<string, number>;
  connections: ConnectionRow[];
  updated_at?: string;
};

type LanPayload = {
  host_bind: string;
  port: number;
  listening_all_interfaces: boolean;
  lan_ips: string[];
  client_urls: string[];
  local_url: string;
  firewall_rule: string;
  hint: string;
};

function roleTone(role: string): "brand" | "success" | "warning" | "neutral" {
  const r = (role || "").toUpperCase();
  if (r === "ADMIN") return "brand";
  if (r === "DOCTOR") return "success";
  if (r === "ASISTENTE" || r === "CAJERO") return "warning";
  return "neutral";
}

export function ConnectedClientsPanel() {
  const [conn, setConn] = useState<ConnectionsPayload | null>(null);
  const [lan, setLan] = useState<LanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, l] = await Promise.all([
        apiFetch<ConnectionsPayload>("/api/system/connections"),
        apiFetch<LanPayload>("/api/system/lan"),
      ]);
      setConn(c);
      setLan(l);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la red de la clínica");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("No se pudo copiar la URL");
    }
  };

  const byRole = conn?.by_role || {};

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Users className="h-4 w-4 text-brand-600" aria-hidden />
            Equipos conectados
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Usuarios en línea en tiempo real (caja, doctor, asistente) y cómo unir otros PCs al
            servidor principal.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void load()}
        >
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">En línea</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
            {conn?.total_users ?? "—"}
          </p>
          <p className="text-xs text-slate-500">
            {conn?.total_sockets ?? 0} sesión{(conn?.total_sockets || 0) === 1 ? "" : "es"} WebSocket
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Por rol</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.keys(byRole).length === 0 ? (
              <span className="text-sm text-slate-500">Nadie conectado por ahora</span>
            ) : (
              Object.entries(byRole).map(([role, n]) => (
                <Badge key={role} variant={roleTone(role)}>
                  {roleLabel(role)}: {n}
                </Badge>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Usuario</th>
              <th className="px-3 py-2 font-semibold">Rol</th>
              <th className="px-3 py-2 font-semibold">IP / equipo</th>
              <th className="px-3 py-2 font-semibold">Desde</th>
            </tr>
          </thead>
          <tbody>
            {(conn?.connections || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No hay otros equipos conectados. Abra N&K en otro PC con la URL de la red local.
                </td>
              </tr>
            ) : (
              (conn?.connections || []).map((row) => (
                <tr key={row.user_id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-800">{row.nombre || "—"}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={roleTone(row.role)}>{roleLabel(row.role)}</Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                    {(row.client_ips || []).join(", ") || "local"}
                    {row.sockets > 1 ? (
                      <span className="ml-1 text-slate-400">({row.sockets} ventanas)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {row.connected_at ? formatDateTime(row.connected_at) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <MonitorSmartphone className="h-4 w-4" aria-hidden />
          Conectar otros equipos al servidor
        </h3>
        <p className="mt-1 text-sm text-brand-900/80">
          {lan?.hint ||
            "Use la IP de este servidor en la misma red Wi‑Fi/LAN. Puerto 8001 debe estar permitido en el firewall."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-brand-800">
          <Wifi className="h-3.5 w-3.5" aria-hidden />
          Escucha: <span className="font-mono">{lan?.host_bind || "0.0.0.0"}:{lan?.port || 8001}</span>
          {lan?.listening_all_interfaces ? (
            <Badge variant="success">Red local activa</Badge>
          ) : (
            <Badge variant="warning">Revise HOST=0.0.0.0</Badge>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {(lan?.client_urls || []).length === 0 ? (
            <li className="text-sm text-brand-900/70">
              No se detectó IP LAN. Verifique el cable/Wi‑Fi del servidor o use{" "}
              <span className="font-mono">{lan?.local_url || "http://127.0.0.1:8001/"}</span> solo en
              este PC.
            </li>
          ) : (
            (lan?.client_urls || []).map((url) => (
              <li
                key={url}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2"
              >
                <code className="text-sm text-slate-800">{url}</code>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-3 !py-1.5 text-xs"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyUrl(url)}
                >
                  {copied === url ? "Copiado" : "Copiar"}
                </Button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Card>
  );
}
