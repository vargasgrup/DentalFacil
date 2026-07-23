from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import (
    OdontogramChangeLog,
    OdontogramEntry,
    OdontogramSnapshot,
    Patient,
    User,
)
from app.odontogram.conditions import (
    EMPTY_SURFACES,
    ODONTOGRAM_CONDITIONS,
    normalize_condition,
)
from app.services.audit import log_audit

router = APIRouter(prefix="/api/odontogram", tags=["odontogram"])


class SurfacesIn(BaseModel):
    M: str | None = None
    D: str | None = None
    V: str | None = None
    L: str | None = None
    O: str | None = None


class OdontogramEntryUpdate(BaseModel):
    estado: str | None = None
    denticion: str = "permanente"
    superficies: SurfacesIn | None = None
    notas: str | None = None


class OdontogramEntryOut(BaseModel):
    id: str
    patient_id: str
    pieza_fdi: str
    estado: str
    denticion: str = "permanente"
    superficies: dict = Field(default_factory=lambda: dict(EMPTY_SURFACES))
    notas: str | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChangeLogOut(BaseModel):
    id: str
    patient_id: str
    pieza_fdi: str
    denticion: str
    estado_antes: str | None
    estado_despues: str | None
    superficies_antes: dict | None
    superficies_despues: dict | None
    user_id: str | None
    user_name: str | None = None
    accion: str
    changed_at: datetime

    model_config = {"from_attributes": True}


class SnapshotCreate(BaseModel):
    denticion: str = "permanente"
    label: str = "Estado de cita"
    evolution_entry_id: str | None = None
    origen: str = "tiempo_real"


class SnapshotOut(BaseModel):
    id: str
    patient_id: str
    denticion: str
    label: str
    entries: list
    taken_by: str | None
    taken_by_name: str | None = None
    evolution_entry_id: str | None
    origen: str = "tiempo_real"
    taken_at: datetime

    model_config = {"from_attributes": True}


class DiffItem(BaseModel):
    pieza_fdi: str
    status: str  # igual | cambio | solo_a | solo_b
    estado_a: str | None = None
    estado_b: str | None = None
    superficies_a: dict | None = None
    superficies_b: dict | None = None


def _merge_surfaces(incoming: SurfacesIn | None) -> dict:
    out = dict(EMPTY_SURFACES)
    if incoming is None:
        return out
    for k, v in incoming.model_dump().items():
        out[k] = normalize_condition(v)
    return out


def _store_estado(value: str | None) -> str:
    n = normalize_condition(value)
    return n or ""


def _surfaces_copy(raw: dict | None) -> dict:
    out = dict(EMPTY_SURFACES)
    if raw:
        out.update(raw)
    return out


def _log_change(
    db: Session,
    *,
    patient_id: str,
    pieza_fdi: str,
    denticion: str,
    estado_antes: str | None,
    estado_despues: str | None,
    superficies_antes: dict | None,
    superficies_despues: dict | None,
    user_id: str | None,
    accion: str,
) -> None:
    db.add(
        OdontogramChangeLog(
            patient_id=patient_id,
            pieza_fdi=pieza_fdi,
            denticion=denticion,
            estado_antes=estado_antes,
            estado_despues=estado_despues,
            superficies_antes=superficies_antes,
            superficies_despues=superficies_despues,
            user_id=user_id,
            accion=accion,
        )
    )


def _entry_payload(e: OdontogramEntry) -> dict:
    return {
        "pieza_fdi": e.pieza_fdi,
        "estado": e.estado or "",
        "superficies": _surfaces_copy(e.superficies if isinstance(e.superficies, dict) else None),
        "notas": e.notas,
    }


def _user_display(u: User | None) -> str | None:
    if not u:
        return None
    return getattr(u, "nombre", None) or getattr(u, "email", None) or str(u.id)


@router.get("/conditions")
def list_conditions(user: User = Depends(get_current_user)):
    return ODONTOGRAM_CONDITIONS


@router.get("/treatments/catalog")
def treatment_catalog(user: User = Depends(get_current_user)):
    return [
        {"condicion_id": k, "nombre": v["nombre"], "precio_default": v["precio_default"]}
        for k, v in CONDITION_TREATMENT_MAP.items()
    ]


@router.get("/treatments/suggest/{condicion_id}")
def treatment_suggest(condicion_id: str, user: User = Depends(get_current_user)):
    return {"condicion_id": condicion_id, **suggest_treatment(condicion_id)}


@router.get("/{patient_id}/history", response_model=list[ChangeLogOut])
def get_history(
    patient_id: str,
    pieza_fdi: str | None = Query(None),
    denticion: str = Query("permanente"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    q = db.query(OdontogramChangeLog).filter(
        OdontogramChangeLog.patient_id == patient_id,
        OdontogramChangeLog.denticion == denticion,
    )
    if pieza_fdi:
        q = q.filter(OdontogramChangeLog.pieza_fdi == pieza_fdi)
    rows = q.order_by(OdontogramChangeLog.changed_at.desc()).limit(limit).all()
    out: list[ChangeLogOut] = []
    for r in rows:
        u = db.get(User, r.user_id) if r.user_id else None
        out.append(
            ChangeLogOut(
                id=r.id,
                patient_id=r.patient_id,
                pieza_fdi=r.pieza_fdi,
                denticion=r.denticion,
                estado_antes=r.estado_antes,
                estado_despues=r.estado_despues,
                superficies_antes=r.superficies_antes,
                superficies_despues=r.superficies_despues,
                user_id=r.user_id,
                user_name=_user_display(u),
                accion=r.accion,
                changed_at=r.changed_at,
            )
        )
    return out


@router.get("/{patient_id}/snapshots", response_model=list[SnapshotOut])
def list_snapshots(
    patient_id: str,
    denticion: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    q = db.query(OdontogramSnapshot).filter(OdontogramSnapshot.patient_id == patient_id)
    if denticion:
        q = q.filter(OdontogramSnapshot.denticion == denticion)
    rows = q.order_by(OdontogramSnapshot.taken_at.desc()).all()
    result: list[SnapshotOut] = []
    for r in rows:
        u = db.get(User, r.taken_by) if r.taken_by else None
        result.append(
            SnapshotOut(
                id=r.id,
                patient_id=r.patient_id,
                denticion=r.denticion,
                label=r.label,
                entries=r.entries or [],
                taken_by=r.taken_by,
                taken_by_name=_user_display(u),
                evolution_entry_id=r.evolution_entry_id,
                origen=getattr(r, "origen", None) or "tiempo_real",
                taken_at=r.taken_at,
            )
        )
    return result


@router.post("/{patient_id}/snapshots", response_model=SnapshotOut, status_code=201)
def create_snapshot(
    patient_id: str,
    payload: SnapshotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    denticion = payload.denticion if payload.denticion in ("permanente", "temporal") else "permanente"
    origen = payload.origen if payload.origen in ("tiempo_real", "migracion") else "tiempo_real"
    default_label = (
        "Estado histórico (migración)" if origen == "migracion" else "Estado de cita"
    )
    entries = (
        db.query(OdontogramEntry)
        .filter(
            OdontogramEntry.patient_id == patient_id,
            OdontogramEntry.denticion == denticion,
        )
        .all()
    )
    snap = OdontogramSnapshot(
        patient_id=patient_id,
        denticion=denticion,
        label=(payload.label or default_label).strip()[:120],
        entries=[_entry_payload(e) for e in entries],
        taken_by=user.id,
        evolution_entry_id=payload.evolution_entry_id,
        origen=origen,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return SnapshotOut(
        id=snap.id,
        patient_id=snap.patient_id,
        denticion=snap.denticion,
        label=snap.label,
        entries=snap.entries or [],
        taken_by=snap.taken_by,
        taken_by_name=_user_display(user),
        evolution_entry_id=snap.evolution_entry_id,
        origen=snap.origen or "tiempo_real",
        taken_at=snap.taken_at,
    )


@router.get("/{patient_id}/compare")
def compare_snapshots(
    patient_id: str,
    a: str = Query(..., description="Snapshot A id"),
    b: str = Query(..., description="Snapshot B id"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    snap_a = db.get(OdontogramSnapshot, a)
    snap_b = db.get(OdontogramSnapshot, b)
    if not snap_a or snap_a.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Snapshot A no encontrado")
    if not snap_b or snap_b.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Snapshot B no encontrado")

    def index(entries: list) -> dict[str, dict]:
        return {str(e.get("pieza_fdi")): e for e in (entries or []) if e.get("pieza_fdi")}

    ia, ib = index(snap_a.entries or []), index(snap_b.entries or [])
    piezas = sorted(set(ia) | set(ib), key=lambda x: (len(x), x))
    diffs: list[DiffItem] = []
    for p in piezas:
        ea, eb = ia.get(p), ib.get(p)
        if ea and not eb:
            diffs.append(
                DiffItem(
                    pieza_fdi=p,
                    status="solo_a",
                    estado_a=ea.get("estado") or "",
                    superficies_a=ea.get("superficies"),
                )
            )
        elif eb and not ea:
            diffs.append(
                DiffItem(
                    pieza_fdi=p,
                    status="solo_b",
                    estado_b=eb.get("estado") or "",
                    superficies_b=eb.get("superficies"),
                )
            )
        else:
            assert ea and eb
            same = (ea.get("estado") or "") == (eb.get("estado") or "") and (
                ea.get("superficies") or {}
            ) == (eb.get("superficies") or {})
            diffs.append(
                DiffItem(
                    pieza_fdi=p,
                    status="igual" if same else "cambio",
                    estado_a=ea.get("estado") or "",
                    estado_b=eb.get("estado") or "",
                    superficies_a=ea.get("superficies"),
                    superficies_b=eb.get("superficies"),
                )
            )
    return {
        "snapshot_a": {
            "id": snap_a.id,
            "label": snap_a.label,
            "taken_at": snap_a.taken_at,
            "denticion": snap_a.denticion,
        },
        "snapshot_b": {
            "id": snap_b.id,
            "label": snap_b.label,
            "taken_at": snap_b.taken_at,
            "denticion": snap_b.denticion,
        },
        "diffs": diffs,
        "changed_count": sum(1 for d in diffs if d.status != "igual"),
    }


@router.get("/{patient_id}", response_model=list[OdontogramEntryOut])
def get_odontogram(
    patient_id: str,
    denticion: str = Query("permanente"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(OdontogramEntry)
        .filter(
            OdontogramEntry.patient_id == patient_id,
            OdontogramEntry.denticion == denticion,
        )
        .all()
    )


@router.put("/{patient_id}/{pieza_fdi}", response_model=OdontogramEntryOut)
def upsert_entry(
    patient_id: str,
    pieza_fdi: str,
    payload: OdontogramEntryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    denticion = payload.denticion if payload.denticion in ("permanente", "temporal") else "permanente"
    condicion = _store_estado(payload.estado)

    entry = (
        db.query(OdontogramEntry)
        .filter(
            OdontogramEntry.patient_id == patient_id,
            OdontogramEntry.pieza_fdi == pieza_fdi,
            OdontogramEntry.denticion == denticion,
        )
        .first()
    )

    estado_antes = entry.estado if entry else None
    superficies_antes = _surfaces_copy(entry.superficies if entry and isinstance(entry.superficies, dict) else None) if entry else None

    if entry:
        entry.estado = condicion
        entry.notas = payload.notas
        entry.denticion = denticion
        if payload.superficies is not None:
            entry.superficies = _merge_surfaces(payload.superficies)
    else:
        surfaces = _merge_surfaces(payload.superficies) if payload.superficies else dict(EMPTY_SURFACES)
        entry = OdontogramEntry(
            patient_id=patient_id,
            pieza_fdi=pieza_fdi,
            estado=condicion,
            denticion=denticion,
            superficies=surfaces,
            notas=payload.notas,
        )
        db.add(entry)

    db.flush()
    _log_change(
        db,
        patient_id=patient_id,
        pieza_fdi=pieza_fdi,
        denticion=denticion,
        estado_antes=estado_antes or "",
        estado_despues=entry.estado or "",
        superficies_antes=superficies_antes,
        superficies_despues=_surfaces_copy(entry.superficies if isinstance(entry.superficies, dict) else None),
        user_id=user.id,
        accion="upsert",
    )
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="odontogram",
        entity_id=pieza_fdi,
        action="upsert",
        user_id=user.id,
        detail={"estado": entry.estado, "denticion": denticion},
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_odontogram(
    patient_id: str,
    denticion: str = Query("permanente"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(OdontogramEntry).filter(
        OdontogramEntry.patient_id == patient_id,
        OdontogramEntry.denticion == denticion,
    )
    rows = q.all()
    for row in rows:
        _log_change(
            db,
            patient_id=patient_id,
            pieza_fdi=row.pieza_fdi,
            denticion=denticion,
            estado_antes=row.estado or "",
            estado_despues="",
            superficies_antes=_surfaces_copy(row.superficies if isinstance(row.superficies, dict) else None),
            superficies_despues=dict(EMPTY_SURFACES),
            user_id=user.id,
            accion="clear_all",
        )
        db.delete(row)
    if not rows:
        _log_change(
            db,
            patient_id=patient_id,
            pieza_fdi="",
            denticion=denticion,
            estado_antes=None,
            estado_despues=None,
            superficies_antes=None,
            superficies_despues=None,
            user_id=user.id,
            accion="clear_all",
        )
    db.commit()


@router.delete("/{patient_id}/{pieza_fdi}", status_code=204)
def delete_entry(
    patient_id: str,
    pieza_fdi: str,
    denticion: str = Query("permanente"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = (
        db.query(OdontogramEntry)
        .filter(
            OdontogramEntry.patient_id == patient_id,
            OdontogramEntry.pieza_fdi == pieza_fdi,
            OdontogramEntry.denticion == denticion,
        )
        .first()
    )
    if entry:
        _log_change(
            db,
            patient_id=patient_id,
            pieza_fdi=pieza_fdi,
            denticion=denticion,
            estado_antes=entry.estado or "",
            estado_despues="",
            superficies_antes=_surfaces_copy(entry.superficies if isinstance(entry.superficies, dict) else None),
            superficies_despues=dict(EMPTY_SURFACES),
            user_id=user.id,
            accion="clear_pieza",
        )
        db.delete(entry)
        db.commit()
