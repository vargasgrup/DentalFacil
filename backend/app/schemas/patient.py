from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class PatientBase(BaseModel):
    nombres: str = Field(..., min_length=1, max_length=120)
    apellidos: str = Field(..., min_length=1, max_length=120)
    tipo_documento: str = Field(default="DNI")
    numero_documento: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    alergias: Optional[str] = None
    lugar_nacimiento: Optional[str] = None
    ocupacion: Optional[str] = None
    estado_civil: Optional[str] = None
    nombre_responsable: Optional[str] = None
    especialidad: Optional[str] = Field(default=None, max_length=80)
    es_migrado: bool = False
    fecha_ingreso_clinica: Optional[date] = None
    resumen_historia_previa: Optional[str] = Field(default=None, max_length=5000)


class PatientCreate(PatientBase):
    """Alta de paciente; saldo_inicial_migracion no se persiste: se traduce a evolución."""

    saldo_inicial_migracion: float = 0

    @field_validator("resumen_historia_previa")
    @classmethod
    def _trim_resumen(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None

    @model_validator(mode="after")
    def _validate_migracion(self):
        if self.es_migrado:
            if self.fecha_ingreso_clinica is None:
                raise ValueError(
                    "fecha_ingreso_clinica es obligatoria para pacientes migrados"
                )
            if self.fecha_ingreso_clinica > date.today():
                raise ValueError("fecha_ingreso_clinica no puede ser futura")
        else:
            # Pacientes normales: ignorar campos de migración
            self.fecha_ingreso_clinica = None
            self.resumen_historia_previa = None
            self.saldo_inicial_migracion = 0
        if self.saldo_inicial_migracion is None:
            self.saldo_inicial_migracion = 0
        return self


class PatientUpdate(BaseModel):
    nombres: Optional[str] = None
    apellidos: Optional[str] = None
    tipo_documento: Optional[str] = None
    numero_documento: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    alergias: Optional[str] = None
    lugar_nacimiento: Optional[str] = None
    ocupacion: Optional[str] = None
    estado_civil: Optional[str] = None
    nombre_responsable: Optional[str] = None
    especialidad: Optional[str] = Field(default=None, max_length=80)
    es_migrado: Optional[bool] = None
    fecha_ingreso_clinica: Optional[date] = None
    resumen_historia_previa: Optional[str] = Field(default=None, max_length=5000)


class PatientOut(PatientBase):
    id: str
    numero_ficha: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientSearchResult(BaseModel):
    id: str
    numero_ficha: int
    nombres: str
    apellidos: str
    telefono: Optional[str] = None
    numero_documento: Optional[str] = None
    especialidad: Optional[str] = None

    model_config = {"from_attributes": True}
