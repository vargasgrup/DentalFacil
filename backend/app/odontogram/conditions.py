"""Catálogo del odontograma — referencia + patologías ampliadas (Fase 2).

34 condiciones de la grilla de referencia + patologías clínicas adicionales.
Convención: rojo = patología / requiere tratamiento; azul = realizado / existente.
"""

from typing import Literal, TypedDict


class ConditionDef(TypedDict):
    id: str
    label: str
    color: str
    symbol: str | None
    convention: Literal["rojo", "azul", "neutro"]


# Grilla 6×6 de referencia (orden exacto)
ODONTOGRAM_CONDITIONS: list[ConditionDef] = [
    {"id": "caries", "label": "Caries", "color": "#ef4444", "symbol": None, "convention": "rojo"},
    {"id": "corona", "label": "Corona", "color": "#3b82f6", "symbol": None, "convention": "azul"},
    {"id": "corona_temp", "label": "Corona (Temp.)", "color": "#60a5fa", "symbol": None, "convention": "azul"},
    {"id": "ausente", "label": "Ausente", "color": "#94a3b8", "symbol": "x", "convention": "neutro"},
    {"id": "fractura", "label": "Fractura", "color": "#dc2626", "symbol": "lines", "convention": "rojo"},
    {"id": "diastema", "label": "Diastema", "color": "#fde68a", "symbol": None, "convention": "neutro"},
    {"id": "obturacion", "label": "Obturación", "color": "#2563eb", "symbol": None, "convention": "azul"},
    {"id": "protesis_remov", "label": "Prótesis Remov.", "color": "#3b82f6", "symbol": None, "convention": "azul"},
    {"id": "desplazamiento", "label": "Desplazamiento", "color": "#f97316", "symbol": None, "convention": "rojo"},
    {"id": "rotacion", "label": "Rotación", "color": "#fb923c", "symbol": None, "convention": "rojo"},
    {"id": "fusion", "label": "Fusión", "color": "#f59e0b", "symbol": None, "convention": "rojo"},
    {"id": "remanente_rad", "label": "Remanente Rad", "color": "#a8a29e", "symbol": None, "convention": "rojo"},
    {"id": "erupcion", "label": "Erupción", "color": "#86efac", "symbol": None, "convention": "neutro"},
    {"id": "transposicion", "label": "Transposición", "color": "#f97316", "symbol": None, "convention": "rojo"},
    {"id": "supernumerario", "label": "Supernumerario", "color": "#fbbf24", "symbol": None, "convention": "rojo"},
    {"id": "pulpa", "label": "Pulpa", "color": "#ef4444", "symbol": None, "convention": "rojo"},
    {"id": "protesis", "label": "Prótesis", "color": "#3b82f6", "symbol": None, "convention": "azul"},
    {"id": "perno", "label": "Perno", "color": "#2563eb", "symbol": None, "convention": "azul"},
    {"id": "ortodoncia_fija", "label": "Ortodoncia Fija", "color": "#3b82f6", "symbol": None, "convention": "azul"},
    {"id": "protesis_fija", "label": "Prótesis Fija", "color": "#2563eb", "symbol": None, "convention": "azul"},
    {"id": "implante", "label": "Implante", "color": "#1d4ed8", "symbol": None, "convention": "azul"},
    {"id": "macrodoncia", "label": "Macrodoncia", "color": "#fbbf24", "symbol": None, "convention": "rojo"},
    {"id": "microdoncia", "label": "Microdoncia", "color": "#fcd34d", "symbol": None, "convention": "rojo"},
    {"id": "discromia", "label": "Discromia", "color": "#f472b6", "symbol": None, "convention": "rojo"},
    {"id": "desgaste", "label": "Desgaste", "color": "#ef4444", "symbol": None, "convention": "rojo"},
    {"id": "impactado_p", "label": "Impactado/P", "color": "#dc2626", "symbol": None, "convention": "rojo"},
    {"id": "intrusion", "label": "Intrusión", "color": "#f97316", "symbol": None, "convention": "rojo"},
    {"id": "edentulismo", "label": "Edentulismo", "color": "#e2e8f0", "symbol": "x", "convention": "neutro"},
    {"id": "ectopico", "label": "Ectópico", "color": "#f97316", "symbol": None, "convention": "rojo"},
    {"id": "impactado", "label": "Impactado", "color": "#dc2626", "symbol": None, "convention": "rojo"},
    {"id": "ortod_remov", "label": "Ortod. Remov", "color": "#3b82f6", "symbol": None, "convention": "azul"},
    {"id": "extrusion", "label": "Extrusión", "color": "#f97316", "symbol": None, "convention": "rojo"},
    {"id": "poste", "label": "Poste", "color": "#2563eb", "symbol": None, "convention": "azul"},
    {"id": "extraer", "label": "Extraer", "color": "#dc2626", "symbol": "diagonal", "convention": "rojo"},
    # Patologías adicionales (Fase 2 — diagnóstico de preexistencias)
    {"id": "abrasion", "label": "Abrasión", "color": "#ef4444", "symbol": None, "convention": "rojo"},
    {"id": "erosion", "label": "Erosión", "color": "#dc2626", "symbol": None, "convention": "rojo"},
    {"id": "anomalia_des", "label": "Anomalía desarr.", "color": "#f59e0b", "symbol": None, "convention": "rojo"},
]

LEGACY_ESTADO_MAP = {
    "sano": None,
    "caries": "caries",
    "obturado": "obturacion",
    "obturacion": "obturacion",
    "ausente": "ausente",
    "corona": "corona",
    "endodoncia": "pulpa",
    "a_extraer": "extraer",
    "extraccion_indicada": "extraer",
    "fractura": "fractura",
    "protesis_fija": "protesis_fija",
    "impactado": "impactado",
    "abrasion": "abrasion",
    "abrasiones": "abrasion",
    "erosion": "erosion",
    "erosiones": "erosion",
}

SURFACE_KEYS = ("M", "D", "V", "L", "O")
EMPTY_SURFACES = {k: None for k in SURFACE_KEYS}

CONDITION_IDS = {c["id"] for c in ODONTOGRAM_CONDITIONS}


def normalize_condition(value: str | None) -> str | None:
    if value is None or value == "" or value == "sano":
        return None
    mapped = LEGACY_ESTADO_MAP.get(value, value)
    if mapped is None:
        return None
    return mapped if mapped in CONDITION_IDS else None


def condition_by_id(cid: str | None) -> ConditionDef | None:
    if not cid:
        return None
    for c in ODONTOGRAM_CONDITIONS:
        if c["id"] == cid:
            return c
    return None


def convention_color(cid: str | None) -> str | None:
    """Color clínico estándar rojo/azul; None = usar color de catálogo."""
    c = condition_by_id(cid)
    if not c:
        return None
    if c["convention"] == "rojo":
        return "#ef4444"
    if c["convention"] == "azul":
        return "#2563eb"
    return c["color"]
