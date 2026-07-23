from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.db_prefetch import prefetch_patients
from app.models import CashSession, CashTransaction, Patient, User
from app.schemas.cash import (
    CashCloseSummary,
    CashSessionOpen,
    CashSessionOut,
    CashTransactionCreate,
    CashTransactionOut,
)

router = APIRouter(prefix="/api/cash", tags=["cash"])


def _tx_to_out(
    tx: CashTransaction,
    db: Session | None = None,
    *,
    patient: Patient | None = None,
    allocated_total: float | None = None,
    unallocated_amount: float | None = None,
    allocations: list[dict] | None = None,
    saldo_pendiente_destino: float | None = None,
    pagos_parciales: list[dict] | None = None,
) -> CashTransactionOut:
    if patient is None and db is not None and tx.patient_id:
        patient = db.get(Patient, tx.patient_id)
    return CashTransactionOut(
        id=tx.id,
        cash_session_id=tx.cash_session_id,
        patient_id=tx.patient_id,
        patient_nombre=f"{patient.nombres} {patient.apellidos}" if patient else None,
        patient_telefono=patient.telefono if patient else None,
        tipo=tx.tipo,
        concepto=tx.concepto,
        monto=float(tx.monto),
        metodo_pago=tx.metodo_pago,
        grupo_pago_id=getattr(tx, "grupo_pago_id", None),
        plan_item_ref=getattr(tx, "plan_item_ref", None),
        pieza_fdi=getattr(tx, "pieza_fdi", None),
        evolution_entry_id=getattr(tx, "evolution_entry_id", None),
        created_at=tx.created_at,
        allocated_total=allocated_total,
        unallocated_amount=unallocated_amount,
        allocations=allocations,
        saldo_pendiente_destino=saldo_pendiente_destino,
        pagos_parciales=pagos_parciales,
    )


def _txs_to_out(db: Session, txs: list[CashTransaction]) -> list[CashTransactionOut]:
    """Serializa transacciones con prefetch de pacientes (evita N+1)."""
    patients = prefetch_patients(db, (t.patient_id for t in txs))
    return [
        _tx_to_out(t, patient=patients.get(t.patient_id) if t.patient_id else None)
        for t in txs
    ]


def _run_clinical_allocation(
    db: Session,
    *,
    patient_id: str,
    monto: float,
    evolution_entry_id: str | None,
    plan_item_ref: str | None,
) -> tuple[float, float, list[dict], float | None]:
    """Apply ingreso to plan/evolución. Raises HTTPException on explicit target failure.

    Must run BEFORE the new CashTransaction is flushed (or before it has clinical
    refs), so sync-from-cash does not double-count this same cobro.
    """
    from app.services.payment_allocation import AllocationError, allocate_ingreso

    explicit = bool(evolution_entry_id or plan_item_ref)
    try:
        applied = allocate_ingreso(
            db,
            patient_id=patient_id,
            monto=monto,
            evolution_entry_id=evolution_entry_id,
            plan_item_id=plan_item_ref,
            require_target=explicit,
        )
    except AllocationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"El pago no pudo aplicarse al plan/evolución: {exc}",
        ) from exc

    allocated_total = round(sum(a.amount for a in applied), 2) if applied else 0.0
    unallocated = round(max(0.0, float(monto) - allocated_total), 2)
    allocations_out = [
        {
            "kind": a.kind,
            "id": a.id,
            "amount": a.amount,
            "label": a.label,
            "saldo_after": a.saldo_after,
            "costo": a.costo,
            "a_cuenta_after": a.a_cuenta_after,
        }
        for a in applied
    ]
    saldo_pendiente = None
    if applied:
        saldo_pendiente = round(float(applied[-1].saldo_after), 2)
    return allocated_total, unallocated, allocations_out, saldo_pendiente


def _refresh_allocation_after_cash_flush(
    db: Session,
    allocations_out: list[dict] | None,
    *,
    patient_id: str | None = None,
) -> tuple[list[dict] | None, float | None]:
    """After cash refs are flushed, align a_cuenta with Σ Caja and refresh saldos."""
    from app.services.payment_allocation import (
        sync_evolution_a_cuenta_from_cash,
        _sync_plan_from_entry,
        _evo_saldo,
        _cash_paid_plan_item,
        _plan_item_subtotal,
    )
    from app.models import ClinicalEvolutionEntry, ClinicalRecord
    from app.odontogram.plans import normalize_plans
    from sqlalchemy.orm.attributes import flag_modified

    if not allocations_out:
        return allocations_out, None
    saldo_pendiente = None
    refreshed: list[dict] = []
    for a in allocations_out:
        row = dict(a)
        if a.get("kind") == "evolution" and a.get("id"):
            entry = db.get(ClinicalEvolutionEntry, a["id"])
            if entry:
                sync_evolution_a_cuenta_from_cash(db, entry)
                _sync_plan_from_entry(db, entry)
                row["a_cuenta_after"] = float(entry.a_cuenta or 0)
                row["costo"] = float(entry.costo or 0)
                row["saldo_after"] = _evo_saldo(entry)
        elif a.get("kind") == "plan" and a.get("id") and patient_id:
            entry = (
                db.query(ClinicalEvolutionEntry)
                .filter(
                    ClinicalEvolutionEntry.patient_id == patient_id,
                    ClinicalEvolutionEntry.plan_item_id == a["id"],
                )
                .first()
            )
            if entry:
                sync_evolution_a_cuenta_from_cash(db, entry)
                _sync_plan_from_entry(db, entry)
                row["a_cuenta_after"] = float(entry.a_cuenta or 0)
                row["costo"] = float(entry.costo or 0)
                row["saldo_after"] = _evo_saldo(entry)
            else:
                record = (
                    db.query(ClinicalRecord)
                    .filter(ClinicalRecord.patient_id == patient_id)
                    .first()
                )
                if record and record.plan_tratamiento:
                    plans = normalize_plans(record.plan_tratamiento)
                    for alt in plans.get("alternatives") or []:
                        for it in alt.get("items") or []:
                            if str(it.get("id") or "") != str(a["id"]):
                                continue
                            paid = _cash_paid_plan_item(db, patient_id, a["id"])
                            ac = max(float(it.get("a_cuenta") or 0), paid)
                            it["a_cuenta"] = ac
                            costo = _plan_item_subtotal(it)
                            row["a_cuenta_after"] = ac
                            row["costo"] = costo
                            row["saldo_after"] = max(0.0, round(costo - ac, 2))
                            record.plan_tratamiento = plans
                            flag_modified(record, "plan_tratamiento")
                            break
        refreshed.append(row)
        saldo_pendiente = round(float(row.get("saldo_after") or 0), 2)
    return refreshed, saldo_pendiente


def _backfill_tx_refs(
    db: Session, txs: list[CashTransaction], applied_rows: list[dict]
) -> None:
    if not applied_rows or not txs:
        return
    primary = txs[0]
    if not primary.evolution_entry_id:
        evo = next((a for a in applied_rows if a["kind"] == "evolution"), None)
        if evo:
            for tx in txs:
                tx.evolution_entry_id = evo["id"]
    if not primary.plan_item_ref:
        plan = next((a for a in applied_rows if a["kind"] == "plan"), None)
        if plan:
            for tx in txs:
                tx.plan_item_ref = plan["id"]
        else:
            from app.models import ClinicalEvolutionEntry

            for a in applied_rows:
                if a["kind"] != "evolution":
                    continue
                entry = db.get(ClinicalEvolutionEntry, a["id"])
                if entry and entry.plan_item_id:
                    for tx in txs:
                        tx.plan_item_ref = entry.plan_item_id
                    break


def _get_open_session(db: Session) -> CashSession | None:
    return db.query(CashSession).filter(CashSession.estado == "abierta").first()


@router.get("/session", response_model=CashSessionOut | None)
def get_current_session(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = _get_open_session(db)
    return s


@router.post("/session/open", response_model=CashSessionOut, status_code=status.HTTP_201_CREATED)
def open_session(
    payload: CashSessionOpen,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if _get_open_session(db):
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta")
    session = CashSession(
        usuario_id=user.id,
        monto_inicial=payload.monto_inicial,
        estado="abierta",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/session/close", response_model=CashCloseSummary)
def close_session(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _get_open_session(db)
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta")

    transactions = (
        db.query(CashTransaction)
        .filter(CashTransaction.cash_session_id == session.id)
        .all()
    )

    ingresos = sum(float(t.monto) for t in transactions if t.tipo == "ingreso")
    egresos = sum(float(t.monto) for t in transactions if t.tipo == "egreso")
    neto = ingresos - egresos
    total_esperado = float(session.monto_inicial) + neto

    por_metodo: dict[str, float] = {}
    for t in transactions:
        if t.tipo == "ingreso":
            por_metodo[t.metodo_pago] = por_metodo.get(t.metodo_pago, 0) + float(t.monto)

    session.monto_final = total_esperado
    session.cerrada_en = datetime.now(timezone.utc)
    session.estado = "cerrada"
    db.commit()

    return CashCloseSummary(
        session_id=session.id,
        monto_inicial=float(session.monto_inicial),
        ingresos=ingresos,
        egresos=egresos,
        neto=neto,
        total_esperado=total_esperado,
        por_metodo=por_metodo,
        monto_final=total_esperado,
    )


@router.get("/transactions", response_model=list[CashTransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _get_open_session(db)
    if not session:
        return []
    txs = (
        db.query(CashTransaction)
        .filter(CashTransaction.cash_session_id == session.id)
        .order_by(CashTransaction.created_at.desc())
        .all()
    )
    return _txs_to_out(db, txs)


@router.get("/transactions/patient/{patient_id}", response_model=list[CashTransactionOut])
def list_patient_payments(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All income transactions for a patient (payment history for Ficha Clínica)."""
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    txs = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.patient_id == patient_id,
            CashTransaction.tipo == "ingreso",
        )
        .order_by(CashTransaction.created_at.desc())
        .all()
    )
    return _txs_to_out(db, txs)


def _ensure_open_session(db: Session, user: User) -> CashSession:
    """Return open caja, creating one with monto_inicial=0 if needed.

    Clinical «Registrar pago» must not hang or fail silently when caja was never
    opened that day — auto-open keeps money flow continuous on Railway / local.
    """
    session = _get_open_session(db)
    if session:
        return session
    session = CashSession(
        usuario_id=user.id,
        monto_inicial=0,
        estado="abierta",
    )
    db.add(session)
    db.flush()
    return session


@router.post("/transactions", response_model=CashTransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: CashTransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.tipo not in ("ingreso", "egreso"):
        raise HTTPException(status_code=400, detail="Tipo debe ser 'ingreso' o 'egreso'")
    if payload.patient_id and not db.get(Patient, payload.patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if float(payload.monto) <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero")

    session = _ensure_open_session(db, user)

    plan_ref = (payload.plan_item_ref or "").strip() or None
    evo_id = (payload.evolution_entry_id or "").strip() or None

    from app.models.ids import new_uuid

    splits = payload.pagos_parciales or []
    if splits:
        grupo_id = new_uuid()
        parts = [
            (p.metodo_pago.strip().lower(), round(float(p.monto), 2)) for p in splits
        ]
        detalle = " + ".join(f"{m} S/ {amt:.2f}" for m, amt in parts)
        concepto_base = payload.concepto.strip()
        if "mixto" not in concepto_base.lower():
            concepto_base = f"{concepto_base} (mixto: {detalle})"

        created: list[CashTransaction] = []
        for metodo, monto_part in parts:
            tx = CashTransaction(
                cash_session_id=session.id,
                patient_id=payload.patient_id,
                tipo=payload.tipo,
                concepto=concepto_base,
                monto=monto_part,
                metodo_pago=metodo,
                grupo_pago_id=grupo_id,
                plan_item_ref=plan_ref,
                pieza_fdi=payload.pieza_fdi,
                evolution_entry_id=evo_id,
            )
            db.add(tx)
            created.append(tx)

        # Allocate BEFORE flush so Σ Caja aún no incluye este cobro (evita doble conteo).
        allocated_total = 0.0
        unallocated_amount = None
        allocations_out = None
        saldo_pendiente = None
        if payload.allocate and payload.tipo == "ingreso" and payload.patient_id:
            (
                allocated_total,
                unallocated_amount,
                allocations_out,
                saldo_pendiente,
            ) = _run_clinical_allocation(
                db,
                patient_id=payload.patient_id,
                monto=float(payload.monto),
                evolution_entry_id=evo_id,
                plan_item_ref=plan_ref,
            )
            _backfill_tx_refs(db, created, allocations_out or [])

        db.flush()
        if allocations_out and payload.patient_id:
            allocations_out, saldo_pendiente = _refresh_allocation_after_cash_flush(
                db, allocations_out, patient_id=payload.patient_id
            )

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"No se pudo guardar el pago mixto: {exc}",
            ) from exc

        for tx in created:
            db.refresh(tx)
        primary = created[0]
        out = _tx_to_out(
            primary,
            db,
            allocated_total=allocated_total,
            unallocated_amount=unallocated_amount,
            allocations=allocations_out,
            saldo_pendiente_destino=saldo_pendiente,
            pagos_parciales=[{"metodo_pago": m, "monto": a} for m, a in parts],
        )
        out.monto = float(payload.monto)
        out.metodo_pago = "mixto"
        out.grupo_pago_id = grupo_id
        return out

    tx = CashTransaction(
        cash_session_id=session.id,
        patient_id=payload.patient_id,
        tipo=payload.tipo,
        concepto=payload.concepto,
        monto=payload.monto,
        metodo_pago=payload.metodo_pago,
        plan_item_ref=plan_ref,
        pieza_fdi=payload.pieza_fdi,
        evolution_entry_id=evo_id,
    )
    db.add(tx)

    # Allocate BEFORE flush (autoflush=False): a_cuenta += monto, then cash gets refs.
    allocated_total = (
        0.0 if (payload.allocate and payload.tipo == "ingreso" and payload.patient_id) else None
    )
    unallocated_amount = None
    allocations_out = None
    saldo_pendiente = None
    if payload.allocate and payload.tipo == "ingreso" and payload.patient_id:
        (
            allocated_total,
            unallocated_amount,
            allocations_out,
            saldo_pendiente,
        ) = _run_clinical_allocation(
            db,
            patient_id=payload.patient_id,
            monto=float(payload.monto),
            evolution_entry_id=evo_id,
            plan_item_ref=plan_ref,
        )
        _backfill_tx_refs(db, [tx], allocations_out or [])

    db.flush()
    if allocations_out and payload.patient_id:
        allocations_out, saldo_pendiente = _refresh_allocation_after_cash_flush(
            db, allocations_out, patient_id=payload.patient_id
        )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar el pago: {exc}",
        ) from exc
    db.refresh(tx)
    return _tx_to_out(
        tx,
        db,
        allocated_total=allocated_total,
        unallocated_amount=unallocated_amount,
        allocations=allocations_out,
        saldo_pendiente_destino=saldo_pendiente,
    )
