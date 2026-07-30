"""One-shot: build consent_official_templates.py from extracted COP texts."""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(__file__).resolve().parent / "_extract_consents_tmp"
OUT = Path(__file__).resolve().parents[1] / "app" / "services" / "consent_official_templates.py"

SLUG_MAP = {
    "Apicectomia": ("apicectomia", "Apicectomía"),
    "Caninos Retenidos": ("caninos_retenidos", "Caninos retenidos"),
    "Cirugia Apical": ("cirugia_apical", "Cirugía apical"),
    "Cirugia Bucal Menor": ("cirugia_bucal_menor", "Cirugía bucal menor"),
    "Cirugia Ortognatica": ("cirugia_ortognatica", "Cirugía ortognática"),
    "Cirugia Tercera Molar": ("cirugia_tercera_molar", "Cirugía de tercera molar"),
    "Endodoncia": ("endodoncia", "Endodoncia"),
    "Exodoncia Simple": ("exodoncia_simple", "Exodoncia simple"),
    "Implantes": ("implantes", "Implantes dentales"),
    "Operatoria": ("operatoria", "Operatoria dental"),
    "Ortodoncia": ("ortodoncia", "Ortodoncia"),
    "Periodoncia": ("periodoncia", "Periodoncia"),
    "Protesis Fija": ("protesis_fija", "Prótesis fija"),
    "Rehabilitacion Oral": ("rehabilitacion_oral", "Rehabilitación oral"),
    "Tercera Molar": ("tercera_molar", "Tercera molar"),
}

OCR_FIXES = [
    ("anes tesia", "anestesia"),
    ("ane stesia", "anestesia"),
    ("ta mbién", "también"),
    ("síncop e", "síncope"),
    ("CONSENTIMIENDO", "CONSENTIMIENTO"),
    ("representa nte", "representante"),
    ("ortod óntico", "ortodóntico"),
    ("neces idad", "necesidad"),
    ("potencialm ente", "potencialmente"),
    ("extre mos", "extremos"),
    ("personal es", "personales"),
    ("per sonales", "personales"),
    ("mayor de e dad", "mayor de edad"),
    ("cari osas", "cariosas"),
    ("revisado  para", "revisado para"),
    ("qued e", "quede"),
    ("pued en", "pueden"),
    ("desaparecerán dos", "desaparecerán en dos"),
    ("exp licado", "explicado"),
    ("expl icado", "explicado"),
    ("facultati vo", "facultativo"),
    ("m edidas", "medidas"),
    ("u legrado", "un legrado"),
    ("revoc ar", "revocar"),
    ("trata miento", "tratamiento"),
    ("extracció n", "extracción"),
    ("presió n", "presión"),
    ("procedim iento", "procedimiento"),
    ("m axilar", "maxilar"),
    ("gr aves", "graves"),
    ("d el", "del"),
    ("expl icado", "explicado"),
    ("rea lización", "realización"),
    ("colocació n", "colocación"),
    ("d e cuyos", "de cuyos"),
    ("ane stesia", "anestesia"),
    ("sobre doto", "sobre todo"),
    ("dol or", "dolor"),
    ("frági l", "frágil"),
    ("adve rtido", "advertido"),
    ("ti enda", "tienda"),
    ("posibi lidad", "posibilidad"),
    ("complica ciones", "complicaciones"),
    ("PARALA ", "PARA LA "),
    ("PARAEXODONCIA", "PARA EXODONCIA"),
    ("[Título de la barra lateral]", ""),
]

# Palabras cortas que no deben unirse al token anterior (español)
_STOP_JOIN = {
    "a", "al", "de", "del", "el", "en", "es", "ha", "he", "la", "las", "le", "lo",
    "los", "me", "mi", "no", "ni", "o", "os", "se", "si", "su", "te", "tu", "un",
    "una", "y", "ya", "yo", "por", "para", "con", "sin", "que", "como", "más",
    "muy", "esto", "esta", "este", "esa", "ese", "así", "aún", "ser", "son",
    "mis", "sus", "nos", "les", "van", "voy", "han", "han", "una", "unos",
}


def _join_ocr_word_splits(text: str) -> str:
    """Une solo fragmentos OCR claros (p. ej. 'exp licado'), sin pegar palabras reales."""
    tokens = text.split()
    i = 0
    while i < len(tokens) - 1:
        a, b = tokens[i], tokens[i + 1]
        bl = b.lower().strip(".,;:()[]")
        # Solo unir partículas de 1–2 letras (típico de OCR: "m e", "q ue" ya filtrado)
        # o 3 letras si el prefijo parece truncado (< 4 chars)
        if (
            len(bl) <= 2
            and bl not in _STOP_JOIN
            and len(a) >= 2
            and a[-1].isalpha()
            and a[-1].islower()
            and b[0].isalpha()
            and b[0].islower()
            and not a.endswith((".", ",", ";", ":"))
        ):
            tokens[i] = a + b
            del tokens[i + 1]
            continue
        if (
            len(bl) == 3
            and len(a) <= 4
            and bl not in _STOP_JOIN
            and a[-1].islower()
            and b[0].islower()
            and not a.endswith((".", ",", ";", ":"))
        ):
            tokens[i] = a + b
            del tokens[i + 1]
            continue
        i += 1
    return " ".join(tokens)


def clean_body(raw: str) -> str:
    t = raw.replace("\u00a0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = t.replace("[Título de la barra lateral]", "")
    m = re.search(r"\bDECLARO\b", t, re.I)
    if m:
        t = t[m.start() :]
    t = re.split(r"\nEn Lima,\s*a\s*\.+", t, maxsplit=1, flags=re.I)[0]
    t = re.split(r"\nEl Paciente o\b", t, maxsplit=1, flags=re.I)[0]
    t = re.split(r"\nEl Odont[oó]logo\b", t, maxsplit=1, flags=re.I)[0]
    t = re.sub(r"\n(?=\d[\.\-])", "\n\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    paras: list[str] = []
    for block in re.split(r"\n\n+", t.strip()):
        block = re.sub(r"\n", " ", block)
        block = re.sub(r" {2,}", " ", block).strip()
        for a, b in OCR_FIXES:
            block = block.replace(a, b)
        block = re.sub(r"\s+", " ", block).strip()
        # Normalizar blancos tipográficos a marcador uniforme
        block = re.sub(r"[.…_]{5,}", " ________ ", block)
        block = re.sub(r" {2,}", " ", block).strip()
        if block and block not in ("________",):
            paras.append(block)
    return "\n\n".join(paras)


def main() -> None:
    templates: list[dict[str, str]] = []
    for stem, (slug, label) in SLUG_MAP.items():
        path = SRC / f"{stem}.txt"
        raw = path.read_text(encoding="utf-8")
        title_m = re.search(r"CONSENTIMIENTO INFORMADO[^\n]*", raw, re.I)
        title = title_m.group(0).strip() if title_m else f"CONSENTIMIENTO INFORMADO PARA {label.upper()}"
        title = re.sub(r"\s+", " ", title).upper()
        # Normalizar acentos combinados (NFC) y títulos truncados conocidos
        import unicodedata

        title = unicodedata.normalize("NFC", title)
        TITLE_FIXES = {
            "cirugia_apical": "CONSENTIMIENTO INFORMADO PARA LA REALIZACIÓN DE CIRUGÍA APICAL",
            "cirugia_tercera_molar": "CONSENTIMIENTO INFORMADO PARA EXODONCIA QUIRÚRGICA DE TERCEROS MOLARES",
            "tercera_molar": "CONSENTIMIENTO INFORMADO PARA LA EXODONCIA DE LA TERCERA MOLAR",
            "cirugia_ortognatica": "CONSENTIMIENTO INFORMADO PARA LA CIRUGÍA ORTOGNÁTICA O DE LAS DEFORMIDADES",
        }
        if slug in TITLE_FIXES:
            title = TITLE_FIXES[slug]
        body = clean_body(raw)
        body = unicodedata.normalize("NFC", body)
        templates.append({"id": slug, "label": label, "title": title, "body": body})
        print(f"{slug}: {len(body)} chars")

    chunks: list[str] = [
        '"""Textos oficiales de Consentimiento Informado (Colegio Odontológico del Perú).',
        "",
        "Solo el cuerpo normativo; membrete, paciente y odontólogo se inyectan al generar el PDF.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "from typing import TypedDict",
        "",
        "",
        "class ConsentTemplate(TypedDict):",
        "    id: str",
        "    label: str",
        "    title: str",
        "    body: str",
        "",
        "",
        "CONSENT_TEMPLATES: list[ConsentTemplate] = [",
    ]
    for t in templates:
        chunks.append("    {")
        chunks.append(f"        \"id\": {t['id']!r},")
        chunks.append(f"        \"label\": {t['label']!r},")
        chunks.append(f"        \"title\": {t['title']!r},")
        chunks.append(f"        \"body\": {t['body']!r},")
        chunks.append("    },")
    chunks.append("]")
    chunks.append("")
    chunks.append("")
    chunks.append("_BY_ID = {t['id']: t for t in CONSENT_TEMPLATES}")
    chunks.append("")
    chunks.append("")
    chunks.append("def list_consent_templates() -> list[ConsentTemplate]:")
    chunks.append("    return list(CONSENT_TEMPLATES)")
    chunks.append("")
    chunks.append("")
    chunks.append("def get_consent_template(template_id: str | None) -> ConsentTemplate:")
    chunks.append("    if template_id and template_id in _BY_ID:")
    chunks.append("        return _BY_ID[template_id]")
    chunks.append("    # Default clínico general: endodoncia como plantilla base frecuente")
    chunks.append("    return _BY_ID.get('exodoncia_simple') or CONSENT_TEMPLATES[0]")
    chunks.append("")

    OUT.write_text("\n".join(chunks), encoding="utf-8")
    print("wrote", OUT, "templates", len(templates))


if __name__ == "__main__":
    main()
