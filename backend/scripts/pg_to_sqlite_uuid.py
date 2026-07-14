"""ETL: PostgreSQL (integer PKs) → SQLite (UUID PKs) with FK remapping.

Usage (from backend/):
  set SOURCE_DATABASE_URL=postgresql+psycopg://...
  set TARGET_DATABASE_URL=sqlite:///./data/clinica_from_pg.db
  python -m scripts.pg_to_sqlite_uuid

Never run against a live production file as TARGET without a backup first.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, select, text
from sqlalchemy.engine import Engine


TABLE_ORDER = [
    "users",
    "patients",
    "clinic_settings",
    "clinical_records",
    "clinical_evolution_entries",
    "appointments",
    "appointment_reminders",
    "cash_sessions",
    "cash_transactions",
    "odontogram_entries",
    "odontogram_change_log",
    "odontogram_snapshots",
    "periodontogram_entries",
    "tooth_media",
    "clinical_audit_log",
    "documents_generated",
    "revoked_tokens",
]

# table -> columns that are FKs to remapped PKs
FK_MAP: dict[str, list[tuple[str, str]]] = {
    # col, target_table
    "patients": [],
    "users": [],
    "clinic_settings": [],
    "clinical_records": [("patient_id", "patients"), ("doctor_responsable_id", "users")],
    "clinical_evolution_entries": [("patient_id", "patients"), ("doctor_id", "users")],
    "appointments": [("patient_id", "patients"), ("doctor_id", "users")],
    "appointment_reminders": [
        ("appointment_id", "appointments"),
        ("marcado_enviado_por_user_id", "users"),
    ],
    "cash_sessions": [("usuario_id", "users")],
    "cash_transactions": [("cash_session_id", "cash_sessions"), ("patient_id", "patients")],
    "odontogram_entries": [("patient_id", "patients")],
    "odontogram_change_log": [("patient_id", "patients"), ("user_id", "users")],
    "odontogram_snapshots": [
        ("patient_id", "patients"),
        ("taken_by", "users"),
        ("evolution_entry_id", "clinical_evolution_entries"),
    ],
    "periodontogram_entries": [("patient_id", "patients"), ("updated_by", "users")],
    "tooth_media": [("patient_id", "patients"), ("uploaded_by", "users")],
    "clinical_audit_log": [("patient_id", "patients"), ("user_id", "users")],
    "documents_generated": [("patient_id", "patients")],
    "revoked_tokens": [("user_id", "users")],
}

CLINIC_SETTINGS_ID = "00000000-0000-4000-8000-000000000001"


def _new_id() -> str:
    return str(uuid.uuid4())


def _engine(url: str) -> Engine:
    kwargs = {}
    if url.startswith("sqlite"):
        Path(url.split("://", 1)[-1].lstrip("./")).parent.mkdir(parents=True, exist_ok=True)
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


def main() -> int:
    src_url = os.environ.get("SOURCE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    dst_url = os.environ.get("TARGET_DATABASE_URL") or "sqlite:///./data/clinica_from_pg.db"
    if not src_url or src_url.startswith("sqlite"):
        print("SOURCE_DATABASE_URL must be a PostgreSQL URL", file=sys.stderr)
        return 1

    src = _engine(src_url)
    dst = _engine(dst_url)

    # Build target schema from current models
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    os.environ["DATABASE_URL"] = dst_url
    from app.database import Base
    import app.models  # noqa: F401

    Base.metadata.drop_all(bind=dst)
    Base.metadata.create_all(bind=dst)

    id_maps: dict[str, dict[object, str]] = {t: {} for t in TABLE_ORDER}
    src_meta = MetaData()
    src_meta.reflect(bind=src)

    with src.connect() as sconn, dst.begin() as dconn:
        dconn.execute(text("PRAGMA foreign_keys=OFF"))

        for table_name in TABLE_ORDER:
            if table_name not in src_meta.tables:
                print(f"skip missing source table: {table_name}")
                continue
            src_table = src_meta.tables[table_name]
            dst_table = Table(table_name, Base.metadata, autoload_with=dst)
            rows = sconn.execute(select(src_table)).mappings().all()
            print(f"{table_name}: {len(rows)} rows")

            for row in rows:
                data = dict(row)
                old_pk = None
                if "id" in data and table_name != "revoked_tokens":
                    old_pk = data["id"]
                    if table_name == "clinic_settings":
                        data["id"] = CLINIC_SETTINGS_ID
                    else:
                        data["id"] = _new_id()
                    id_maps[table_name][old_pk] = data["id"]

                for col, target in FK_MAP.get(table_name, []):
                    if col in data and data[col] is not None:
                        data[col] = id_maps[target].get(data[col], data[col])

                # Drop columns not in destination
                dest_cols = {c.name for c in dst_table.columns}
                payload = {k: v for k, v in data.items() if k in dest_cols}
                dconn.execute(dst_table.insert().values(**payload))

        dconn.execute(text("PRAGMA foreign_keys=ON"))

    print(f"Done → {dst_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
