"""Propuestas de tratamiento por condición del odontograma."""

from typing import TypedDict


class TreatmentSuggestion(TypedDict):
    nombre: str
    precio_default: float


# Precios iniciales editables al agregar al plan (misma moneda de la ficha).
CONDITION_TREATMENT_MAP: dict[str, TreatmentSuggestion] = {
    "caries": {"nombre": "Obturación / restauración", "precio_default": 80.0},
    "obturacion": {"nombre": "Obturación", "precio_default": 80.0},
    "corona": {"nombre": "Corona dental", "precio_default": 350.0},
    "corona_temp": {"nombre": "Corona temporal", "precio_default": 120.0},
    "ausente": {"nombre": "Rehabilitación por pieza ausente", "precio_default": 400.0},
    "extraer": {"nombre": "Exodoncia", "precio_default": 100.0},
    "fractura": {"nombre": "Tratamiento por fractura", "precio_default": 150.0},
    "pulpa": {"nombre": "Endodoncia", "precio_default": 280.0},
    "implante": {"nombre": "Implante dental", "precio_default": 1200.0},
    "protesis_fija": {"nombre": "Prótesis fija", "precio_default": 500.0},
    "protesis": {"nombre": "Prótesis", "precio_default": 450.0},
    "protesis_remov": {"nombre": "Prótesis removible", "precio_default": 400.0},
    "perno": {"nombre": "Perno / poste", "precio_default": 150.0},
    "poste": {"nombre": "Poste", "precio_default": 150.0},
    "ortodoncia_fija": {"nombre": "Ortodoncia fija", "precio_default": 800.0},
    "ortod_remov": {"nombre": "Ortodoncia removible", "precio_default": 500.0},
    "erupcion": {"nombre": "Control de erupción", "precio_default": 50.0},
    "impactado": {"nombre": "Cirugía de pieza impactada", "precio_default": 350.0},
    "impactado_p": {"nombre": "Cirugía de pieza impactada", "precio_default": 350.0},
    "discromia": {"nombre": "Blanqueamiento / estética", "precio_default": 200.0},
    "desgaste": {"nombre": "Rehabilitación por desgaste", "precio_default": 180.0},
    "abrasion": {"nombre": "Tratamiento por abrasión", "precio_default": 120.0},
    "erosion": {"nombre": "Tratamiento por erosión", "precio_default": 120.0},
    "anomalia_des": {"nombre": "Corrección anomalía del desarrollo", "precio_default": 200.0},
}


def suggest_treatment(condicion_id: str | None) -> TreatmentSuggestion:
    if not condicion_id:
        return {"nombre": "Tratamiento dental", "precio_default": 0.0}
    return CONDITION_TREATMENT_MAP.get(
        condicion_id,
        {"nombre": f"Tratamiento — {condicion_id}", "precio_default": 0.0},
    )
