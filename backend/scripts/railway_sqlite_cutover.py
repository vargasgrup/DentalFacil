"""Railway one-shot: Postgres (integer PK) → persistent SQLite UUID on /data.

Run inside the Backend service after mounting a Volume at /data and setting:

  SOURCE_DATABASE_URL=<Postgres DATABASE_URL from Railway>
  TARGET_DATABASE_URL=sqlite:////data/clinica.db   # default

  python -m scripts.railway_sqlite_cutover

Safety:
  - Refuses if TARGET already has users (unless FORCE_SQLITE_CUTOVER=1)
  - Does not delete the Postgres source
  - Stamps Alembic head after ETL
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


DEFAULT_TARGET = "sqlite:////data/clinica.db"


def _normalize_pg(url: str) -> str:
    raw = url.strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    return raw


def main() -> int:
    src = os.environ.get("SOURCE_DATABASE_URL") or os.environ.get("POSTGRES_DATABASE_URL")
    dst = os.environ.get("TARGET_DATABASE_URL") or DEFAULT_TARGET
    force = os.environ.get("FORCE_SQLITE_CUTOVER", "").strip() in ("1", "true", "yes")

    if not src:
        print(
            "Set SOURCE_DATABASE_URL to the Railway Postgres URL "
            "(Variable Reference → Postgres → DATABASE_URL).",
            file=sys.stderr,
        )
        return 1

    src = _normalize_pg(src)
    if src.lower().startswith("sqlite"):
        print("SOURCE_DATABASE_URL must be PostgreSQL, not SQLite.", file=sys.stderr)
        return 1
    if not dst.lower().startswith("sqlite"):
        print("TARGET_DATABASE_URL must be sqlite:///…", file=sys.stderr)
        return 1

    # Ensure absolute dir for /data/clinica.db
    from sqlalchemy.engine.url import make_url

    db_path = make_url(dst).database
    if db_path and db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Refuse overwrite unless forced
    if Path(db_path or "").is_file() and not force:
        from sqlalchemy import create_engine, text

        eng = create_engine(dst, connect_args={"check_same_thread": False})
        try:
            with eng.connect() as conn:
                tables = {
                    r[0]
                    for r in conn.execute(
                        text("SELECT name FROM sqlite_master WHERE type='table'")
                    )
                }
                if "users" in tables:
                    n = conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0
                    if n > 0:
                        print(
                            f"TARGET already has {n} users at {db_path}. "
                            "Refusing to overwrite. Set FORCE_SQLITE_CUTOVER=1 to replace.",
                            file=sys.stderr,
                        )
                        return 2
        finally:
            eng.dispose()

    print(f"[cutover] SOURCE → Postgres host/db = {src.split('@')[-1]}", flush=True)
    print(f"[cutover] TARGET → {dst}", flush=True)

    os.environ["SOURCE_DATABASE_URL"] = src
    os.environ["TARGET_DATABASE_URL"] = dst

    from scripts.pg_to_sqlite_uuid import main as etl_main

    code = etl_main()
    if code != 0:
        return code

    # Stamp is done inside pg_to_sqlite_uuid; avoid double-import settings race.
    print(
        "[cutover] OK. Set Backend DATABASE_URL=sqlite:////data/clinica.db, "
        "remove Postgres as primary URL, restart, then login with existing users.",
        flush=True,
    )
    print(
        "[cutover] Checklist: GET /api/health → engine=sqlite + user_count>0; "
        "POST /api/auth/login; pacientes + agenda + caja smoke.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
