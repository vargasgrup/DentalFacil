"""Shared filesystem roots for local / Windows desktop installs."""

from __future__ import annotations

import os
from pathlib import Path

# backend/ (parent of app/)
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def resolve_under_backend(raw: str | Path) -> Path:
    """Absolute as-is; relative paths anchored to backend root (not process cwd)."""
    path = Path(raw)
    if path.is_absolute():
        return path.resolve()
    return (BACKEND_ROOT / path).resolve()


def resolve_sqlite_file(database_url: str) -> Path:
    """
    Resolve the on-disk SQLite file for a SQLAlchemy URL.

    Relative paths prefer an existing file under cwd (legacy) or backend/data
    so backup/restore targets the same file the engine opened.
    """
    from sqlalchemy.engine.url import make_url

    db = make_url(database_url).database
    if not db or db == ":memory:":
        raise ValueError("Ruta de base de datos inválida")
    path = Path(db)
    if path.is_absolute():
        return path.resolve()
    backend_candidate = (BACKEND_ROOT / path).resolve()
    cwd_candidate = (Path.cwd() / path).resolve()
    if cwd_candidate.exists() and not backend_candidate.exists():
        return cwd_candidate
    if backend_candidate.exists():
        return backend_candidate
    # Fresh install: keep data next to the package (installer-friendly)
    return backend_candidate


def absolute_sqlite_url(database_url: str) -> str:
    """Rewrite relative sqlite URLs to an absolute file URL (Windows-safe)."""
    if not database_url.strip().lower().startswith("sqlite"):
        return database_url
    from sqlalchemy.engine.url import make_url

    u = make_url(database_url)
    if not u.database or u.database == ":memory:":
        return database_url
    path = resolve_sqlite_file(database_url)
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path.as_posix()}"


def default_data_dir() -> Path:
    """
    Writable data root for desktop installs.
    Honors DENTALSIMPLE_DATA_DIR / NKDENTALSOFT_DATA_DIR.
    On Windows: prefer %LOCALAPPDATA%\\NKDentalSoft; keep legacy DentalSimple if present.
    """
    for key in ("NKDENTALSOFT_DATA_DIR", "DENTALSIMPLE_DATA_DIR"):
        env = (os.environ.get(key) or "").strip()
        if env:
            return Path(env).expanduser().resolve()
    local = os.environ.get("LOCALAPPDATA")
    if local:
        legacy = (Path(local) / "DentalSimple").resolve()
        modern = (Path(local) / "NKDentalSoft").resolve()
        if legacy.exists() and not modern.exists():
            return legacy
        return modern
    return (BACKEND_ROOT / "data").resolve()
