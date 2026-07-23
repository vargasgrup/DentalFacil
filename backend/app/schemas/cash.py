from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class CashSessionOpen(BaseModel):
    monto_inicial: float = 0


class CashSessionOut(BaseModel):
    id: str
    usuario_id: str
    monto_inicial: float
    monto_final: Optional[float] = None
    abierta_en: datetime
    cerrada_en: Optional[datetime] = None
    estado: str

    model_config = {"from_attributes": True}


class PagoParcialIn(BaseModel):
    """Parte de un cobro mixto (ej. efectivo 20 + yape 80)."""

    metodo_pago: str = Field(..., min_length=1, max_length=20)
    monto: float = Field(..., gt=0)


class CashTransactionCreate(BaseModel):
    patient_id: Optional[str] = None
    tipo: str  # ingreso/egreso
    concepto: str
    monto: float
    metodo_pago: str = "efectivo"  # efectivo/tarjeta/transferencia/yape/plin/mixto
    plan_item_ref: Optional[str] = None
    pieza_fdi: Optional[str] = None
    evolution_entry_id: Optional[str] = None
    # When True (default), ingreso+patient updates a_cuenta on plan/evolución.
    allocate: bool = True
    # Si se envía, se crean N movimientos (uno por método) que suman `monto`.
    pagos_parciales: Optional[list[PagoParcialIn]] = None

    @model_validator(mode="after")
    def _validate_mixto(self):
        if not self.pagos_parciales:
            return self
        if self.tipo != "ingreso":
            raise ValueError("El pago mixto solo aplica a ingresos")
        total = round(sum(float(p.monto) for p in self.pagos_parciales), 2)
        expected = round(float(self.monto), 2)
        if abs(total - expected) > 0.009:
            raise ValueError(
                f"La suma de pagos parciales (S/ {total:.2f}) debe coincidir "
                f"con el monto total (S/ {expected:.2f})"
            )
        if len(self.pagos_parciales) < 2:
            raise ValueError("Un pago mixto requiere al menos 2 métodos")
        methods = [p.metodo_pago.strip().lower() for p in self.pagos_parciales]
        if any(m in ("", "mixto") for m in methods):
            raise ValueError("Cada parte del mixto debe tener un método concreto (no 'mixto')")
        self.metodo_pago = "mixto"
        return self


class CashTransactionOut(BaseModel):
    id: str
    cash_session_id: str
    patient_id: Optional[str] = None
    patient_nombre: Optional[str] = None
    patient_telefono: Optional[str] = None
    tipo: str
    concepto: str
    monto: float
    metodo_pago: str
    grupo_pago_id: Optional[str] = None
    plan_item_ref: Optional[str] = None
    pieza_fdi: Optional[str] = None
    evolution_entry_id: Optional[str] = None
    created_at: datetime
    allocated_total: Optional[float] = None
    unallocated_amount: Optional[float] = None
    allocations: Optional[list[dict]] = None
    # Tras abono parcial: saldo que queda en el destino clínico
    saldo_pendiente_destino: Optional[float] = None
    # Partes del cobro mixto (si aplica), para UI/comprobante
    pagos_parciales: Optional[list[dict]] = None

    model_config = {"from_attributes": True}


class CashCloseSummary(BaseModel):
    session_id: str
    monto_inicial: float
    ingresos: float
    egresos: float
    neto: float
    total_esperado: float
    por_metodo: dict[str, float]
    monto_final: Optional[float] = None
