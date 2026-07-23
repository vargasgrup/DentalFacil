"""Reportes clínicos y de caja — consolidan Agenda, Evolución y Caja."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Appointment,
    CashTransaction,
    ClinicalEvolutionEntry,
    Patient,
    User,
)


def _money(v: float) -> str:
    return f"S/ {float(v):.2f}"


def _patient_name(db: Session, patient_id: str | None) -> str:
    if not patient_id:
        return "—"
    p = db.get(Patient, patient_id)
    if not p:
        return "—"
    return f"{p.nombres} {p.apellidos}".strip() or "—"


def _patient_doc(db: Session, patient_id: str | None) -> str:
    if not patient_id:
        return "—"
    p = db.get(Patient, patient_id)
    return (p.numero_documento if p and p.numero_documento else None) or "—"


def _doctor_name(db: Session, doctor_id: str | None) -> str:
    if not doctor_id:
        return "—"
    u = db.get(User, doctor_id)
    return u.nombre if u else "—"


def _fmt_dt(dt: datetime | None) -> tuple[str, str]:
    if not dt:
        return "—", "—"
    try:
        return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M")
    except Exception:
        return "—", "—"


@dataclass
class ReportPayload:
    title: str
    fecha_inicio: str
    fecha_fin: str
    summary: dict[str, str]
    rows: list[list[str]]
    meta: dict[str, Any] | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "title": self.title,
            "fecha_inicio": self.fecha_inicio,
            "fecha_fin": self.fecha_fin,
            "summary": self.summary,
            "rows": self.rows,
        }
        if self.meta:
            out["meta"] = self.meta
        return out


def build_caja_report(db: Session, start: datetime, end: datetime) -> ReportPayload:
    transactions = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.created_at >= start,
            CashTransaction.created_at <= end,
        )
        .order_by(CashTransaction.created_at.asc())
        .all()
    )
    ingresos = [t for t in transactions if t.tipo == "ingreso"]
    egresos = [t for t in transactions if t.tipo == "egreso"]
    total_ingresos = sum(float(t.monto) for t in ingresos)
    total_egresos = sum(float(t.monto) for t in egresos)
    neto = total_ingresos - total_egresos

    por_metodo: dict[str, float] = {}
    for t in ingresos:
        key = (t.metodo_pago or "otro").strip().lower() or "otro"
        por_metodo[key] = por_metodo.get(key, 0.0) + float(t.monto)

    pacientes_cobrados = len({t.patient_id for t in ingresos if t.patient_id})

    rows: list[list[str]] = [
        ["Fecha", "Hora", "Tipo", "Concepto", "Paciente", "Método", "Monto"]
    ]
    for t in transactions:
        f, h = _fmt_dt(t.created_at)
        rows.append(
            [
                f,
                h,
                t.tipo,
                t.concepto or "—",
                _patient_name(db, t.patient_id),
                t.metodo_pago or "—",
                _money(float(t.monto)),
            ]
        )

    return ReportPayload(
        title="Reporte de Caja",
        fecha_inicio=start.strftime("%d/%m/%Y"),
        fecha_fin=end.strftime("%d/%m/%Y"),
        summary={
            "Total ingresos": _money(total_ingresos),
            "Total egresos": _money(total_egresos),
            "Neto": _money(neto),
            "Movimientos": str(len(transactions)),
            "Pacientes cobrados": str(pacientes_cobrados),
        },
        rows=rows,
        meta={
            "por_metodo": {k: round(v, 2) for k, v in sorted(por_metodo.items())},
            "total_ingresos": round(total_ingresos, 2),
            "total_egresos": round(total_egresos, 2),
            "neto": round(neto, 2),
        },
    )


def build_pacientes_report(
    db: Session,
    start: datetime,
    end: datetime,
    doctor_id: str | None = None,
) -> ReportPayload:
    """
    Pacientes atendidos = actividad real del período:
    - Citas (no canceladas)
    - Evolución clínica (no migración)
    - Cobros en Caja con paciente
    """
    events: list[dict[str, Any]] = []

    appt_q = db.query(Appointment).filter(
        Appointment.fecha_hora >= start,
        Appointment.fecha_hora <= end,
        Appointment.estado != "cancelada",
    )
    if doctor_id:
        appt_q = appt_q.filter(Appointment.doctor_id == doctor_id)
    for a in appt_q.all():
        events.append(
            {
                "when": a.fecha_hora,
                "patient_id": a.patient_id,
                "origen": "Cita",
                "detalle": (a.especialidad or a.notas or a.estado or "Cita").strip(),
                "estado": a.estado or "—",
                "doctor_id": a.doctor_id,
                "monto": None,
                "key": f"cita:{a.id}",
            }
        )

    evo_q = db.query(ClinicalEvolutionEntry).filter(
        ClinicalEvolutionEntry.fecha >= start,
        ClinicalEvolutionEntry.fecha <= end,
        ClinicalEvolutionEntry.origen != "migracion",
    )
    if doctor_id:
        evo_q = evo_q.filter(ClinicalEvolutionEntry.doctor_id == doctor_id)
    for e in evo_q.all():
        events.append(
            {
                "when": e.fecha,
                "patient_id": e.patient_id,
                "origen": "Evolución",
                "detalle": (e.tratamiento_descripcion or "Atención clínica").strip(),
                "estado": e.estado or "—",
                "doctor_id": e.doctor_id,
                "monto": float(e.a_cuenta or 0) or None,
                "key": f"evo:{e.id}",
            }
        )

    cash_q = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.created_at >= start,
            CashTransaction.created_at <= end,
            CashTransaction.tipo == "ingreso",
            CashTransaction.patient_id.isnot(None),
        )
    )
    for t in cash_q.all():
        # Si el cobro ya está ligado a evolución del mismo paciente el mismo día,
        # igual lo mostramos como cobro (trazabilidad financiera).
        events.append(
            {
                "when": t.created_at,
                "patient_id": t.patient_id,
                "origen": "Caja",
                "detalle": (t.concepto or "Cobro").strip(),
                "estado": "cobrado",
                "doctor_id": None,
                "monto": float(t.monto),
                "key": f"cash:{t.id}",
            }
        )

    events.sort(key=lambda x: x["when"] or datetime.min)

    # Deduplicate identical keys only
    seen: set[str] = set()
    unique_events: list[dict[str, Any]] = []
    for ev in events:
        k = ev["key"]
        if k in seen:
            continue
        seen.add(k)
        unique_events.append(ev)

    patient_ids = {e["patient_id"] for e in unique_events if e.get("patient_id")}
    citas_n = sum(1 for e in unique_events if e["origen"] == "Cita")
    evo_n = sum(1 for e in unique_events if e["origen"] == "Evolución")
    caja_n = sum(1 for e in unique_events if e["origen"] == "Caja")
    cobrado = sum(float(e["monto"]) for e in unique_events if e.get("monto"))

    rows: list[list[str]] = [
        ["Fecha", "Hora", "Paciente", "Documento", "Origen", "Detalle", "Doctor", "Monto"]
    ]
    for ev in unique_events:
        f, h = _fmt_dt(ev.get("when"))
        rows.append(
            [
                f,
                h,
                _patient_name(db, ev.get("patient_id")),
                _patient_doc(db, ev.get("patient_id")),
                ev.get("origen") or "—",
                (ev.get("detalle") or "—")[:80],
                _doctor_name(db, ev.get("doctor_id")),
                _money(float(ev["monto"])) if ev.get("monto") is not None else "—",
            ]
        )

    doctor_label = "Todos"
    if doctor_id:
        doctor_label = _doctor_name(db, doctor_id)

    return ReportPayload(
        title="Pacientes atendidos",
        fecha_inicio=start.strftime("%d/%m/%Y"),
        fecha_fin=end.strftime("%d/%m/%Y"),
        summary={
            "Pacientes únicos": str(len(patient_ids)),
            "Atenciones": str(len(unique_events)),
            "Citas": str(citas_n),
            "Evoluciones": str(evo_n),
            "Cobros caja": str(caja_n),
            "Monto cobrado": _money(cobrado),
            "Doctor": doctor_label,
        },
        rows=rows,
        meta={
            "pacientes_unicos": len(patient_ids),
            "atenciones": len(unique_events),
            "citas": citas_n,
            "evoluciones": evo_n,
            "cobros_caja": caja_n,
            "monto_cobrado": round(cobrado, 2),
        },
    )


def build_tratamientos_report(
    db: Session, start: datetime, end: datetime
) -> ReportPayload:
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(
            ClinicalEvolutionEntry.fecha >= start,
            ClinicalEvolutionEntry.fecha <= end,
            ClinicalEvolutionEntry.origen != "migracion",
        )
        .order_by(ClinicalEvolutionEntry.fecha.desc())
        .all()
    )

    total_costo = sum(float(e.costo or 0) for e in entries)
    total_a_cuenta = sum(float(e.a_cuenta or 0) for e in entries)
    total_saldo = max(0.0, round(total_costo - total_a_cuenta, 2))

    entry_ids = [e.id for e in entries]
    cash_linked = 0.0
    if entry_ids:
        cash_linked = float(
            sum(
                float(t.monto)
                for t in db.query(CashTransaction)
                .filter(
                    CashTransaction.tipo == "ingreso",
                    CashTransaction.created_at >= start,
                    CashTransaction.created_at <= end,
                    CashTransaction.evolution_entry_id.in_(entry_ids),
                )
                .all()
            )
        )

    rows: list[list[str]] = [
        [
            "Fecha",
            "Paciente",
            "Tratamiento",
            "Pieza",
            "Costo",
            "A cuenta",
            "Saldo",
            "Estado",
        ]
    ]
    for e in entries:
        costo = float(e.costo or 0)
        ac = float(e.a_cuenta or 0)
        saldo = max(0.0, round(costo - ac, 2))
        f, _ = _fmt_dt(e.fecha)
        rows.append(
            [
                f,
                _patient_name(db, e.patient_id),
                (e.tratamiento_descripcion or "—")[:70],
                e.pieza_fdi or "—",
                _money(costo),
                _money(ac),
                _money(saldo),
                e.estado or "—",
            ]
        )

    return ReportPayload(
        title="Tratamientos / Evolución",
        fecha_inicio=start.strftime("%d/%m/%Y"),
        fecha_fin=end.strftime("%d/%m/%Y"),
        summary={
            "Atenciones": str(len(entries)),
            "Costo total": _money(total_costo),
            "A cuenta (clínico)": _money(total_a_cuenta),
            "Saldo clínico": _money(total_saldo),
            "Cobros ligados (caja)": _money(cash_linked),
        },
        rows=rows,
        meta={
            "atenciones": len(entries),
            "costo_total": round(total_costo, 2),
            "a_cuenta": round(total_a_cuenta, 2),
            "saldo": round(total_saldo, 2),
            "cobros_caja": round(cash_linked, 2),
        },
    )


def build_resumen(db: Session, start: datetime, end: datetime) -> dict[str, Any]:
    """KPI overview for the reports dashboard (all modules)."""
    caja = build_caja_report(db, start, end)
    pac = build_pacientes_report(db, start, end)
    trat = build_tratamientos_report(db, start, end)
    return {
        "fecha_inicio": start.strftime("%d/%m/%Y"),
        "fecha_fin": end.strftime("%d/%m/%Y"),
        "caja": caja.meta or {},
        "pacientes": pac.meta or {},
        "tratamientos": trat.meta or {},
    }


def caja_csv_rows(db: Session, start: datetime, end: datetime) -> list[list[Any]]:
    payload = build_caja_report(db, start, end)
    return payload.rows


def pacientes_csv_rows(
    db: Session, start: datetime, end: datetime, doctor_id: str | None = None
) -> list[list[Any]]:
    return build_pacientes_report(db, start, end, doctor_id).rows


def tratamientos_csv_rows(
    db: Session, start: datetime, end: datetime
) -> list[list[Any]]:
    return build_tratamientos_report(db, start, end).rows
