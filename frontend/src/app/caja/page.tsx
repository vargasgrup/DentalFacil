"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageContainer } from "@/components/ui/PageContainer";
import { CashPageHeader } from "@/components/caja/CashPageHeader";
import { OpenCashPanel } from "@/components/caja/OpenCashPanel";
import { CloseCashConfirm } from "@/components/caja/CloseCashConfirm";
import { CloseCashSummary } from "@/components/caja/CloseCashSummary";
import { CashSessionDashboard } from "@/components/caja/CashSessionDashboard";
import { IncomeForm } from "@/components/caja/IncomeForm";
import { ExpenseForm } from "@/components/caja/ExpenseForm";
import { TransactionsTable } from "@/components/caja/TransactionsTable";
import type { CashSession, CashTransaction, CloseSummary, PaymentTarget } from "@/components/caja/types";
import { isAbonoConcepto, round2 } from "@/components/caja/utils";
import type { PickedPatient } from "@/components/PatientPicker";

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

    let pagos_parciales: { metodo_pago: string; monto: number }[] | undefined;
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
      const piezaAlreadyInLabel =
        targetMeta.pieza_fdi &&
        String(targetMeta.label).includes(String(targetMeta.pieza_fdi));
      const piezaSuffix =
        targetMeta.pieza_fdi && !piezaAlreadyInLabel
          ? ` (pieza ${targetMeta.pieza_fdi})`
          : "";
      concepto = `Abono — ${targetMeta.label}${piezaSuffix}`;
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

      // Feedback: abono aplicado al plan/evolución
      const allocated = Number(tx.allocated_total ?? 0);
      if (incomePatient?.id && allocated <= 0.009 && paymentTargets.length > 0) {
        setError(
          "Cobro registrado en Caja, pero no se aplicó al plan/evolución. Elige un destino en «Aplicar a» o revisa que el ítem tenga saldo."
        );
      } else if (
        incomePatient?.id &&
        typeof tx.saldo_pendiente_destino === "number" &&
        tx.saldo_pendiente_destino > 0.009
      ) {
        setError("");
      }

      setLastReceipt(enriched);
      await loadData();

      // Refrescar destinos (saldo restante) y avisar a la ficha clínica
      if (incomePatient?.id) {
        const saldoFromPay =
          typeof tx.saldo_pendiente_destino === "number"
            ? tx.saldo_pendiente_destino
            : null;
        try {
          const res = await apiFetch<{ targets: PaymentTarget[] }>(
            `/api/clinical/${incomePatient.id}/payment-targets`
          );
          setPaymentTargets(res.targets || []);
          const still = (res.targets || []).find(
            (t) =>
              (tx.evolution_entry_id &&
                t.kind === "evolution" &&
                t.id === tx.evolution_entry_id) ||
              (tx.plan_item_ref && t.kind === "plan" && t.id === tx.plan_item_ref) ||
              (tx.allocations || []).some(
                (a) => a.kind === t.kind && a.id === t.id
              )
          );
          if (still) {
            setPayTarget(`${still.kind}:${still.id}`);
            const nextSaldo =
              saldoFromPay !== null && saldoFromPay >= 0
                ? saldoFromPay
                : still.saldo;
            setIncomeMonto(nextSaldo > 0.009 ? String(nextSaldo) : "");
          } else if (saldoFromPay !== null && saldoFromPay > 0.009) {
            setIncomeMonto(String(saldoFromPay));
          } else {
            setPayTarget("auto");
            setIncomeMonto("");
          }
        } catch {
          if (saldoFromPay !== null && saldoFromPay > 0.009) {
            setIncomeMonto(String(saldoFromPay));
          }
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("dentalfacil:clinical-money-updated", {
              detail: { patientId: incomePatient.id },
            })
          );
        }
      }
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

      <CashPageHeader
        session={session}
        onCobrar={() => {
          setShowIncome(true);
          setShowExpense(false);
          setLastReceipt(null);
          setReceiptAction(null);
        }}
        onEgreso={() => {
          setShowExpense(true);
          setShowIncome(false);
        }}
        onCloseConfirm={() => setShowCloseConfirm(true)}
      />

      {closeSummary && (
        <CloseCashSummary summary={closeSummary} onDismiss={() => setCloseSummary(null)} />
      )}

      {showCloseConfirm && session && (
        <CloseCashConfirm
          session={session}
          totals={totals}
          saving={saving}
          onConfirm={() => void closeCash()}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}

      {!session ? (
        <OpenCashPanel
          showOpen={showOpen}
          montoInicial={montoInicial}
          setMontoInicial={setMontoInicial}
          saving={saving}
          onOpen={openCash}
          onShowOpen={() => setShowOpen(true)}
          onCancelOpen={() => setShowOpen(false)}
        />
      ) : (
        <div className="space-y-5">
          <CashSessionDashboard session={session} totals={totals} barMax={barMax} />

          {showIncome && (
            <IncomeForm
              incomePatient={incomePatient}
              setIncomePatient={setIncomePatient}
              incomeConcepto={incomeConcepto}
              setIncomeConcepto={setIncomeConcepto}
              incomeMonto={incomeMonto}
              setIncomeMonto={setIncomeMonto}
              incomeMetodo={incomeMetodo}
              setIncomeMetodo={setIncomeMetodo}
              incomeMixto={incomeMixto}
              setIncomeMixto={setIncomeMixto}
              incomePartes={incomePartes}
              setIncomePartes={setIncomePartes}
              payTarget={payTarget}
              setPayTarget={setPayTarget}
              paymentTargets={paymentTargets}
              targetsLoading={targetsLoading}
              incomeTotal={incomeTotal}
              mixtoSuma={mixtoSuma}
              mixtoDiff={mixtoDiff}
              saving={saving}
              lastReceipt={lastReceipt}
              setError={setError}
              onSubmit={createIncome}
              onClose={() => setShowIncome(false)}
              onResetForm={resetIncomeForm}
              onClearReceipt={() => {
                setLastReceipt(null);
              }}
            />
          )}

          {showExpense && (
            <ExpenseForm
              expenseConcepto={expenseConcepto}
              setExpenseConcepto={setExpenseConcepto}
              expenseMonto={expenseMonto}
              setExpenseMonto={setExpenseMonto}
              expenseMetodo={expenseMetodo}
              setExpenseMetodo={setExpenseMetodo}
              saving={saving}
              onSubmit={createExpense}
              onClose={() => setShowExpense(false)}
            />
          )}

          <TransactionsTable
            transactions={transactions}
            filteredTx={filteredTx}
            tipoFilter={tipoFilter}
            setTipoFilter={setTipoFilter}
            onCobrar={() => {
              setShowIncome(true);
              setShowExpense(false);
            }}
          />
        </div>
      )}
    </PageContainer>
  );
}
