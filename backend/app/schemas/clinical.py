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
    pieza_fdi: Optional[str] = None
    cantidad: float = 1
    costo_unitario: float = 0
    costo: Optional[float] = None
    a_cuenta: float = 0
    estado: str = "pendiente"
    plan_item_id: Optional[str] = None
    proxima_cita_fecha: Optional[datetime] = None


class ClinicalEvolutionEntryUpdate(BaseModel):
    doctor_id: Optional[str] = None
    especialidad: Optional[str] = None
    tratamiento_descripcion: Optional[str] = None
    pieza_fdi: Optional[str] = None
    cantidad: Optional[float] = None
    costo_unitario: Optional[float] = None
    costo: Optional[float] = None
    a_cuenta: Optional[float] = None
    estado: Optional[str] = None
    plan_item_id: Optional[str] = None
    proxima_cita_fecha: Optional[datetime] = None


class ClinicalEvolutionEntryOut(BaseModel):
    id: str
    patient_id: str
    doctor_id: Optional[str] = None
    especialidad: Optional[str] = None
    tratamiento_descripcion: str
    pieza_fdi: Optional[str] = None
    cantidad: float = 1
    costo_unitario: float = 0
    costo: float
    a_cuenta: float
    estado: str
    plan_item_id: Optional[str] = None
    proxima_cita_fecha: Optional[datetime] = None
    fecha: datetime
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("cantidad", mode="before")
    @classmethod
    def _cantidad_default(cls, v):
        return 1.0 if v is None else v

    @field_validator("costo_unitario", mode="before")
    @classmethod
    def _unit_default(cls, v):
        return 0.0 if v is None else v


class FinancialSummary(BaseModel):
    costo_total: float
    pagado_total: float
    saldo: float
