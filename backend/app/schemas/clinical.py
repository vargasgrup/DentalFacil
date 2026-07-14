import json
from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, field_validator


class ClinicalRecordBase(BaseModel):
    motivo_consulta: Optional[str] = None
    antecedentes_medicos: Optional[str] = None
    antecedentes_odontologicos: Optional[str] = None
    diagnostico: Optional[str] = None
    plan_tratamiento: Optional[Union[list, str]] = None
    observaciones: Optional[str] = None
    doctor_responsable_id: Optional[str] = None

    @field_validator("plan_tratamiento", mode="before")
    @classmethod
    def normalize_plan(cls, v):
        """Accept a string (JSON) from the frontend; parse to list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return v
        return v


class ClinicalRecordUpdate(ClinicalRecordBase):
    pass


class ClinicalRecordOut(ClinicalRecordBase):
    id: str
    patient_id: str
    consentimiento_firmado: bool
    consentimiento_fecha: Optional[datetime] = None
    firma_odontologo: Optional[str] = None
    firma_paciente: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ConsentimientoUpdate(BaseModel):
    firmado: bool
    firma_odontologo: Optional[str] = None
    firma_paciente: Optional[str] = None


class ClinicalEvolutionEntryCreate(BaseModel):
    doctor_id: Optional[str] = None
    especialidad: Optional[str] = None
    tratamiento_descripcion: str
    costo: float = 0
    a_cuenta: float = 0
    estado: str = "pendiente"
    proxima_cita_fecha: Optional[datetime] = None


class ClinicalEvolutionEntryUpdate(BaseModel):
    doctor_id: Optional[str] = None
    especialidad: Optional[str] = None
    tratamiento_descripcion: Optional[str] = None
    costo: Optional[float] = None
    a_cuenta: Optional[float] = None
    estado: Optional[str] = None
    proxima_cita_fecha: Optional[datetime] = None


class ClinicalEvolutionEntryOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: Optional[str] = None
    especialidad: Optional[str] = None
    tratamiento_descripcion: str
    costo: float
    a_cuenta: float
    estado: str
    proxima_cita_fecha: Optional[datetime] = None
    fecha: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class FinancialSummary(BaseModel):
    costo_total: float
    pagado_total: float
    saldo: float
