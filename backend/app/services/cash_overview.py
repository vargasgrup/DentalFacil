"""Pending clinical debts and period-bounded cash movement queries for Caja."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import CashSession, CashTransaction, ClinicalEvolutionEntry, Patient
from app.services.payment_allocation import _evo_saldo

LIMA = ZoneInfo("America/Lima")
PeriodKey = Literal["sesion", "hoy", "semana", "mes", "anio"]


def _patient_initials(nombres: str, apellidos: str) -> str:
    a = (nombres or "").strip()[:1]
    b = (apellidos or "").strip()[:1]
    return f"{a}{b}".upper() or "?"


def list_pending_debts(db: Session, *, limit: int = 100) -> dict[str, Any]:
    """Aggregate evolution balances > 0 by patient (same source as Dashboard)."""
    from app.utils.ficha import format_ficha_code

    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.origen != "migracion")
        .order_by(ClinicalEvolutionEntry.fecha.asc())
        .all()
    )
    by_patient: dict[str, dict[str, Any]] = {}
    for e in entries:
        saldo = _evo_saldo(e)
        if saldo <= 0.009:
            continue
        pid = e.patient_id
        if not pid:
            continue
        if pid not in by_patient:
            p = db.get(Patient, pid)
            if p and getattr(p, "activo", True) is False:
                # Keep inactive visibility? usually still show debt
                pass
            by_patient[pid] = {
                "patient_id": pid,
                "patient_nombre": (
                    f"{p.nombres} {p.apellidos}".strip() if p else "Paciente"
                ),
                "initials": _patient_initials(
                    p.nombres if p else "", p.apellidos if p else ""
                ),
                "ficha": format_ficha_code(p.numero_ficha) if p else "—",
                "telefono": (p.telefono if p else None)
                or (getattr(p, "telefono_responsable", None) if p else None),
                "saldo": 0.0,
                "lines": [],
            }
        row = by_patient[pid]
        row["saldo"] += saldo
        row["lines"].append(
            {
                "evolution_entry_id": e.id,
                "label": e.tratamiento_descripcion or "Tratamiento",
                "pieza_fdi": e.pieza_fdi,
                "costo": round(float(e.costo or 0), 2),
                "a_cuenta": round(float(e.a_cuenta or 0), 2),
                "saldo": round(saldo, 2),
            }
        )

    items = sorted(by_patient.values(), key=lambda x: -x["saldo"])
    for d in items:
        d["saldo"] = round(d["saldo"], 2)
        d["lines"] = sorted(d["lines"], key=lambda x: -x["saldo"])
    if limit > 0:
        items = items[:limit]
    deuda_total = round(sum(d["saldo"] for d in items), 2)
    return {
        "deuda_total": deuda_total,
        "deuda_pacientes": len(by_patient),
        "items": items,
    }


def period_bounds(
    period: PeriodKey,
    *,
    now: datetime | None = None,
    session: CashSession | None = None,
) -> tuple[datetime | None, datetime | None]:
    """Return inclusive UTC-ish bounds for filters. sesion → (None,None) use session id."""
    if period == "sesion":
        if not session:
            return None, None
        start = session.abierta_en
        end = session.cerrada_en or datetime.now(timezone.utc)
        return start, end

    now_local = (now or datetime.now(timezone.utc)).astimezone(LIMA)
    day_start = datetime.combine(now_local.date(), time.min, tzinfo=LIMA)

    if period == "hoy":
        start = day_start
        end = day_start + timedelta(days=1) - timedelta(microseconds=1)
    elif period == "semana":
        # Lunes 00:00 → now (semana en curso)
        mon = day_start - timedelta(days=day_start.weekday())
        start = mon
        end = now_local
    elif period == "mes":
        start = day_start.replace(day=1)
        end = now_local
    elif period == "anio":
        start = day_start.replace(month=1, day=1)
        end = now_local
    else:
        start = day_start
        end = now_local

    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def list_cash_movements(
    db: Session,
    *,
    period: PeriodKey = "hoy",
    tipo: str | None = None,
    include_voided: bool = True,
    limit: int = 500,
) -> dict[str, Any]:
    open_s = (
        db.query(CashSession)
        .filter(CashSession.estado == "abierta")
        .order_by(CashSession.abierta_en.asc())
        .first()
    )

    q = db.query(CashTransaction)
    start: datetime | None = None
    end: datetime | None = None

    if period == "sesion":
        if not open_s:
            return {
                "period": period,
                "start": None,
                "end": None,
                "session_id": None,
                "ingresos": 0.0,
                "egresos": 0.0,
                "neto": 0.0,
                "items": [],
            }
        q = q.filter(CashTransaction.cash_session_id == open_s.id)
        start = open_s.abierta_en
        end = datetime.now(timezone.utc)
    else:
        start, end = period_bounds(period, session=open_s)
        if start is not None:
            q = q.filter(CashTransaction.created_at >= start)
        if end is not None:
            q = q.filter(CashTransaction.created_at <= end)

    if tipo in ("ingreso", "egreso"):
        q = q.filter(CashTransaction.tipo == tipo)
    if not include_voided:
        q = q.filter(CashTransaction.anulado.is_(False))

    txs = q.order_by(CashTransaction.created_at.desc()).limit(limit).all()

    ingresos = sum(
        float(t.monto)
        for t in txs
        if t.tipo == "ingreso" and not getattr(t, "anulado", False)
    )
    egresos = sum(
        float(t.monto)
        for t in txs
        if t.tipo == "egreso" and not getattr(t, "anulado", False)
    )
    return {
        "period": period,
        "start": start,
        "end": end,
        "session_id": open_s.id if open_s and period == "sesion" else None,
        "ingresos": round(ingresos, 2),
        "egresos": round(egresos, 2),
        "neto": round(ingresos - egresos, 2),
        "items": txs,
    }
