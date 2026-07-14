from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    fecha_hora: datetime
    duracion_minutos: int = 30
    especialidad: Optional[str] = None
    notas: Optional[str] = None


class AppointmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    fecha_hora: Optional[datetime] = None
    duracion_minutos: Optional[int] = None
    estado: Optional[str] = None
    especialidad: Optional[str] = None
    notas: Optional[str] = None


class AppointmentOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: Optional[str] = None
    doctor_nombre: Optional[str] = None
    patient_nombre: Optional[str] = None
    fecha_hora: datetime
    duracion_minutos: int
    estado: str
    especialidad: Optional[str] = None
    notas: Optional[str] = None
    recordatorio_enviado: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AppointmentReminderOut(BaseModel):
    id: str
    appointment_id: str
    canal: str
    programado_para: datetime
    mensaje_sugerido: str
    marcado_enviado_en: Optional[datetime] = None
    estado: str
    # Extra fields for display
    patient_id: Optional[str] = None
    patient_nombre: Optional[str] = None
    patient_telefono: Optional[str] = None
    appointment_fecha: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReminderConfigOut(BaseModel):
    reminder_hours_before: int
    reminder_template: str


class ReminderConfigUpdate(BaseModel):
    reminder_hours_before: Optional[int] = None
    reminder_template: Optional[str] = None


class ClinicHoursOut(BaseModel):
    hora_apertura: str  # HH:MM
    hora_cierre: str


class ClinicHoursUpdate(BaseModel):
    hora_apertura: Optional[str] = None
    hora_cierre: Optional[str] = None


class EspecialidadesOut(BaseModel):
    items: list[str]
    is_default: bool = False


class EspecialidadesUpdate(BaseModel):
    items: list[str]


class ClinicProfileOut(BaseModel):
    razon_social: str
    nombre_comercial: str
    ruc: str
    direccion: str
    distrito: str
    provincia: str
    departamento: str
    telefono: str
    email: str
    ticket_serie: str
    eslogan: str
    director_nombre: str
    cop_registro: str
    logo_url: Optional[str] = None
    has_custom_logo: bool = False
    nombre_publico: str
    direccion_completa: str


class ClinicProfileUpdate(BaseModel):
    razon_social: Optional[str] = None
    nombre_comercial: Optional[str] = None
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    distrito: Optional[str] = None
    provincia: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    ticket_serie: Optional[str] = None
    eslogan: Optional[str] = None
    director_nombre: Optional[str] = None
    cop_registro: Optional[str] = None
    clear_logo: Optional[bool] = None
