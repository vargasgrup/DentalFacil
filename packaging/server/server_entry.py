"""Frozen entry point for N&K DentalSoft Windows Server (PyInstaller).

Loads ProgramData config, runs schema bootstrap, then serves HTTPS/HTTP uvicorn.
"""

from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path


def _meipass() -> Path | None:
    raw = getattr(sys, "_MEIPASS", None)
    return Path(raw) if raw else None


def _install_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # Dev: packaging/server → repo/backend
    return Path(__file__).resolve().parents[2] / "backend"


def _programdata() -> Path:
    return Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "NKDentalSoft"


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def prepare_environment() -> Path:
    root = _programdata()
    for sub in ("config", "data", "logs", "certs", "uploads", "updates"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    _load_env_file(root / "config" / ".env")

    os.environ.setdefault("APP_ENV", "production")
    os.environ.setdefault("HOST", "0.0.0.0")
    os.environ.setdefault("BACKEND_PORT", "8001")
    db_path = root / "data" / "clinica.db"
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    os.environ.setdefault("UPLOAD_DIR", str(root / "uploads"))
    os.environ.setdefault("NKDENTALSOFT_INSTALL_DIR", str(_install_dir()))

    install = _install_dir()
    meipass = _meipass()
    for p in (meipass, install):
        if p and p.exists() and str(p) not in sys.path:
            sys.path.insert(0, str(p))
    return root


def bootstrap_schema() -> None:
    from app.migrate import run_migrations_blocking
    from app.ensure_auth_schema import ensure_auth_schema
    from app.ensure_clinical_schema import ensure_clinical_evolution_schema
    from app.schema_guard import assert_schema_compatible_with_uuid_models

    run_migrations_blocking()
    ensure_auth_schema()
    ensure_clinical_evolution_schema()
    assert_schema_compatible_with_uuid_models()


def run_server() -> None:
    root = prepare_environment()
    try:
        bootstrap_schema()
    except Exception as exc:  # noqa: BLE001
        print(f"[nkdentalsoft-server] schema bootstrap failed: {exc}", flush=True)
        traceback.print_exc()
        raise

    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("BACKEND_PORT", "8001"))
    cert = root / "certs" / "server.crt"
    key = root / "certs" / "server.key"
    kwargs: dict = {
        "app": "app.main:app",
        "host": host,
        "port": port,
        "log_level": "info",
    }
    if cert.is_file() and key.is_file():
        kwargs["ssl_certfile"] = str(cert)
        kwargs["ssl_keyfile"] = str(key)
        print(f"[nkdentalsoft-server] HTTPS on {host}:{port}", flush=True)
    else:
        print(
            f"[nkdentalsoft-server] WARNING: no TLS certs — HTTP on {host}:{port}",
            flush=True,
        )
    uvicorn.run(**kwargs)


def main() -> None:
    try:
        run_server()
    except Exception:
        print("[nkdentalsoft-server] fatal:", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
