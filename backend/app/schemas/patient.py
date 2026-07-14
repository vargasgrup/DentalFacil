from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


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


class PatientCreate(PatientBase):
    pass


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

    model_config = {"from_attributes": True}
