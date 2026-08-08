from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.patient_especialidades import (
    dual_write_fields,
    normalize_especialidades,
    resolve_from_patient,
)


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
    sexo: Optional[str] = Field(default=None, max_length=20)
    nombre_responsable: Optional[str] = None
    parentesco_responsable: Optional[str] = Field(default=None, max_length=40)
    telefono_responsable: Optional[str] = Field(default=None, max_length=30)
    documento_responsable: Optional[str] = Field(default=None, max_length=30)
    # Legado: primera especialidad (sincronizada con especialidades[0])
    especialidad: Optional[str] = Field(default=None, max_length=80)
    # Multi: especialidades en las que se atiende al paciente
    especialidades: list[str] = Field(default_factory=list)
    es_migrado: bool = False
    fecha_ingreso_clinica: Optional[date] = None
    resumen_historia_previa: Optional[str] = Field(default=None, max_length=5000)
    activo: bool = True

    @field_validator("sexo", mode="before")
    @classmethod
    def _normalize_sexo(cls, v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().upper()
        if not s:
            return None
        # Accept common labels
        if s in ("M", "MASCULINO", "HOMBRE", "H"):
            return "M"
        if s in ("F", "FEMENINO", "MUJER"):
            return "F"
        if s in ("X", "OTRO", "NO_BINARIO", "NB", "O"):
            return "X"
        return s[:20]

    @field_validator("especialidades", mode="before")
    @classmethod
    def _coerce_especialidades(cls, v: object) -> list:
        if v is None:
            return []
        if isinstance(v, str):
            return normalize_especialidades(None, v)
        if isinstance(v, (list, tuple)):
            return normalize_especialidades(list(v), None)
        return []

    @model_validator(mode="after")
    def _sync_especialidades(self):
        items = normalize_especialidades(self.especialidades, self.especialidad)
        object.__setattr__(self, "especialidades", items)
        object.__setattr__(self, "especialidad", items[0] if items else None)
        return self


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

    @field_validator("tipo_documento", mode="before")
    @classmethod
    def _normalize_tipo_doc(cls, v: object) -> str:
        raw = (str(v) if v is not None else "DNI").strip().upper()
        aliases = {
            "PASAPORTE": "PASAPORTE",
            "PASAPORT": "PASAPORTE",
            "PASSPORT": "PASAPORTE",
            "CARNET": "CE",
            "CARNÉ": "CE",
            "CE": "CE",
            "DNI": "DNI",
            "SIN_DOC": "SIN_DOC",
            "SIN DOCUMENTO": "SIN_DOC",
            "NO_DOC": "SIN_DOC",
            "EN_TRAMITE": "EN_TRAMITE",
            "EN TRÁMITE": "EN_TRAMITE",
            "EN TRAMITE": "EN_TRAMITE",
            "OTRO": "OTRO",
        }
        return aliases.get(raw, raw or "DNI")

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
            self.fecha_ingreso_clinica = None
            self.resumen_historia_previa = None
            self.saldo_inicial_migracion = 0
        if self.saldo_inicial_migracion is None:
            self.saldo_inicial_migracion = 0
        # Tipos sin número de documento
        if self.tipo_documento in ("SIN_DOC", "EN_TRAMITE") and not (
            self.numero_documento or ""
        ).strip():
            object.__setattr__(self, "numero_documento", None)
        if self.fecha_nacimiento and self.fecha_nacimiento > date.today():
            raise ValueError("fecha_nacimiento no puede ser futura")
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
    sexo: Optional[str] = Field(default=None, max_length=20)
    nombre_responsable: Optional[str] = None
    parentesco_responsable: Optional[str] = Field(default=None, max_length=40)
    telefono_responsable: Optional[str] = Field(default=None, max_length=30)
    documento_responsable: Optional[str] = Field(default=None, max_length=30)
    especialidad: Optional[str] = Field(default=None, max_length=80)
    especialidades: Optional[list[str]] = None
    es_migrado: Optional[bool] = None
    fecha_ingreso_clinica: Optional[date] = None
    resumen_historia_previa: Optional[str] = Field(default=None, max_length=5000)
    activo: Optional[bool] = None

    @field_validator("sexo", mode="before")
    @classmethod
    def _normalize_sexo(cls, v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().upper()
        if not s:
            return None
        if s in ("M", "MASCULINO", "HOMBRE", "H"):
            return "M"
        if s in ("F", "FEMENINO", "MUJER"):
            return "F"
        if s in ("X", "OTRO", "NO_BINARIO", "NB", "O"):
            return "X"
        return s[:20]

    @field_validator("especialidades", mode="before")
    @classmethod
    def _coerce_especialidades(cls, v: object) -> Optional[list]:
        if v is None:
            return None
        if isinstance(v, str):
            return normalize_especialidades(None, v)
        if isinstance(v, (list, tuple)):
            return normalize_especialidades(list(v), None)
        return []


class PatientOut(PatientBase):
    id: str
    numero_ficha: int
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _hydrate_from_orm(cls, data: Any) -> Any:
        """Expande especialidades desde JSON o columna legacy."""
        if data is None:
            return data
        if hasattr(data, "id") and hasattr(data, "nombres"):
            items = resolve_from_patient(data)
            primary, multi = dual_write_fields(items, None)
            return {
                "id": data.id,
                "numero_ficha": data.numero_ficha,
                "nombres": data.nombres,
                "apellidos": data.apellidos,
                "tipo_documento": data.tipo_documento,
                "numero_documento": data.numero_documento,
                "fecha_nacimiento": data.fecha_nacimiento,
                "telefono": data.telefono,
                "email": data.email,
                "direccion": data.direccion,
                "contacto_emergencia": data.contacto_emergencia,
                "alergias": data.alergias,
                "lugar_nacimiento": data.lugar_nacimiento,
                "ocupacion": data.ocupacion,
                "estado_civil": data.estado_civil,
                "sexo": data.sexo,
                "nombre_responsable": data.nombre_responsable,
                "parentesco_responsable": data.parentesco_responsable,
                "telefono_responsable": data.telefono_responsable,
                "documento_responsable": data.documento_responsable,
                "especialidad": primary,
                "especialidades": multi or [],
                "es_migrado": bool(getattr(data, "es_migrado", False)),
                "fecha_ingreso_clinica": data.fecha_ingreso_clinica,
                "resumen_historia_previa": data.resumen_historia_previa,
                "activo": bool(getattr(data, "activo", True)),
                "created_at": data.created_at,
            }
        if isinstance(data, dict):
            items = normalize_especialidades(
                data.get("especialidades"), data.get("especialidad")
            )
            data = {
                **data,
                "especialidades": items,
                "especialidad": items[0] if items else None,
            }
        return data


class PatientSearchResult(BaseModel):
    id: str
    numero_ficha: int
    nombres: str
    apellidos: str
    telefono: Optional[str] = None
    numero_documento: Optional[str] = None
    especialidad: Optional[str] = None
    especialidades: list[str] = Field(default_factory=list)
    activo: bool = True

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _hydrate(cls, data: Any) -> Any:
        if data is None:
            return data
        if hasattr(data, "id") and hasattr(data, "nombres"):
            items = resolve_from_patient(data)
            return {
                "id": data.id,
                "numero_ficha": data.numero_ficha,
                "nombres": data.nombres,
                "apellidos": data.apellidos,
                "telefono": data.telefono,
                "numero_documento": data.numero_documento,
                "especialidad": items[0] if items else None,
                "especialidades": items,
                "activo": bool(getattr(data, "activo", True)),
            }
        if isinstance(data, dict):
            items = normalize_especialidades(
                data.get("especialidades"), data.get("especialidad")
            )
            data = {
                **data,
                "especialidades": items,
                "especialidad": items[0] if items else data.get("especialidad"),
            }
        return data
