from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CashSession(Base):
    __tablename__ = "cash_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    monto_inicial: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    monto_final: Mapped[float | None] = mapped_column(Numeric(10, 2))
    abierta_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estado: Mapped[str] = mapped_column(String(20), default="abierta")  # abierta/cerrada


class CashTransaction(Base):
    __tablename__ = "cash_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    cash_session_id: Mapped[int] = mapped_column(ForeignKey("cash_sessions.id"), index=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"))
    tipo: Mapped[str] = mapped_column(String(10))  # ingreso/egreso
    concepto: Mapped[str] = mapped_column(String(255))
    monto: Mapped[float] = mapped_column(Numeric(10, 2))
    metodo_pago: Mapped[str] = mapped_column(String(20), default="efectivo")  # efectivo/tarjeta/transferencia/yape
    plan_item_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pieza_fdi: Mapped[str | None] = mapped_column(String(4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
