"""Dashboard home — aggregated KPIs and widgets for the modern Inicio screen."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Appointment,
    AppointmentReminder,
    CashSession,
    CashTransaction,
    ClinicalEvolutionEntry,
    ClinicalRecord,
    Patient,
    User,
)
from app.services.payment_allocation import _evo_saldo
from app.utils.ficha import format_ficha_code


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, 0, 0, 0)
    end = datetime(d.year, d.month, d.day, 23, 59, 59)
    return start, end


def _week_start(d: date) -> date:
    # Monday as start of week (Perú / ISO)
    return d - timedelta(days=d.weekday())


def _patient_initials(nombres: str, apellidos: str) -> str:
    a = (nombres or "").strip()[:1]
    b = (apellidos or "").strip()[:1]
    return f"{a}{b}".upper() or "?"


def _relative_es(dt: datetime | None, now: datetime) -> str:
    if not dt:
        return ""
    delta = now - dt
    secs = int(delta.total_seconds())
    if secs < 60:
        return "Hace un momento"
    if secs < 3600:
        m = secs // 60
        return f"Hace {m} minuto{'s' if m != 1 else ''}"
    if secs < 86400:
        h = secs // 3600
        return f"Hace {h} hora{'s' if h != 1 else ''}"
    days = secs // 86400
    if days == 1:
        return "Ayer"
    return f"Hace {days} días"


def build_dashboard_home(db: Session) -> dict[str, Any]:
    now = _utc_now()
    today = now.date()
    today_start, today_end = _day_bounds(today)
    yesterday = today - timedelta(days=1)
    y_start, y_end = _day_bounds(yesterday)

    month_start = datetime(today.year, today.month, 1)
    if today.month == 1:
        prev_month_start = datetime(today.year - 1, 12, 1)
        prev_month_end = datetime(today.year, 1, 1) - timedelta(seconds=1)
    else:
        prev_month_start = datetime(today.year, today.month - 1, 1)
        prev_month_end = month_start - timedelta(seconds=1)

    week_start = _week_start(today)
    week_start_dt = datetime(week_start.year, week_start.month, week_start.day)
    prev_week_start = week_start - timedelta(days=7)
    prev_week_start_dt = datetime(
        prev_week_start.year, prev_week_start.month, prev_week_start.day
    )
    prev_week_end_dt = week_start_dt - timedelta(seconds=1)

    # --- Caja ---
    cash = (
        db.query(CashSession)
        .filter(CashSession.estado == "abierta")
        .order_by(CashSession.abierta_en.desc())
        .first()
    )
    ingresos_hoy = 0.0
    egresos_hoy = 0.0
    if cash:
        txs = (
            db.query(CashTransaction)
            .filter(CashTransaction.cash_session_id == cash.id)
            .all()
        )
        for t in txs:
            if t.tipo == "ingreso":
                ingresos_hoy += float(t.monto or 0)
            elif t.tipo == "egreso":
                egresos_hoy += float(t.monto or 0)

    # --- Citas hoy / ayer ---
    today_appts = (
        db.query(Appointment)
        .filter(
            Appointment.fecha_hora >= today_start,
            Appointment.fecha_hora <= today_end,
        )
        .order_by(Appointment.fecha_hora.asc())
        .all()
    )
    yesterday_count = (
        db.query(func.count(Appointment.id))
        .filter(
            Appointment.fecha_hora >= y_start,
            Appointment.fecha_hora <= y_end,
            Appointment.estado != "cancelada",
        )
        .scalar()
        or 0
    )

    doctor_cache: dict[str, str] = {}
    patient_cache: dict[str, Patient] = {}

    def doctor_name(doctor_id: str | None) -> str:
        if not doctor_id:
            return "—"
        if doctor_id not in doctor_cache:
            u = db.get(User, doctor_id)
            doctor_cache[doctor_id] = u.nombre if u else "—"
        return doctor_cache[doctor_id]

    def get_patient(pid: str | None) -> Patient | None:
        if not pid:
            return None
        if pid not in patient_cache:
            patient_cache[pid] = db.get(Patient, pid)  # type: ignore[assignment]
        return patient_cache.get(pid)

    citas_out = []
    completed = 0
    pending = 0
    for a in today_appts:
        if a.estado == "cancelada":
            continue
        if a.estado == "completada":
            completed += 1
        else:
            pending += 1
        p = get_patient(a.patient_id)
        citas_out.append(
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "patient_nombre": (
                    f"{p.nombres} {p.apellidos}".strip() if p else "Paciente"
                ),
                "patient_telefono": p.telefono if p else None,
                "fecha_hora": a.fecha_hora.isoformat() if a.fecha_hora else None,
                "duracion_minutos": a.duracion_minutos,
                "estado": a.estado,
                "especialidad": a.especialidad,
                "notas": a.notas,
                "doctor_nombre": doctor_name(a.doctor_id),
            }
        )

    active_today = len(citas_out)
    citas_delta = active_today - int(yesterday_count)

    # --- Pacientes nuevos (mes) ---
    nuevos_mes = (
        db.query(func.count(Patient.id))
        .filter(Patient.created_at >= month_start)
        .scalar()
        or 0
    )
    nuevos_prev = (
        db.query(func.count(Patient.id))
        .filter(
            Patient.created_at >= prev_month_start,
            Patient.created_at <= prev_month_end,
        )
        .scalar()
        or 0
    )

    # --- Deudas (evolución con saldo > 0) ---
    evo_open = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.origen != "migracion")
        .all()
    )
    debt_by_patient: dict[str, dict[str, Any]] = {}
    for e in evo_open:
        saldo = _evo_saldo(e)
        if saldo <= 0.009:
            continue
        pid = e.patient_id
        if pid not in debt_by_patient:
            p = get_patient(pid)
            debt_by_patient[pid] = {
                "patient_id": pid,
                "patient_nombre": (
                    f"{p.nombres} {p.apellidos}".strip() if p else "Paciente"
                ),
                "initials": _patient_initials(
                    p.nombres if p else "", p.apellidos if p else ""
                ),
                "ficha": format_ficha_code(p.numero_ficha) if p else "—",
                "saldo": 0.0,
                "concepto": e.tratamiento_descripcion or "Tratamiento",
            }
        debt_by_patient[pid]["saldo"] += saldo
        if e.tratamiento_descripcion:
            debt_by_patient[pid]["concepto"] = e.tratamiento_descripcion

    deudas = sorted(debt_by_patient.values(), key=lambda x: -x["saldo"])
    deuda_total = sum(d["saldo"] for d in deudas)
    for d in deudas:
        d["saldo"] = round(d["saldo"], 2)

    # --- Recordatorios ---
    reminders = (
        db.query(AppointmentReminder)
        .filter(AppointmentReminder.estado == "pendiente")
        .order_by(AppointmentReminder.programado_para)
        .limit(8)
        .all()
    )
    reminders_out = []
    for r in reminders:
        apt = db.get(Appointment, r.appointment_id)
        p = get_patient(apt.patient_id) if apt else None
        reminders_out.append(
            {
                "id": r.id,
                "appointment_id": r.appointment_id,
                "patient_id": apt.patient_id if apt else None,
                "patient_nombre": (
                    f"{p.nombres} {p.apellidos}".strip() if p else "Paciente"
                ),
                "patient_telefono": p.telefono if p else None,
                "mensaje_sugerido": r.mensaje_sugerido,
                "programado_para": (
                    r.programado_para.isoformat() if r.programado_para else None
                ),
                "appointment_fecha": (
                    apt.fecha_hora.isoformat() if apt and apt.fecha_hora else None
                ),
                "especialidad": apt.especialidad if apt else None,
                "estado": r.estado,
            }
        )

    # --- Tratamientos activos (plan items con saldo o sesiones) ---
    from app.odontogram.plans import normalize_plans
    from app.services.payment_allocation import _plan_item_saldo, _plan_item_subtotal

    records = (
        db.query(ClinicalRecord)
        .filter(ClinicalRecord.plan_tratamiento.isnot(None))
        .all()
    )
    tratamientos: list[dict[str, Any]] = []

    for rec in records:
        plans = normalize_plans(rec.plan_tratamiento)
        p = get_patient(rec.patient_id)
        pname = f"{p.nombres} {p.apellidos}".strip() if p else "Paciente"
        parts = pname.split()
        short = parts[0] if parts else "Paciente"
        if len(parts) > 1:
            short = f"{short} {parts[-1][:1]}."
        for alt in plans.get("alternatives") or []:
            for it in alt.get("items") or []:
                estado = (it.get("estado") or "").lower()
                if estado in ("completado", "cancelado", "anulado"):
                    continue
                costo = _plan_item_subtotal(it)
                saldo = _plan_item_saldo(it)
                if costo <= 0 and saldo <= 0:
                    continue
                paid = float(it.get("a_cuenta") or 0)
                pct = min(100, int(round((paid / costo) * 100))) if costo > 0 else 0
                if pct >= 100 and saldo <= 0.009:
                    continue
                tratamientos.append(
                    {
                        "patient_id": rec.patient_id,
                        "label": f"{it.get('item') or 'Tratamiento'} — {short}",
                        "progress_pct": pct,
                        "saldo": round(saldo, 2),
                        "costo": round(costo, 2),
                        "estado": it.get("estado") or "en_curso",
                    }
                )
    tratamientos = sorted(tratamientos, key=lambda x: -x["saldo"])[:6]

    # --- Revenue series (7 days this week vs last week) ---
    labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    this_week = [0.0] * 7
    last_week = [0.0] * 7

    week_end = week_start_dt + timedelta(days=7)
    txs_this = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.tipo == "ingreso",
            CashTransaction.created_at >= week_start_dt,
            CashTransaction.created_at < week_end,
        )
        .all()
    )
    for t in txs_this:
        if not t.created_at:
            continue
        idx = t.created_at.weekday()  # 0=Mon
        this_week[idx] += float(t.monto or 0)

    txs_last = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.tipo == "ingreso",
            CashTransaction.created_at >= prev_week_start_dt,
            CashTransaction.created_at <= prev_week_end_dt,
        )
        .all()
    )
    for t in txs_last:
        if not t.created_at:
            continue
        idx = t.created_at.weekday()
        last_week[idx] += float(t.monto or 0)

    # --- Resumen semanal ---
    week_appts = (
        db.query(func.count(Appointment.id))
        .filter(
            Appointment.fecha_hora >= week_start_dt,
            Appointment.fecha_hora < week_end,
            Appointment.estado == "completada",
        )
        .scalar()
        or 0
    )
    week_ingresos = sum(this_week)
    week_nuevos = (
        db.query(func.count(Patient.id))
        .filter(Patient.created_at >= week_start_dt)
        .scalar()
        or 0
    )
    week_evo = (
        db.query(func.count(ClinicalEvolutionEntry.id))
        .filter(
            ClinicalEvolutionEntry.fecha >= week_start_dt,
            ClinicalEvolutionEntry.origen != "migracion",
        )
        .scalar()
        or 0
    )

    # --- Especialidades (fill gap) ---
    esp_rows = (
        db.query(Patient.especialidad, func.count(Patient.id))
        .filter(Patient.especialidad.isnot(None), Patient.especialidad != "")
        .group_by(Patient.especialidad)
        .order_by(func.count(Patient.id).desc())
        .limit(6)
        .all()
    )
    esp_total = sum(int(c) for _, c in esp_rows) or 1
    especialidades = [
        {
            "nombre": name,
            "count": int(count),
            "pct": int(round(100 * int(count) / esp_total)),
        }
        for name, count in esp_rows
    ]

    # --- Cumpleaños próximos (14 días) ---
    birthdays: list[dict[str, Any]] = []
    patients_bd = (
        db.query(Patient)
        .filter(Patient.fecha_nacimiento.isnot(None))
        .all()
    )
    for p in patients_bd:
        if not p.fecha_nacimiento:
            continue
        try:
            next_bd = p.fecha_nacimiento.replace(year=today.year)
        except ValueError:
            # Feb 29
            next_bd = date(today.year, 2, 28)
        if next_bd < today:
            try:
                next_bd = p.fecha_nacimiento.replace(year=today.year + 1)
            except ValueError:
                next_bd = date(today.year + 1, 2, 28)
        delta_days = (next_bd - today).days
        if 0 <= delta_days <= 14:
            birthdays.append(
                {
                    "patient_id": p.id,
                    "patient_nombre": f"{p.nombres} {p.apellidos}".strip(),
                    "initials": _patient_initials(p.nombres, p.apellidos),
                    "fecha": next_bd.isoformat(),
                    "dias": delta_days,
                    "ficha": format_ficha_code(p.numero_ficha),
                }
            )
    birthdays.sort(key=lambda x: x["dias"])
    birthdays = birthdays[:5]

    # --- Actividad reciente ---
    activity: list[dict[str, Any]] = []

    recent_appts = (
        db.query(Appointment)
        .filter(Appointment.estado == "completada")
        .order_by(Appointment.fecha_hora.desc())
        .limit(5)
        .all()
    )
    for a in recent_appts:
        p = get_patient(a.patient_id)
        activity.append(
            {
                "type": "cita_completada",
                "title": "Cita completada",
                "detail": f"{(p.nombres + ' ' + p.apellidos).strip() if p else 'Paciente'}"
                + (f" · {a.especialidad}" if a.especialidad else ""),
                "at": a.fecha_hora.isoformat() if a.fecha_hora else None,
                "relative": _relative_es(a.fecha_hora, now),
                "href": f"/pacientes/{a.patient_id}",
                "amount": None,
            }
        )

    recent_patients = (
        db.query(Patient).order_by(Patient.created_at.desc()).limit(5).all()
    )
    for p in recent_patients:
        activity.append(
            {
                "type": "nuevo_paciente",
                "title": "Nuevo paciente registrado",
                "detail": f"{p.nombres} {p.apellidos}".strip()
                + f" · {format_ficha_code(p.numero_ficha)}",
                "at": p.created_at.isoformat() if p.created_at else None,
                "relative": _relative_es(p.created_at, now),
                "href": f"/pacientes/{p.id}",
                "amount": None,
            }
        )

    recent_cash = (
        db.query(CashTransaction)
        .filter(CashTransaction.tipo == "ingreso")
        .order_by(CashTransaction.created_at.desc())
        .limit(5)
        .all()
    )
    for t in recent_cash:
        p = get_patient(t.patient_id)
        activity.append(
            {
                "type": "cobro",
                "title": "Cobro registrado",
                "detail": (t.concepto or "Pago")
                + (
                    f" · {(p.nombres + ' ' + p.apellidos).strip()}"
                    if p
                    else ""
                ),
                "at": t.created_at.isoformat() if t.created_at else None,
                "relative": _relative_es(t.created_at, now),
                "href": "/caja",
                "amount": round(float(t.monto or 0), 2),
            }
        )

    recent_evo = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.origen != "migracion")
        .order_by(ClinicalEvolutionEntry.fecha.desc())
        .limit(5)
        .all()
    )
    for e in recent_evo:
        p = get_patient(e.patient_id)
        activity.append(
            {
                "type": "evolucion",
                "title": "Evolución clínica",
                "detail": (e.tratamiento_descripcion or "Atención")
                + (
                    f" · {(p.nombres + ' ' + p.apellidos).strip()}"
                    if p
                    else ""
                ),
                "at": e.fecha.isoformat() if e.fecha else None,
                "relative": _relative_es(e.fecha, now),
                "href": f"/pacientes/{e.patient_id}",
                "amount": round(float(e.costo or 0), 2) if e.costo else None,
            }
        )

    def _act_key(item: dict[str, Any]) -> float:
        try:
            return datetime.fromisoformat(item["at"]).timestamp() if item.get("at") else 0
        except Exception:
            return 0

    activity = sorted(activity, key=_act_key, reverse=True)[:10]

    patients_total = db.query(func.count(Patient.id)).scalar() or 0

    return {
        "generated_at": now.isoformat(),
        "cash": {
            "open": cash is not None,
            "session_id": cash.id if cash else None,
            "monto_inicial": float(cash.monto_inicial) if cash else 0,
            "ingresos_hoy": round(ingresos_hoy, 2),
            "egresos_hoy": round(egresos_hoy, 2),
            "saldo": round(
                (float(cash.monto_inicial) if cash else 0) + ingresos_hoy - egresos_hoy,
                2,
            ),
        },
        "kpis": {
            "ingresos_hoy": round(ingresos_hoy, 2),
            "citas_hoy": active_today,
            "citas_completadas": completed,
            "citas_pendientes": pending,
            "citas_delta_vs_ayer": citas_delta,
            "pacientes_nuevos_mes": int(nuevos_mes),
            "pacientes_nuevos_delta": int(nuevos_mes) - int(nuevos_prev),
            "deuda_total": round(deuda_total, 2),
            "deuda_pacientes": len(deudas),
            "pacientes_total": int(patients_total),
            "recordatorios_pendientes": len(reminders_out),
        },
        "citas_hoy": citas_out,
        "reminders": reminders_out,
        "deudas": deudas[:8],
        "tratamientos_activos": tratamientos,
        "revenue_chart": {
            "labels": labels,
            "this_week": [round(v, 2) for v in this_week],
            "last_week": [round(v, 2) for v in last_week],
        },
        "resumen_semanal": {
            "citas_atendidas": int(week_appts),
            "ingresos": round(week_ingresos, 2),
            "nuevos_pacientes": int(week_nuevos),
            "tratamientos": int(week_evo),
        },
        "especialidades": especialidades,
        "cumpleanos": birthdays,
        "actividad": activity,
    }
