"""Normalización y dual-write de especialidades del paciente (multi + legado)."""

from __future__ import annotations

from typing import Any, Sequence


def normalize_especialidades(
    especialidades: Sequence[str] | None = None,
    especialidad: str | None = None,
) -> list[str]:
    """Lista única, orden de aparición, máx. 80 chars por ítem."""
    raw: list[str] = []
    if especialidades:
        for item in especialidades:
            if item is None:
                continue
            raw.append(str(item))
    if especialidad is not None and str(especialidad).strip():
        # Compat: string único o cadena con separadores
        text = str(especialidad).strip()
        if "," in text or "·" in text or ";" in text:
            for sep in (",", "·", ";"):
                text = text.replace(sep, "|")
            raw.extend(text.split("|"))
        else:
            raw.append(text)

    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        s = " ".join(str(item).split()).strip()[:80]
        if not s:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def dual_write_fields(
    especialidades: Sequence[str] | None = None,
    especialidad: str | None = None,
) -> tuple[str | None, list[str] | None]:
    """
    Retorna (especialidad_primaria, especialidades_json).
    primary = primer ítem (filtros legacy / display corto).
    """
    items = normalize_especialidades(especialidades, especialidad)
    if not items:
        return None, None
    return items[0], items


def resolve_from_patient(patient: Any) -> list[str]:
    """Lee lista efectiva desde ORM o dict-like."""
    esps = getattr(patient, "especialidades", None)
    if esps is None and isinstance(patient, dict):
        esps = patient.get("especialidades")
    single = getattr(patient, "especialidad", None)
    if single is None and isinstance(patient, dict):
        single = patient.get("especialidad")
    if isinstance(esps, str):
        return normalize_especialidades(None, esps)
    if isinstance(esps, (list, tuple)):
        return normalize_especialidades(list(esps), single)
    return normalize_especialidades(None, single)


def patient_matches_especialidad(patient: Any, filter_value: str) -> bool:
    needle = (filter_value or "").strip()
    if not needle:
        return True
    needle_cf = needle.casefold()
    return any(s.casefold() == needle_cf for s in resolve_from_patient(patient))
