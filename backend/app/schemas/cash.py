from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CashSessionOpen(BaseModel):
    monto_inicial: float = 0


class CashSessionOut(BaseModel):
    id: int
    usuario_id: int
    monto_inicial: float
    monto_final: Optional[float] = None
    abierta_en: datetime
    cerrada_en: Optional[datetime] = None
    estado: str

    model_config = {"from_attributes": True}


class CashTransactionCreate(BaseModel):
    patient_id: Optional[int] = None
    tipo: str  # ingreso/egreso
    concepto: str
    monto: float
    metodo_pago: str = "efectivo"  # efectivo/tarjeta/transferencia/yape
    plan_item_ref: Optional[str] = None
    pieza_fdi: Optional[str] = None


class CashTransactionOut(BaseModel):
    id: int
    cash_session_id: int
    patient_id: Optional[int] = None
    patient_nombre: Optional[str] = None
    patient_telefono: Optional[str] = None
    tipo: str
    concepto: str
    monto: float
    metodo_pago: str
    plan_item_ref: Optional[str] = None
    pieza_fdi: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CashCloseSummary(BaseModel):
    session_id: int
    monto_inicial: float
    ingresos: float
    egresos: float
    neto: float
    total_esperado: float
    por_metodo: dict[str, float]
    monto_final: Optional[float] = None
