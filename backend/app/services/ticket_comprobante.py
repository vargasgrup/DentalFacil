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
    """Logo compacto para ticket (máx. ~80 pt), centrado; recorta padding blanco."""
    profile = get_clinic_profile()
    max_pt = min(MAX_LOGO_PT, width_mm * mm)
    img = logo_image(
        profile.logo_abs_path,
        max_pt=max_pt,
        h_align="CENTER",
        trim_whitespace=True,
    )
    return img


def _esc(text: object) -> str:
    """Escape XML para ReportLab Paragraph (&, <, >)."""
    return (
        str(text if text is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _p(text: object, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_esc(text), style)


def _p_html(text: str, style: ParagraphStyle) -> Paragraph:
    """Paragraph con marcado <b> ya controlado; escapa el resto."""
    return Paragraph(text, style)


def _styles(fmt: str) -> dict[str, ParagraphStyle]:
    if fmt == "80mm":
        title_sz, body_sz, small_sz, tiny_sz = 9, 7.5, 6.5, 5.5
        after = 0.5
    elif fmt == "A5":
        title_sz, body_sz, small_sz, tiny_sz = 12, 9, 8, 7
        after = 1
    else:
        title_sz, body_sz, small_sz, tiny_sz = 14, 10, 9, 8
        after = 1

    return {
        "center_bold": ParagraphStyle(
            "c_bold",
            fontName="Helvetica-Bold",
            fontSize=title_sz,
            alignment=1,
            leading=title_sz + 2,
            spaceBefore=0,
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "center": ParagraphStyle(
            "c_norm",
            fontName="Helvetica",
            fontSize=small_sz,
            alignment=1,
            leading=small_sz + 2,
            spaceBefore=0,
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "center_small": ParagraphStyle(
            "c_small",
            fontName="Helvetica",
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + 1.5,
            textColor=colors.HexColor("#334155"),
            spaceBefore=0,
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "left": ParagraphStyle(
            "l_norm",
            fontName="Helvetica",
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + 2,
            spaceBefore=0,
            spaceAfter=after,
            leftIndent=0,
            firstLineIndent=0,
            wordWrap="CJK",
        ),
        "left_bold": ParagraphStyle(
            "l_bold",
            fontName="Helvetica-Bold",
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + 2,
            spaceBefore=0,
            spaceAfter=after,
            leftIndent=0,
            firstLineIndent=0,
            wordWrap="CJK",
        ),
        "tiny": ParagraphStyle(
            "tiny",
            fontName="Helvetica",
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + 1.5,
            textColor=colors.HexColor("#64748b"),
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "total": ParagraphStyle(
            "total",
            fontName="Helvetica-Bold",
            fontSize=body_sz + 1.5,
            alignment=0,
            leading=body_sz + 3,
            spaceAfter=2,
            wordWrap="CJK",
        ),
    }


def _line(content_w: float, *, tight: bool = False) -> HRFlowable:
    before = 0.8 if tight else 3
    after = 0.8 if tight else 3
    return HRFlowable(
        width=content_w,
        thickness=0.6,
        color=colors.black,
        spaceBefore=before,
        spaceAfter=after,
        hAlign="LEFT",
    )


def _dash(content_w: float, *, tight: bool = False) -> HRFlowable:
    before = 0.6 if tight else 2
    after = 0.6 if tight else 2
    return HRFlowable(
        width=content_w,
        thickness=0.4,
        color=colors.HexColor("#94a3b8"),
        spaceBefore=before,
        spaceAfter=after,
        dash=(1, 1.5),
        hAlign="LEFT",
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
    tight = fmt == "80mm"
    profile = get_clinic_profile()
    logo = _logo(logo_size_mm_for_ticket(fmt))
    if logo:
        story.append(logo)
        story.append(Spacer(1, 0.3 * mm if tight else 1.5 * mm))
    story.append(_p(profile.nombre_publico.upper(), styles["center_bold"]))
    if profile.ruc:
        story.append(_p(f"RUC {profile.ruc}", styles["center"]))
    contact = profile.linea_documento()
    if contact:
        story.append(_p(contact, styles["center_small"]))
    if profile.email and profile.email not in contact:
        story.append(_p(f"Email: {profile.email}", styles["center_small"]))
    if profile.director_nombre:
        dir_txt = profile.director_nombre
        if profile.cop_registro:
            dir_txt += f" · COP {profile.cop_registro}"
        story.append(_p(dir_txt, styles["center_small"]))

    story.append(_line(content_w, tight=tight))
    story.append(_p("COMPROBANTE DE PAGO", styles["center_bold"]))
    story.append(_p(serie, styles["center_bold"]))
    story.append(_dash(content_w, tight=tight))

    story.append(
        _p_html(f"<b>F. Emisión:</b> {_esc(f_emision)}", styles["left"])
    )
    story.append(
        _p_html(f"<b>H. Emisión:</b> {_esc(h_emision)}", styles["left"])
    )
    story.append(_p_html(f"<b>Cliente:</b> {_esc(patient)}", styles["left"]))
    story.append(_p_html(f"<b>Documento:</b> {_esc(doc_num)}", styles["left"]))
    if telefono:
        story.append(
            _p_html(f"<b>Teléfono:</b> {_esc(telefono)}", styles["left"])
        )
    if direccion and direccion != "—":
        story.append(
            _p_html(f"<b>Dirección:</b> {_esc(direccion)}", styles["left"])
        )

    story.append(_dash(content_w, tight=tight))

    # --- Ítems: mismas columnas y sangría que «F. Emisión» (sin desborde izquierdo) ---
    header_fs = 6.5 if fmt == "80mm" else 8
    body_fs = 7 if fmt == "80mm" else 9
    if fmt == "80mm":
        # Anchos fijos en ~70 mm útiles (80 − 2×5). Cant. centrado con texto plano.
        col_cant = 9 * mm
        col_pu = 14 * mm
        col_tot = 14 * mm
        col_desc = content_w - col_cant - col_pu - col_tot
        if col_desc < 18 * mm:
            col_pu = 12 * mm
            col_tot = 12 * mm
            col_desc = content_w - col_cant - col_pu - col_tot
    else:
        col_cant = content_w * 0.12
        col_desc = content_w * 0.44
        col_pu = content_w * 0.22
        col_tot = content_w * 0.22

    # Normalizar para que la suma sea exactamente content_w (evita overflow ReportLab)
    col_widths = [col_cant, col_desc, col_pu, col_tot]
    drift = content_w - sum(col_widths)
    col_widths[1] += drift

    hdr_desc = ParagraphStyle(
        "tick_hdr_d",
        fontName="Helvetica-Bold",
        fontSize=header_fs,
        leading=header_fs + 1,
        alignment=0,
    )
    hdr_right = ParagraphStyle(
        "tick_hdr_r",
        fontName="Helvetica-Bold",
        fontSize=header_fs,
        leading=header_fs + 1,
        alignment=2,
    )
    body_left = ParagraphStyle(
        "tick_body",
        fontName="Helvetica",
        fontSize=body_fs,
        leading=body_fs + 2,
        wordWrap="CJK",
        alignment=0,
    )
    body_right = ParagraphStyle(
        "tick_num",
        fontName="Helvetica",
        fontSize=body_fs,
        leading=body_fs + 2,
        alignment=2,
    )

    # Cant. como str (no Paragraph): ReportLab centra mejor en la celda
    item_rows = [
        [
            "Cant.",
            Paragraph("Descripción", hdr_desc),
            Paragraph("P.Unit", hdr_right),
            Paragraph("Total", hdr_right),
        ],
        [
            "1",
            Paragraph(_esc(concepto[:120]), body_left),
            Paragraph(_esc(format_price_plain(monto)), body_right),
            Paragraph(_esc(format_price_plain(monto)), body_right),
        ],
    ]
    items_table = Table(item_rows, colWidths=col_widths, hAlign="LEFT")
    pad = 1.5
    items_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (0, -1), header_fs if fmt == "80mm" else body_fs),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (1, 0), (1, -1), "LEFT"),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), pad),
                ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.black),
            ]
        )
    )
    story.append(items_table)
    story.append(_dash(content_w, tight=tight))

    # --- Totales ---
    story.append(
        _p_html(
            f"<b>Total a pagar: {_esc(format_price_plain(monto))}</b>",
            styles["total"],
        )
    )
    story.append(_p(f"Son: {monto_en_letras(monto)}", styles["left"]))
    story.append(Spacer(1, 1 * mm))
    story.append(_p_html("<b>Condición de pago:</b> Contado", styles["left"]))
    story.append(_p_html("<b>Pagos:</b>", styles["left"]))
    story.append(
        _p(f"• {metodo} — {format_price_plain(monto)}", styles["left"])
    )

    t_costo = data.get("tratamiento_costo")
    t_ac = data.get("tratamiento_a_cuenta")
    t_saldo = data.get("tratamiento_saldo")
    if t_costo is not None and t_ac is not None and t_saldo is not None:
        story.append(Spacer(1, 1 * mm))
        story.append(_p_html("<b>Estado del tratamiento:</b>", styles["left"]))
        story.append(
            _p(f"Costo: {format_price_plain(float(t_costo))}", styles["left"])
        )
        story.append(
            _p(
                f"A cuenta: {format_price_plain(float(t_ac))} · "
                f"Saldo: {format_price_plain(float(t_saldo))}",
                styles["left"],
            )
        )
        if float(t_saldo) > 0.009:
            story.append(
                _p(
                    f"Pendiente por cobrar: {format_price_plain(float(t_saldo))}",
                    styles["left"],
                )
            )

    story.append(_p_html(f"<b>Atendido por:</b> {_esc(vendedor)}", styles["left"]))

    story.append(_dash(content_w, tight=tight))
    story.append(_p("Código hash:", styles["left"]))
    story.append(_p(codigo_hash, styles["center_small"]))
    story.append(Spacer(1, 1.5 * mm))

    qr_size = 16 if fmt == "80mm" else 34
    story.append(_qr_image(qr_payload, size_mm=qr_size))
    story.append(Spacer(1, 1 * mm))

    story.append(
        _p(
            "Documento interno de caja — no es comprobante electrónico SUNAT.",
            styles["tiny"],
        )
    )
    story.append(_p("¡Gracias por su preferencia!", styles["center_small"]))

    return story
