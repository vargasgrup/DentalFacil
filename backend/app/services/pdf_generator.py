"""
Single PDF generation engine for all documents in the system.
Uses ReportLab for all document types (comprobante, cierre_caja, ficha,
evolucion, consentimiento, reporte) in 3 formats: 80mm, A5, A4.

The same business data feeds all three formats — only page dimensions and
layout proportions change. No business logic is duplicated between formats.
"""

import io
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Spacer,
    Paragraph,
    Table,
    TableStyle,
    Image as RLImage,
)

from app.utils.ficha import format_ficha_label
from app.services.ticket_comprobante import build_comprobante_story
from app.services.clinic_profile import get_clinic_profile
from app.services.pdf_helpers import (
    MAX_LOGO_PT,
    as_float,
    cell_paragraph,
    clean_treatment_label,
    format_date_for_document,
    format_price_plain,
    logo_image,
    strip_markdown_noise,
)

# Fallback logo path (perfil puede apuntar a uploads/clinic-logo.*)
_DEFAULT_LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo-md.png"

# Ticket 80mm (térmica + matricial Epson TM-U220A / M188A / Star TSP):
# - Ancho fijo 80mm; altura al contenido.
# - Márgenes laterales ≥5 mm: zona no imprimible típica de Star TSP / Epson (~3–6 mm).
#   Márgenes <4 mm recortaban P.Unit/Total al borde derecho del papel.
TICKET_WIDTH = 80 * mm
# (left, right, top, bottom) — ~70 mm de texto útil, contenido completo en preview/print
TICKET_MARGINS_COMPROBANTE = (5.0 * mm, 5.0 * mm, 2.0 * mm, 3.5 * mm)
PAGE_A5 = A5
PAGE_A4 = A4

FORMAT_DIMENSIONS = {
    "80mm": (TICKET_WIDTH, 297 * mm),  # fallback only; real 80mm uses dynamic height
    "A5": PAGE_A5,
    "A4": PAGE_A4,
}


def _measure_story_height(story: list, avail_width: float) -> float:
    """Suma la altura real de los flowables (para página térmica a medida).

    Nota: ``wrap()`` muta flowables — el caller debe construir un story fresco
    para ``doc.build`` después de medir.
    """
    total = 0.0
    for flowable in story:
        try:
            total += float(flowable.getSpaceBefore())
        except Exception:
            total += float(getattr(flowable, "spaceBefore", 0) or 0)
        try:
            _w, h = flowable.wrap(avail_width, 1e7)
            total += float(h)
        except Exception:
            total += 8
        try:
            total += float(flowable.getSpaceAfter())
        except Exception:
            total += float(getattr(flowable, "spaceAfter", 0) or 0)
    return total


def _as_box_margins(
    margin: float | tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Normalize to (left, right, top, bottom)."""
    if isinstance(margin, (tuple, list)) and len(margin) == 4:
        return float(margin[0]), float(margin[1]), float(margin[2]), float(margin[3])
    m = float(margin)
    return m, m, m, m


def _render_pdf_bytes(
    story: list | Callable[[], list],
    fmt: str,
    margin: float | tuple[float, float, float, float],
) -> bytes:
    """
    Renderiza el PDF. En 80mm la página tiene el alto del contenido (+ márgenes).

    ReportLab flowables are **single-use**: after ``doc.build`` (and after
    ``wrap`` in measurement) they must not be reused. Pass a zero-arg factory
    for 80mm so retries rebuild a fresh story — otherwise the PDF is empty
    (~1 KB) and browsers report «archivo dañado».
    """
    left_m, right_m, top_m, bottom_m = _as_box_margins(margin)

    def _fresh_story() -> list:
        if callable(story):
            return list(story())
        return story

    buf = io.BytesIO()
    if fmt == "80mm":
        measure_story = _fresh_story()
        usable_w = TICKET_WIDTH - left_m - right_m
        content_h = _measure_story_height(measure_story, usable_w)
        # +3 mm sobre la medida: wrap() de ReportLab subestima un poco.
        # Crecimiento por pasos fijos (no *1.35) evita tiques de ~A4 con hueco
        # y 2.ª «hoja» fantasma en la vista de impresión de Edge.
        page_h = max(55 * mm, content_h + top_m + bottom_m + 3.0 * mm)
        page_size = (TICKET_WIDTH, page_h)
        pdf_bytes = b""
        best_single: bytes | None = None

        for attempt in range(14):
            # Siempre story fresco: build consume flowables
            current = _fresh_story()
            buf = io.BytesIO()
            page_count = [0]

            def _count_page(canvas, doc):  # noqa: ARG001
                page_count[0] += 1

            doc = SimpleDocTemplate(
                buf,
                pagesize=page_size,
                leftMargin=left_m,
                rightMargin=right_m,
                topMargin=top_m,
                bottomMargin=bottom_m,
            )
            doc.build(current, onFirstPage=_count_page, onLaterPages=_count_page)
            pdf_bytes = buf.getvalue()
            buf.close()

            if page_count[0] <= 1 and len(pdf_bytes) >= 2500:
                # Primer ajuste que cabe: alto util sin bloat
                if best_single is None or len(pdf_bytes) <= len(best_single) + 2000:
                    best_single = pdf_bytes
                return pdf_bytes

            # Multisida: sobra poco (no multiplicar; sumar)
            page_h = min(page_h + (10 * mm if attempt < 6 else 18 * mm), 900 * mm)
            page_size = (TICKET_WIDTH, page_h)

            if not callable(story):
                break

        if best_single is not None:
            return best_single

        if len(pdf_bytes) < 2500:
            raise RuntimeError(
                "No se pudo generar el PDF del ticket 80mm (documento vacío). "
                "Reintente; si persiste, revise el logo de la clínica."
            )
        return pdf_bytes

    current = _fresh_story()
    page_size = FORMAT_DIMENSIONS[fmt]
    doc = SimpleDocTemplate(
        buf,
        pagesize=page_size,
        leftMargin=left_m,
        rightMargin=right_m,
        topMargin=top_m,
        bottomMargin=bottom_m,
    )
    doc.build(current)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes


def _build_styles(fmt: str) -> dict:
    """Build paragraph styles scaled to the format size."""
    if fmt == "80mm":
        title_sz, body_sz, small_sz, cell_sz = 11, 8, 6.5, 7
    elif fmt == "A5":
        title_sz, body_sz, small_sz, cell_sz = 14, 10, 8, 8
    else:
        title_sz, body_sz, small_sz, cell_sz = 16, 11, 9, 9

    return {
        "title": ParagraphStyle(
            "DocTitle",
            fontName="Helvetica-Bold",
            fontSize=title_sz,
            leading=title_sz + 3,
            alignment=1,
            spaceAfter=6,
            textColor=colors.HexColor("#0f172a"),
        ),
        "clinic_name": ParagraphStyle(
            "ClinicName",
            fontName="Helvetica-Bold",
            fontSize=body_sz + 1,
            leading=body_sz + 3,
            alignment=0,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=1,
        ),
        "clinic_meta": ParagraphStyle(
            "ClinicMeta",
            fontName="Helvetica",
            fontSize=small_sz,
            leading=small_sz + 2,
            alignment=0,
            textColor=colors.HexColor("#475569"),
            spaceAfter=1,
        ),
        "subtitle": ParagraphStyle(
            "DocSubtitle",
            fontName="Helvetica",
            fontSize=small_sz,
            leading=small_sz + 2,
            textColor=colors.HexColor("#64748b"),
            alignment=1,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "DocBody",
            fontName="Helvetica",
            fontSize=body_sz,
            leading=body_sz + 3,
            spaceAfter=4,
            textColor=colors.HexColor("#1e293b"),
        ),
        "body_justify": ParagraphStyle(
            "DocBodyJustify",
            fontName="Helvetica",
            fontSize=body_sz if fmt != "80mm" else max(7, body_sz - 0.5),
            leading=(body_sz if fmt != "80mm" else max(7, body_sz - 0.5)) + 4,
            spaceAfter=7,
            alignment=4,  # TA_JUSTIFY
            textColor=colors.HexColor("#1e293b"),
        ),
        "consent_title": ParagraphStyle(
            "ConsentTitle",
            fontName="Helvetica-Bold",
            fontSize=body_sz + 2 if fmt != "80mm" else body_sz + 1,
            leading=body_sz + 5,
            alignment=1,
            spaceAfter=10,
            spaceBefore=2,
            textColor=colors.HexColor("#0f172a"),
        ),
        "consent_meta": ParagraphStyle(
            "ConsentMeta",
            fontName="Helvetica",
            fontSize=small_sz,
            leading=small_sz + 2,
            alignment=1,
            spaceAfter=8,
            textColor=colors.HexColor("#64748b"),
        ),
        "body_right": ParagraphStyle(
            "DocBodyRight",
            fontName="Helvetica-Bold",
            fontSize=body_sz,
            leading=body_sz + 3,
            alignment=2,
            spaceAfter=4,
            textColor=colors.HexColor("#0f172a"),
        ),
        "small": ParagraphStyle(
            "DocSmall",
            fontName="Helvetica",
            fontSize=small_sz,
            leading=small_sz + 2,
            textColor=colors.HexColor("#64748b"),
            spaceAfter=2,
        ),
        "section": ParagraphStyle(
            "DocSection",
            fontName="Helvetica-Bold",
            fontSize=body_sz + 1,
            leading=body_sz + 4,
            spaceAfter=6,
            spaceBefore=4,
            textColor=colors.HexColor("#1c66e8"),
        ),
        "cell": ParagraphStyle(
            "DocCell",
            fontName="Helvetica",
            fontSize=cell_sz,
            leading=cell_sz + 3,
            textColor=colors.HexColor("#1e293b"),
        ),
        "cell_center": ParagraphStyle(
            "DocCellCenter",
            fontName="Helvetica",
            fontSize=cell_sz,
            leading=cell_sz + 3,
            alignment=1,
            textColor=colors.HexColor("#1e293b"),
        ),
        "cell_right": ParagraphStyle(
            "DocCellRight",
            fontName="Helvetica",
            fontSize=cell_sz,
            leading=cell_sz + 3,
            alignment=2,
            textColor=colors.HexColor("#1e293b"),
        ),
        "th": ParagraphStyle(
            "DocTh",
            fontName="Helvetica-Bold",
            fontSize=cell_sz,
            leading=cell_sz + 3,
            textColor=colors.white,
            alignment=1,
        ),
        "label": ParagraphStyle(
            "DocLabel",
            fontName="Helvetica",
            fontSize=small_sz,
            leading=small_sz + 2,
            textColor=colors.HexColor("#64748b"),
        ),
    }


def _safe_filename(text: str) -> str:
    """Sanitize text for Content-Disposition (ASCII-only; accents are not isalnum-safe across clients)."""
    return "".join(
        c if c.isascii() and (c.isalnum() or c in "-_") else "_" for c in text
    )[:60]


def _clinic_logo(fmt: str) -> RLImage | None:
    """Logo acotado (máx. 80×80 pt), alineado a la izquierda."""
    profile = get_clinic_profile()
    max_pt = 52.0 if fmt == "80mm" else (64.0 if fmt == "A5" else MAX_LOGO_PT)
    return logo_image(profile.logo_abs_path, max_pt=max_pt, h_align="LEFT")


def _append_document_header(story: list, styles: dict, fmt: str) -> None:
    """Cabecera profesional: logo izquierda + datos clínica (sin solapes)."""
    profile = get_clinic_profile()
    logo = _clinic_logo(fmt)
    name = strip_markdown_noise(profile.nombre_publico)
    contact = profile.linea_documento()
    meta_bits: list[str] = []
    if profile.eslogan:
        meta_bits.append(profile.eslogan)
    if profile.director_nombre:
        dir_line = profile.director_nombre
        if profile.cop_registro:
            dir_line += f" · COP {profile.cop_registro}"
        meta_bits.append(dir_line)

    info_flowables: list = [
        Paragraph(name, styles["clinic_name"]),
    ]
    if contact:
        info_flowables.append(Paragraph(contact, styles["clinic_meta"]))
    for bit in meta_bits:
        info_flowables.append(Paragraph(strip_markdown_noise(bit), styles["clinic_meta"]))

    if logo is not None:
        # Tabla 2 columnas: logo | datos (evita logo gigante centrado)
        page_w = TICKET_WIDTH if fmt == "80mm" else FORMAT_DIMENSIONS[fmt][0]
        margin = 2.5 * mm if fmt == "80mm" else (8 * mm if fmt == "A5" else 15 * mm)
        content_w = page_w - 2 * margin
        logo_col = min(MAX_LOGO_PT + 8, content_w * 0.28)
        info_col = content_w - logo_col
        header = Table(
            [[logo, info_flowables]],
            colWidths=[logo_col, info_col],
        )
        header.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (0, 0), 8),
                    ("RIGHTPADDING", (1, 0), (1, 0), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(header)
    else:
        story.append(Paragraph(name, styles["clinic_name"]))
        for f in info_flowables[1:]:
            story.append(f)

    story.append(Spacer(1, 4 if fmt == "80mm" else 8))
    # Separador
    from reportlab.platypus import HRFlowable

    story.append(
        HRFlowable(
            width="100%",
            thickness=0.8,
            color=colors.HexColor("#1c66e8"),
            spaceBefore=0,
            spaceAfter=6,
        )
    )


def generate_pdf(
    doc_type: str,
    fmt: str,
    data: dict[str, Any],
) -> tuple[bytes, str]:
    """
    Generate a PDF document. Returns (pdf_bytes, suggested_filename).

    Parameters:
        doc_type: comprobante | cierre_caja | ficha | evolucion | consentimiento | reporte
        fmt: 80mm | A5 | A4
        data: dict with all business data for the document
    """
    if fmt not in FORMAT_DIMENSIONS:
        fmt = "A4"

    # Margins scale with format
    if fmt == "80mm":
        # Comprobante: gutters laterales para cabezal térmico; top corto.
        margin: float | tuple[float, float, float, float] = (
            TICKET_MARGINS_COMPROBANTE if doc_type == "comprobante" else 4 * mm
        )
    elif fmt == "A5":
        margin = 8 * mm
    else:
        margin = 15 * mm

    page_w = TICKET_WIDTH if fmt == "80mm" else FORMAT_DIMENSIONS[fmt][0]
    left_m, right_m, _, _ = _as_box_margins(margin)
    styles = _build_styles(fmt)
    story: list = []
    type_labels = {
        "comprobante": "COMPROBANTE DE PAGO",
        "cierre_caja": "CIERRE DE CAJA",
        "ficha": "FICHA CLÍNICA",
        "evolucion": "REGISTRO DE EVOLUCIÓN",
        "consentimiento": "CONSENTIMIENTO INFORMADO",
        "reporte": "REPORTE",
        "presupuesto": "PRESUPUESTO DE TRATAMIENTO",
    }

    # Comprobante de caja: layout propio estilo boleta térmica (logo, serie, QR…)
    if doc_type == "comprobante":
        # Factory: ReportLab flowables are single-use (retries must rebuild).
        # Pass exact frame width (page − left − right) so tables and rules match.
        frame_w = page_w - left_m - right_m
        pdf_bytes = _render_pdf_bytes(
            lambda: build_comprobante_story(data, fmt, frame_w),
            fmt,
            margin,
        )
        serie = data.get("serie") or f"T{data.get('transaction_id', 0)}"
        patient_name = data.get("patient_nombre", "")
        fn = f"Comprobante_{_safe_filename(serie)}"
        if patient_name and patient_name not in ("—", "Clientes - Varios"):
            fn += f"_{_safe_filename(patient_name)}"
        fn += f"_{datetime.now().strftime('%d-%m-%Y')}.pdf"
        return pdf_bytes, fn

    # Header (common to all) — official logo + clinic contact
    _append_document_header(story, styles, fmt)

    # Consentimiento: título según origen (plan clínico o COP)
    if doc_type == "consentimiento" and data.get("consent_title"):
        story.append(Paragraph(str(data["consent_title"]), styles["consent_title"]))
        meta = data.get("consent_meta") or (
            "Texto normativo adaptado · Colegio Odontológico del Perú"
            if data.get("consent_origen") != "plan"
            else "Basado en el plan de tratamiento activo de la ficha clínica"
        )
        story.append(Paragraph(str(meta), styles["consent_meta"]))
    else:
        story.append(Paragraph(type_labels.get(doc_type, doc_type.upper()), styles["section"]))
        story.append(
            Paragraph(
                f"Fecha: {format_date_for_document(data.get('fecha') or datetime.now())}",
                styles["small"],
            )
        )
        story.append(Spacer(1, 6))

    # Dispatch to specific document builder
    if doc_type == "cierre_caja":
        _build_cierre_caja(story, data, styles, fmt)
    elif doc_type == "ficha":
        _build_ficha(story, data, styles, fmt)
    elif doc_type == "evolucion":
        _build_evolucion(story, data, styles, fmt)
    elif doc_type == "consentimiento":
        _build_consentimiento(story, data, styles, fmt)
    elif doc_type == "presupuesto":
        _build_presupuesto(story, data, styles, fmt)
    elif doc_type == "reporte":
        _build_reporte(story, data, styles, fmt)

    # Footer (no aplica a consentimientos informados — documento clínico/legal)
    if doc_type != "consentimiento":
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "Documento interno — no válido como comprobante tributario",
            styles["small"],
        ))

    pdf_bytes = _render_pdf_bytes(story, fmt, margin)

    patient_name = data.get("patient_nombre", "")
    if doc_type == "consentimiento":
        origen = data.get("consent_origen") or "cop"
        tipo_label = "plan" if origen == "plan" else (data.get("consent_tipo") or "general")
        fn_parts = ["Consentimiento", _safe_filename(str(tipo_label))]
    else:
        fn_parts = [type_labels.get(doc_type, doc_type)]
    if patient_name:
        fn_parts.append(_safe_filename(patient_name))
    fn_parts.append(datetime.now().strftime("%d-%m-%Y"))
    filename = "_".join(fn_parts) + ".pdf"

    return pdf_bytes, filename


def _build_table(rows: list[list], col_widths: list[float], styles: dict) -> Table:
    """Tabla profesional: celdas como Paragraph (evita texto fantasma / solapes)."""
    cell = styles["cell"]
    cell_c = styles["cell_center"]
    cell_r = styles["cell_right"]
    th = styles["th"]

    formatted: list[list] = []
    for r_idx, row in enumerate(rows):
        out_row = []
        for c_idx, value in enumerate(row):
            if r_idx == 0:
                style = th
            elif c_idx == 0:
                style = cell_c
            elif c_idx >= len(row) - 3 and len(row) >= 4:
                # Cantidad / montos / estado: centro o derecha
                style = cell_r if c_idx < len(row) - 1 else cell_c
            else:
                style = cell
            if isinstance(value, (Paragraph,)):
                out_row.append(value)
            else:
                out_row.append(cell_paragraph(value, style))
        formatted.append(out_row)

    t = Table(formatted, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c66e8")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ]
        )
    )
    return t


def _build_cierre_caja(story: list, data: dict, styles: dict, fmt: str):
    """Cash close summary."""
    page_w = FORMAT_DIMENSIONS[fmt][0]
    margin = 3 * mm if fmt == "80mm" else 15 * mm
    content_w = page_w - 2 * margin

    story.append(Paragraph(f"<b>Operador:</b> {data.get('usuario_nombre', '—')}", styles["body"]))
    story.append(Paragraph(f"Sesión #{data.get('session_id', '—')}", styles["small"]))
    story.append(Spacer(1, 6))

    rows = [
        ["Concepto", "Monto"],
        ["Monto inicial", f"S/ {data.get('monto_inicial', 0):.2f}"],
        ["Ingresos", f"S/ {data.get('ingresos', 0):.2f}"],
        ["Egresos", f"S/ {data.get('egresos', 0):.2f}"],
        ["Neto", f"S/ {data.get('neto', 0):.2f}"],
        ["Total esperado", f"S/ {data.get('total_esperado', 0):.2f}"],
        ["Monto contado", f"S/ {data.get('monto_contado', data.get('total_esperado', 0)):.2f}"],
        ["Diferencia", f"S/ {data.get('diferencia', 0):.2f}"],
    ]
    story.append(_build_table(rows, [content_w * 0.6, content_w * 0.4], styles))
    if data.get("cierre_notas"):
        story.append(Spacer(1, 4))
        story.append(
            Paragraph(f"<b>Notas:</b> {data.get('cierre_notas')}", styles["small"])
        )
    story.append(Spacer(1, 6))

    por_metodo = data.get("por_metodo", {})
    if por_metodo:
        story.append(Paragraph("Por método de pago:", styles["body"]))
        mt_rows = [["Método", "Total"]]
        for method, amount in por_metodo.items():
            mt_rows.append([method.capitalize(), f"S/ {amount:.2f}"])
        story.append(_build_table(mt_rows, [content_w * 0.6, content_w * 0.4], styles))


def _build_ficha(story: list, data: dict, styles: dict, fmt: str):
    """Clinical record."""
    p = data.get("patient", {})
    r = data.get("record", {})

    # Patient identification
    story.append(Paragraph(
        f"<b>Paciente:</b> {p.get('nombres', '')} {p.get('apellidos', '')}",
        styles["body"],
    ))
    nf = p.get("numero_ficha")
    try:
        nf_int = int(nf) if nf is not None and nf != "—" else None
    except (TypeError, ValueError):
        nf_int = None
    story.append(Paragraph(format_ficha_label(nf_int), styles["small"]))
    if p.get("numero_documento"):
        story.append(Paragraph(f"DNI: {p['numero_documento']}", styles["small"]))
    if p.get("fecha_nacimiento"):
        story.append(Paragraph(
            f"Fecha de nacimiento: {p['fecha_nacimiento']} (Edad: {p.get('edad', '—')})",
            styles["small"],
        ))
    extra = []
    for label in ("lugar_nacimiento", "ocupacion", "estado_civil", "nombre_responsable"):
        val = p.get(label)
        if val:
            extra.append(f"{label.replace('_', ' ').title()}: {val}")
    if extra:
        story.append(Paragraph(" · ".join(extra), styles["small"]))
    if p.get("telefono"):
        story.append(Paragraph(f"Teléfono: {p['telefono']}", styles["small"]))
    if p.get("email"):
        story.append(Paragraph(f"Email: {p['email']}", styles["small"]))
    if p.get("alergias"):
        story.append(Paragraph(f"<b>Alergias:</b> {p['alergias']}", styles["body"]))
    story.append(Spacer(1, 6))

    # Clinical sections in correct order
    sections = [
        ("Motivo de consulta", r.get("motivo_consulta")),
        ("Antecedentes médicos", r.get("antecedentes_medicos")),
        ("Antecedentes odontológicos", r.get("antecedentes_odontologicos")),
        ("Diagnóstico", r.get("diagnostico")),
    ]
    for title, content in sections:
        if content:
            story.append(Paragraph(title, styles["section"]))
            story.append(Paragraph(content, styles["body"]))
            story.append(Spacer(1, 4))

    # Plan de tratamiento (structured table)
    plan_raw = r.get("plan_tratamiento")
    plan_items = None
    if isinstance(plan_raw, str):
        try:
            import json
            plan_items = json.loads(plan_raw)
        except Exception:
            plan_items = plan_raw.split("\n") if plan_raw else []
    elif isinstance(plan_raw, list):
        plan_items = plan_raw

    if plan_items:
        story.append(Paragraph("Plan de tratamiento", styles["section"]))
        if isinstance(plan_items, list) and len(plan_items) > 0 and isinstance(plan_items[0], dict):
            page_w = FORMAT_DIMENSIONS[fmt][0]
            margin = 3 * mm if fmt == "80mm" else 15 * mm
            content_w = page_w - 2 * margin
            rows = [["Tratamiento", "Cantidad"]]
            for item in plan_items:
                rows.append([str(item.get("item", "")), str(item.get("cantidad", 1))])
            story.append(_build_table(rows, [content_w * 0.7, content_w * 0.3], styles))
        else:
            story.append(Paragraph(str(plan_items), styles["body"]))
        story.append(Spacer(1, 4))

    # Odontograma — resumen tabular (alternativa a raster SVG; ver ODONTOGRAMA_SPEC)
    odonto = data.get("odontogram") or []
    if odonto:
        story.append(Paragraph("Odontograma (hallazgos)", styles["section"]))
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 3 * mm if fmt == "80mm" else 15 * mm
        content_w = page_w - 2 * margin
        rows = [["Pieza", "Dentición", "Condición", "Superficies"]]
        for e in odonto:
            surfs = e.get("superficies") or {}
            marked = ", ".join(
                f"{k}:{v}" for k, v in surfs.items() if v and v != "sano"
            ) or "—"
            dent = e.get("denticion") or "permanente"
            dent_label = "Adulto" if dent == "permanente" else "Niño"
            rows.append([
                str(e.get("pieza_fdi", "")),
                dent_label,
                str(e.get("estado", "sano") or "—"),
                marked,
            ])
        story.append(
            _build_table(
                rows,
                [content_w * 0.15, content_w * 0.18, content_w * 0.32, content_w * 0.35],
                styles,
            )
        )
        story.append(Spacer(1, 4))

    # Observaciones
    if r.get("observaciones"):
        story.append(Paragraph("Observaciones", styles["section"]))
        story.append(Paragraph(r["observaciones"], styles["body"]))
        story.append(Spacer(1, 4))

    fin = data.get("financial", {})
    if fin:
        story.append(Paragraph("Resumen financiero", styles["section"]))
        story.append(Paragraph(
            f"Costo total: S/ {fin.get('costo_total', 0):.2f} · "
            f"Pagado: S/ {fin.get('pagado_total', 0):.2f} · "
            f"Saldo: S/ {fin.get('saldo', 0):.2f}",
            styles["body"],
        ))

    if r.get("consentimiento_firmado"):
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            f"Consentimiento informado firmado el {r.get('consentimiento_fecha', '—')}",
            styles["small"],
        ))


def _build_evolucion(story: list, data: dict, styles: dict, fmt: str):
    """Evolution entry."""
    e = data.get("entry", {})
    p = data.get("patient_nombre", "—")

    story.append(Paragraph(f"<b>Paciente:</b> {p}", styles["body"]))
    story.append(Paragraph(f"Fecha: {e.get('fecha', '—')}", styles["small"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Tratamiento", styles["section"]))
    story.append(Paragraph(e.get("tratamiento_descripcion", "—"), styles["body"]))

    if e.get("especialidad"):
        story.append(Paragraph(f"Especialidad: {e['especialidad']}", styles["small"]))

    story.append(Paragraph(
        f"Costo: S/ {e.get('costo', 0):.2f} · A cuenta: S/ {e.get('a_cuenta', 0):.2f} · Estado: {e.get('estado', '—')}",
        styles["body"],
    ))


def _spanish_long_date(dt: datetime | None = None) -> str:
    months = (
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    )
    d = dt or datetime.now()
    return f"{d.day} de {months[d.month - 1]} de {d.year}"


def _consent_place_and_date(profile) -> str:
    """Fecha y lugar del consentimiento: solo distrito desde Configuración."""
    place = (getattr(profile, "lugar_emision", None) or "").strip()
    date_txt = _spanish_long_date()
    if place:
        return f"En {_escape_xml(place)}, a {date_txt}."
    return f"En ________________, a {date_txt}."


def _escape_xml(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _fill_consent_official_body(
    body: str,
    *,
    doctor_name: str,
    patient_name: str,
    procedure_label: str = "",
) -> str:
    """Rellena blancos tipográficos del texto COP con datos reales."""
    import re

    text = (body or "").replace("[Título de la barra lateral]", "")
    text = re.sub(r"[ \t]+", " ", text)

    def _sub_blank(match: re.Match[str], value: str) -> str:
        return f" {value.strip()} "

    # Primeros blancos tras mención del profesional → odontólogo emisor
    text, n = re.subn(
        r"(Cirujano\s*[-–]?\s*Dentista|Odont[oó]logo/?Estomat[oó]logo|Odont[oó]logo|"
        r"cirujano abajo firmante|doctor)\s*_{3,}",
        lambda m: f"{m.group(1)} {doctor_name}",
        text,
        count=2,
        flags=re.IGNORECASE,
    )
    if n == 0:
        text = re.sub(
            r"_{3,}",
            lambda m: _sub_blank(m, doctor_name),
            text,
            count=1,
        )

    # Blancos restantes: paciente / procedimiento / observaciones manuscritas
    remaining = list(
        filter(
            None,
            [
                patient_name,
                procedure_label,
                "____________________",
            ],
        )
    )
    for value in remaining:
        if "___" not in text:
            break
        text = re.sub(r"_{3,}", lambda m, v=value: _sub_blank(m, v), text, count=1)

    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def _consent_patient_doctor_block(
    story: list,
    styles: dict,
    *,
    patient_name: str,
    dni: str,
    address: str,
    doctor_name: str,
    cop: str,
) -> None:
    id_line = (
        f"<b>Paciente:</b> {_escape_xml(patient_name)} · "
        f"<b>DNI:</b> {_escape_xml(dni)} · "
        f"<b>Domicilio:</b> {_escape_xml(address)}"
    )
    story.append(Paragraph(id_line, styles["body"]))
    doc_line = f"<b>Odontólogo que emite:</b> Dr(a). {_escape_xml(doctor_name)}"
    if cop:
        doc_line += f" · COP {_escape_xml(cop)}"
    story.append(Paragraph(doc_line, styles["small"]))
    story.append(Spacer(1, 8))


def _consent_signature_block(
    story: list,
    styles: dict,
    fmt: str,
    *,
    patient_name: str,
    dni: str,
    doctor_name: str,
    cop: str,
    consentimiento_fecha: str | None = None,
) -> None:
    story.append(Spacer(1, 10))
    story.append(Paragraph(_consent_place_and_date(get_clinic_profile()), styles["body"]))
    story.append(Spacer(1, 14))

    if fmt == "80mm":
        story.append(Paragraph(f"Paciente: {patient_name}", styles["small"]))
        story.append(Paragraph("Firma: ____________________", styles["body"]))
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"Odontólogo: Dr(a). {doctor_name}", styles["small"]))
        if cop:
            story.append(Paragraph(f"COP: {cop}", styles["small"]))
        story.append(Paragraph("Firma: ____________________", styles["body"]))
    else:
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 8 * mm if fmt == "A5" else 15 * mm
        col = (page_w - 2 * margin - 8 * mm) / 2
        left = [
            Paragraph("<b>El paciente / representante legal</b>", styles["small"]),
            Spacer(1, 22),
            Paragraph("_______________________________", styles["body"]),
            Paragraph(_escape_xml(patient_name), styles["small"]),
            Paragraph(f"DNI {_escape_xml(dni)}", styles["small"]),
        ]
        right = [
            Paragraph("<b>El odontólogo / estomatólogo</b>", styles["small"]),
            Spacer(1, 22),
            Paragraph("_______________________________", styles["body"]),
            Paragraph(f"Dr(a). {_escape_xml(doctor_name)}", styles["small"]),
        ]
        if cop:
            right.append(Paragraph(f"COP {_escape_xml(cop)}", styles["small"]))
        sig = Table([[left, right]], colWidths=[col, col])
        sig.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(sig)

    if consentimiento_fecha:
        story.append(Spacer(1, 8))
        story.append(
            Paragraph(f"Registro en sistema: {consentimiento_fecha}", styles["small"])
        )


def _build_consentimiento_plan(story: list, data: dict, styles: dict, fmt: str) -> None:
    """Consentimiento clínico generado desde el plan de tratamiento activo."""
    p = data.get("patient") or {}
    doctor = data.get("doctor") or {}
    profile = get_clinic_profile()

    patient_name = f"{p.get('nombres', '')} {p.get('apellidos', '')}".strip() or "________________"
    dni = str(p.get("numero_documento") or "____________")
    address = str(p.get("direccion") or "").strip() or "________________________________"
    doctor_name = str(doctor.get("nombre") or profile.director_nombre or "________________").strip()
    cop = str(doctor.get("cop") or profile.cop_registro or "").strip()
    diagnostico = str(data.get("diagnostico") or "").strip()

    _consent_patient_doctor_block(
        story,
        styles,
        patient_name=patient_name,
        dni=dni,
        address=address,
        doctor_name=doctor_name,
        cop=cop,
    )

    body = (
        f"Yo, <b>{_escape_xml(patient_name)}</b>, identificado(a) con DNI "
        f"<b>{_escape_xml(dni)}</b>, declaro que he sido informado(a) sobre mi "
        f"diagnóstico odontológico"
    )
    if diagnostico:
        body += f" (<i>{_escape_xml(diagnostico)}</i>)"
    body += (
        f" y el plan de tratamiento propuesto por el/la Dr.(a) "
        f"<b>{_escape_xml(doctor_name)}</b>. He comprendido los beneficios, riesgos "
        f"y alternativas del tratamiento, así como las consecuencias de no recibirlo. "
        f"Autorizo al profesional mencionado a realizar los procedimientos necesarios "
        f"para mi atención odontológica, conforme al plan que se detalla a continuación."
    )
    story.append(Paragraph(body, styles["body_justify"]))
    story.append(Spacer(1, 8))

    items = data.get("plan_items") or []
    if items:
        story.append(Paragraph("<b>Plan de tratamiento aceptado</b>", styles["body"]))
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 8 * mm if fmt == "A5" else 15 * mm
        if fmt == "80mm":
            margin = 3 * mm
        content_w = page_w - 2 * margin
        widths = [content_w * 0.18, content_w * 0.52, content_w * 0.30]
        rows: list[list] = [["Pieza", "Tratamiento", "Estado"]]
        for it in items:
            pieza = str(it.get("pieza_fdi") or "—")
            label = clean_treatment_label(
                it.get("item"),
                pieza_fdi=pieza if pieza != "—" else None,
            )
            estado = strip_markdown_noise(str(it.get("estado") or "pendiente"))
            rows.append([pieza, label, estado])
        story.append(_build_table(rows, widths, styles))
    else:
        story.append(
            Paragraph(
                "No hay ítems activos en el plan de tratamiento al momento de emitir "
                "este documento. El consentimiento cubre el diagnóstico y el plan "
                "clínico que el odontólogo explique verbalmente.",
                styles["body_justify"],
            )
        )

    _consent_signature_block(
        story,
        styles,
        fmt,
        patient_name=patient_name,
        dni=dni,
        doctor_name=doctor_name,
        cop=cop,
        consentimiento_fecha=data.get("consentimiento_fecha"),
    )


def _build_consentimiento_cop(story: list, data: dict, styles: dict, fmt: str) -> None:
    """Consentimiento oficial COP + membrete de clínica + datos reales."""
    from app.services.consent_official_templates import get_consent_template

    tpl = get_consent_template(data.get("consent_tipo"))
    p = data.get("patient") or {}
    doctor = data.get("doctor") or {}
    profile = get_clinic_profile()

    patient_name = f"{p.get('nombres', '')} {p.get('apellidos', '')}".strip() or "________________"
    dni = str(p.get("numero_documento") or "____________")
    address = str(p.get("direccion") or "").strip() or "________________________________"
    doctor_name = str(doctor.get("nombre") or profile.director_nombre or "________________").strip()
    cop = str(doctor.get("cop") or profile.cop_registro or "").strip()
    label = str(tpl.get("label") or "")

    _consent_patient_doctor_block(
        story,
        styles,
        patient_name=patient_name,
        dni=dni,
        address=address,
        doctor_name=doctor_name,
        cop=cop,
    )

    filled = _fill_consent_official_body(
        tpl.get("body") or "",
        doctor_name=doctor_name,
        patient_name=patient_name,
        procedure_label=label,
    )
    for para in filled.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        story.append(Paragraph(_escape_xml(para), styles["body_justify"]))

    _consent_signature_block(
        story,
        styles,
        fmt,
        patient_name=patient_name,
        dni=dni,
        doctor_name=doctor_name,
        cop=cop,
        consentimiento_fecha=data.get("consentimiento_fecha"),
    )


def _build_consentimiento(story: list, data: dict, styles: dict, fmt: str):
    """Despacha consentimiento por plan clínico u oficial COP."""
    if (data.get("consent_origen") or "cop") == "plan":
        _build_consentimiento_plan(story, data, styles, fmt)
    else:
        _build_consentimiento_cop(story, data, styles, fmt)


def _build_presupuesto(story: list, data: dict, styles: dict, fmt: str):
    """Presupuesto exportable (plan de tratamiento alternativo)."""
    p = data.get("patient", {})
    story.append(
        Paragraph(
            f"<b>Paciente:</b> {p.get('nombres', '')} {p.get('apellidos', '')} · "
            f"Ficha {p.get('numero_ficha', '—')}",
            styles["body"],
        )
    )
    story.append(
        Paragraph(
            f"Plan: {strip_markdown_noise(str(data.get('plan_nombre', 'Plan A')))}",
            styles["body"],
        )
    )
    story.append(Spacer(1, 6))
    items = data.get("items") or []
    page_w = FORMAT_DIMENSIONS[fmt][0]
    margin = 3 * mm if fmt == "80mm" else (8 * mm if fmt == "A5" else 15 * mm)
    content_w = page_w - 2 * margin

    # Anchos que evitan colisión Subtotal|Estado
    widths = [
        content_w * 0.09,
        content_w * 0.34,
        content_w * 0.09,
        content_w * 0.16,
        content_w * 0.16,
        content_w * 0.16,
    ]
    rows: list[list] = [
        ["Pieza", "Tratamiento", "Cant.", "Costo unit.", "Subtotal", "Estado"]
    ]
    total = 0.0
    for it in items:
        cant = as_float(it.get("cantidad"), 1.0) or 1.0
        unit = as_float(it.get("costo_unitario"), 0.0)
        sub = cant * unit
        total += sub
        pieza = str(it.get("pieza_fdi") or "—")
        label = clean_treatment_label(it.get("item"), pieza_fdi=pieza if pieza != "—" else None)
        estado = strip_markdown_noise(str(it.get("estado") or "pendiente"))
        rows.append(
            [
                pieza,
                label,
                str(int(cant) if cant == int(cant) else cant),
                format_price_plain(unit),
                format_price_plain(sub),
                estado,
            ]
        )

    story.append(_build_table(rows, widths, styles))
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            f"Total presupuesto: {format_price_plain(total)}",
            styles["body_right"],
        )
    )
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "Este presupuesto es referencial. Al firmar el consentimiento informado "
            "el paciente acepta el plan activo vinculado.",
            styles["small"],
        )
    )


def _esc_pdf(text: object) -> str:
    return (
        str(text if text is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _build_reporte(story: list, data: dict, styles: dict, fmt: str):
    """Professional multi-module report layout."""
    from reportlab.lib import colors
    from reportlab.platypus import Table as RLTable, TableStyle as RLTableStyle

    title = data.get("title", "Reporte")
    story.append(Paragraph(_esc_pdf(title), styles["section"]))
    story.append(
        Paragraph(
            f"Período: {data.get('fecha_inicio', '—')} — {data.get('fecha_fin', '—')}",
            styles["small"],
        )
    )
    story.append(Spacer(1, 8))

    summary = data.get("summary", {}) or {}
    if summary:
        story.append(Paragraph("<b>Resumen</b>", styles["body"]))
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 3 * mm if fmt == "80mm" else (8 * mm if fmt == "A5" else 15 * mm)
        content_w = page_w - 2 * margin
        sum_rows = [[str(k), str(v)] for k, v in summary.items()]
        sum_table = RLTable(sum_rows, colWidths=[content_w * 0.55, content_w * 0.45])
        sum_table.setStyle(
            RLTableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8 if fmt == "80mm" else 9),
                    ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#475569")),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#e2e8f0")),
                ]
            )
        )
        story.append(sum_table)
        story.append(Spacer(1, 10))

    rows = data.get("rows", []) or []
    if len(rows) > 1:
        story.append(Paragraph("<b>Detalle</b>", styles["body"]))
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 3 * mm if fmt == "80mm" else (8 * mm if fmt == "A5" else 15 * mm)
        content_w = page_w - 2 * margin
        n_cols = max(1, len(rows[0]))
        # Prefer wider first text columns
        if n_cols <= 3:
            widths = [content_w / n_cols] * n_cols
        else:
            weights = [1.1] + [1.0] * (n_cols - 2) + [0.9]
            total_w = sum(weights)
            widths = [content_w * (w / total_w) for w in weights]
        story.append(Spacer(1, 4))
        story.append(_build_table(rows, widths, styles))
    elif rows:
        story.append(Paragraph("Sin movimientos en el período seleccionado.", styles["small"]))
