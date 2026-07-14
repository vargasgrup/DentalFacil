"""
Construcción de mensajes de recordatorio con datos del centro (Configuración).
Nunca usa el nombre del producto/sistema (p. ej. DentalSimple).
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.models.appointment import Appointment
from app.models.clinic_settings import ClinicSettings
from app.models.ids import CLINIC_SETTINGS_ID
from app.models.patient import Patient
from app.services.clinic_profile import get_clinic_profile

CLINIC_TZ = ZoneInfo("America/Lima")

DEFAULT_REMINDER_TEMPLATE = (
    "Hola {nombre_paciente}, te recordamos tu cita en {nombre_centro} "
    "el {fecha_cita} a las {hora_cita}. Confirmamos tu asistencia. Gracias."
)

# Nombres de producto / legacy que no deben aparecer en mensajes al paciente
_PRODUCT_NAME_MARKERS = (
    "DentalSimple",
    "dentalsimple",
    "Centro Odontológico DentalSimple",
)


def normalize_reminder_template(template: str | None) -> str:
    """Asegura plantilla válida con {nombre_centro}; limpia marcas del producto."""
    t = (template or "").strip() or DEFAULT_REMINDER_TEMPLATE
    # Si alguien pegó el nombre del sistema a mano, restaurar el placeholder
    if "{nombre_centro}" not in t:
        for marker in _PRODUCT_NAME_MARKERS:
            if marker in t:
                t = t.replace(marker, "{nombre_centro}")
        if "{nombre_centro}" not in t:
            t = DEFAULT_REMINDER_TEMPLATE
    else:
        for marker in _PRODUCT_NAME_MARKERS:
            # Evita "… en DentalSimple …" mezclado con el placeholder
            t = t.replace(f"Centro Odontológico {marker}", "{nombre_centro}")
            if marker.lower() == "dentalsimple":
                # no reemplazar si ya está solo el placeholder
                pass
    # Placeholders mínimos
    for required in ("{nombre_paciente}", "{nombre_centro}", "{fecha_cita}", "{hora_cita}"):
        if required not in t:
            return DEFAULT_REMINDER_TEMPLATE
    return t


def get_reminder_config(db: Session) -> dict:
    row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
    hours = settings.REMINDER_HOURS_BEFORE
    template = DEFAULT_REMINDER_TEMPLATE
    if row:
        if row.reminder_hours_before is not None and row.reminder_hours_before > 0:
            hours = int(row.reminder_hours_before)
        if row.reminder_template:
            template = normalize_reminder_template(row.reminder_template)
    return {
        "reminder_hours_before": hours,
        "reminder_template": template,
    }


def save_reminder_config(
    db: Session,
    *,
    reminder_hours_before: int | None = None,
    reminder_template: str | None = None,
) -> dict:
    row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
    if not row:
        row = ClinicSettings(id=CLINIC_SETTINGS_ID, hora_apertura="08:00", hora_cierre="20:00")
        db.add(row)
        db.flush()
    if reminder_hours_before is not None:
        row.reminder_hours_before = max(1, int(reminder_hours_before))
    if reminder_template is not None:
        row.reminder_template = normalize_reminder_template(reminder_template)
    db.commit()
    db.refresh(row)
    return get_reminder_config(db)


def _local_appointment_dt(fecha_hora: datetime) -> datetime:
    dt = fecha_hora
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CLINIC_TZ)


def build_reminder_message(
    db: Session,
    appointment: Appointment,
    patient: Patient,
    template: str | None = None,
) -> str:
    """Arma el texto WhatsApp con nombre del centro desde Configuración."""
    cfg_template = template or get_reminder_config(db)["reminder_template"]
    cfg_template = normalize_reminder_template(cfg_template)
    profile = get_clinic_profile(db)
    local = _local_appointment_dt(appointment.fecha_hora)
    nombre_paciente = f"{patient.nombres} {patient.apellidos}".strip()
    return cfg_template.format(
        nombre_paciente=nombre_paciente,
        nombre_centro=profile.nombre_publico,
        fecha_cita=local.strftime("%d/%m/%Y"),
        hora_cita=local.strftime("%H:%M"),
    )


def refresh_pending_reminder_messages(db: Session) -> int:
    """Regenera mensajes de recordatorios pendientes con datos actuales del centro."""
    from app.models.appointment import AppointmentReminder

    pending = (
        db.query(AppointmentReminder)
        .filter(AppointmentReminder.estado == "pendiente")
        .all()
    )
    template = get_reminder_config(db)["reminder_template"]
    updated = 0
    for r in pending:
        apt = db.get(Appointment, r.appointment_id)
        if not apt:
            continue
        patient = db.get(Patient, apt.patient_id)
        if not patient:
            continue
        new_msg = build_reminder_message(db, apt, patient, template)
        if r.mensaje_sugerido != new_msg:
            r.mensaje_sugerido = new_msg
            updated += 1
    if updated:
        db.commit()
    return updated
