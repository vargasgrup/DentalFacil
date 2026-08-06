from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_module
from app.database import get_db
from app.db_prefetch import prefetch_patients
from app.models import CashSession, CashTransaction, Patient, User
from app.schemas.cash import (
    CashCloseSummary,
    CashSessionClose,
    CashSessionOpen,
    CashSessionOut,
    CashTransactionCreate,
    CashTransactionOut,
    CashTransactionVoid,
)
from app.services.patient_access import get_active_patient_or_404

router = APIRouter(prefix="/api/cash", tags=["cash"])


def _patient_whatsapp_phone(patient: Patient | None) -> str | None:
    if not patient:
        return None
    own = "".join(c for c in (patient.telefono or "") if c.isdigit())
    if len(own) >= 9:
        return patient.telefono
    tutor = "".join(
        c for c in (getattr(patient, "telefono_responsable", None) or "") if c.isdigit()
    )
    if len(tutor) >= 9:
        return patient.telefono_responsable  # type: ignore[attr-defined]
    return patient.telefono or getattr(patient, "telefono_responsable", None) or None


def _is_active_tx(tx: CashTransaction) -> bool:
    return not bool(getattr(tx, "anulado", False))


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
        patient_telefono=_patient_whatsapp_phone(patient),
        tipo=tx.tipo,
        concepto=tx.concepto,
        monto=float(tx.monto),
        metodo_pago=tx.metodo_pago,
        grupo_pago_id=getattr(tx, "grupo_pago_id", None),
        plan_item_ref=getattr(tx, "plan_item_ref", None),
        pieza_fdi=getattr(tx, "pieza_fdi", None),
        evolution_entry_id=getattr(tx, "evolution_entry_id", None),
        anulado=bool(getattr(tx, "anulado", False)),
        anulado_en=getattr(tx, "anulado_en", None),
        anulacion_motivo=getattr(tx, "anulacion_motivo", None),
        created_at=tx.created_at,
        allocated_total=allocated_total,
        unallocated_amount=unallocated_amount,
        allocations=allocations,
        saldo_pendiente_destino=saldo_pendiente_destino,
        pagos_parciales=pagos_parciales,
    )


def _txs_to_out(db: Session, txs: list[CashTransaction]) -> list[CashTransactionOut]:
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
    return (
        db.query(CashSession)
        .filter(CashSession.estado == "abierta")
        .order_by(CashSession.abierta_en.asc())
        .first()
    )


def _require_open_session(db: Session) -> CashSession:
    session = _get_open_session(db)
    if not session:
        raise HTTPException(
            status_code=400,
            detail="No hay caja abierta. Abra la caja en el módulo Caja antes de registrar movimientos.",
        )
    return session


def _session_saldo(db: Session, session: CashSession) -> float:
    txs = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.cash_session_id == session.id,
            CashTransaction.anulado.is_(False),
        )
        .all()
    )
    ingresos = sum(float(t.monto) for t in txs if t.tipo == "ingreso")
    egresos = sum(float(t.monto) for t in txs if t.tipo == "egreso")
    return round(float(session.monto_inicial) + ingresos - egresos, 2)


def _publish_tx_created(user: User, tx: CashTransaction, *, monto: float | None = None) -> None:
    from app.realtime.connection_manager import publish_event

    publish_event(
        "cash.transaction.created",
        {
            "id": tx.id,
            "patientId": tx.patient_id,
            "monto": float(monto if monto is not None else (tx.monto or 0)),
            "tipo": tx.tipo,
            "grupo_pago_id": getattr(tx, "grupo_pago_id", None),
        },
        actor=user.id,
    )


def _tag_anticipo_concepto(concepto: str, unallocated: float) -> str:
    if unallocated <= 0.009:
        return concepto
    base = (concepto or "").strip()
    tag = f"anticipo S/ {unallocated:.2f}"
    if tag in base.lower():
        return base
    return f"{base} · {tag}" if base else tag


@router.get("/session", response_model=CashSessionOut | None)
def get_current_session(
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
):
    return _get_open_session(db)


@router.post("/session/open", response_model=CashSessionOut, status_code=status.HTTP_201_CREATED)
def open_session(
    payload: CashSessionOpen,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
):
    if _get_open_session(db):
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta")
    session = CashSession(
        usuario_id=user.id,
        monto_inicial=payload.monto_inicial,
        estado="abierta",
        open_lock=1,
    )
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta") from None
    db.refresh(session)
    from app.realtime.connection_manager import publish_event

    publish_event("cash.session.opened", {"id": session.id}, actor=user.id)
    return session


@router.post("/session/close", response_model=CashCloseSummary)
def close_session(
    payload: CashSessionClose,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
):
    session = _get_open_session(db)
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta")

    transactions = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.cash_session_id == session.id,
            CashTransaction.anulado.is_(False),
        )
        .all()
    )

    ingresos = sum(float(t.monto) for t in transactions if t.tipo == "ingreso")
    egresos = sum(float(t.monto) for t in transactions if t.tipo == "egreso")
    neto = ingresos - egresos
    total_esperado = float(session.monto_inicial) + neto
    monto_contado = round(float(payload.monto_contado), 2)
    diferencia = round(monto_contado - total_esperado, 2)

    por_metodo: dict[str, float] = {}
    for t in transactions:
        if t.tipo == "ingreso":
            por_metodo[t.metodo_pago] = por_metodo.get(t.metodo_pago, 0) + float(t.monto)

    session.monto_final = total_esperado
    session.monto_contado = monto_contado
    session.diferencia = diferencia
    session.cierre_notas = (payload.notas or "").strip() or None
    session.cerrada_por_id = user.id
    session.cerrada_en = datetime.now(timezone.utc)
    session.estado = "cerrada"
    session.open_lock = None
    db.commit()

    from app.realtime.connection_manager import publish_event

    publish_event("cash.session.closed", {"id": session.id}, actor=user.id)

    return CashCloseSummary(
        session_id=session.id,
        monto_inicial=float(session.monto_inicial),
        ingresos=ingresos,
        egresos=egresos,
        neto=neto,
        total_esperado=total_esperado,
        monto_contado=monto_contado,
        diferencia=diferencia,
        cierre_notas=session.cierre_notas,
        por_metodo=por_metodo,
        monto_final=total_esperado,
    )


@router.get("/transactions", response_model=list[CashTransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
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
    """Historial de cobros del paciente (solo lectura en ficha; el cobro es en Caja)."""
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    txs = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.patient_id == patient_id,
            CashTransaction.tipo == "ingreso",
            CashTransaction.anulado.is_(False),
        )
        .order_by(CashTransaction.created_at.desc())
        .all()
    )
    return _txs_to_out(db, txs)


@router.post(
    "/transactions/{transaction_id}/void",
    response_model=CashTransactionOut,
)
def void_transaction(
    transaction_id: str,
    payload: CashTransactionVoid,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
):
    """Anula un cobro/egreso de la sesión abierta y resincroniza a_cuenta clínico."""
    from app.models import ClinicalEvolutionEntry
    from app.services.payment_allocation import (
        sync_evolution_a_cuenta_from_cash,
        _sync_plan_from_entry,
        reconcile_plan_evolution_costs,
    )

    session = _require_open_session(db)
    tx = db.get(CashTransaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    if tx.cash_session_id != session.id:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden anular movimientos de la caja abierta actual",
        )
    if getattr(tx, "anulado", False):
        raise HTTPException(status_code=400, detail="El movimiento ya está anulado")

    siblings = [tx]
    if tx.grupo_pago_id:
        siblings = (
            db.query(CashTransaction)
            .filter(CashTransaction.grupo_pago_id == tx.grupo_pago_id)
            .all()
        )

    now = datetime.now(timezone.utc)
    motivo = payload.motivo.strip()
    patient_ids: set[str] = set()
    evo_ids: set[str] = set()
    for s in siblings:
        if getattr(s, "anulado", False):
            continue
        s.anulado = True
        s.anulado_en = now
        s.anulado_por_id = user.id
        s.anulacion_motivo = motivo
        if s.patient_id:
            patient_ids.add(s.patient_id)
        if s.evolution_entry_id:
            evo_ids.add(s.evolution_entry_id)

    for evo_id in evo_ids:
        entry = db.get(ClinicalEvolutionEntry, evo_id)
        if entry:
            # Forzar a_cuenta a Σ cash activa (puede bajar al anular)
            paid = (
                db.query(CashTransaction)
                .filter(
                    CashTransaction.evolution_entry_id == evo_id,
                    CashTransaction.tipo == "ingreso",
                    CashTransaction.anulado.is_(False),
                )
                .all()
            )
            entry.a_cuenta = round(sum(float(t.monto) for t in paid), 2)
            _sync_plan_from_entry(db, entry)

    for pid in patient_ids:
        reconcile_plan_evolution_costs(db, pid)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"No se pudo anular el movimiento: {exc}"
        ) from exc

    for s in siblings:
        db.refresh(s)
    primary = next((s for s in siblings if s.id == transaction_id), siblings[0])
    from app.realtime.connection_manager import publish_event

    publish_event(
        "cash.transaction.voided",
        {
            "id": primary.id,
            "patientId": primary.patient_id,
            "grupo_pago_id": primary.grupo_pago_id,
        },
        actor=user.id,
    )
    return _tx_to_out(primary, db)


@router.post("/transactions", response_model=CashTransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: CashTransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_module("caja")),
):
    if payload.tipo not in ("ingreso", "egreso"):
        raise HTTPException(status_code=400, detail="Tipo debe ser 'ingreso' o 'egreso'")
    if payload.patient_id:
        get_active_patient_or_404(db, payload.patient_id)
    if float(payload.monto) <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero")

    session = _require_open_session(db)

    if payload.tipo == "egreso":
        saldo = _session_saldo(db, session)
        if float(payload.monto) - saldo > 0.009:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El egreso (S/ {float(payload.monto):.2f}) supera el saldo "
                    f"disponible en caja (S/ {saldo:.2f})."
                ),
            )

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
                anulado=False,
            )
            db.add(tx)
            created.append(tx)

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
            if unallocated_amount and unallocated_amount > 0.009:
                tagged = _tag_anticipo_concepto(concepto_base, unallocated_amount)
                for tx in created:
                    tx.concepto = tagged

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
        _publish_tx_created(user, primary, monto=float(payload.monto))
        return out

    concepto = payload.concepto.strip()
    tx = CashTransaction(
        cash_session_id=session.id,
        patient_id=payload.patient_id,
        tipo=payload.tipo,
        concepto=concepto,
        monto=payload.monto,
        metodo_pago=payload.metodo_pago,
        plan_item_ref=plan_ref,
        pieza_fdi=payload.pieza_fdi,
        evolution_entry_id=evo_id,
        anulado=False,
    )
    db.add(tx)

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
        if unallocated_amount and unallocated_amount > 0.009:
            tx.concepto = _tag_anticipo_concepto(concepto, unallocated_amount)

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
    _publish_tx_created(user, tx)
    return _tx_to_out(
        tx,
        db,
        allocated_total=allocated_total,
        unallocated_amount=unallocated_amount,
        allocations=allocations_out,
        saldo_pendiente_destino=saldo_pendiente,
    )
