from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.roles import Rol
from app.database import SessionLocal, get_db
from app.models import Appointment, AppointmentReminder, Patient, User, ClinicSettings
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentReminderOut,
    AppointmentUpdate,
    ReminderConfigOut,
    ReminderConfigUpdate,
    ClinicHoursOut,
    ClinicHoursUpdate,
    ClinicProfileOut,
    ClinicProfileUpdate,
    EspecialidadesOut,
    EspecialidadesUpdate,
)
from app.services.clinic_profile import (
    ensure_uploads_dir,
    get_clinic_profile,
)
from app.services.reminder_messages import (
    DEFAULT_REMINDER_TEMPLATE,
    build_reminder_message,
    get_reminder_config,
    refresh_pending_reminder_messages,
    save_reminder_config,
)

CLINIC_TZ = ZoneInfo("America/Lima")

router = APIRouter(prefix="/api/appointments", tags=["appointments"])
config_router = APIRouter(prefix="/api/config", tags=["config"])


def _appointment_to_out(a: Appointment, db: Session) -> AppointmentOut:
    doctor = db.get(User, a.doctor_id) if a.doctor_id else None
    patient = db.get(Patient, a.patient_id)
    return AppointmentOut(
        id=a.id,
        patient_id=a.patient_id,
        doctor_id=a.doctor_id,
        doctor_nombre=doctor.nombre if doctor else None,
        patient_nombre=f"{patient.nombres} {patient.apellidos}" if patient else None,
        fecha_hora=a.fecha_hora,
        duracion_minutos=a.duracion_minutos,
        estado=a.estado,
        especialidad=getattr(a, "especialidad", None),
        notas=a.notas,
        recordatorio_enviado=a.recordatorio_enviado,
        created_at=a.created_at,
    )


def _check_overlap(db: Session, doctor_id: int | None, fecha_hora: datetime, duracion: int, exclude_id: int | None = None) -> bool:
    if not doctor_id:
        return False
    end_time = fecha_hora + timedelta(minutes=duracion)
    existing = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doctor_id,
            Appointment.estado.in_(["programada", "completada"]),
        )
        .all()
    )
    for a in existing:
        if exclude_id and a.id == exclude_id:
            continue
        a_end = a.fecha_hora + timedelta(minutes=a.duracion_minutos)
        if fecha_hora < a_end and end_time > a.fecha_hora:
            return True
    return False


def _parse_hhmm(value: str) -> int:
    parts = value.split(":")
    return int(parts[0]) * 60 + int(parts[1] if len(parts) > 1 else 0)


def _assert_within_clinic_hours(db: Session, fecha_hora: datetime) -> None:
    """Enforce Configuración → horario de atención (America/Lima wall clock)."""
    row = _get_or_create_clinic_settings(db)
    aware = fecha_hora if fecha_hora.tzinfo else fecha_hora.replace(tzinfo=timezone.utc)
    local = aware.astimezone(CLINIC_TZ)
    mins = local.hour * 60 + local.minute
    open_m = _parse_hhmm(row.hora_apertura)
    close_m = _parse_hhmm(row.hora_cierre)
    if close_m <= open_m:
        close_m = open_m + 12 * 60
    if mins < open_m or mins >= close_m:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La cita debe estar dentro del horario de atención "
                f"({row.hora_apertura} – {row.hora_cierre}). "
                "Ajústalo en Configuración si el centro opera otro rango."
            ),
        )


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    start: datetime = Query(None),
    end: datetime = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Appointment)
    if start:
        q = q.filter(Appointment.fecha_hora >= start)
    if end:
        q = q.filter(Appointment.fecha_hora <= end)
    appts = q.order_by(Appointment.fecha_hora).all()
    return [_appointment_to_out(a, db) for a in appts]


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, payload.patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    _assert_within_clinic_hours(db, payload.fecha_hora)
    if _check_overlap(db, payload.doctor_id, payload.fecha_hora, payload.duracion_minutos):
        raise HTTPException(status_code=409, detail="El doctor ya tiene una cita en ese horario")
    apt = Appointment(
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id or user.id,
        fecha_hora=payload.fecha_hora,
        duracion_minutos=payload.duracion_minutos,
        especialidad=payload.especialidad,
        notas=payload.notas,
    )
    db.add(apt)
    db.commit()
    db.refresh(apt)
    return _appointment_to_out(apt, db)


@router.patch("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: int,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    apt = db.get(Appointment, appointment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if payload.fecha_hora or payload.duracion_minutos:
        new_time = payload.fecha_hora or apt.fecha_hora
        new_dur = payload.duracion_minutos or apt.duracion_minutos
        doctor = payload.doctor_id or apt.doctor_id
        if payload.fecha_hora:
            _assert_within_clinic_hours(db, new_time)
        if _check_overlap(db, doctor, new_time, new_dur, exclude_id=apt.id):
            raise HTTPException(status_code=409, detail="El doctor ya tiene una cita en ese horario")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(apt, field, value)
    db.commit()
    db.refresh(apt)
    return _appointment_to_out(apt, db)


@router.delete("/{appointment_id}", status_code=204)
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    apt = db.get(Appointment, appointment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    db.delete(apt)
    db.commit()


# --- Reminders ---

def _reminder_to_out(r: AppointmentReminder, db: Session, *, refresh_message: bool = False) -> AppointmentReminderOut:
    apt = db.get(Appointment, r.appointment_id)
    patient = db.get(Patient, apt.patient_id) if apt else None
    mensaje = r.mensaje_sugerido
    if refresh_message and r.estado == "pendiente" and apt and patient:
        mensaje = build_reminder_message(db, apt, patient)
        if r.mensaje_sugerido != mensaje:
            r.mensaje_sugerido = mensaje
            db.add(r)
    return AppointmentReminderOut(
        id=r.id,
        appointment_id=r.appointment_id,
        canal=r.canal,
        programado_para=r.programado_para,
        mensaje_sugerido=mensaje,
        marcado_enviado_en=r.marcado_enviado_en,
        estado=r.estado,
        patient_id=apt.patient_id if apt else None,
        patient_nombre=f"{patient.nombres} {patient.apellidos}" if patient else None,
        patient_telefono=patient.telefono if patient else None,
        appointment_fecha=apt.fecha_hora if apt else None,
    )


@router.get("/reminders/pending", response_model=list[AppointmentReminderOut])
def pending_reminders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    reminders = (
        db.query(AppointmentReminder)
        .filter(AppointmentReminder.estado == "pendiente")
        .order_by(AppointmentReminder.programado_para)
        .all()
    )
    out = [_reminder_to_out(r, db, refresh_message=True) for r in reminders]
    db.commit()
    return out


@router.post("/reminders/{reminder_id}/send", response_model=AppointmentReminderOut)
def mark_reminder_sent(
    reminder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark reminder as 'sent' — this means the user clicked to open WhatsApp."""
    r = db.get(AppointmentReminder, reminder_id)
    if not r:
        raise HTTPException(status_code=404, detail="Recordatorio no encontrado")
    # Refrescar mensaje con datos actuales del centro antes de marcar enviado
    apt = db.get(Appointment, r.appointment_id)
    patient = db.get(Patient, apt.patient_id) if apt else None
    if apt and patient:
        r.mensaje_sugerido = build_reminder_message(db, apt, patient)
    r.marcado_enviado_en = datetime.now(timezone.utc)
    r.marcado_enviado_por_user_id = user.id
    r.estado = "enviado"
    if apt:
        apt.recordatorio_enviado = True
    db.commit()
    db.refresh(r)
    return _reminder_to_out(r, db)


# --- Config ---

@config_router.get("/reminders", response_model=ReminderConfigOut)
def get_reminder_config_api(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ReminderConfigOut(**get_reminder_config(db))


@config_router.patch("/reminders", response_model=ReminderConfigOut)
def update_reminder_config_api(
    payload: ReminderConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = save_reminder_config(
        db,
        reminder_hours_before=payload.reminder_hours_before,
        reminder_template=payload.reminder_template,
    )
    refresh_pending_reminder_messages(db)
    return ReminderConfigOut(**cfg)


def _get_or_create_clinic_settings(db: Session) -> ClinicSettings:
    row = db.get(ClinicSettings, 1)
    if not row:
        row = ClinicSettings(id=1, hora_apertura="08:00", hora_cierre="20:00")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@config_router.get("/hours", response_model=ClinicHoursOut)
def get_clinic_hours(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = _get_or_create_clinic_settings(db)
    return ClinicHoursOut(hora_apertura=row.hora_apertura, hora_cierre=row.hora_cierre)


@config_router.get("/especialidades", response_model=EspecialidadesOut)
def list_especialidades(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Catálogo de especialidades del centro (editable en Configuración)."""
    from app.constants.especialidades import ESPECIALIDADES_ODONTOLOGICAS

    row = _get_or_create_clinic_settings(db)
    stored = row.especialidades
    if isinstance(stored, list) and len(stored) > 0:
        items = [str(x).strip() for x in stored if str(x).strip()]
        # dedupe preservando orden
        seen: set[str] = set()
        unique: list[str] = []
        for it in items:
            key = it.casefold()
            if key in seen:
                continue
            seen.add(key)
            unique.append(it)
        return EspecialidadesOut(items=unique, is_default=False)
    return EspecialidadesOut(items=list(ESPECIALIDADES_ODONTOLOGICAS), is_default=True)


@config_router.put("/especialidades", response_model=EspecialidadesOut)
def update_especialidades(
    payload: EspecialidadesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Rol.ADMIN)),
):
    """Guarda el catálogo de especialidades del centro."""
    from app.constants.especialidades import ESPECIALIDADES_ODONTOLOGICAS

    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in payload.items:
        name = str(raw or "").strip()
        if not name:
            continue
        if len(name) > 80:
            raise HTTPException(status_code=400, detail="Cada especialidad debe tener máximo 80 caracteres")
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)

    if not cleaned:
        raise HTTPException(status_code=400, detail="Debe haber al menos una especialidad")

    row = _get_or_create_clinic_settings(db)
    row.especialidades = cleaned
    db.commit()
    db.refresh(row)
    return EspecialidadesOut(items=cleaned, is_default=False)


@config_router.post("/especialidades/reset", response_model=EspecialidadesOut)
def reset_especialidades(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Rol.ADMIN)),
):
    """Restablece el catálogo por defecto del sistema."""
    from app.constants.especialidades import ESPECIALIDADES_ODONTOLOGICAS

    row = _get_or_create_clinic_settings(db)
    row.especialidades = None
    db.commit()
    return EspecialidadesOut(items=list(ESPECIALIDADES_ODONTOLOGICAS), is_default=True)


@config_router.patch("/hours", response_model=ClinicHoursOut)
def update_clinic_hours(
    payload: ClinicHoursUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = _get_or_create_clinic_settings(db)
    if payload.hora_apertura is not None:
        row.hora_apertura = payload.hora_apertura
    if payload.hora_cierre is not None:
        row.hora_cierre = payload.hora_cierre
    db.commit()
    db.refresh(row)
    return ClinicHoursOut(hora_apertura=row.hora_apertura, hora_cierre=row.hora_cierre)


def _clinic_out(db: Session) -> ClinicProfileOut:
    _get_or_create_clinic_settings(db)
    profile = get_clinic_profile(db)
    return ClinicProfileOut(
        razon_social=profile.razon_social,
        nombre_comercial=profile.nombre_comercial,
        ruc=profile.ruc,
        direccion=profile.direccion,
        distrito=profile.distrito,
        provincia=profile.provincia,
        departamento=profile.departamento,
        telefono=profile.telefono,
        email=profile.email,
        ticket_serie=profile.ticket_serie,
        eslogan=profile.eslogan,
        director_nombre=profile.director_nombre,
        cop_registro=profile.cop_registro,
        logo_url="/api/config/clinic/logo-file" if profile.logo_abs_path else None,
        has_custom_logo=profile.has_custom_logo,
        nombre_publico=profile.nombre_publico,
        direccion_completa=profile.direccion_completa,
    )


@config_router.get("/clinic", response_model=ClinicProfileOut)
def get_clinic_profile_api(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Datos del centro odontológico (documentos oficiales)."""
    return _clinic_out(db)


@config_router.patch("/clinic", response_model=ClinicProfileOut)
def update_clinic_profile_api(
    payload: ClinicProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Rol.ADMIN)),
):
    row = _get_or_create_clinic_settings(db)
    data = payload.model_dump(exclude_unset=True)
    clear_logo = data.pop("clear_logo", None)

    if "ruc" in data and data["ruc"] is not None:
        ruc = "".join(c for c in str(data["ruc"]) if c.isdigit())
        if ruc and len(ruc) != 11:
            raise HTTPException(status_code=400, detail="El RUC debe tener 11 dígitos")
        data["ruc"] = ruc or None

    if "ticket_serie" in data and data["ticket_serie"] is not None:
        serie = str(data["ticket_serie"]).strip().upper()
        data["ticket_serie"] = serie or None

    for key, val in data.items():
        if hasattr(row, key):
            if isinstance(val, str):
                val = val.strip() or None
            setattr(row, key, val)

    if clear_logo:
        row.logo_path = None

    db.commit()
    db.refresh(row)
    refresh_pending_reminder_messages(db)
    return _clinic_out(db)


@config_router.post("/clinic/logo", response_model=ClinicProfileOut)
async def upload_clinic_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Rol.ADMIN)),
):
    """Sube logo del centro (PNG/JPEG/WebP) para documentos e impresión."""
    content_type = (file.content_type or "").lower()
    allowed = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
    }
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato no permitido. Usa PNG, JPG o WebP.")

    raw = await file.read()
    if len(raw) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El logo no debe superar 3 MB")

    uploads = ensure_uploads_dir()
    ext = allowed[content_type]
    dest_name = f"clinic-logo{ext}"
    dest = uploads / dest_name
    # Limpia logos previos con otra extensión
    for old in uploads.glob("clinic-logo.*"):
        try:
            old.unlink()
        except OSError:
            pass
    dest.write_bytes(raw)

    row = _get_or_create_clinic_settings(db)
    row.logo_path = f"uploads/{dest_name}"
    db.commit()
    db.refresh(row)
    return _clinic_out(db)


@config_router.get("/clinic/logo-file")
def get_clinic_logo_file(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sirve el logo actual (personalizado o por defecto) para previsualización."""
    profile = get_clinic_profile(db)
    if not profile.logo_abs_path or not profile.logo_abs_path.is_file():
        raise HTTPException(status_code=404, detail="Logo no disponible")
    media = "image/png"
    suffix = profile.logo_abs_path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif suffix == ".webp":
        media = "image/webp"
    return FileResponse(profile.logo_abs_path, media_type=media)


# --- Scheduler logic ---

def generate_reminders_job():
    """Called by APScheduler. Scans upcoming appointments and creates
    pending reminders for those that need one (within the reminder window)
    and don't have a reminder yet."""
    db = SessionLocal()
    try:
        cfg = get_reminder_config(db)
        hours_before = cfg["reminder_hours_before"]
        template = cfg["reminder_template"]
        now = datetime.now(timezone.utc)
        window_end = now + timedelta(hours=hours_before)

        # Find appointments in the reminder window that don't have reminders
        appts = (
            db.query(Appointment)
            .filter(
                Appointment.estado == "programada",
                Appointment.fecha_hora >= now,
                Appointment.fecha_hora <= window_end,
            )
            .all()
        )

        for apt in appts:
            existing = (
                db.query(AppointmentReminder)
                .filter(AppointmentReminder.appointment_id == apt.id)
                .first()
            )
            if existing:
                # Mantener mensaje al día con datos del centro
                patient = db.get(Patient, apt.patient_id)
                if patient:
                    existing.mensaje_sugerido = build_reminder_message(
                        db, apt, patient, template
                    )
                continue

            patient = db.get(Patient, apt.patient_id)
            if not patient:
                continue

            mensaje = build_reminder_message(db, apt, patient, template)

            reminder = AppointmentReminder(
                appointment_id=apt.id,
                canal="whatsapp",
                programado_para=apt.fecha_hora - timedelta(hours=hours_before),
                mensaje_sugerido=mensaje,
                estado="pendiente",
            )
            db.add(reminder)

        db.commit()
    except Exception as e:
        print(f"[scheduler] Error generating reminders: {e}")
    finally:
        db.close()
