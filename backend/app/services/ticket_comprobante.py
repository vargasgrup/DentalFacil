"""
Ticket / comprobante de pago estilo boleta 80mm.

Diseño multi-impresora:
  - Térmicas 80mm (Star, Epson TM-T series, etc.)
  - Matriciales / impact Epson TM-U220A (M188A) y afines

Tipografía: Courier / Courier-Bold (ReportLab built-in). Son monoespace con trazo
grueso y counters abiertos; al rasterizar en ~9–16 pines o drivers termicos
siguen legibles. Evitar grises y dash finos en 80mm (se pierden en impact).
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

# ── Tipografía de ticket 80mm (termico + matricial TM-U220) ────────────────
# Courier es el estandar de facto en recibos POS/impact: contadores abiertos,
# peso de trazo alto, monoespace (columnas alineadas), Unicode Latin-1/ñ.
# Helvetica a tamaños < 8pt se “come” al imprimir en TM-U220A (9 pines).
TICKET_FONT = "Courier"
TICKET_FONT_BOLD = "Courier-Bold"
# Negro puro: drivers impact no reproducen gris medium de forma fiable
TICKET_BLACK = colors.black
TICKET_INK = colors.HexColor("#000000")

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
    # ERROR_CORRECT_H: mejor recuperación en impresión ruidosa (matricial/térmico sucio)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8,
        border=2,
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


def _logo(width_mm: float = 24) -> RLImage | None:
    """Logo del centro en ticket, centrado; recorta padding blanco."""
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


# Separadores 80mm: mismo grosor y ancho (aspecto profesional uniforme)
_SEP_THICK_80 = 0.75
_SEP_GAP_80 = 1.6  # pt arriba/abajo del separador


def _styles(fmt: str) -> dict[str, ParagraphStyle]:
    """
    Estilos por formato.

    80mm: Courier + tamaños mínimos ~8–11 pt (legible en TM-U220A y térmicas).
    Campos apilados (emisión, cliente, pagos): interlineado compacto.
    A5/A4: Helvetica de lectura en hoja A (documentos oficina).
    """
    if fmt == "80mm":
        # Mínimos impresos (pt): título 11, cuerpo 9.5, secundaria 8.5, pie 8
        title_sz, body_sz, small_sz, tiny_sz = 11, 9.5, 8.5, 8
        # Interlineado compacto: body ~11 pt; spaceAfter mínimo entre renglones
        after = 0.6
        lead_extra = 1.5
        field_after = 0.4  # F. Emisión / Cliente / Pagos… aún más ceñido
        font_r, font_b = TICKET_FONT, TICKET_FONT_BOLD
        mute = TICKET_INK  # sin gris: el impact lo desvanece o lo hace ilegible
    elif fmt == "A5":
        title_sz, body_sz, small_sz, tiny_sz = 12, 9, 8, 7
        after = 2.0
        lead_extra = 3.0
        field_after = after
        font_r, font_b = "Helvetica", "Helvetica-Bold"
        mute = colors.HexColor("#334155")
    else:
        title_sz, body_sz, small_sz, tiny_sz = 14, 10, 9, 8
        after = 2.0
        lead_extra = 3.0
        field_after = after
        font_r, font_b = "Helvetica", "Helvetica-Bold"
        mute = colors.HexColor("#334155")

    field_lead = body_sz + (1.2 if fmt == "80mm" else lead_extra)

    return {
        "center_bold": ParagraphStyle(
            "c_bold",
            fontName=font_b,
            fontSize=title_sz,
            alignment=1,
            leading=title_sz + lead_extra,
            spaceBefore=0,
            spaceAfter=after + (0.8 if fmt == "80mm" else 0),
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
        "center": ParagraphStyle(
            "c_norm",
            fontName=font_r,
            fontSize=small_sz,
            alignment=1,
            leading=small_sz + lead_extra,
            spaceBefore=0,
            spaceAfter=after,
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
        "center_small": ParagraphStyle(
            "c_small",
            fontName=font_r,
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + lead_extra,
            textColor=mute,
            spaceBefore=0,
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "left": ParagraphStyle(
            "l_norm",
            fontName=font_r,
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + lead_extra,
            spaceBefore=0,
            spaceAfter=after,
            leftIndent=0,
            firstLineIndent=0,
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
        # Bloques de datos en 1 renglón c/u (emisión, cliente, pagos, estado)
        "field": ParagraphStyle(
            "l_field",
            fontName=font_r,
            fontSize=body_sz,
            alignment=0,
            leading=field_lead,
            spaceBefore=0,
            spaceAfter=field_after,
            leftIndent=0,
            firstLineIndent=0,
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
        "left_bold": ParagraphStyle(
            "l_bold",
            fontName=font_b,
            fontSize=body_sz,
            alignment=0,
            leading=body_sz + lead_extra,
            spaceBefore=0,
            spaceAfter=after,
            leftIndent=0,
            firstLineIndent=0,
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
        "tiny": ParagraphStyle(
            "tiny",
            fontName=font_r,
            fontSize=tiny_sz,
            alignment=1,
            leading=tiny_sz + lead_extra,
            textColor=mute,
            spaceAfter=after,
            wordWrap="CJK",
        ),
        "total": ParagraphStyle(
            "total",
            fontName=font_b,
            fontSize=body_sz + 1.5 if fmt != "80mm" else 11,
            alignment=0,
            leading=(body_sz + 1.5 if fmt != "80mm" else 11) + 1.2,
            spaceAfter=after + 0.4,
            textColor=TICKET_INK if fmt == "80mm" else colors.black,
            wordWrap="CJK",
        ),
    }


def _sep(content_w: float, *, tight: bool = False) -> HRFlowable:
    """Separador de bloque: en 80mm siempre el mismo grosor y ancho completo."""
    if tight:
        return HRFlowable(
            width=content_w,
            thickness=_SEP_THICK_80,
            color=TICKET_BLACK,
            spaceBefore=_SEP_GAP_80,
            spaceAfter=_SEP_GAP_80,
            hAlign="LEFT",
        )
    return HRFlowable(
        width=content_w,
        thickness=0.6,
        color=colors.HexColor("#334155"),
        spaceBefore=2.4,
        spaceAfter=2.4,
        hAlign="LEFT",
    )


def _line(content_w: float, *, tight: bool = False) -> HRFlowable:
    """Alias histórico → mismo separador unificado."""
    return _sep(content_w, tight=tight)


def _dash(content_w: float, *, tight: bool = False) -> HRFlowable:
    """Alias histórico → mismo separador unificado (80mm sin dash fino)."""
    if tight:
        return _sep(content_w, tight=True)
    return HRFlowable(
        width=content_w,
        thickness=0.5,
        color=colors.HexColor("#334155"),
        spaceBefore=2.2,
        spaceAfter=2.2,
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
        story.append(Spacer(1, 2.8 * mm if tight else 4 * mm))
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

    story.append(Spacer(1, 1.0 * mm if tight else 2.5 * mm))
    story.append(_sep(content_w, tight=tight))
    story.append(_p("COMPROBANTE DE PAGO", styles["center_bold"]))
    story.append(_p(serie, styles["center_bold"]))
    story.append(_sep(content_w, tight=tight))

    field = styles["field"]
    story.append(_p_html(f"<b>F. Emisión:</b> {_esc(f_emision)}", field))
    story.append(_p_html(f"<b>H. Emisión:</b> {_esc(h_emision)}", field))
    story.append(_p_html(f"<b>Cliente:</b> {_esc(patient)}", field))
    story.append(_p_html(f"<b>Documento:</b> {_esc(doc_num)}", field))
    if telefono:
        story.append(_p_html(f"<b>Teléfono:</b> {_esc(telefono)}", field))
    if direccion and direccion != "—":
        story.append(_p_html(f"<b>Dirección:</b> {_esc(direccion)}", field))

    story.append(_sep(content_w, tight=tight))

    # --- Ítems ---
    # 80mm: tipografía + tamaño mínimo legible en impact (nunca < 8 pt)
    header_fs = 8.5 if fmt == "80mm" else 8
    body_fs = 9.5 if fmt == "80mm" else 9
    font_r = TICKET_FONT if fmt == "80mm" else "Helvetica"
    font_b = TICKET_FONT_BOLD if fmt == "80mm" else "Helvetica-Bold"
    if fmt == "80mm":
        col_cant = 10 * mm
        col_pu = 15 * mm
        col_tot = 15 * mm
        col_desc = content_w - col_cant - col_pu - col_tot
        if col_desc < 18 * mm:
            col_pu = 13 * mm
            col_tot = 13 * mm
            col_desc = content_w - col_cant - col_pu - col_tot
    else:
        col_cant = content_w * 0.12
        col_desc = content_w * 0.44
        col_pu = content_w * 0.22
        col_tot = content_w * 0.22

    col_widths = [col_cant, col_desc, col_pu, col_tot]
    drift = content_w - sum(col_widths)
    col_widths[1] += drift

    lead_row = body_fs + 1.6 if fmt == "80mm" else body_fs + 2
    hdr_desc = ParagraphStyle(
        "tick_hdr_d",
        fontName=font_b,
        fontSize=header_fs,
        leading=header_fs + 1.5,
        alignment=0,
        textColor=TICKET_INK,
    )
    hdr_right = ParagraphStyle(
        "tick_hdr_r",
        fontName=font_b,
        fontSize=header_fs,
        leading=header_fs + 1.5,
        alignment=2,
        textColor=TICKET_INK,
    )
    body_left = ParagraphStyle(
        "tick_body",
        fontName=font_r,
        fontSize=body_fs,
        leading=lead_row,
        wordWrap="CJK",
        alignment=0,
        textColor=TICKET_INK,
    )
    body_right = ParagraphStyle(
        "tick_num",
        fontName=font_b if fmt == "80mm" else font_r,
        fontSize=body_fs,
        leading=lead_row,
        alignment=2,
        textColor=TICKET_INK,
    )

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
    pad = 1.5 if tight else 1.5
    items_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (0, 0), font_b),
                ("FONTNAME", (0, 1), (0, -1), font_r),
                ("FONTSIZE", (0, 0), (0, -1), header_fs if fmt == "80mm" else body_fs),
                ("TEXTCOLOR", (0, 0), (-1, -1), TICKET_INK),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (1, 0), (1, -1), "LEFT"),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), pad),
                ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5 if tight else 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 if tight else 2),
                # Misma trama que _sep en 80mm
                ("LINEBELOW", (0, 0), (-1, 0), _SEP_THICK_80 if tight else 0.4, TICKET_BLACK),
            ]
        )
    )
    story.append(items_table)
    story.append(_sep(content_w, tight=tight))

    # --- Totales y pagos (mismo estilo field = interlineado compacto) ---
    story.append(
        _p_html(
            f"<b>Total a pagar: {_esc(format_price_plain(monto))}</b>",
            styles["total"],
        )
    )
    story.append(_p(f"Son: {monto_en_letras(monto)}", field))
    story.append(Spacer(1, 0.8 * mm if tight else 1.2 * mm))
    story.append(_p_html("<b>Condición de pago:</b> Contado", field))
    story.append(_p_html("<b>Pagos:</b>", field))
    story.append(_p(f"* {metodo} — {format_price_plain(monto)}", field))

    t_costo = data.get("tratamiento_costo")
    t_ac = data.get("tratamiento_a_cuenta")
    t_saldo = data.get("tratamiento_saldo")
    if t_costo is not None and t_ac is not None and t_saldo is not None:
        story.append(Spacer(1, 0.8 * mm if tight else 1.2 * mm))
        story.append(_p_html("<b>Estado del tratamiento:</b>", field))
        story.append(_p(f"Costo: {format_price_plain(float(t_costo))}", field))
        # Dos líneas cortas evitan "S/\n52.00" partido a media palabra en Courier
        story.append(
            _p(f"A cuenta: {format_price_plain(float(t_ac))}", field)
        )
        story.append(
            _p(f"Saldo: {format_price_plain(float(t_saldo))}", field)
        )
        if float(t_saldo) > 0.009:
            story.append(
                _p(
                    f"Pendiente por cobrar: {format_price_plain(float(t_saldo))}",
                    field,
                )
            )

    story.append(_p_html(f"<b>Atendido por:</b> {_esc(vendedor)}", field))

    story.append(_sep(content_w, tight=tight))
    story.append(
        _p("Código hash:", styles["left_bold"] if tight else styles["left"])
    )
    story.append(_p(codigo_hash, styles["center_small"]))
    story.append(Spacer(1, 1.4 * mm if tight else 1.8 * mm))

    # QR más grande en 80mm: impact necesita módulos más anchos
    qr_size = 22 if fmt == "80mm" else 34
    story.append(_qr_image(qr_payload, size_mm=qr_size))
    story.append(Spacer(1, 1.2 * mm if tight else 1.4 * mm))

    story.append(
        _p(
            "Documento interno de caja — no es comprobante electrónico SUNAT.",
            styles["tiny"],
        )
    )
    story.append(_p("¡Gracias por su preferencia!", styles["center_small"]))
    # Pie de corte para rollo / matricial (aire al final)
    if tight:
        story.append(Spacer(1, 2.5 * mm))
        story.append(_sep(content_w, tight=True))

    return story
