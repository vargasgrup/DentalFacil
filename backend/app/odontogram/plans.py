"""Helpers for multi-alternative treatment plans + presupuesto."""

from __future__ import annotations

import uuid
from typing import Any


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
    """
    if raw is None:
        return {
            "active_id": "plan_a",
            "alternatives": [{"id": "plan_a", "nombre": "Plan A", "items": []}],
        }
    if isinstance(raw, list):
        return {
            "active_id": "plan_a",
            "alternatives": [{"id": "plan_a", "nombre": "Plan A", "items": raw}],
        }
    if isinstance(raw, dict) and "alternatives" in raw:
        alts = raw.get("alternatives") or []
        if not alts:
            alts = [{"id": "plan_a", "nombre": "Plan A", "items": []}]
        active = raw.get("active_id") or alts[0].get("id")
        return {"active_id": active, "alternatives": alts}
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
        "items": items or [],
    }


def estimate(items: list) -> float:
    total = 0.0
    for it in items or []:
        try:
            total += float(it.get("cantidad") or 0) * float(it.get("costo_unitario") or 0)
        except (TypeError, ValueError):
            pass
    return total
