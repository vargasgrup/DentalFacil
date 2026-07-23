from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
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
    db: Session,
    *,
    allocated_total: float | None = None,
    allocations: list[dict] | None = None,
    pagos_parciales: list[dict] | None = None,
) -> CashTransactionOut:
    patient = db.get(Patient, tx.patient_id) if tx.patient_id else None
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
        allocations=allocations,
        pagos_parciales=pagos_parciales,
    )


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
    return [_tx_to_out(t, db) for t in txs]


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
    return [_tx_to_out(t, db) for t in txs]


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
        db.flush()

        allocated_total = None
        allocations_out = None
        if payload.allocate and payload.tipo == "ingreso" and payload.patient_id:
            from app.services.payment_allocation import allocate_ingreso

            try:
                applied = allocate_ingreso(
                    db,
                    patient_id=payload.patient_id,
                    monto=float(payload.monto),
                    evolution_entry_id=evo_id,
                    plan_item_id=plan_ref,
                )
            except Exception as exc:
                db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"El pago no pudo aplicarse al plan/evolución: {exc}",
                ) from exc
            if applied:
                allocated_total = round(sum(a.amount for a in applied), 2)
                allocations_out = [
                    {"kind": a.kind, "id": a.id, "amount": a.amount, "label": a.label}
                    for a in applied
                ]
                primary = created[0]
                if not primary.evolution_entry_id:
                    evo_apps = [a for a in applied if a.kind == "evolution"]
                    if evo_apps:
                        for tx in created:
                            tx.evolution_entry_id = evo_apps[0].id
                if not primary.plan_item_ref:
                    plan_apps = [a for a in applied if a.kind == "plan"]
                    if plan_apps:
                        for tx in created:
                            tx.plan_item_ref = plan_apps[0].id

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
        # Respuesta “cabecera”: monto total + detalle de partes (auditoría / comprobante)
        out = _tx_to_out(
            primary,
            db,
            allocated_total=allocated_total,
            allocations=allocations_out,
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
    db.flush()

    allocated_total = None
    allocations_out = None
    if (
        payload.allocate
        and payload.tipo == "ingreso"
        and payload.patient_id
    ):
        from app.services.payment_allocation import allocate_ingreso

        try:
            applied = allocate_ingreso(
                db,
                patient_id=payload.patient_id,
                monto=float(payload.monto),
                evolution_entry_id=evo_id,
                plan_item_id=plan_ref,
            )
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"El pago no pudo aplicarse al plan/evolución: {exc}",
            ) from exc
        if applied:
            allocated_total = round(sum(a.amount for a in applied), 2)
            allocations_out = [
                {"kind": a.kind, "id": a.id, "amount": a.amount, "label": a.label}
                for a in applied
            ]
            # Persist primary clinical refs on the cash row for audit
            if not tx.evolution_entry_id:
                evo_apps = [a for a in applied if a.kind == "evolution"]
                if evo_apps:
                    tx.evolution_entry_id = evo_apps[0].id
            if not tx.plan_item_ref:
                plan_apps = [a for a in applied if a.kind == "plan"]
                if plan_apps:
                    tx.plan_item_ref = plan_apps[0].id
                else:
                    # evolution may carry plan_item_id
                    from app.models import ClinicalEvolutionEntry

                    for a in applied:
                        if a.kind != "evolution":
                            continue
                        entry = db.get(ClinicalEvolutionEntry, a.id)
                        if entry and entry.plan_item_id:
                            tx.plan_item_ref = entry.plan_item_id
                            break

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
        tx, db, allocated_total=allocated_total, allocations=allocations_out
    )
