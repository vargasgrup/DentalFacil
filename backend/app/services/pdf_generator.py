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
from typing import Any

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

# Ticket térmico: ancho fijo 80mm. La altura se calcula al contenido
# (evita página de 400mm que Chrome escala al imprimir en 80×200 y achica todo).
TICKET_WIDTH = 80 * mm
PAGE_A5 = A5
PAGE_A4 = A4

FORMAT_DIMENSIONS = {
    "80mm": (TICKET_WIDTH, 297 * mm),  # fallback only; real 80mm uses dynamic height
    "A5": PAGE_A5,
    "A4": PAGE_A4,
}


def _measure_story_height(story: list, avail_width: float) -> float:
    """Suma la altura real de los flowables (para página térmica a medida)."""
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


def _render_pdf_bytes(story: list, fmt: str, margin: float) -> bytes:
    """
    Renderiza el PDF. En formato 80mm la página tiene exactamente
    el alto del contenido (+ márgenes), a escala 1:1 para tiquetera.
    Garantiza una sola página (evita que el pie pase a hoja 2).
    """
    buf = io.BytesIO()
    if fmt == "80mm":
        usable_w = TICKET_WIDTH - 2 * margin
        content_h = _measure_story_height(story, usable_w)
        # wrap() suele subestimar Paragraph/Table/Image → padding moderado
        page_h = max(60 * mm, content_h + 2 * margin + 8 * mm)
        page_size = (TICKET_WIDTH, page_h)

        # Reintentos si ReportLab aún parte a 2ª página
        for _ in range(4):
            buf = io.BytesIO()
            page_count = [0]

            def _count_page(canvas, doc):  # noqa: ARG001
                page_count[0] += 1

            doc = SimpleDocTemplate(
                buf,
                pagesize=page_size,
                leftMargin=margin,
                rightMargin=margin,
                topMargin=margin,
                bottomMargin=margin,
            )
            doc.build(story, onFirstPage=_count_page, onLaterPages=_count_page)
            if page_count[0] <= 1:
                break
            page_h = min(page_h * 1.35, 2000 * mm)
            page_size = (TICKET_WIDTH, page_h)

        pdf_bytes = buf.getvalue()
        buf.close()
        return pdf_bytes

    page_size = FORMAT_DIMENSIONS[fmt]
    doc = SimpleDocTemplate(
        buf,
        pagesize=page_size,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )
    doc.build(story)
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
        # Papel 80mm / área útil ~72–76mm en TSP700II: márgenes mínimos
        margin = 1.5 * mm
    elif fmt == "A5":
        margin = 8 * mm
    else:
        margin = 15 * mm

    page_w = TICKET_WIDTH if fmt == "80mm" else FORMAT_DIMENSIONS[fmt][0]
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
        story.extend(build_comprobante_story(data, fmt, page_w, margin))
        pdf_bytes = _render_pdf_bytes(story, fmt, margin)
        serie = data.get("serie") or f"T{data.get('transaction_id', 0)}"
        patient_name = data.get("patient_nombre", "")
        fn = f"Comprobante_{_safe_filename(serie)}"
        if patient_name and patient_name not in ("—", "Clientes - Varios"):
            fn += f"_{_safe_filename(patient_name)}"
        fn += f"_{datetime.now().strftime('%d-%m-%Y')}.pdf"
        return pdf_bytes, fn

    # Header (common to all) — official logo + clinic contact
    _append_document_header(story, styles, fmt)

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

    # Footer
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Documento interno — no válido como comprobante tributario",
        styles["small"],
    ))

    pdf_bytes = _render_pdf_bytes(story, fmt, margin)

    patient_name = data.get("patient_nombre", "")
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
        ["Total en caja", f"S/ {data.get('total_esperado', 0):.2f}"],
    ]
    story.append(_build_table(rows, [content_w * 0.6, content_w * 0.4], styles))
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


def _build_consentimiento(story: list, data: dict, styles: dict, fmt: str):
    """Informed consent."""
    p = data.get("patient", {})
    story.append(Paragraph(f"<b>Paciente:</b> {p.get('nombres', '')} {p.get('apellidos', '')}", styles["body"]))
    story.append(Paragraph(f"DNI: {p.get('numero_documento', '—')}", styles["small"]))
    story.append(Spacer(1, 8))

    consent_text = (
        "Por medio de la presente, el paciente manifiesta su consentimiento informado "
        "para someterse al tratamiento odontológico descrito en el plan de tratamiento "
        "vinculado a continuación. El odontólogo ha explicado el procedimiento, sus riesgos, "
        "beneficios y alternativas. El paciente declara haber entendido la información "
        "y acepta voluntariamente el tratamiento propuesto."
    )
    story.append(Paragraph(consent_text, styles["body"]))
    story.append(Spacer(1, 8))

    plan_items = data.get("plan_items") or []
    if plan_items:
        story.append(Paragraph("Plan de tratamiento vinculado", styles["section"]))
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 3 * mm if fmt == "80mm" else 15 * mm
        content_w = page_w - 2 * margin
        rows = [["Pieza", "Tratamiento", "Estado", "Subtotal"]]
        for it in plan_items:
            cant = as_float(it.get("cantidad"), 1.0) or 1.0
            unit = as_float(it.get("costo_unitario"), 0.0)
            pieza = str(it.get("pieza_fdi") or "—")
            rows.append([
                pieza,
                clean_treatment_label(it.get("item"), pieza_fdi=pieza if pieza != "—" else None),
                strip_markdown_noise(str(it.get("estado") or "pendiente")),
                format_price_plain(cant * unit),
            ])
        story.append(
            _build_table(rows, [content_w * 0.15, content_w * 0.45, content_w * 0.2, content_w * 0.2], styles)
        )
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 12))

    if fmt == "80mm":
        story.append(Paragraph("Firma del paciente: _______________", styles["body"]))
        story.append(Spacer(1, 8))
        story.append(Paragraph("Firma del odontólogo: _____________", styles["body"]))
    else:
        story.append(Paragraph(
            "<br/><br/>________________________<br/>Firma del paciente",
            styles["body"],
        ))
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            "<br/><br/>________________________<br/>Firma del odontólogo",
            styles["body"],
        ))

    if data.get("consentimiento_fecha"):
        story.append(Paragraph(
            f"Consentimiento registrado el: {data['consentimiento_fecha']}",
            styles["small"],
        ))


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


def _build_reporte(story: list, data: dict, styles: dict, fmt: str):
    """Report (used by Phase 9 reports)."""
    title = data.get("title", "Reporte")
    story.append(Paragraph(title, styles["section"]))
    story.append(Paragraph(
        f"Período: {data.get('fecha_inicio', '—')} a {data.get('fecha_fin', '—')}",
        styles["small"],
    ))
    story.append(Spacer(1, 6))

    # Summary
    summary = data.get("summary", {})
    for label, value in summary.items():
        story.append(Paragraph(f"<b>{label}:</b> {value}", styles["body"]))

    # Table data
    rows = data.get("rows", [])
    if rows:
        page_w = FORMAT_DIMENSIONS[fmt][0]
        margin = 3 * mm if fmt == "80mm" else 15 * mm
        content_w = page_w - 2 * margin
        n_cols = len(rows[0]) if rows else 1
        col_w = content_w / n_cols
        story.append(Spacer(1, 6))
        story.append(_build_table(rows, [col_w] * n_cols, styles))
