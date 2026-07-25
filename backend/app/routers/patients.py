from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, func, literal, or_
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.roles import Rol
from app.database import get_db
from app.logging_config import get_logger
from app.migrate import migrations_status
from app.models import (
    Appointment,
    AppointmentReminder,
    CashTransaction,
    ClinicalAuditLog,
    ClinicalEvolutionEntry,
    ClinicalRecord,
    ComplementaryTestFile,
    DocumentGenerated,
    HistoricalDocument,
    OdontogramChangeLog,
    OdontogramEntry,
    OdontogramSnapshot,
    Patient,
    PeriodontogramEntry,
    ToothMedia,
    User,
)
from app.schemas.patient import (
    PatientCreate,
    PatientOut,
    PatientSearchResult,
    PatientUpdate,
)
from app.services.audit import log_audit
from app.utils.ficha import format_ficha_label, parse_ficha_query

router = APIRouter(prefix="/api/patients", tags=["patients"])
logger = get_logger("patients")


def _db_write_error_detail(exc: Exception) -> str:
    msg = str(exc).lower()
    if "clinical_records" in msg and "does not exist" in msg:
        return (
            "Falta la tabla de ficha clínica. Reinicia el servicio Backend en Railway "
            "para aplicar migraciones."
        )
    if "does not exist" in msg or "undefinedcolumn" in msg or "undefined column" in msg:
        return (
            "Esquema de base de datos incompleto. Reinicia el Backend en Railway; "
            "si persiste, revisa los logs de migraciones."
        )
    if "connection" in msg or "timeout" in msg or "could not connect" in msg:
        return (
            "Sin conexión a PostgreSQL. En Railway, DATABASE_URL debe ser Variable Reference "
            "→ Postgres → DATABASE_URL (postgresql://…)."
        )
    return f"No se pudo guardar el paciente: {exc}"


def _next_ficha_number(db: Session) -> int:
    max_num = db.query(func.max(Patient.numero_ficha)).scalar()
    return (max_num or 0) + 1


def _normalize_documento(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _find_by_document(
    db: Session,
    tipo_documento: str,
    numero_documento: str | None,
    exclude_id: str | None = None,
) -> Patient | None:
    doc = _normalize_documento(numero_documento)
    if not doc:
        return None
    q = db.query(Patient).filter(
        Patient.tipo_documento == (tipo_documento or "DNI"),
        func.lower(Patient.numero_documento) == doc.lower(),
    )
    if exclude_id is not None:
        q = q.filter(Patient.id != exclude_id)
    return q.first()


def _assert_unique_document(
    db: Session,
    tipo_documento: str,
    numero_documento: str | None,
    exclude_id: str | None = None,
) -> None:
    existing = _find_by_document(db, tipo_documento, numero_documento, exclude_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ya existe un paciente con {tipo_documento or 'DNI'} {numero_documento.strip()} "
                f"({format_ficha_label(existing.numero_ficha)}: {existing.nombres} {existing.apellidos}). "
                "Abre esa ficha en lugar de crear un duplicado."
            ),
        )


@router.get("/search", response_model=list[PatientSearchResult])
def search_patients(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Búsqueda inteligente de pacientes:
    nombre, apellido, nombre completo, DNI y nº de ficha (5, 00005, FC-00005).
    Soporta varias palabras (p.ej. «Maria Perez») con coincidencia por token.
    """
    raw = q.strip()
    if not raw:
        return []

    tokens = [t for t in raw.lower().split() if t]
    full_name = func.lower(func.concat(Patient.nombres, literal(" "), Patient.apellidos))
    raw_like = f"%{raw.lower()}%"

    base_or = [
        full_name.like(raw_like),
        func.lower(Patient.nombres).like(raw_like),
        func.lower(Patient.apellidos).like(raw_like),
        func.lower(func.coalesce(Patient.numero_documento, "")).like(raw_like),
        func.lower(func.coalesce(Patient.especialidad, "")).like(raw_like),
        func.cast(Patient.numero_ficha, String).like(raw_like),
    ]
    ficha_n = parse_ficha_query(raw)
    if ficha_n is not None:
        base_or.append(Patient.numero_ficha == ficha_n)

    filters = [or_(*base_or)]

    # Cada palabra debe coincidir en algún campo (AND entre tokens)
    if len(tokens) > 1:
        for token in tokens:
            t = f"%{token}%"
            filters.append(
                or_(
                    func.lower(Patient.nombres).like(t),
                    func.lower(Patient.apellidos).like(t),
                    full_name.like(t),
                    func.lower(func.coalesce(Patient.numero_documento, "")).like(t),
                    func.cast(Patient.numero_ficha, String).like(t),
                )
            )

    results = (
        db.query(Patient)
        .filter(and_(*filters), Patient.activo.is_(True))
        .order_by(Patient.apellidos, Patient.nombres)
        .limit(20)
        .all()
    )
    return results


@router.get("", response_model=list[PatientOut])
def list_patients(
    skip: int = 0,
    limit: int = 200,
    especialidad: str | None = Query(default=None),
    estado: str = Query(
        default="activos",
        description="activos | inactivos | todos",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Patient)
    estado_norm = (estado or "activos").strip().lower()
    if estado_norm == "activos":
        q = q.filter(Patient.activo.is_(True))
    elif estado_norm == "inactivos":
        q = q.filter(Patient.activo.is_(False))
    elif estado_norm != "todos":
        raise HTTPException(400, "estado inválido (activos | inactivos | todos)")
    if especialidad and especialidad.strip():
        q = q.filter(Patient.especialidad == especialidad.strip())
    return q.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return p


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mig = migrations_status()
    if not mig["ok"]:
        from app.db_health import schema_ready

        ready, schema_err = schema_ready()
        if not ready:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Base de datos en inicialización. Espera 30 segundos e intenta de nuevo. "
                    f"Detalle: {mig['error'] or schema_err or 'migraciones pendientes'}"
                ),
            )
        # Esquema usable aunque Alembic aún reporte error residual.
        logger.warning(
            "create_patient: migrations_ok=false but schema_ready=true (%s)",
            mig["error"],
        )

    doc = _normalize_documento(payload.numero_documento)
    _assert_unique_document(db, payload.tipo_documento, doc)

    patient = Patient(
        numero_ficha=_next_ficha_number(db),
        nombres=payload.nombres.strip(),
        apellidos=payload.apellidos.strip(),
        tipo_documento=payload.tipo_documento or "DNI",
        numero_documento=doc,
        fecha_nacimiento=payload.fecha_nacimiento,
        lugar_nacimiento=payload.lugar_nacimiento,
        ocupacion=payload.ocupacion,
        estado_civil=payload.estado_civil,
        especialidad=(payload.especialidad or "").strip() or None,
        telefono=payload.telefono,
        email=payload.email,
        direccion=payload.direccion,
        contacto_emergencia=payload.contacto_emergencia,
        nombre_responsable=payload.nombre_responsable,
        alergias=payload.alergias,
        es_migrado=bool(payload.es_migrado),
        fecha_ingreso_clinica=payload.fecha_ingreso_clinica if payload.es_migrado else None,
        resumen_historia_previa=(
            payload.resumen_historia_previa if payload.es_migrado else None
        ),
        activo=True,
    )
    db.add(patient)
    try:
        db.flush()
        record = ClinicalRecord(
            patient_id=patient.id,
            doctor_responsable_id=user.id,
            antecedentes_odontologicos=(
                payload.resumen_historia_previa if payload.es_migrado else None
            ),
        )
        db.add(record)

        saldo = float(payload.saldo_inicial_migracion or 0)
        if payload.es_migrado and abs(saldo) > 1e-9 and payload.fecha_ingreso_clinica:
            evento = datetime.combine(payload.fecha_ingreso_clinica, time.min)
            db.add(
                ClinicalEvolutionEntry(
                    patient_id=patient.id,
                    doctor_id=user.id,
                    tratamiento_descripcion="Saldo inicial por migración",
                    cantidad=1,
                    costo_unitario=saldo,
                    costo=saldo,
                    a_cuenta=0,
                    estado="pendiente",
                    origen="migracion",
                    fecha=evento,
                )
            )

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ya existe un paciente con {payload.tipo_documento or 'DNI'} {doc}. "
                "No se permiten documentos duplicados."
            ),
        )
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        logger.error("create_patient DB error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_db_write_error_detail(exc),
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.error("create_patient error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_db_write_error_detail(exc),
        ) from exc
    db.refresh(patient)
    return patient


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "numero_documento" in data:
        data["numero_documento"] = _normalize_documento(data["numero_documento"])
    if "nombres" in data and data["nombres"] is not None:
        data["nombres"] = data["nombres"].strip()
    if "apellidos" in data and data["apellidos"] is not None:
        data["apellidos"] = data["apellidos"].strip()
    if "especialidad" in data:
        esp = data["especialidad"]
        data["especialidad"] = (esp or "").strip() or None

    next_tipo = data.get("tipo_documento", p.tipo_documento)
    next_doc = data["numero_documento"] if "numero_documento" in data else p.numero_documento
    _assert_unique_document(db, next_tipo, next_doc, exclude_id=p.id)

    for field, value in data.items():
        setattr(p, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe otro paciente con ese número de documento.",
        )
    db.refresh(p)
    return p


@router.post("/{patient_id}/deactivate", response_model=PatientOut)
def deactivate_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Baja lógica: oculta al paciente de la lista activa conservando la historia clínica."""
    from datetime import datetime, timezone

    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if not p.activo:
        return p
    p.activo = False

    # Cancel any remaining scheduled appointments + pending reminders
    now = datetime.now(timezone.utc)
    scheduled = (
        db.query(Appointment)
        .filter(
            Appointment.patient_id == patient_id,
            Appointment.estado == "programada",
        )
        .all()
    )
    apt_ids = [a.id for a in scheduled]
    for apt in scheduled:
        apt.estado = "cancelada"
    if apt_ids:
        db.query(AppointmentReminder).filter(
            AppointmentReminder.appointment_id.in_(apt_ids),
            AppointmentReminder.estado == "pendiente",
        ).delete(synchronize_session=False)

    log_audit(
        db,
        patient_id=p.id,
        entity_type="patient",
        entity_id=p.id,
        action="deactivate",
        user_id=user.id,
        detail={
            "numero_ficha": p.numero_ficha,
            "citas_canceladas": len(apt_ids),
            "as_of": now.isoformat(),
        },
    )
    db.commit()
    db.refresh(p)
    return p


@router.post("/{patient_id}/reactivate", response_model=PatientOut)
def reactivate_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if p.activo:
        return p
    p.activo = True
    log_audit(
        db,
        patient_id=p.id,
        entity_type="patient",
        entity_id=p.id,
        action="reactivate",
        user_id=user.id,
        detail={"numero_ficha": p.numero_ficha},
    )
    db.commit()
    db.refresh(p)
    return p


def _unlink_patient_files(paths: list[str]) -> None:
    from pathlib import Path

    for raw in paths:
        try:
            path = Path(raw)
            if path.is_file():
                path.unlink(missing_ok=True)
        except OSError:
            pass


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: str,
    permanent: bool = Query(
        default=False,
        description="true = borrado definitivo (solo ADMIN). false = baja lógica.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Por defecto aplica baja lógica (activo=false).
    Con permanent=true (solo ADMIN) elimina el paciente y su historial clínico asociado.
    Los movimientos de caja se conservan (patient_id → null) por integridad contable.
    """
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    if not permanent:
        deactivate_patient(patient_id=patient_id, db=db, user=user)
        return None

    if user.rol != Rol.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede eliminar un paciente de forma permanente.",
        )

    file_paths: list[str] = []
    for row in db.query(HistoricalDocument).filter(HistoricalDocument.patient_id == patient_id):
        file_paths.append(row.stored_path)
        db.delete(row)
    for row in db.query(ComplementaryTestFile).filter(ComplementaryTestFile.patient_id == patient_id):
        file_paths.append(row.stored_path)
        db.delete(row)
    for row in db.query(ToothMedia).filter(ToothMedia.patient_id == patient_id):
        file_paths.append(row.stored_path)
        db.delete(row)

    appt_ids = [
        row[0]
        for row in db.query(Appointment.id).filter(Appointment.patient_id == patient_id).all()
    ]
    if appt_ids:
        db.query(AppointmentReminder).filter(
            AppointmentReminder.appointment_id.in_(appt_ids)
        ).delete(synchronize_session=False)
    db.query(Appointment).filter(Appointment.patient_id == patient_id).delete(
        synchronize_session=False
    )

    db.query(DocumentGenerated).filter(DocumentGenerated.patient_id == patient_id).delete(
        synchronize_session=False
    )
    # Preserve accounting rows but detach patient + evolution FKs before deleting clinical rows
    evo_ids = [
        row[0]
        for row in db.query(ClinicalEvolutionEntry.id)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .all()
    ]
    db.query(CashTransaction).filter(CashTransaction.patient_id == patient_id).update(
        {CashTransaction.patient_id: None, CashTransaction.evolution_entry_id: None},
        synchronize_session=False,
    )
    if evo_ids:
        db.query(CashTransaction).filter(
            CashTransaction.evolution_entry_id.in_(evo_ids)
        ).update(
            {CashTransaction.evolution_entry_id: None},
            synchronize_session=False,
        )
    db.query(ClinicalAuditLog).filter(ClinicalAuditLog.patient_id == patient_id).delete(
        synchronize_session=False
    )
    db.query(PeriodontogramEntry).filter(PeriodontogramEntry.patient_id == patient_id).delete(
        synchronize_session=False
    )
    db.query(OdontogramChangeLog).filter(OdontogramChangeLog.patient_id == patient_id).delete(
        synchronize_session=False
    )
    db.query(OdontogramSnapshot).filter(OdontogramSnapshot.patient_id == patient_id).delete(
        synchronize_session=False
    )
    db.query(OdontogramEntry).filter(OdontogramEntry.patient_id == patient_id).delete(
        synchronize_session=False
    )
    db.query(ClinicalEvolutionEntry).filter(
        ClinicalEvolutionEntry.patient_id == patient_id
    ).delete(synchronize_session=False)
    db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).delete(
        synchronize_session=False
    )

    ficha = p.numero_ficha
    nombre = f"{p.nombres} {p.apellidos}"
    db.delete(p)
    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("delete_patient permanent failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="No se pudo eliminar el paciente. Es posible que tenga vínculos pendientes.",
        ) from exc

    _unlink_patient_files(file_paths)
    logger.info(
        "patient permanently deleted ficha=%s name=%s by=%s",
        ficha,
        nombre,
        user.id,
    )
    return None
