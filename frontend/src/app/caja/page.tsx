"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  Check,
  X,
  Eye,
  Printer,
  MessageCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/Input";
import { DocumentActions } from "@/components/DocumentActions";
import { PatientPicker, type PickedPatient } from "@/components/PatientPicker";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";

interface CashSession {
  id: string;
  monto_inicial: number;
  abierta_en: string;
  estado: string;
}

interface CashTransaction {
  id: string;
  patient_id?: string | null;
  patient_nombre?: string | null;
  patient_telefono?: string | null;
  tipo: string;
  concepto: string;
  monto: number;
  metodo_pago: string;
  grupo_pago_id?: string | null;
  created_at: string;
  pagos_parciales?: { metodo_pago: string; monto: number }[] | null;
}

interface PaymentTarget {
  kind: "evolution" | "plan";
  id: string;
  plan_item_id?: string;
  label: string;
  pieza_fdi?: string;
  costo: number;
  a_cuenta: number;
  saldo: number;
}

interface CloseSummary {
  session_id: string;
  monto_inicial: number;
  ingresos: number;
  egresos: number;
  neto: number;
  total_esperado: number;
  por_metodo: Record<string, number>;
  monto_final: number;
}

const INCOME_PRESETS = [
  "Consulta",
  "Curación",
  "Limpieza",
  "Abono tratamiento",
  "Ortodoncia",
  "Radiografía",
];

const EXPENSE_PRESETS = [
  "Insumos",
  "Servicios",
  "Compra materiales",
  "Gastos varios",
];

const METODOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
] as const;

const METODO_LABEL: Record<string, string> = Object.fromEntries(
  METODOS.map((m) => [m.value, m.label])
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isAbonoConcepto(concepto: string): boolean {
  const c = concepto.trim().toLowerCase();
  return c.includes("abono") && c.includes("tratamiento");
}

function formatMetodoLabel(t: CashTransaction): string {
  if (t.pagos_parciales && t.pagos_parciales.length > 0) {
    return t.pagos_parciales
      .map(
        (p) =>
          `${METODO_LABEL[p.metodo_pago] || p.metodo_pago} S/ ${Number(p.monto).toFixed(2)}`
      )
      .join(" + ");
  }
  if (t.metodo_pago === "mixto") return "Mixto";
  return METODO_LABEL[t.metodo_pago] || t.metodo_pago;
}

function waReceiptMessage(t: CashTransaction): string {
  const nombre = t.patient_nombre?.split(" ")[0] || "paciente";
  const metodo =
    t.pagos_parciales && t.pagos_parciales.length > 0
      ? ` · ${formatMetodoLabel(t)}`
      : "";
  return `Hola ${nombre}, adjuntamos tu comprobante de pago por S/ ${t.monto.toFixed(2)} (${t.concepto}${metodo}). Gracias por tu preferencia — M&D Odontología.`;
}

export default function CajaPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showOpen, setShowOpen] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null);
  const [lastReceipt, setLastReceipt] = useState<CashTransaction | null>(null);
  const [tipoFilter, setTipoFilter] = useState<"todos" | "ingreso" | "egreso">("todos");
  const [receiptAction, setReceiptAction] = useState<"preview" | "print" | "wa" | null>(null);
  const [actionBusy, setActionBusy] = useState<"preview" | "print" | "wa" | null>(null);

  const [montoInicial, setMontoInicial] = useState("50");
  const [incomeConcepto, setIncomeConcepto] = useState("");
  const [incomeMonto, setIncomeMonto] = useState("");
  const [incomeMetodo, setIncomeMetodo] = useState("efectivo");
  const [incomeMixto, setIncomeMixto] = useState(false);
  const [incomePartes, setIncomePartes] = useState<
    { metodo_pago: string; monto: string }[]
  >([
    { metodo_pago: "efectivo", monto: "" },
    { metodo_pago: "yape", monto: "" },
  ]);
  const [incomePatient, setIncomePatient] = useState<PickedPatient | null>(null);
  const [paymentTargets, setPaymentTargets] = useState<PaymentTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [payTarget, setPayTarget] = useState("auto");
  const [expenseConcepto, setExpenseConcepto] = useState("");
  const [expenseMonto, setExpenseMonto] = useState("");
  const [expenseMetodo, setExpenseMetodo] = useState("efectivo");

  const incomeTotal = useMemo(() => {
    const n = parseFloat(incomeMonto);
    return Number.isFinite(n) ? round2(n) : 0;
  }, [incomeMonto]);

  const mixtoSuma = useMemo(() => {
    return round2(
      incomePartes.reduce((s, p) => {
        const n = parseFloat(p.monto);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0)
    );
  }, [incomePartes]);

  const mixtoDiff = useMemo(
    () => round2(incomeTotal - mixtoSuma),
    [incomeTotal, mixtoSuma]
  );

  const totals = useMemo(() => {
    const ingresos = transactions
      .filter((t) => t.tipo === "ingreso")
      .reduce((s, t) => s + t.monto, 0);
    const egresos = transactions
      .filter((t) => t.tipo === "egreso")
      .reduce((s, t) => s + t.monto, 0);
    const saldo = (session?.monto_inicial || 0) + ingresos - egresos;
    const porMetodo: Record<string, number> = {};
    for (const t of transactions) {
      if (t.tipo !== "ingreso") continue;
      porMetodo[t.metodo_pago] = (porMetodo[t.metodo_pago] || 0) + t.monto;
    }
    return { ingresos, egresos, saldo, porMetodo };
  }, [transactions, session]);

  const filteredTx = useMemo(() => {
    if (tipoFilter === "todos") return transactions;
    return transactions.filter((t) => t.tipo === tipoFilter);
  }, [transactions, tipoFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await apiFetch<CashSession | null>("/api/cash/session");
      setSession(s);
      if (s) {
        const txs = await apiFetch<CashTransaction[]>("/api/cash/transactions");
        setTransactions(txs);
      } else {
        setTransactions([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar caja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!incomePatient?.id) {
      setPaymentTargets([]);
      setPayTarget("auto");
      setTargetsLoading(false);
      return;
    }
    let cancelled = false;
    setTargetsLoading(true);
    apiFetch<{ targets: PaymentTarget[] }>(
      `/api/clinical/${incomePatient.id}/payment-targets`
    )
      .then((res) => {
        if (cancelled) return;
        setPaymentTargets(res.targets || []);
        setPayTarget("auto");
      })
      .catch(() => {
        if (cancelled) return;
        setPaymentTargets([]);
        setPayTarget("auto");
      })
      .finally(() => {
        if (!cancelled) setTargetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [incomePatient?.id]);

  const openCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/cash/session/open", {
        method: "POST",
        body: JSON.stringify({ monto_inicial: parseFloat(montoInicial) || 0 }),
      });
      setShowOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo abrir caja");
    } finally {
      setSaving(false);
    }
  };

  const closeCash = async () => {
    setSaving(true);
    setError("");
    try {
      const summary = await apiFetch<CloseSummary>("/api/cash/session/close", {
        method: "POST",
      });
      setCloseSummary(summary);
      setShowCloseConfirm(false);
      setSession(null);
      setTransactions([]);
      setLastReceipt(null);
      setShowIncome(false);
      setShowExpense(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar caja");
    } finally {
      setSaving(false);
    }
  };

  const resetIncomeForm = () => {
    setIncomeConcepto("");
    setIncomeMonto("");
    setIncomeMetodo("efectivo");
    setIncomeMixto(false);
    setIncomePartes([
      { metodo_pago: "efectivo", monto: "" },
      { metodo_pago: "yape", monto: "" },
    ]);
    setIncomePatient(null);
    setPaymentTargets([]);
    setPayTarget("auto");
  };

  /** Registra el cobro y deja el formulario abierto con acciones de comprobante. */
  const saveIncome = async (): Promise<CashTransaction | null> => {
    if (!incomeConcepto.trim() || !incomeMonto) {
      setError("Completa concepto y monto para continuar");
      return null;
    }
    const monto = parseFloat(incomeMonto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("Ingresa un monto válido mayor a cero");
      return null;
    }

    if (isAbonoConcepto(incomeConcepto) && !incomePatient) {
      setError("Para abono a tratamiento selecciona al paciente");
      return null;
    }

    let pagos_parciales:
      | { metodo_pago: string; monto: number }[]
      | undefined;
    if (incomeMixto) {
      const parts = incomePartes
        .map((p) => ({
          metodo_pago: p.metodo_pago,
          monto: round2(parseFloat(p.monto) || 0),
        }))
        .filter((p) => p.monto > 0);
      if (parts.length < 2) {
        setError("El pago mixto requiere al menos 2 métodos con monto");
        return null;
      }
      const suma = round2(parts.reduce((s, p) => s + p.monto, 0));
      if (Math.abs(suma - round2(monto)) > 0.009) {
        setError(
          `La suma de partes (S/ ${suma.toFixed(2)}) debe coincidir con el monto total (S/ ${monto.toFixed(2)})`
        );
        return null;
      }
      const methods = new Set(parts.map((p) => p.metodo_pago));
      if (methods.size < parts.length) {
        setError("Usa un método distinto en cada parte del pago mixto");
        return null;
      }
      pagos_parciales = parts;
    }

    let evolution_entry_id: string | undefined;
    let plan_item_ref: string | undefined;
    if (payTarget.startsWith("evolution:")) {
      evolution_entry_id = payTarget.slice("evolution:".length);
    } else if (payTarget.startsWith("plan:")) {
      plan_item_ref = payTarget.slice("plan:".length);
    }

    const targetMeta = paymentTargets.find((t) =>
      payTarget === "auto" ? false : payTarget === `${t.kind}:${t.id}`
    );

    let concepto = incomeConcepto.trim();
    if (targetMeta && isAbonoConcepto(concepto)) {
      concepto = `Abono — ${targetMeta.label}${
        targetMeta.pieza_fdi ? ` (pieza ${targetMeta.pieza_fdi})` : ""
      }`;
    }

    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        patient_id: incomePatient?.id ?? null,
        tipo: "ingreso",
        concepto,
        monto,
        metodo_pago: incomeMixto ? "mixto" : incomeMetodo,
        allocate: Boolean(incomePatient?.id),
      };
      if (evolution_entry_id) payload.evolution_entry_id = evolution_entry_id;
      if (plan_item_ref) payload.plan_item_ref = plan_item_ref;
      if (targetMeta?.pieza_fdi) payload.pieza_fdi = targetMeta.pieza_fdi;
      if (pagos_parciales) payload.pagos_parciales = pagos_parciales;

      const tx = await apiFetch<CashTransaction>("/api/cash/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const enriched: CashTransaction = {
        ...tx,
        patient_telefono: tx.patient_telefono || incomePatient?.telefono || null,
        patient_nombre:
          tx.patient_nombre ||
          (incomePatient ? `${incomePatient.nombres} ${incomePatient.apellidos}` : null),
        pagos_parciales: tx.pagos_parciales || pagos_parciales || null,
      };
      setLastReceipt(enriched);
      await loadData();
      return enriched;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el ingreso");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveIncome();
  };

  const saveAndRun = async (action: "preview" | "print" | "wa") => {
    setActionBusy(action);
    try {
      const monto = parseFloat(incomeMonto || "0");
      const same =
        lastReceipt &&
        Math.abs(lastReceipt.monto - monto) < 0.001 &&
        (lastReceipt.patient_id || null) === (incomePatient?.id ?? null) &&
        (
          incomeMixto
            ? lastReceipt.metodo_pago === "mixto"
            : lastReceipt.metodo_pago === incomeMetodo
        );

      let tx = same ? lastReceipt : null;
      if (!tx) {
        tx = await saveIncome();
      }
      if (!tx) return;
      setReceiptAction(action);
      window.setTimeout(() => setReceiptAction(null), 1500);
    } finally {
      setActionBusy(null);
    }
  };

  const createExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseConcepto.trim() || !expenseMonto) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/cash/transactions", {
        method: "POST",
        body: JSON.stringify({
          tipo: "egreso",
          concepto: expenseConcepto.trim(),
          monto: parseFloat(expenseMonto),
          metodo_pago: expenseMetodo,
        }),
      });
      setShowExpense(false);
      setExpenseConcepto("");
      setExpenseMonto("");
      setExpenseMetodo("efectivo");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el egreso");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="skeleton h-8 w-32 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-card" />
          ))}
        </div>
      </PageContainer>
    );
  }

  const barMax = Math.max(totals.ingresos, totals.egresos, 1);

  return (
    <PageContainer>
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-slate-800">Caja</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cobros del día: registra, imprime o envía el comprobante en un par de clics.
          </p>
        </div>
        {session && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setShowIncome(true);
                setShowExpense(false);
                setLastReceipt(null);
                setReceiptAction(null);
              }}
              icon={<ArrowDownCircle className="h-4 w-4" />}
            >
              Cobrar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowExpense(true);
                setShowIncome(false);
              }}
              icon={<ArrowUpCircle className="h-4 w-4" />}
            >
              Egreso
            </Button>
            <Button variant="danger" onClick={() => setShowCloseConfirm(true)}>
              Cerrar caja
            </Button>
          </div>
        )}
      </div>

      {/* Post-close summary */}
      {closeSummary && (
        <Card className="border-success-200 bg-success-50">
          <h2 className="mb-3 flex items-center gap-2 text-section-title text-success-800">
            <Check className="h-5 w-5" />
            Caja cerrada
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-help text-slate-500">Inicial</p>
              <p className="font-medium">S/ {closeSummary.monto_inicial.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-help text-slate-500">Ingresos</p>
              <p className="font-medium text-success-700">S/ {closeSummary.ingresos.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-help text-slate-500">Egresos</p>
              <p className="font-medium text-danger-600">S/ {closeSummary.egresos.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-help text-slate-500">Total en caja</p>
              <p className="text-lg font-bold text-slate-800">
                S/ {closeSummary.total_esperado.toFixed(2)}
              </p>
            </div>
          </div>
          {Object.keys(closeSummary.por_metodo).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-success-200 pt-3">
              {Object.entries(closeSummary.por_metodo).map(([method, amount]) => (
                <span
                  key={method}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs capitalize shadow-card"
                >
                  {method}: <strong>S/ {amount.toFixed(2)}</strong>
                </span>
              ))}
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Imprimir / descargar cierre</p>
            <DocumentActions
              label="Cierre de caja"
              downloadUrl={`/api/documents/cierre-caja/${closeSummary.session_id}`}
              telefono={null}
              mensaje=""
              hideWhatsApp
            />
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setCloseSummary(null)}>
            Listo
          </Button>
        </Card>
      )}

      {/* Close confirmation */}
      {showCloseConfirm && session && (
        <Card className="border-danger-200 bg-danger-50/50">
          <h2 className="text-section-title text-slate-800">¿Cerrar caja?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Debes tener en caja{" "}
            <strong className="text-slate-900">S/ {totals.saldo.toFixed(2)}</strong> (inicial +
            ingresos − egresos). Esta acción cierra la sesión actual.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" loading={saving} onClick={() => void closeCash()}>
              Sí, cerrar caja
            </Button>
            <Button variant="ghost" onClick={() => setShowCloseConfirm(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {!session ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="No hay caja abierta"
          description="Abre caja al empezar el día. Luego cobra en 2 clics e imprime o envía el comprobante."
          action={
            showOpen ? (
              <form onSubmit={openCash} className="mx-auto w-full max-w-xs space-y-3 text-left">
                <Input
                  label="Monto inicial (S/)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                />
                <div className="flex justify-center gap-2">
                  <Button type="submit" loading={saving}>
                    Abrir caja
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={() => setShowOpen(true)} icon={<Wallet className="h-4 w-4" />}>
                Abrir caja
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={<ArrowDownCircle className="h-5 w-5" />}
              label="Total ingresos"
              value={`S/ ${totals.ingresos.toFixed(2)}`}
              variant="success"
            />
            <StatCard
              icon={<ArrowUpCircle className="h-5 w-5" />}
              label="Total egresos"
              value={`S/ ${totals.egresos.toFixed(2)}`}
              variant="warning"
            />
            <StatCard
              icon={<Scale className="h-5 w-5" />}
              label="Saldo de sesión"
              value={`S/ ${totals.saldo.toFixed(2)}`}
              subtext={`Inicial: S/ ${session.monto_inicial.toFixed(2)}`}
              variant="info"
            />
          </div>

          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">Abierta</Badge>
                  <span className="text-help text-slate-500">
                    {formatDateTime(session.abierta_en)}
                  </span>
                </div>
                {Object.keys(totals.porMetodo).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(totals.porMetodo).map(([method, amount]) => (
                      <span
                        key={method}
                        className="rounded-lg bg-surface-subtle px-2.5 py-1 text-xs text-slate-600"
                      >
                        {METODO_LABEL[method] || method}:{" "}
                        <strong>S/ {amount.toFixed(2)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-full max-w-xs space-y-2 sm:w-48">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Ingresos</span>
                    <span className="font-medium text-success-700">
                      S/ {totals.ingresos.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className="h-full rounded-full bg-success-500 transition-smooth"
                      style={{ width: `${(totals.ingresos / barMax) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Egresos</span>
                    <span className="font-medium text-warning-700">
                      S/ {totals.egresos.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className="h-full rounded-full bg-warning-500 transition-smooth"
                      style={{ width: `${(totals.egresos / barMax) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Income form */}
          {showIncome && (
            <Card>
              <form onSubmit={createIncome} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-section-title text-slate-800">Registrar cobro</h3>
                  <button
                    type="button"
                    onClick={() => setShowIncome(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <PatientPicker
                  value={incomePatient}
                  onChange={setIncomePatient}
                  label="Paciente (obligatorio para abono a tratamiento)"
                />

                <div>
                  <span className="mb-1.5 block text-label text-slate-700">Concepto</span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {INCOME_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setIncomeConcepto(preset);
                          if (isAbonoConcepto(preset) && !incomePatient) {
                            setError("Selecciona al paciente para ver sus planes activos");
                          }
                        }}
                        className={`rounded-lg px-2.5 py-1 text-xs transition-smooth ${
                          incomeConcepto === preset
                            ? "bg-brand-600 text-white"
                            : "bg-surface-subtle text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <TreatmentAutocomplete
                    label=""
                    value={incomeConcepto}
                    onChange={setIncomeConcepto}
                    onSelect={(t) => {
                      setIncomeConcepto(t.nombre);
                      if (!incomeMonto && t.precio_referencial) {
                        setIncomeMonto(String(t.precio_referencial));
                      }
                    }}
                    required
                    placeholder="Escribe: curación, limpieza, abono…"
                    hint="Catálogo predictivo + acceso rápido arriba"
                  />
                </div>

                {incomePatient && (
                  <label className="block">
                    <span className="mb-1 block text-label text-slate-700">
                      Aplicar a (plan / evolución)
                    </span>
                    <select
                      value={payTarget}
                      disabled={targetsLoading || saving}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPayTarget(value);
                        const t = paymentTargets.find(
                          (x) => `${x.kind}:${x.id}` === value
                        );
                        if (t) {
                          if (!incomeConcepto || isAbonoConcepto(incomeConcepto)) {
                            setIncomeConcepto(
                              `Abono — ${t.label}${
                                t.pieza_fdi ? ` (pieza ${t.pieza_fdi})` : ""
                              }`
                            );
                          }
                          if (!incomeMonto) {
                            setIncomeMonto(String(t.saldo));
                          }
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      <option value="auto">
                        Automático (FIFO — saldos abiertos)
                      </option>
                      {paymentTargets.map((t) => (
                        <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                          {t.kind === "evolution" ? "Evolución" : "Plan"}: {t.label}
                          {t.pieza_fdi ? ` · pieza ${t.pieza_fdi}` : ""} — saldo S/{" "}
                          {t.saldo.toFixed(2)}
                        </option>
                      ))}
                    </select>
                    {targetsLoading && (
                      <p className="mt-1 text-help text-slate-500">
                        Cargando planes activos del paciente…
                      </p>
                    )}
                    {!targetsLoading && paymentTargets.length === 0 && (
                      <p className="mt-1 text-help text-warning-700">
                        Este paciente no tiene líneas con saldo en plan u evolución. El cobro
                        quedará registrado en Caja; podrás asignarlo cuando existan costos.
                      </p>
                    )}
                    {!targetsLoading &&
                      paymentTargets.length > 0 &&
                      isAbonoConcepto(incomeConcepto) &&
                      payTarget === "auto" && (
                        <p className="mt-1 text-help text-slate-500">
                          Elige el plan o evolución específico, o deja Automático para aplicar
                          FIFO a los saldos abiertos.
                        </p>
                      )}
                  </label>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Monto total (S/)"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={incomeMonto}
                    onChange={(e) => setIncomeMonto(e.target.value)}
                    required
                    autoFocus
                  />
                  <label className="block">
                    <span className="mb-1 block text-label text-slate-700">Método de pago</span>
                    <select
                      value={incomeMixto ? "mixto" : incomeMetodo}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "mixto") {
                          setIncomeMixto(true);
                          setIncomePartes((prev) => {
                            const total = incomeMonto || "";
                            if (prev.length >= 2) {
                              return [
                                { ...prev[0], monto: prev[0].monto || "" },
                                { ...prev[1], monto: prev[1].monto || "" },
                              ];
                            }
                            return [
                              { metodo_pago: "efectivo", monto: total },
                              { metodo_pago: "yape", monto: "" },
                            ];
                          });
                        } else {
                          setIncomeMixto(false);
                          setIncomeMetodo(v);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {METODOS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                      <option value="mixto">Mixto (varios métodos)</option>
                    </select>
                  </label>
                </div>

                {incomeMixto && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        Detalle del pago mixto
                      </p>
                      <p className="text-xs text-slate-500">
                        Ej.: S/ 20 efectivo + S/ 80 Yape = S/ 100
                      </p>
                    </div>
                    {incomePartes.map((parte, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-600">Método</span>
                          <select
                            value={parte.metodo_pago}
                            onChange={(e) => {
                              const next = [...incomePartes];
                              next[idx] = { ...next[idx], metodo_pago: e.target.value };
                              setIncomePartes(next);
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                          >
                            {METODOS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Input
                          label="Monto (S/)"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={parte.monto}
                          onChange={(e) => {
                            const next = [...incomePartes];
                            next[idx] = { ...next[idx], monto: e.target.value };
                            setIncomePartes(next);
                          }}
                          required
                        />
                        <div className="flex items-end pb-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={incomePartes.length <= 2}
                            onClick={() =>
                              setIncomePartes((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            Quitar
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={incomePartes.length >= METODOS.length}
                        onClick={() => {
                          const used = new Set(incomePartes.map((p) => p.metodo_pago));
                          const nextMethod =
                            METODOS.find((m) => !used.has(m.value))?.value || "tarjeta";
                          setIncomePartes((prev) => [
                            ...prev,
                            { metodo_pago: nextMethod, monto: "" },
                          ]);
                        }}
                      >
                        + Agregar método
                      </Button>
                      <p
                        className={`text-sm ${
                          Math.abs(mixtoDiff) < 0.01
                            ? "text-success-700"
                            : "text-warning-700"
                        }`}
                      >
                        Suma: S/ {mixtoSuma.toFixed(2)}
                        {incomeTotal > 0 && (
                          <>
                            {" "}
                            / Total S/ {incomeTotal.toFixed(2)}
                            {Math.abs(mixtoDiff) >= 0.01
                              ? ` · faltan S/ ${mixtoDiff.toFixed(2)}`
                              : " · cuadrado"}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-label text-slate-700">Comprobante (Ticket 80mm)</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={actionBusy === "preview"}
                      disabled={!!actionBusy || saving}
                      onClick={() => void saveAndRun("preview")}
                      icon={<Eye className="h-3.5 w-3.5" />}
                    >
                      Previsualizar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={actionBusy === "print"}
                      disabled={!!actionBusy || saving}
                      onClick={() => void saveAndRun("print")}
                      icon={<Printer className="h-3.5 w-3.5" />}
                    >
                      Imprimir
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      loading={actionBusy === "wa"}
                      disabled={!!actionBusy || saving}
                      onClick={() => void saveAndRun("wa")}
                      icon={<MessageCircle className="h-3.5 w-3.5" />}
                    >
                      WhatsApp
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="secondary" loading={saving && !receiptAction}>
                      Solo registrar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowIncome(false);
                        setLastReceipt(null);
                        setReceiptAction(null);
                        resetIncomeForm();
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <p className="text-help text-slate-500">
                    Previsualizar, Imprimir o WhatsApp registran el cobro (si hace falta) y abren el
                    ticket de una vez.
                  </p>

                  {lastReceipt && (
                    <div className="rounded-lg border border-success-200 bg-success-50/60 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-success-800">
                        <Check className="h-4 w-4" />
                        Cobro registrado · S/ {lastReceipt.monto.toFixed(2)} ·{" "}
                        {formatMetodoLabel(lastReceipt)} · {lastReceipt.concepto}
                      </p>
                      <DocumentActions
                        key={`receipt-${lastReceipt.id}-${receiptAction || "idle"}`}
                        label="Comprobante de pago"
                        downloadUrl={`/api/documents/comprobante/${lastReceipt.id}`}
                        telefono={lastReceipt.patient_telefono}
                        mensaje={waReceiptMessage(lastReceipt)}
                        forceFormat="80mm"
                        autoOpenPreview={receiptAction === "preview"}
                        autoPrint={receiptAction === "print"}
                        autoWhatsApp={receiptAction === "wa"}
                      />
                      {!lastReceipt.patient_id && (
                        <p className="mt-2 text-xs text-warning-700">
                          Sin paciente: puedes imprimir, pero no enviar por WhatsApp.
                        </p>
                      )}
                      {!!lastReceipt.patient_id && !lastReceipt.patient_telefono && (
                        <p className="mt-2 text-xs text-warning-700">
                          Sin teléfono en la ficha.{" "}
                          <Link
                            href={`/pacientes/${lastReceipt.patient_id}`}
                            className="font-medium text-brand-600 underline"
                          >
                            Completar ficha
                          </Link>
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => {
                            setLastReceipt(null);
                            setReceiptAction(null);
                            resetIncomeForm();
                          }}
                        >
                          Otro cobro
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </Card>
          )}

          {/* Expense form */}
          {showExpense && (
            <Card>
              <form onSubmit={createExpense} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-section-title text-slate-800">Registrar egreso</h3>
                  <button
                    type="button"
                    onClick={() => setShowExpense(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div>
                  <span className="mb-1.5 block text-label text-slate-700">Concepto</span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {EXPENSE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setExpenseConcepto(preset)}
                        className={`rounded-lg px-2.5 py-1 text-xs transition-smooth ${
                          expenseConcepto === preset
                            ? "bg-warning-500 text-white"
                            : "bg-surface-subtle text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={expenseConcepto}
                    onChange={(e) => setExpenseConcepto(e.target.value)}
                    required
                    placeholder="O escribe el concepto…"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Monto (S/)"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={expenseMonto}
                    onChange={(e) => setExpenseMonto(e.target.value)}
                    required
                  />
                  <label className="block">
                    <span className="mb-1 block text-label text-slate-700">Método</span>
                    <select
                      value={expenseMetodo}
                      onChange={(e) => setExpenseMetodo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                    >
                      {METODOS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={saving}>
                    Registrar egreso
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowExpense(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Transactions */}
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-7 w-7" />}
              title="Sin movimientos aún"
              description="Pulsa Cobrar para registrar el primer pago e imprimir el comprobante."
              action={
                <Button
                  onClick={() => {
                    setShowIncome(true);
                    setShowExpense(false);
                  }}
                  icon={<ArrowDownCircle className="h-4 w-4" />}
                >
                  Cobrar
                </Button>
              }
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Movimientos</h3>
                <div className="flex rounded-lg bg-slate-100 p-0.5">
                  {(
                    [
                      ["todos", "Todos"],
                      ["ingreso", "Ingresos"],
                      ["egreso", "Egresos"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTipoFilter(key)}
                      className={`rounded px-2.5 py-1 text-xs transition-smooth ${
                        tipoFilter === key
                          ? "bg-white font-medium text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-4 py-3 font-medium">Hora</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Concepto</th>
                      <th className="px-4 py-3 font-medium">Paciente</th>
                      <th className="px-4 py-3 font-medium">Método</th>
                      <th className="px-4 py-3 font-medium text-right">Monto</th>
                      <th className="px-4 py-3 font-medium">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-slate-50 transition-smooth hover:bg-brand-50/30"
                      >
                        <td className="px-4 py-2.5 text-slate-500">{formatTime(t.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={t.tipo === "ingreso" ? "success" : "danger"}>
                            {t.tipo}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{t.concepto}</td>
                        <td className="px-4 py-2.5">
                          {t.patient_id && t.patient_nombre ? (
                            <Link
                              href={`/pacientes/${t.patient_id}`}
                              className="text-brand-600 hover:underline"
                            >
                              {t.patient_nombre}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {METODO_LABEL[t.metodo_pago] || t.metodo_pago}
                          {t.grupo_pago_id ? (
                            <span className="ml-1 text-xs text-slate-400">(mixto)</span>
                          ) : null}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-medium ${
                            t.tipo === "ingreso" ? "text-success-600" : "text-danger-500"
                          }`}
                        >
                          {t.tipo === "ingreso" ? "+" : "−"} S/ {t.monto.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5">
                          <DocumentActions
                            label="Comprobante"
                            downloadUrl={`/api/documents/comprobante/${t.id}`}
                            telefono={t.tipo === "ingreso" ? t.patient_telefono : null}
                            mensaje={t.tipo === "ingreso" ? waReceiptMessage(t) : ""}
                            hideWhatsApp={t.tipo !== "ingreso" || !t.patient_id}
                            forceFormat="80mm"
                            compact
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
