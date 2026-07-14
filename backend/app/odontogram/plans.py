"""Helpers for multi-alternative treatment plans + presupuesto."""

from __future__ import annotations

import uuid
from typing import Any


def _new_item_id() -> str:
    return f"pi_{uuid.uuid4().hex[:8]}"


def _normalize_estado(raw: Any) -> str:
    v = str(raw or "pendiente").lower()
    if v in ("en_curso", "en_proceso", "proceso"):
        return "en_proceso"
    if v in ("finalizado", "completado", "completo"):
        return "completado"
    return "pendiente"


def normalize_plan_item(raw: Any) -> dict:
    """Canonical plan line: stable id + economic fields."""
    if not isinstance(raw, dict):
        raw = {"item": str(raw or "")}
    cantidad = float(raw.get("cantidad") or 1) or 1.0
    if cantidad < 1:
        cantidad = 1.0
    unit = float(raw.get("costo_unitario") or 0)
    sub = cantidad * unit
    a_cuenta = float(raw.get("a_cuenta") or 0)
    if a_cuenta > sub:
        a_cuenta = sub
    out = {
        "id": str(raw.get("id") or "") or _new_item_id(),
        "item": str(raw.get("item") or ""),
        "cantidad": cantidad,
        "costo_unitario": unit,
        "a_cuenta": a_cuenta,
        "estado": _normalize_estado(raw.get("estado")),
        "origen": "odontogram" if raw.get("origen") == "odontogram" else "manual",
    }
    if raw.get("pieza_fdi"):
        out["pieza_fdi"] = str(raw["pieza_fdi"])
    if raw.get("condicion_id"):
        out["condicion_id"] = str(raw["condicion_id"])
    if raw.get("evolution_entry_id"):
        out["evolution_entry_id"] = str(raw["evolution_entry_id"])
    return out


def normalize_plans(raw: Any) -> dict:
    """
    Canonical shape:
    {
      "active_id": "plan_a",
      "alternatives": [
        {"id": "...", "nombre": "Plan A", "items": [...]}
      ]
    }
    Legacy: list of items → wrapped as Plan A.
    Every item gets a stable id (required for evolution/payment sync).
    """
    if raw is None:
        return {
            "active_id": "plan_a",
            "alternatives": [{"id": "plan_a", "nombre": "Plan A", "items": []}],
        }
    if isinstance(raw, list):
        return {
            "active_id": "plan_a",
            "alternatives": [
                {
                    "id": "plan_a",
                    "nombre": "Plan A",
                    "items": [normalize_plan_item(it) for it in raw],
                }
            ],
        }
    if isinstance(raw, dict) and "alternatives" in raw:
        alts = raw.get("alternatives") or []
        if not alts:
            alts = [{"id": "plan_a", "nombre": "Plan A", "items": []}]
        active = raw.get("active_id") or alts[0].get("id")
        normalized_alts = []
        for alt in alts:
            normalized_alts.append(
                {
                    "id": alt.get("id") or f"plan_{uuid.uuid4().hex[:8]}",
                    "nombre": alt.get("nombre") or "Plan",
                    "items": [normalize_plan_item(it) for it in (alt.get("items") or [])],
                }
            )
        return {"active_id": active, "alternatives": normalized_alts}
    return {
        "active_id": "plan_a",
        "alternatives": [{"id": "plan_a", "nombre": "Plan A", "items": []}],
    }


def active_items(raw: Any) -> list:
    plans = normalize_plans(raw)
    for alt in plans["alternatives"]:
        if alt.get("id") == plans["active_id"]:
            return list(alt.get("items") or [])
    return list(plans["alternatives"][0].get("items") or []) if plans["alternatives"] else []


def new_alternative(nombre: str, items: list | None = None) -> dict:
    return {
        "id": f"plan_{uuid.uuid4().hex[:8]}",
        "nombre": nombre,
        "items": [normalize_plan_item(it) for it in (items or [])],
    }


def estimate(items: list) -> float:
    total = 0.0
    for it in items or []:
        try:
            total += float(it.get("cantidad") or 0) * float(it.get("costo_unitario") or 0)
        except (TypeError, ValueError):
            pass
    return total
