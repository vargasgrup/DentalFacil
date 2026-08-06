from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


ALLOWED_PAYMENT_METHODS = frozenset(
    {"efectivo", "yape", "plin", "transferencia", "tarjeta"}
)


class CashSessionOpen(BaseModel):
    monto_inicial: float = Field(default=0, ge=0)


class CashSessionOut(BaseModel):
    id: str
    usuario_id: str
    monto_inicial: float
    monto_final: Optional[float] = None
    monto_contado: Optional[float] = None
    diferencia: Optional[float] = None
    cierre_notas: Optional[str] = None
    abierta_en: datetime
    cerrada_en: Optional[datetime] = None
    estado: str

    model_config = {"from_attributes": True}


class CashSessionClose(BaseModel):
    """Cierre con arqueo físico obligatorio."""

    monto_contado: float = Field(..., ge=0)
    notas: Optional[str] = Field(default=None, max_length=500)


class PagoParcialIn(BaseModel):
    """Parte de un cobro mixto (ej. efectivo 20 + yape 80)."""

    metodo_pago: str = Field(..., min_length=1, max_length=20)
    monto: float = Field(..., gt=0)

    @field_validator("metodo_pago", mode="before")
    @classmethod
    def _norm_method(cls, v: object) -> str:
        s = (str(v) if v is not None else "").strip().lower()
        if s not in ALLOWED_PAYMENT_METHODS:
            raise ValueError(
                f"Método de pago inválido: {s or '—'}. "
                f"Use: {', '.join(sorted(ALLOWED_PAYMENT_METHODS))}"
            )
        return s


class CashTransactionCreate(BaseModel):
    patient_id: Optional[str] = None
    tipo: str  # ingreso/egreso
    concepto: str
    monto: float
    metodo_pago: str = "efectivo"
    plan_item_ref: Optional[str] = None
    pieza_fdi: Optional[str] = None
    evolution_entry_id: Optional[str] = None
    # When True (default), ingreso+patient updates a_cuenta on plan/evolución.
    allocate: bool = True
    # Si se envía, se crean N movimientos (uno por método) que suman `monto`.
    pagos_parciales: Optional[list[PagoParcialIn]] = None

    @field_validator("metodo_pago", mode="before")
    @classmethod
    def _norm_metodo(cls, v: object) -> str:
        s = (str(v) if v is not None else "efectivo").strip().lower() or "efectivo"
        if s == "mixto":
            return "mixto"
        if s not in ALLOWED_PAYMENT_METHODS:
            raise ValueError(
                f"Método de pago inválido: {s}. "
                f"Use: {', '.join(sorted(ALLOWED_PAYMENT_METHODS))} o mixto"
            )
        return s

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
        methods = [p.metodo_pago for p in self.pagos_parciales]
        if len(set(methods)) < len(methods):
            raise ValueError("Cada parte del mixto debe usar un método distinto")
        self.metodo_pago = "mixto"
        return self


class CashTransactionVoid(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=255)


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
    anulado: bool = False
    anulado_en: Optional[datetime] = None
    anulacion_motivo: Optional[str] = None
    created_at: datetime
    allocated_total: Optional[float] = None
    unallocated_amount: Optional[float] = None
    allocations: Optional[list[dict]] = None
    saldo_pendiente_destino: Optional[float] = None
    pagos_parciales: Optional[list[dict]] = None

    model_config = {"from_attributes": True}


class DebtLineOut(BaseModel):
    evolution_entry_id: str
    label: str
    pieza_fdi: Optional[str] = None
    costo: float
    a_cuenta: float
    saldo: float


class DebtPatientOut(BaseModel):
    patient_id: str
    patient_nombre: str
    initials: str
    ficha: str
    telefono: Optional[str] = None
    saldo: float
    lines: list[DebtLineOut] = Field(default_factory=list)


class DebtsOverviewOut(BaseModel):
    deuda_total: float
    deuda_pacientes: int
    items: list[DebtPatientOut]


class CashMovementsOut(BaseModel):
    period: str
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    session_id: Optional[str] = None
    ingresos: float
    egresos: float
    neto: float
    items: list[CashTransactionOut]


class CashCloseSummary(BaseModel):
    session_id: str
    monto_inicial: float
    ingresos: float
    egresos: float
    neto: float
    total_esperado: float
    monto_contado: float
    diferencia: float
    cierre_notas: Optional[str] = None
    por_metodo: dict[str, float]
    monto_final: Optional[float] = None
