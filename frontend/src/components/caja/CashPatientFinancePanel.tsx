"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  FileText,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { DocumentActions } from "@/components/DocumentActions";
import type { PickedPatient } from "@/components/PatientPicker";
import type {
  EvolutionEntry,
  FinancialSummary,
  PaymentTarget,
} from "@/components/patient/types";
import type { CashTransaction } from "./types";
import { formatDateTime } from "@/lib/datetime";
import { formatFichaCode } from "@/lib/ficha";
import {
  itemSaldo,
  itemSubtotal,
  normalizePlans,
} from "@/lib/treatmentPlans";
import { formatMetodoLabel } from "./utils";

interface CashPatientFinancePanelProps {
  patient: PickedPatient;
  sessionOpen: boolean;
  onClose: () => void;
  onCobrar?: (opts?: {
    evolutionId?: string;
    planItemId?: string;
    monto?: number;
    concepto?: string;
  }) => void;
  /** Bump to force reload after a payment */
  refreshKey?: number;
}

function money(n: number | undefined | null, fallback = "—") {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return fallback;
  return `S/ ${Number(n).toFixed(2)}`;
}

export function CashPatientFinancePanel({
  patient,
  sessionOpen,
  onClose,
  onCobrar,
  refreshKey = 0,
}: CashPatientFinancePanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [payments, setPayments] = useState<CashTransaction[]>([]);
  const [targets, setTargets] = useState<PaymentTarget[]>([]);
  const [evolution, setEvolution] = useState<EvolutionEntry[]>([]);
  const [planItems, setPlanItems] = useState<
    { id: string; item: string; pieza_fdi?: string; subtotal: number; a_cuenta: number; saldo: number }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const pid = patient.id;
    try {
      const [fin, pays, tg, evo, rec] = await Promise.all([
        apiFetch<FinancialSummary>(`/api/clinical/${pid}/financial`),
        apiFetch<CashTransaction[]>(
          `/api/cash/transactions/patient/${pid}?include_voided=true`
        ).catch(() => [] as CashTransaction[]),
        apiFetch<{ targets: PaymentTarget[] }>(
          `/api/clinical/${pid}/payment-targets`
        ).catch(() => ({ targets: [] })),
        apiFetch<EvolutionEntry[]>(`/api/clinical/${pid}/evolution`).catch(
          () => [] as EvolutionEntry[]
        ),
        apiFetch<{ plan_tratamiento?: unknown }>(
          `/api/clinical/${pid}/record`
        ).catch(() => null),
      ]);
      setFinancial(fin);
      setPayments(Array.isArray(pays) ? pays : []);
      setTargets(tg?.targets || []);
      setEvolution(Array.isArray(evo) ? evo : []);

      const plans = normalizePlans(rec?.plan_tratamiento ?? null);
      const activeId = plans.active_id;
      const alt =
        (plans.alternatives || []).find((a) => a.id === activeId) ||
        (plans.alternatives || [])[0];
      const items = (alt?.items || []).map((it) => {
        const subtotal = itemSubtotal(it);
        const a_cuenta = Number(it.a_cuenta) || 0;
        return {
          id: String(it.id || it.item),
          item: String(it.item || "Ítem"),
          pieza_fdi: it.pieza_fdi ? String(it.pieza_fdi) : undefined,
          subtotal,
          a_cuenta,
          saldo: itemSaldo(it),
        };
      });
      setPlanItems(items);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el estado financiero"
      );
      setFinancial(null);
      setPayments([]);
      setTargets([]);
      setEvolution([]);
      setPlanItems([]);
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const fullName = `${patient.nombres} ${patient.apellidos}`.trim();
  const deudas = targets.filter((t) => t.saldo > 0.009);
  const deudaTargets = deudas.reduce((s, t) => s + t.saldo, 0);

  return (
    <Card padding="none" className="overflow-hidden border-brand-200 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-brand-50/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Wallet className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-800">
              Estado financiero del paciente
            </h3>
            <Badge variant="info">Seleccionado</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{fullName}</p>
          <p className="text-help text-slate-500">
            {formatFichaCode(patient.numero_ficha)}
            {patient.numero_documento
              ? ` · Doc. ${patient.numero_documento}`
              : ""}
            {patient.telefono ? ` · ${patient.telefono}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessionOpen && onCobrar ? (
            <Button
              variant="primary"
              className="text-xs"
              icon={<CreditCard className="h-3.5 w-3.5" />}
              onClick={() =>
                onCobrar({
                  monto:
                    deudas[0]?.saldo > 0.009
                      ? deudas[0].saldo
                      : financial?.saldo && financial.saldo > 0
                        ? financial.saldo
                        : undefined,
                  evolutionId:
                    deudas[0]?.kind === "evolution" ? deudas[0].id : undefined,
                  planItemId:
                    deudas[0]?.kind === "plan" ? deudas[0].id : undefined,
                  concepto: deudas[0]
                    ? `Abono — ${deudas[0].label}`
                    : "Abono a tratamiento",
                })
              }
            >
              Cobrar
            </Button>
          ) : null}
          <PacienteFichaLink
            patientId={patient.id}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Ficha
          </PacienteFichaLink>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="Quitar paciente"
            title="Quitar selección"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial financiero…
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-sm text-danger-600">
          {error}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void load()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-5 p-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MoneyTile
              label="Costo clínico"
              value={money(financial?.costo_total)}
              help="Suma evolución"
            />
            <MoneyTile
              label="Pagado (Caja)"
              value={money(financial?.pagado_total)}
              tone="success"
              help="Ingresos no anulados"
            />
            <MoneyTile
              label="Saldo global"
              value={money(financial?.saldo)}
              tone={
                (financial?.saldo || 0) > 0.009 ? "warning" : "success"
              }
              help="Costo − pagado"
            />
            <MoneyTile
              label="Por cobrar (líneas)"
              value={money(deudaTargets || 0)}
              tone={(deudaTargets || 0) > 0.009 ? "warning" : "default"}
              help={`${deudas.length} destino${deudas.length === 1 ? "" : "s"}`}
            />
          </div>

          {(financial?.plan_estimado || 0) > 0.009 && (
            <div className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2.5 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Presupuesto / plan activo</p>
              <p className="mt-0.5 text-help">
                Estimado {money(financial?.plan_estimado)} · A cuenta plan{" "}
                {money(financial?.plan_a_cuenta)} · Saldo plan{" "}
                <strong className="text-slate-800">
                  {money(financial?.plan_saldo)}
                </strong>
                {" · "}A cuenta clínico {money(financial?.a_cuenta_clinico)}
              </p>
            </div>
          )}

          {/* Deudas / líneas abiertas */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              Saldos por cobrar (líneas de atención)
            </h4>
            {deudas.length === 0 ? (
              <p className="text-sm text-slate-400">
                No hay saldos pendientes en evolución/plan.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Concepto</th>
                      <th className="px-3 py-2 font-medium">Origen</th>
                      <th className="px-3 py-2 font-medium text-right">Costo</th>
                      <th className="px-3 py-2 font-medium text-right">
                        A cuenta
                      </th>
                      <th className="px-3 py-2 font-medium text-right">Saldo</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {deudas.map((t) => (
                      <tr key={`${t.kind}:${t.id}`} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-700">
                          {t.label}
                          {t.pieza_fdi ? (
                            <span className="text-slate-500">
                              {" "}
                              · pieza {t.pieza_fdi}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="neutral">
                            {t.kind === "evolution" ? "Evolución" : "Plan"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(t.costo)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {money(t.a_cuenta)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-warning-700">
                          {money(t.saldo)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {sessionOpen && onCobrar ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-xs text-brand-600"
                              onClick={() =>
                                onCobrar({
                                  evolutionId:
                                    t.kind === "evolution" ? t.id : undefined,
                                  planItemId:
                                    t.kind === "plan" ? t.id : undefined,
                                  monto: t.saldo,
                                  concepto: `Abono — ${t.label}${
                                    t.pieza_fdi
                                      ? ` (pieza ${t.pieza_fdi})`
                                      : ""
                                  }`,
                                })
                              }
                            >
                              Cobrar
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Plan / presupuesto items */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              Plan de tratamiento / presupuesto
            </h4>
            {planItems.length === 0 ? (
              <p className="text-sm text-slate-400">
                Sin plan activo registrado en la ficha.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Ítem</th>
                      <th className="px-3 py-2 font-medium text-right">Costo</th>
                      <th className="px-3 py-2 font-medium text-right">
                        A cuenta
                      </th>
                      <th className="px-3 py-2 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planItems.map((it) => (
                      <tr key={it.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-700">
                          {it.item}
                          {it.pieza_fdi ? (
                            <span className="text-slate-500">
                              {" "}
                              · pieza {it.pieza_fdi}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(it.subtotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {money(it.a_cuenta)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium tabular-nums ${
                            it.saldo > 0.009
                              ? "text-warning-700"
                              : "text-success-600"
                          }`}
                        >
                          {money(it.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Evolución con saldos */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              Evolución clínica (costos)
            </h4>
            {evolution.length === 0 ? (
              <p className="text-sm text-slate-400">
                Sin entradas de evolución con costo.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Tratamiento</th>
                      <th className="px-3 py-2 font-medium text-right">Costo</th>
                      <th className="px-3 py-2 font-medium text-right">
                        A cuenta
                      </th>
                      <th className="px-3 py-2 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolution.map((e) => {
                      const costo = Number(e.costo) || 0;
                      const ac = Number(e.a_cuenta) || 0;
                      const saldo = Math.max(0, costo - ac);
                      return (
                        <tr key={e.id} className="border-b border-slate-50">
                          <td className="px-3 py-2 text-slate-500">
                            {formatDateTime(e.fecha || e.created_at, {
                              year: undefined,
                            })}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {e.tratamiento_descripcion}
                            {e.pieza_fdi ? (
                              <span className="text-slate-500">
                                {" "}
                                · pieza {e.pieza_fdi}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {money(costo)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {money(ac)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium tabular-nums ${
                              saldo > 0.009
                                ? "text-warning-700"
                                : "text-success-600"
                            }`}
                          >
                            {money(saldo)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Historial de pagos Caja */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              Historial de pagos (módulo Caja)
            </h4>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aún no hay cobros registrados en Caja para este paciente.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Concepto</th>
                      <th className="px-3 py-2 font-medium">Método</th>
                      <th className="px-3 py-2 font-medium text-right">Monto</th>
                      <th className="px-3 py-2 font-medium">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        className={`border-b border-slate-50 ${
                          p.anulado ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-500">
                          {formatDateTime(p.created_at, { year: undefined })}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className={p.anulado ? "line-through" : ""}>
                            {p.concepto}
                          </span>
                          {p.anulado ? (
                            <span className="ml-1 text-help text-slate-400">
                              (anulado)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-500">
                          {formatMetodoLabel(p)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium tabular-nums ${
                            p.anulado
                              ? "text-slate-400 line-through"
                              : "text-success-600"
                          }`}
                        >
                          + {money(p.monto)}
                        </td>
                        <td className="px-3 py-2">
                          {!p.anulado ? (
                            <DocumentActions
                              label="Comprobante"
                              documentType="comprobante"
                              downloadUrl={`/api/documents/comprobante/${p.id}`}
                              telefono={
                                p.patient_telefono || patient.telefono || undefined
                              }
                              mensaje={`Hola ${fullName}, adjuntamos su comprobante de pago.`}
                              forceFormat="80mm"
                              compact
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">
                Presupuesto (PDF)
              </p>
              <DocumentActions
                label="Presupuesto"
                documentType="presupuesto"
                downloadUrl={`/api/documents/presupuesto/${patient.id}`}
                telefono={patient.telefono || undefined}
                mensaje={`Hola ${fullName}, adjuntamos su presupuesto.`}
                compact
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">
                Ficha clínica (PDF)
              </p>
              <DocumentActions
                label="Ficha"
                documentType="ficha"
                downloadUrl={`/api/documents/ficha/${patient.id}`}
                telefono={patient.telefono || undefined}
                mensaje={`Hola ${fullName}, adjuntamos su ficha clínica.`}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function MoneyTile({
  label,
  value,
  help,
  tone = "default",
}: {
  label: string;
  value: string;
  help?: string;
  tone?: "default" | "success" | "warning";
}) {
  const valueCls =
    tone === "success"
      ? "text-success-700"
      : tone === "warning"
        ? "text-warning-700"
        : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-help text-slate-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${valueCls}`}>{value}</p>
      {help ? <p className="text-[11px] text-slate-400">{help}</p> : null}
    </div>
  );
}
