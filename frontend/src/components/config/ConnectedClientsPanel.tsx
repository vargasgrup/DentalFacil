"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Copy,
  MonitorSmartphone,
  RefreshCw,
  Users,
  Wifi,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { isLanDesktopRuntime } from "@/lib/runtimeMode";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfigSection } from "@/components/config/ConfigSection";
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
  hostname?: string;
  recommended_url?: string;
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

function subnetLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function uniqueSubnets(urls: string[]): string[] {
  const set = new Set<string>();
  for (const u of urls) {
    const s = subnetLabel(u);
    if (s) set.add(s);
  }
  return [...set];
}

/** Static panel for Railway / public web — no LAN polling. */
function WebCloudClientsNotice() {
  return (
    <ConfigSection
      title="Equipos conectados"
      icon={<Cloud className="h-4 w-4" aria-hidden />}
      description="Disponible en el modo Escritorio (Server + Clients en la red local de la clínica)."
    >
      <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white px-4 py-5">
        <p className="text-sm leading-relaxed text-slate-700">
          Está usando la <strong className="font-semibold text-slate-900">versión web en la nube</strong>.
          La unión de equipos por IP LAN, el discovery UDP y el monitoreo de Clients no aplican
          aquí — por eso no se realizan peticiones periódicas a{" "}
          <span className="font-mono text-xs text-slate-600">/api/system/lan</span> ni a{" "}
          <span className="font-mono text-xs text-slate-600">/api/system/connections</span>.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            En web, cada usuario inicia sesión en el mismo sistema online; no hay “servidor de
            clínica” en la red local.
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Para ver equipos en tiempo real y copiar la URL LAN, abra N&amp;K DentalSoft en el{" "}
            <strong className="font-medium text-slate-800">instalador Server</strong> (puerto 8001)
            o desde un Client de la clínica.
          </li>
        </ul>
      </div>
    </ConfigSection>
  );
}

export function ConnectedClientsPanel() {
  const [mode, setMode] = useState<"pending" | "lan" | "web">("pending");

  // Detect after mount (SSR-safe). Web/cloud never polls LAN APIs.
  useEffect(() => {
    setMode(isLanDesktopRuntime() ? "lan" : "web");
  }, []);

  if (mode === "pending") {
    return (
      <ConfigSection
        title="Equipos conectados"
        icon={<Users className="h-4 w-4" aria-hidden />}
        description="Detectando modo de instalación…"
      >
        <div className="skeleton h-28 rounded-xl" />
      </ConfigSection>
    );
  }

  if (mode === "web") {
    return <WebCloudClientsNotice />;
  }

  return <LanConnectedClientsPanel />;
}

function LanConnectedClientsPanel() {
  const [conn, setConn] = useState<ConnectionsPayload | null>(null);
  const [lan, setLan] = useState<LanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const [cRes, lRes] = await Promise.allSettled([
        apiFetch<ConnectionsPayload>("/api/system/connections"),
        apiFetch<LanPayload>("/api/system/lan"),
      ]);

      const errors: string[] = [];

      if (cRes.status === "fulfilled") {
        setConn(cRes.value);
      } else {
        errors.push(formatLoadError(cRes.reason));
      }

      if (lRes.status === "fulfilled") {
        setLan(lRes.value);
      } else {
        errors.push(formatLoadError(lRes.reason));
      }

      if (errors.length > 0 && !silent) {
        setError(errors[0]);
      } else if (errors.length === 0) {
        setError("");
      }
    } catch (err: unknown) {
      if (!silent) setError(formatLoadError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ silent: false });
    const id = window.setInterval(() => void load({ silent: true }), 8000);
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
    <ConfigSection
      title="Equipos conectados"
      icon={<Users className="h-4 w-4" aria-hidden />}
      description="Usuarios en línea en tiempo real y cómo unir otros PCs al servidor principal de la clínica."
      actions={
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void load({ silent: false })}
        >
          Actualizar
        </Button>
      }
    >
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            En línea
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {conn?.total_users ?? "—"}
          </p>
          <p className="text-xs text-slate-500">
            {conn?.total_sockets ?? 0} sesión{(conn?.total_sockets || 0) === 1 ? "" : "es"}{" "}
            WebSocket
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm sm:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Por rol
          </p>
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

      <div className="overflow-x-auto rounded-xl border border-slate-200/90">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/90 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-bold">Usuario</th>
              <th className="px-3 py-2.5 font-bold">Rol</th>
              <th className="px-3 py-2.5 font-bold">IP / equipo</th>
              <th className="px-3 py-2.5 font-bold">Desde</th>
            </tr>
          </thead>
          <tbody>
            {(conn?.connections || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                  No hay otros equipos conectados. Abra N&amp;K en otro PC con la URL de la red
                  local.
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

      <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <MonitorSmartphone className="h-4 w-4" aria-hidden />
          Conectar otros equipos al servidor
        </h3>
        <p className="mt-1 text-sm text-brand-900/80">
          {lan?.hint ||
            "En el Client: Pegar URL (botón Copiar abajo). Red Privada, sin VPN. Puerto TCP 8001."}
        </p>
        {uniqueSubnets(lan?.client_urls || []).length > 1 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-semibold">Varias redes en este PC servidor</p>
            <p className="mt-1 text-amber-900/90">
              El Client debe usar la URL de <span className="font-semibold">su misma subred</span>.
              Ejemplo: si el Client tiene IP <span className="font-mono">192.168.100.200</span>,
              copie <span className="font-mono">http://192.168.100.…:8001/</span> — no la Ethernet
              de otra red (<span className="font-mono">192.168.0.…</span>).
            </p>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-brand-800">
          <Wifi className="h-3.5 w-3.5" aria-hidden />
          Escucha:{" "}
          <span className="font-mono">
            {lan?.host_bind || "0.0.0.0"}:{lan?.port || 8001}
          </span>
          {lan?.listening_all_interfaces ? (
            <Badge variant="success">Red local activa</Badge>
          ) : (
            <Badge variant="warning">Revise HOST=0.0.0.0</Badge>
          )}
        </div>
        <p className="mt-2 text-xs text-brand-900/70">
          También se crea el acceso directo{" "}
          <span className="font-mono">NKDentalSoft-Servidor.url</span> en el escritorio público del
          servidor (y{" "}
          <span className="font-mono">%ProgramData%\NKDentalSoft\IP-DEL-SERVIDOR.txt</span>).
        </p>
        <ul className="mt-3 space-y-2">
          {(lan?.client_urls || []).map((url, idx) => {
            const subnet = subnetLabel(url);
            const isRecommended = url === (lan?.recommended_url || lan?.client_urls?.[0]);
            return (
              <li
                key={url}
                className={
                  isRecommended
                    ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-brand-300 bg-white px-3 py-3 shadow-sm"
                    : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2"
                }
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                    {isRecommended ? "URL Ethernet preferida" : "URL alternativa"}
                    {subnet ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono normal-case text-slate-700">
                        red {subnet}
                      </span>
                    ) : null}
                  </div>
                  <code
                    className={
                      isRecommended
                        ? "text-base font-semibold text-slate-900"
                        : "text-sm text-slate-800"
                    }
                  >
                    {url}
                  </code>
                  {idx === 0 && uniqueSubnets(lan?.client_urls || []).length > 1 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Si el Client no conecta, pruebe la otra URL (misma subred que el Client).
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant={isRecommended ? "primary" : "secondary"}
                  className={isRecommended ? "!px-4 !py-2" : "!px-3 !py-1.5 text-xs"}
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyUrl(url)}
                >
                  {copied === url ? "Copiado" : "Copiar"}
                </Button>
              </li>
            );
          })}
          {(lan?.client_urls || []).length === 0 ? (
            <li className="text-sm text-brand-900/70">
              No se detectó IP LAN útil. Active Ethernet o el Hotspot de clínica. Local:{" "}
              <span className="font-mono">{lan?.local_url || "http://127.0.0.1:8001/"}</span>
            </li>
          ) : null}
        </ul>
        {lan?.hostname ? (
          <p className="mt-2 text-xs text-amber-800">
            No use el nombre del PC (<span className="font-mono">{lan.hostname}</span>). Si la IP
            cambia al reiniciar, vuelva a pulsar Copiar en este panel.
          </p>
        ) : null}
      </div>
    </ConfigSection>
  );
}
