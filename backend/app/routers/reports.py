"""API de reportes: Caja, Pacientes atendidos, Tratamientos."""

from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services.pdf_generator import generate_pdf
from app.services.reports_service import (
    build_caja_report,
    build_pacientes_report,
    build_resumen,
    build_tratamientos_report,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    output = StringIO()
    writer = csv.writer(output)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_or_json(data: dict, fmt: Optional[str]):
    if fmt:
        pdf_bytes, filename = generate_pdf("reporte", fmt, data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return data


@router.get("/resumen")
def report_resumen(
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """KPIs consolidados Agenda + Evolución + Caja para el dashboard de reportes."""
    return build_resumen(db, start, end)


@router.get("/caja")
def report_caja(
    start: datetime = Query(...),
    end: datetime = Query(...),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    payload = build_caja_report(db, start, end)
    if csv_export:
        return _csv_response(payload.rows, "reporte_caja.csv")
    return _pdf_or_json(payload.as_dict(), fmt)


@router.get("/pacientes")
def report_pacientes(
    start: datetime = Query(...),
    end: datetime = Query(...),
    doctor_id: Optional[str] = Query(None),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pacientes atendidos: citas + evolución + cobros de caja en el período."""
    payload = build_pacientes_report(db, start, end, doctor_id)
    if csv_export:
        return _csv_response(payload.rows, "reporte_pacientes.csv")
    return _pdf_or_json(payload.as_dict(), fmt)


@router.get("/tratamientos")
def report_tratamientos(
    start: datetime = Query(...),
    end: datetime = Query(...),
    fmt: Optional[str] = Query(None, regex="^(80mm|A5|A4)$"),
    csv_export: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    payload = build_tratamientos_report(db, start, end)
    if csv_export:
        return _csv_response(payload.rows, "reporte_tratamientos.csv")
    return _pdf_or_json(payload.as_dict(), fmt)
