"""Unit tests for PDF helpers and presupuesto layout smoke."""

from __future__ import annotations

from datetime import datetime

from app.services.pdf_helpers import (
    clean_treatment_label,
    format_date_for_document,
    format_price_plain,
    strip_markdown_noise,
)
from app.services.pdf_generator import generate_pdf


def test_format_date_for_document_without_time():
    text = format_date_for_document(datetime(2026, 7, 23, 13, 59))
    assert text == "23 de julio de 2026"
    assert "13:59" not in text


def test_clean_treatment_removes_pieza_and_pier_garbage():
    assert "pier" not in clean_treatment_label(
        "Corona temporal / provisional (pier 2020)", pieza_fdi="12"
    ).lower()
    cleaned = clean_treatment_label(
        "Corona temporal / provisional (pieza 12)", pieza_fdi="12"
    )
    assert "pieza 12" not in cleaned.lower()
    assert "Corona temporal" in cleaned


def test_strip_markdown_headers():
    assert strip_markdown_noise("## Total presupuesto") == "Total presupuesto"
    assert "##" not in strip_markdown_noise("## Total")


def test_format_price_plain():
    assert format_price_plain(120) == "S/ 120.00"
    assert format_price_plain(None) == "S/ 0.00"


def test_presupuesto_pdf_smoke_no_ghost_markers():
    """Genera presupuesto y valida bytes PDF + ausencia de patrones rotos."""
    data = {
        "patient": {
            "nombres": "Diego",
            "apellidos": "Mamani Suxo",
            "numero_ficha": 1,
        },
        "plan_nombre": "Plan A",
        "items": [
            {
                "pieza_fdi": "12",
                "item": "Corona temporal / provisional (pieza 12)",
                "cantidad": 1,
                "costo_unitario": 120,
                "estado": "pendiente",
            },
            {
                "pieza_fdi": "47",
                "item": "Perno muñón / poste (pieza 47)",
                "cantidad": 1,
                "costo_unitario": 180,
                "estado": "pendiente",
            },
        ],
    }
    pdf_bytes, filename = generate_pdf("presupuesto", "A4", data)
    assert filename.endswith(".pdf")
    assert pdf_bytes.startswith(b"%PDF")
    assert b"120.00pendiente" not in pdf_bytes
    assert b"no configurada" not in pdf_bytes.lower()
    assert len(pdf_bytes) > 800
