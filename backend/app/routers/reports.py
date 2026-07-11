from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from io import StringIO
import csv
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import (
    Appointment,
    CashSession,
    CashTransaction,
    ClinicalEvolutionEntry,
    Patient,
    User,
)
from app.services.pdf_generator import generate_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/caja")
def report_caja(
    start: datetime = Query(...),
    end: datetime = Query(...),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cash report: income, expenses, net, by payment method."""
    transactions = (
        db.query(CashTransaction)
        .filter(CashTransaction.created_at >= start, CashTransaction.created_at <= end)
        .all()
    )
    ingresos = [t for t in transactions if t.tipo == "ingreso"]
    egresos = [t for t in transactions if t.tipo == "egreso"]
    total_ingresos = sum(float(t.monto) for t in ingresos)
    total_egresos = sum(float(t.monto) for t in egresos)
    neto = total_ingresos - total_egresos

    por_metodo: dict[str, float] = {}
    for t in ingresos:
        por_metodo[t.metodo_pago] = por_metodo.get(t.metodo_pago, 0) + float(t.monto)

    if csv_export:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Fecha", "Tipo", "Concepto", "Paciente", "Método", "Monto"])
        for t in transactions:
            patient = db.get(Patient, t.patient_id) if t.patient_id else None
            writer.writerow([
                t.created_at.strftime("%d/%m/%Y %H:%M"),
                t.tipo,
                t.concepto,
                f"{patient.nombres} {patient.apellidos}" if patient else "—",
                t.metodo_pago,
                float(t.monto),
            ])
        writer.writerow([])
        writer.writerow(["RESUMEN"])
        writer.writerow(["Total ingresos", total_ingresos])
        writer.writerow(["Total egresos", total_egresos])
        writer.writerow(["Neto", neto])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=reporte_caja.csv"},
        )

    data = {
        "title": "Reporte de Caja",
        "fecha_inicio": start.strftime("%d/%m/%Y"),
        "fecha_fin": end.strftime("%d/%m/%Y"),
        "summary": {
            "Total ingresos": f"S/ {total_ingresos:.2f}",
            "Total egresos": f"S/ {total_egresos:.2f}",
            "Neto": f"S/ {neto:.2f}",
        },
        "rows": [["Fecha", "Tipo", "Concepto", "Método", "Monto"]] + [
            [
                t.created_at.strftime("%d/%m/%Y"),
                t.tipo,
                t.concepto,
                t.metodo_pago,
                f"S/ {float(t.monto):.2f}",
            ]
            for t in transactions
        ],
    }

    if fmt:
        pdf_bytes, filename = generate_pdf("reporte", fmt, data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return data


@router.get("/pacientes")
def report_pacientes(
    start: datetime = Query(...),
    end: datetime = Query(...),
    doctor_id: Optional[int] = Query(None),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Patients treated report: by date range and optional doctor."""
    q = db.query(Appointment).filter(
        Appointment.fecha_hora >= start,
        Appointment.fecha_hora <= end,
        Appointment.estado.in_(["programada", "completada"]),
    )
    if doctor_id:
        q = q.filter(Appointment.doctor_id == doctor_id)
    appointments = q.order_by(Appointment.fecha_hora).all()

    if csv_export:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Fecha", "Hora", "Paciente", "Doctor", "Estado", "Duración"])
        for a in appointments:
            patient = db.get(Patient, a.patient_id)
            doctor = db.get(User, a.doctor_id) if a.doctor_id else None
            writer.writerow([
                a.fecha_hora.strftime("%d/%m/%Y"),
                a.fecha_hora.strftime("%H:%M"),
                f"{patient.nombres} {patient.apellidos}" if patient else "—",
                doctor.nombre if doctor else "—",
                a.estado,
                f"{a.duracion_minutos} min",
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=reporte_pacientes.csv"},
        )

    data = {
        "title": "Reporte de Pacientes Atendidos",
        "fecha_inicio": start.strftime("%d/%m/%Y"),
        "fecha_fin": end.strftime("%d/%m/%Y"),
        "summary": {
            "Total citas": len(appointments),
            "Doctor": db.get(User, doctor_id).nombre if doctor_id else "Todos",
        },
        "rows": [["Fecha", "Hora", "Paciente", "Doctor", "Estado"]] + [
            [
                a.fecha_hora.strftime("%d/%m/%Y"),
                a.fecha_hora.strftime("%H:%M"),
                f"{db.get(Patient, a.patient_id).nombres} {db.get(Patient, a.patient_id).apellidos}" if db.get(Patient, a.patient_id) else "—",
                db.get(User, a.doctor_id).nombre if a.doctor_id and db.get(User, a.doctor_id) else "—",
                a.estado,
            ]
            for a in appointments
        ],
    }

    if fmt:
        pdf_bytes, filename = generate_pdf("reporte", fmt, data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return data


@router.get("/tratamientos")
def report_tratamientos(
    start: datetime = Query(...),
    end: datetime = Query(...),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Treatments/evolution report: what was treated, charged, pending."""
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.fecha >= start, ClinicalEvolutionEntry.fecha <= end)
        .order_by(ClinicalEvolutionEntry.fecha.desc())
        .all()
    )

    total_cobrado = sum(float(e.costo) for e in entries)
    total_pagado = 0.0
    for e in entries:
        txs = (
            db.query(CashTransaction)
            .filter(CashTransaction.patient_id == e.patient_id, CashTransaction.tipo == "ingreso")
            .all()
        )
        total_pagado += sum(float(t.monto) for t in txs)

    total_pendiente = total_cobrado - total_pagado

    if csv_export:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["Fecha", "Paciente", "Tratamiento", "Especialidad", "Costo", "Estado"])
        for e in entries:
            patient = db.get(Patient, e.patient_id)
            writer.writerow([
                e.fecha.strftime("%d/%m/%Y"),
                f"{patient.nombres} {patient.apellidos}" if patient else "—",
                e.tratamiento_descripcion,
                e.especialidad or "—",
                float(e.costo),
                e.estado,
            ])
        writer.writerow([])
        writer.writerow(["RESUMEN"])
        writer.writerow(["Total cobrado", total_cobrado])
        writer.writerow(["Total pagado", total_pagado])
        writer.writerow(["Total pendiente", total_pendiente])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=reporte_tratamientos.csv"},
        )

    data = {
        "title": "Reporte de Tratamientos",
        "fecha_inicio": start.strftime("%d/%m/%Y"),
        "fecha_fin": end.strftime("%d/%m/%Y"),
        "summary": {
            "Total cobrado": f"S/ {total_cobrado:.2f}",
            "Total pagado": f"S/ {total_pagado:.2f}",
            "Total pendiente": f"S/ {total_pendiente:.2f}",
        },
        "rows": [["Fecha", "Paciente", "Tratamiento", "Costo", "Estado"]] + [
            [
                e.fecha.strftime("%d/%m/%Y"),
                f"{db.get(Patient, e.patient_id).nombres} {db.get(Patient, e.patient_id).apellidos}" if db.get(Patient, e.patient_id) else "—",
                e.tratamiento_descripcion,
                f"S/ {float(e.costo):.2f}",
                e.estado,
            ]
            for e in entries
        ],
    }

    if fmt:
        pdf_bytes, filename = generate_pdf("reporte", fmt, data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return data
