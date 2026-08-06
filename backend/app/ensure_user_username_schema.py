"""Add users.username for login-by-name (email remains recovery only)."""

from __future__ import annotations

import re

from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_user_username_schema")


def _suggest(nombre: str | None, email: str | None, taken: set[str]) -> str:
    base = ""
    if nombre:
        base = re.sub(r"[^A-Za-z0-9._\-]+", "", (nombre or "").strip())
    if not base and email and "@" in (email or ""):
        base = re.sub(r"[^A-Za-z0-9._\-]+", "", email.split("@", 1)[0])
    if not base:
        base = "usuario"
    base = base[:40] or "usuario"
    if len(base) < 3:
        base = (base + "xxx")[:3]
    candidate = base
    n = 2
    while candidate.lower() in taken:
        suffix = str(n)
        candidate = f"{base[: max(1, 40 - len(suffix))]}{suffix}"
        n += 1
    return candidate


def ensure_user_username_schema() -> None:
    """Add username column + backfill from nombre/email for existing installs."""
    insp = inspect(engine)
    if "users" not in set(insp.get_table_names()):
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    dialect = engine.dialect.name

    with engine.begin() as conn:
        if "username" not in cols:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(40)"))
            else:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(40)")
                )
            logger.info("[dentalfacil] users.username column added")

        # Backfill empty usernames
        rows = conn.execute(
            text("SELECT id, nombre, email, username FROM users")
        ).fetchall()
        taken: set[str] = set()
        for row in rows:
            u = (row[3] or "").strip()
            if u:
                taken.add(u.lower())
        for row in rows:
            uid, nombre, email, username = row[0], row[1], row[2], row[3]
            if (username or "").strip():
                continue
            candidate = _suggest(nombre, email, taken)
            taken.add(candidate.lower())
            conn.execute(
                text("UPDATE users SET username = :u WHERE id = :id"),
                {"u": candidate, "id": uid},
            )
            logger.info("[dentalfacil] backfilled username=%s for user id=%s", candidate, uid)

        # Unique index (ignore if already exists)
        try:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower "
                        "ON users (username COLLATE NOCASE)"
                    )
                )
            else:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username "
                        "ON users (username)"
                    )
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("username unique index note: %s", exc)

    # Optional: allow NULL emails on Postgres (recovery-only)
    if dialect != "sqlite" and settings.is_sqlite is False:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
        except Exception:  # noqa: BLE001
            pass
