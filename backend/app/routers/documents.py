from datetime import datetime, timezone, date
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import (
    CashSession,
    CashTransaction,
    ClinicalEvolutionEntry,
    ClinicalRecord,
    DocumentGenerated,
    OdontogramEntry,
    Patient,
    User,
)
from app.schemas.cash import CashCloseSummary
from app.services.pdf_generator import generate_pdf
from app.services.ticket_comprobante import format_serie

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _format_date(d) -> str:
    if not d:
        return "—"
    if isinstance(d, (datetime, date)):
        return d.strftime("%d/%m/%Y")
    return str(d)


def _calc_age(birthdate) -> str | None:
    if not birthdate:
        return None
    if isinstance(birthdate, str):
        try:
            birthdate = datetime.strptime(birthdate, "%Y-%m-%d").date()
        except ValueError:
            return None
    today = date.today()
    age = today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))
    return f"{age} años"


def _pdf_response(pdf_bytes: bytes, filename: str, document_id: str | None = None) -> Response:
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }
    if document_id:
        headers["X-Document-Id"] = str(document_id)
        headers["Access-Control-Expose-Headers"] = "X-Document-Id"
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/comprobante/{transaction_id}")
def download_comprobante(
    transaction_id: str,
    fmt: str = Query("80mm", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate payment receipt PDF (official Caja format: 80mm thermal ticket)."""
    tx = db.get(CashTransaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    patient = db.get(Patient, tx.patient_id) if tx.patient_id else None
    session = db.get(CashSession, tx.cash_session_id)
    operator = db.get(User, session.usuario_id) if session else user

    # Cobro mixto: sumar partes del mismo grupo para el ticket (total + detalle).
    monto = float(tx.monto)
    metodo = tx.metodo_pago
    grupo_id = getattr(tx, "grupo_pago_id", None)
    if grupo_id:
        parts = (
            db.query(CashTransaction)
            .filter(CashTransaction.grupo_pago_id == grupo_id)
            .order_by(CashTransaction.created_at.asc())
            .all()
        )
        if parts:
            monto = round(sum(float(p.monto) for p in parts), 2)
            metodo = "mixto (" + " + ".join(
                f"{p.metodo_pago} S/ {float(p.monto):.2f}" for p in parts
            ) + ")"

    serie = format_serie(tx.id)
    emitido = tx.created_at
    if emitido is not None and getattr(emitido, "tzinfo", None) is not None:
        from zoneinfo import ZoneInfo

        emitido = emitido.astimezone(ZoneInfo("America/Lima"))
    data = {
        "transaction_id": tx.id,
        "serie": serie,
        "patient_nombre": (
            f"{patient.nombres} {patient.apellidos}".strip() if patient else "Clientes - Varios"
        ),
        "patient_telefono": (patient.telefono if patient else "") or "",
        "patient_documento": (patient.numero_documento if patient else "") or "—",
        "patient_direccion": (patient.direccion if patient else "") or "—",
        "concepto": tx.concepto,
        "monto": monto,
        "metodo_pago": metodo,
        "fecha_emision": emitido,
        "vendedor": (operator.nombre if operator else None) or user.nombre or "Administrador",
    }

    # Abono parcial: costo / a cuenta / saldo del destino clínico vinculado
    evo_id = getattr(tx, "evolution_entry_id", None)
    plan_ref = getattr(tx, "plan_item_ref", None)
    if evo_id or plan_ref:
        from app.models import ClinicalEvolutionEntry, ClinicalRecord
        from app.odontogram.plans import normalize_plans
        from app.services.payment_allocation import (
            _evo_saldo,
            _plan_item_saldo,
            _plan_item_subtotal,
            sync_evolution_a_cuenta_from_cash,
            _sync_plan_from_entry,
        )

        if evo_id:
            entry = db.get(ClinicalEvolutionEntry, evo_id)
            if entry:
                sync_evolution_a_cuenta_from_cash(db, entry)
                _sync_plan_from_entry(db, entry)
                data["tratamiento_costo"] = float(entry.costo or 0)
                data["tratamiento_a_cuenta"] = float(entry.a_cuenta or 0)
                data["tratamiento_saldo"] = _evo_saldo(entry)
                data["tratamiento_label"] = entry.tratamiento_descripcion
        elif plan_ref and tx.patient_id:
            record = (
                db.query(ClinicalRecord)
                .filter(ClinicalRecord.patient_id == tx.patient_id)
                .first()
            )
            if record and record.plan_tratamiento:
                for alt in normalize_plans(record.plan_tratamiento).get("alternatives") or []:
                    for it in alt.get("items") or []:
                        if str(it.get("id") or "") != str(plan_ref):
                            continue
                        data["tratamiento_costo"] = _plan_item_subtotal(it)
                        data["tratamiento_a_cuenta"] = float(it.get("a_cuenta") or 0)
                        data["tratamiento_saldo"] = _plan_item_saldo(it)
                        data["tratamiento_label"] = it.get("item") or tx.concepto
                        break

    try:
        pdf_bytes, filename = generate_pdf("comprobante", fmt, data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo generar el comprobante PDF: {exc}",
        ) from exc

    if not pdf_bytes or len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(
            status_code=500,
            detail="El PDF del comprobante quedó vacío o corrupto. Reintente la operación.",
        )

    doc_id = _register_document(db, patient.id if patient else None, "comprobante", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


@router.get("/cierre-caja/{session_id}")
def download_cierre_caja(
    session_id: str,
    fmt: str = Query("A5", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate and download a cash close summary PDF."""
    session = db.get(CashSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    operator = db.get(User, session.usuario_id)
    transactions = (
        db.query(CashTransaction)
        .filter(CashTransaction.cash_session_id == session_id)
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

    data = {
        "session_id": session.id,
        "usuario_nombre": operator.nombre if operator else "—",
        "monto_inicial": float(session.monto_inicial),
        "ingresos": ingresos,
        "egresos": egresos,
        "neto": neto,
        "total_esperado": total_esperado,
        "por_metodo": por_metodo,
    }
    pdf_bytes, filename = generate_pdf("cierre_caja", fmt, data)

    doc_id = _register_document(db, None, "cierre_caja", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


@router.get("/ficha/{patient_id}")
def download_ficha(
    patient_id: str,
    fmt: str = Query("A4", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate and download a clinical record PDF."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    record = (
        db.query(ClinicalRecord)
        .filter(ClinicalRecord.patient_id == patient_id)
        .first()
    )
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .all()
    )
    costo_total = sum(float(e.costo) for e in entries)
    transactions = (
        db.query(CashTransaction)
        .filter(CashTransaction.patient_id == patient_id, CashTransaction.tipo == "ingreso")
        .all()
    )
    pagado_total = sum(float(t.monto) for t in transactions)

    odonto_rows = (
        db.query(OdontogramEntry)
        .filter(OdontogramEntry.patient_id == patient_id)
        .order_by(OdontogramEntry.denticion, OdontogramEntry.pieza_fdi)
        .all()
    )
    odontogram = [
        {
            "pieza_fdi": e.pieza_fdi,
            "estado": e.estado,
            "denticion": e.denticion,
            "superficies": e.superficies or {},
        }
        for e in odonto_rows
        if e.estado not in ("sano", "", None)
        or any((e.superficies or {}).get(k) for k in ("M", "D", "V", "L", "O"))
    ]

    data = {
        "patient": {
            "nombres": patient.nombres,
            "apellidos": patient.apellidos,
            "numero_ficha": patient.numero_ficha,
            "numero_documento": patient.numero_documento,
            "fecha_nacimiento": _format_date(patient.fecha_nacimiento),
            "edad": _calc_age(patient.fecha_nacimiento),
            "telefono": patient.telefono,
            "email": patient.email,
            "alergias": patient.alergias,
            "lugar_nacimiento": patient.lugar_nacimiento,
            "ocupacion": patient.ocupacion,
            "estado_civil": patient.estado_civil,
            "nombre_responsable": patient.nombre_responsable,
        },
        "record": {
            "motivo_consulta": record.motivo_consulta if record else None,
            "antecedentes_medicos": record.antecedentes_medicos if record else None,
            "antecedentes_odontologicos": record.antecedentes_odontologicos if record else None,
            "diagnostico": record.diagnostico if record else None,
            "plan_tratamiento": record.plan_tratamiento if record else None,
            "observaciones": record.observaciones if record else None,
            "consentimiento_firmado": record.consentimiento_firmado if record else False,
            "consentimiento_fecha": _format_date(record.consentimiento_fecha) if record and record.consentimiento_fecha else None,
        },
        "financial": {
            "costo_total": costo_total,
            "pagado_total": pagado_total,
            "saldo": costo_total - pagado_total,
        },
        "odontogram": odontogram,
    }
    pdf_bytes, filename = generate_pdf("ficha", fmt, data)
    doc_id = _register_document(db, patient_id, "ficha", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


@router.get("/evolucion/{entry_id}")
def download_evolucion(
    entry_id: str,
    fmt: str = Query("A5", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate and download an evolution entry PDF."""
    entry = db.get(ClinicalEvolutionEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    patient = db.get(Patient, entry.patient_id)

    data = {
        "patient_nombre": f"{patient.nombres} {patient.apellidos}" if patient else "—",
        "entry": {
            "fecha": _format_date(entry.fecha),
            "tratamiento_descripcion": entry.tratamiento_descripcion,
            "especialidad": entry.especialidad,
            "costo": float(entry.costo),
            "a_cuenta": float(entry.a_cuenta),
            "estado": entry.estado,
        },
    }
    pdf_bytes, filename = generate_pdf("evolucion", fmt, data)
    doc_id = _register_document(db, entry.patient_id, "evolucion", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


@router.get("/consentimiento-tipos")
def list_consentimiento_tipos(
    user: User = Depends(get_current_user),
):
    """Catálogo de consentimientos oficiales (COP) disponibles."""
    from app.services.consent_official_templates import list_consent_templates

    _ = user
    out = []
    for t in list_consent_templates():
        body = (t.get("body") or "").strip()
        if len(body) > 280:
            cut = body[:280].rsplit(" ", 1)[0]
            preview = f"{cut}…"
        else:
            preview = body
        out.append(
            {
                "id": t["id"],
                "label": t["label"],
                "title": t["title"],
                "preview": preview,
            }
        )
    return out


@router.get("/consentimiento/{patient_id}")
def download_consentimiento(
    patient_id: str,
    tipo: str | None = Query(
        None,
        description="Plantilla oficial COP (ej. endodoncia, ortodoncia)",
    ),
    fmt: str = Query("A4", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate and download an informed consent PDF (membrete clínica + texto COP)."""
    from app.services.clinic_profile import get_clinic_profile
    from app.services.consent_official_templates import get_consent_template

    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    record = (
        db.query(ClinicalRecord)
        .filter(ClinicalRecord.patient_id == patient_id)
        .first()
    )
    tpl = get_consent_template(tipo)
    profile = get_clinic_profile(db)

    data = {
        "patient": {
            "nombres": patient.nombres,
            "apellidos": patient.apellidos,
            "numero_documento": patient.numero_documento,
            "direccion": patient.direccion,
        },
        "doctor": {
            "nombre": user.nombre,
            "cop": profile.cop_registro,
        },
        "consent_tipo": tpl["id"],
        "consent_title": tpl["title"],
        "consentimiento_fecha": _format_date(record.consentimiento_fecha)
        if record and record.consentimiento_fecha
        else None,
        "patient_nombre": f"{patient.nombres} {patient.apellidos}".strip(),
    }
    # Documentos legales: preferir A4/A5 (80mm queda ilegible)
    if fmt == "80mm":
        fmt = "A5"
    pdf_bytes, filename = generate_pdf("consentimiento", fmt, data)
    doc_id = _register_document(db, patient_id, "consentimiento", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


@router.get("/presupuesto/{patient_id}")
def download_presupuesto(
    patient_id: str,
    plan_id: str | None = Query(None),
    fmt: str = Query("A4", regex="^(80mm|A5|A4)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """PDF de presupuesto (plan activo o una alternativa)."""
    from app.odontogram.plans import normalize_plans, estimate

    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    record = (
        db.query(ClinicalRecord)
        .filter(ClinicalRecord.patient_id == patient_id)
        .first()
    )
    plans = normalize_plans(record.plan_tratamiento if record else None)
    alt = None
    for a in plans["alternatives"]:
        if plan_id and a.get("id") == plan_id:
            alt = a
            break
        if not plan_id and a.get("id") == plans["active_id"]:
            alt = a
            break
    if not alt:
        alt = plans["alternatives"][0]
    data = {
        "patient": {
            "nombres": patient.nombres,
            "apellidos": patient.apellidos,
            "numero_ficha": patient.numero_ficha,
        },
        "patient_nombre": f"{patient.nombres} {patient.apellidos}",
        "plan_nombre": alt.get("nombre") or "Plan",
        "items": alt.get("items") or [],
        "total": estimate(alt.get("items") or []),
    }
    pdf_bytes, filename = generate_pdf("presupuesto", fmt, data)
    doc_id = _register_document(db, patient_id, "presupuesto", fmt, filename)
    return _pdf_response(pdf_bytes, filename, doc_id)


# --- WhatsApp send tracking ---

@router.post("/whatsapp-sent")
def mark_whatsapp_sent_by_meta(
    patient_id: str = Query(..., description="Paciente dueño del PDF"),
    tipo: str = Query(..., description="Tipo de documento generado"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark the latest generated document for patient+tipo as sent via WhatsApp."""
    doc = (
        db.query(DocumentGenerated)
        .filter(
            DocumentGenerated.patient_id == patient_id,
            DocumentGenerated.tipo == tipo,
        )
        .order_by(DocumentGenerated.created_at.desc())
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    doc.marcado_enviado_whatsapp_en = datetime.now(timezone.utc)
    db.commit()
    return {"status": "marked", "document_id": doc.id, "tipo": tipo}


@router.post("/whatsapp-sent/{document_id}")
def mark_whatsapp_sent(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a document as 'sent via WhatsApp' by DocumentGenerated.id."""
    doc = db.get(DocumentGenerated, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    doc.marcado_enviado_whatsapp_en = datetime.now(timezone.utc)
    db.commit()
    return {"status": "marked", "document_id": document_id}


def _register_document(
    db: Session,
    patient_id: str | None,
    doc_type: str,
    fmt: str,
    filename: str,
) -> str:
    """Register a generated document for traceability. Returns the document ID."""
    doc = DocumentGenerated(
        patient_id=patient_id,
        tipo=doc_type,
        formato=fmt,
        archivo_ref=filename,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc.id


# --- WhatsApp link builder ---

def build_whatsapp_url(telefono: str | None, mensaje: str) -> str | None:
    """Build a wa.me URL for sending a WhatsApp message. Returns None if no valid phone."""
    if not telefono:
        return None
    from urllib.parse import quote

    digits = "".join(c for c in telefono if c.isdigit())
    if len(digits) < 9:
        return None
    if not digits.startswith("51") and len(digits) == 9:
        digits = "51" + digits
    return f"https://wa.me/{digits}?text={quote(mensaje)}"
