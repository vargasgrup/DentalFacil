"""
Ticket / comprobante de pago estilo boleta térmica 80mm.

Diseño inspirado en boletas de venta electrónicas peruanas (logo, serie,
cliente, ítems, totales, monto en letras, hash, QR), sin pretender ser
comprobante tributario SUNAT.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
from datetime import datetime
from pathlib import Path
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.config import settings
from app.services.clinic_profile import get_clinic_profile
from app.services.pdf_helpers import (
    MAX_LOGO_PT,
    format_price_plain,
    logo_image,
    logo_size_mm_for_ticket,
    strip_markdown_noise,
)

_DEFAULT_LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo-md.png"

_ONES = (
    "",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISÉIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
)
_TENS = (
    "",
    "",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
)
_HUNDREDS = (
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
)


def _under_1000(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "CIEN"
    parts: list[str] = []
    h, rem = divmod(n, 100)
    if h:
        parts.append(_HUNDREDS[h])
    if rem == 0:
        return " ".join(parts)
    if rem < 20:
        parts.append(_ONES[rem])
    else:
        t, o = divmod(rem, 10)
        if t == 2:
            veintis = {
                0: "VEINTE",
                1: "VEINTIUNO",
                2: "VEINTIDÓS",
                3: "VEINTITRÉS",
                4: "VEINTICUATRO",
                5: "VEINTICINCO",
                6: "VEINTISÉIS",
                7: "VEINTISIETE",
                8: "VEINTIOCHO",
                9: "VEINTINUEVE",
            }
            parts.append(veintis[o])
        elif o:
            parts.append(f"{_TENS[t]} Y {_ONES[o]}")
        else:
            parts.append(_TENS[t])
    return " ".join(parts)


def monto_en_letras(amount: float) -> str:
    """Convierte monto a letras (soles), p.ej. 'CUARENTA Y CINCO CON 00/100 SOLES'."""
    entero = int(round(amount * 100)) // 100
    centavos = int(round(amount * 100)) % 100
    if entero == 0:
        palabras = "CERO"
    else:
        millions, rest = divmod(entero, 1_000_000)
        thousands, units = divmod(rest, 1000)
        chunks: list[str] = []
        if millions:
            if millions == 1:
                chunks.append("UN MILLÓN")
            else:
                chunks.append(f"{_under_1000(millions)} MILLONES")
        if thousands:
            if thousands == 1:
                chunks.append("MIL")
            else:
                chunks.append(f"{_under_1000(thousands)} MIL")
        if units:
            chunks.append(_under_1000(units))
        palabras = " ".join(chunks)
    return f"{palabras} CON {centavos:02d}/100 SOLES"


def format_serie(transaction_id: str | int, serie: str | None = None) -> str:
    profile = get_clinic_profile()
    prefix = (serie or profile.ticket_serie or "T001").strip().upper()
    raw = str(transaction_id).replace("-", "")
    try:
        n = int(raw[-8:], 16) % 100_000_000
    except ValueError:
        try:
            n = int(transaction_id) % 100_000_000
        except (TypeError, ValueError):
            n = 0
    return f"{prefix}-{n:08d}"


def build_receipt_hash(payload: str) -> str:
    """Hash corto tipo boleta (HMAC-SHA256 truncado, base64)."""
    digest = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("ascii")[:28] + "="


def build_qr_payload(data: dict[str, Any]) -> str:
    """
    Payload del QR: URL de consulta si hay PUBLIC_APP_URL,
    o cadena compacta con datos del comprobante.
    """
    serie = data.get("serie") or format_serie(data.get("transaction_id") or "0")
    base = (settings.PUBLIC_APP_URL or "").rstrip("/")
    if base:
        return f"{base}/caja?comprobante={serie}"
    # Offline / sin URL pública: datos legibles para verificación manual
    return "|".join(
        [
            "MD-COMP",
            serie,
            f"{float(data.get('monto') or 0):.2f}",
            str(data.get("fecha_emision") or ""),
            str(data.get("metodo_pago") or ""),
            str(data.get("hash") or ""),
        ]
    )


def _qr_image(payload: str, size_mm: float = 28) -> RLImage:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=1,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    side = size_mm * mm
    rl = RLImage(buf, width=side, height=side)
    rl.hAlign = "CENTER"
    return rl


def _logo(width_mm: float = 22) -> RLImage | None:
    """Logo compacto para ticket (máx. ~80 pt), centrado en boleta térmica."""
    profile = get_clinic_profile()
    max_pt = min(MAX_LOGO_PT, width_mm * mm)
    img = logo_image(profile.logo_abs_path, max_pt=max_pt, h_align="CENTER")
    return img


def _styles(fmt: str) -> dict[str, ParagraphStyle]:
    if fmt == "80mm":
        title_sz, body_sz, small_sz, tiny_sz = 9, 7.5, 6.5, 5.5
    elif fmt == "A5":
        title_sz, body_sz, small_sz, tiny_sz = 12, 9, 8, 7
    else:
        title_sz, body_sz, small_sz, tiny_sz = 14, 10, 9, 8

    return {
        "center_bold": ParagraphStyle(
            "c_bold",
            fontName="Helvetica-Bold",
            fontSize=title_sz,
            alignment=1,
            leading=title_sz + 2,
            spaceAfter=1,
        ),
        "center": ParagraphStyle(
            "c_norm",
            fontName="Helvetica",
            fontSize=small_sz,
            alignment=1,
            leading=small_sz + 2,
            spaceAfter=1,
        ),
        "center_small": ParagraphStyle(
            "c_small",
            fontName="Helvetica",
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + 1.5,
            textColor=colors.HexColor("#334155"),
            spaceAfter=1,
        ),
        "left": ParagraphStyle(
            "l_norm",
            fontName="Helvetica",
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + 2,
            spaceAfter=1,
        ),
        "left_bold": ParagraphStyle(
            "l_bold",
            fontName="Helvetica-Bold",
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + 2,
            spaceAfter=1,
        ),
        "tiny": ParagraphStyle(
            "tiny",
            fontName="Helvetica",
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + 1.5,
            textColor=colors.HexColor("#64748b"),
            spaceAfter=1,
        ),
        "total": ParagraphStyle(
            "total",
            fontName="Helvetica-Bold",
            fontSize=body_sz + 1.5,
            alignment=0,
            leading=body_sz + 3,
            spaceAfter=2,
        ),
    }


def _line(content_w: float) -> HRFlowable:
    return HRFlowable(
        width="100%",
        thickness=0.6,
        color=colors.black,
        spaceBefore=3,
        spaceAfter=3,
    )


def _dash(content_w: float) -> HRFlowable:
    return HRFlowable(
        width="100%",
        thickness=0.4,
        color=colors.HexColor("#94a3b8"),
        spaceBefore=2,
        spaceAfter=2,
        dash=(1, 1.5),
    )


def build_comprobante_story(
    data: dict[str, Any],
    fmt: str,
    page_w: float,
    margin: float,
) -> list:
    """Construye el flowable list del comprobante (ticket / A5 / A4)."""
    styles = _styles(fmt)
    content_w = page_w - 2 * margin
    story: list = []

    tx_id = data.get("transaction_id") or "0"
    serie = data.get("serie") or format_serie(tx_id)
    monto = float(data.get("monto") or 0)
    concepto = strip_markdown_noise(str(data.get("concepto") or "Servicio odontológico"))
    metodo = str(data.get("metodo_pago") or "efectivo").capitalize()
    patient = str(data.get("patient_nombre") or "Clientes - Varios")
    doc_num = str(data.get("patient_documento") or "—")
    telefono = str(data.get("patient_telefono") or "")
    direccion = str(data.get("patient_direccion") or "—")
    vendedor = str(data.get("vendedor") or "Administrador")
    emitido = data.get("fecha_emision")
    if isinstance(emitido, datetime):
        f_emision = emitido.strftime("%Y-%m-%d")
        h_emision = emitido.strftime("%H:%M:%S")
    else:
        now = datetime.now()
        f_emision = str(data.get("f_emision") or now.strftime("%Y-%m-%d"))
        h_emision = str(data.get("h_emision") or now.strftime("%H:%M:%S"))

    hash_src = f"{serie}|{monto:.2f}|{f_emision}|{h_emision}|{patient}|{concepto}|{metodo}"
    codigo_hash = data.get("hash") or build_receipt_hash(hash_src)
    qr_data = {**data, "serie": serie, "hash": codigo_hash, "fecha_emision": f"{f_emision} {h_emision}"}
    qr_payload = build_qr_payload(qr_data)

    # --- Cabecera clínica ---
    profile = get_clinic_profile()
    logo = _logo(logo_size_mm_for_ticket(fmt))
    if logo:
        story.append(logo)
        story.append(Spacer(1, 1.5 * mm))
    story.append(Paragraph(profile.nombre_publico.upper(), styles["center_bold"]))
    if profile.ruc:
        story.append(Paragraph(f"RUC {profile.ruc}", styles["center"]))
    contact = profile.linea_documento()
    if contact:
        story.append(Paragraph(contact, styles["center_small"]))
    if profile.email and profile.email not in contact:
        story.append(Paragraph(f"Email: {profile.email}", styles["center_small"]))
    if profile.director_nombre:
        dir_txt = profile.director_nombre
        if profile.cop_registro:
            dir_txt += f" · COP {profile.cop_registro}"
        story.append(Paragraph(dir_txt, styles["center_small"]))

    story.append(_line(content_w))
    story.append(Paragraph("COMPROBANTE DE PAGO", styles["center_bold"]))
    story.append(Paragraph(serie, styles["center_bold"]))
    story.append(_dash(content_w))

    story.append(Paragraph(f"<b>F. Emisión:</b> {f_emision}", styles["left"]))
    story.append(Paragraph(f"<b>H. Emisión:</b> {h_emision}", styles["left"]))
    story.append(Paragraph(f"<b>Cliente:</b> {patient}", styles["left"]))
    story.append(Paragraph(f"<b>Documento:</b> {doc_num}", styles["left"]))
    if telefono:
        story.append(Paragraph(f"<b>Teléfono:</b> {telefono}", styles["left"]))
    if direccion and direccion != "—":
        story.append(Paragraph(f"<b>Dirección:</b> {direccion}", styles["left"]))

    story.append(_dash(content_w))

    # --- Ítems ---
    header_fs = 6.5 if fmt == "80mm" else 8
    body_fs = 7 if fmt == "80mm" else 9
    col_cant = content_w * 0.12
    col_desc = content_w * 0.48
    col_pu = content_w * 0.20
    col_tot = content_w * 0.20

    item_rows = [
        [
            Paragraph("<b>Cant.</b>", ParagraphStyle("h", fontSize=header_fs, fontName="Helvetica-Bold")),
            Paragraph("<b>Descripción</b>", ParagraphStyle("h2", fontSize=header_fs, fontName="Helvetica-Bold")),
            Paragraph("<b>P.Unit</b>", ParagraphStyle("h3", fontSize=header_fs, fontName="Helvetica-Bold", alignment=2)),
            Paragraph("<b>Total</b>", ParagraphStyle("h4", fontSize=header_fs, fontName="Helvetica-Bold", alignment=2)),
        ],
        [
            Paragraph("1", ParagraphStyle("b", fontSize=body_fs)),
            Paragraph(concepto[:120], ParagraphStyle("b2", fontSize=body_fs, leading=body_fs + 2)),
            Paragraph(format_price_plain(monto), ParagraphStyle("b3", fontSize=body_fs, alignment=2, leading=body_fs + 2)),
            Paragraph(format_price_plain(monto), ParagraphStyle("b4", fontSize=body_fs, alignment=2, leading=body_fs + 2)),
        ],
    ]
    items_table = Table(item_rows, colWidths=[col_cant, col_desc, col_pu, col_tot])
    items_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.black),
            ]
        )
    )
    story.append(items_table)
    story.append(_dash(content_w))

    # --- Totales (sin IGV fiscal: documento interno de caja) ---
    story.append(Paragraph(f"<b>Total a pagar: {format_price_plain(monto)}</b>", styles["total"]))
    story.append(Paragraph(f"Son: {monto_en_letras(monto)}", styles["left"]))
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(f"<b>Condición de pago:</b> Contado", styles["left"]))
    story.append(Paragraph(f"<b>Pagos:</b>", styles["left"]))
    story.append(Paragraph(f"• {metodo} — {format_price_plain(monto)}", styles["left"]))
    story.append(Paragraph(f"<b>Atendido por:</b> {vendedor}", styles["left"]))

    story.append(_dash(content_w))
    story.append(Paragraph(f"Código hash:", styles["left"]))
    story.append(Paragraph(codigo_hash, styles["center_small"]))
    story.append(Spacer(1, 2 * mm))

    qr_size = 22 if fmt == "80mm" else 34
    story.append(_qr_image(qr_payload, size_mm=qr_size))
    story.append(Spacer(1, 1 * mm))

    story.append(
        Paragraph(
            "Representación impresa del COMPROBANTE DE PAGO del consultorio. "
            "Documento interno de caja — no constituye comprobante de pago electrónico SUNAT.",
            styles["tiny"],
        )
    )
    if settings.PUBLIC_APP_URL:
        story.append(
            Paragraph(
                f"Consulta: {(settings.PUBLIC_APP_URL or '').rstrip('/')}/caja",
                styles["tiny"],
            )
        )
    story.append(Paragraph("¡Gracias por su preferencia!", styles["center_small"]))

    return story
