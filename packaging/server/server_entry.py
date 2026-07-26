"""Frozen entry point for N&K DentalSoft Windows Server (PyInstaller).

Loads ProgramData config, auto-inits clinic secrets if missing, then serves uvicorn.
"""

from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path


def _meipass() -> Path | None:
    raw = getattr(sys, "_MEIPASS", None)
    return Path(raw) if raw else None


def _install_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2] / "backend"


def _programdata() -> Path:
    return Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "NKDentalSoft"


def _log_path() -> Path:
    return _programdata() / "logs" / "startup.log"


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line, flush=True)
    try:
        path = _log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        # Prefer file values over empty/defaults already in the process env
        os.environ[k.strip()] = v.strip()


def _env_path() -> Path:
    return _programdata() / "config" / ".env"


def _secrets_ok() -> bool:
    jwt = (os.environ.get("JWT_SECRET") or "").strip()
    maint = (os.environ.get("MAINTENANCE_ACCESS_KEY") or "").strip()
    if len(jwt) < 32:
        return False
    if jwt == "change-me-in-production-please-use-a-long-random-string":
        return False
    if len(maint) < 16 or maint == "Solo,yo1532":
        return False
    return True


def _detect_lan_ip() -> str:
    try:
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass
    return "127.0.0.1"


def _import_init_helpers():
    candidates = [
        _install_dir() / "scripts",
        (_meipass() / "scripts") if _meipass() else None,
        Path(__file__).resolve().parent / "scripts",
    ]
    last_err: Exception | None = None
    for folder in candidates:
        if folder is None or not folder.is_dir():
            continue
        if str(folder) not in sys.path:
            sys.path.insert(0, str(folder))
        try:
            import generate_production_secrets as gps
            import generate_selfsigned_cert as gsc

            return gps, gsc
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    raise ImportError(f"No se pudieron cargar scripts de init: {last_err}")


def init_clinic(host: str | None = None) -> None:
    """Generate unique .env + self-signed cert under ProgramData."""
    root = _programdata()
    for sub in ("config", "data", "logs", "certs", "uploads", "updates"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    gps, gsc = _import_init_helpers()
    out_env = _env_path()
    jwt_secret, maint = gps.generate_secrets()
    gps.write_env(out_env, jwt_secret=jwt_secret, maintenance_key=maint)
    log(f"Wrote production env: {out_env}")

    lan = (host or "").strip() or _detect_lan_ip()
    hosts = ["127.0.0.1", "localhost", "nkdentalsoft-server.local", lan]
    info = gsc.generate_cert(
        root / "certs",
        common_name="nkdentalsoft-server.local",
        extra_hosts=hosts,
    )
    log(f"lan_ip={lan}")
    log(f"fingerprint_sha256={info['fingerprint_sha256']}")


def prepare_environment() -> Path:
    root = _programdata()
    for sub in ("config", "data", "logs", "certs", "uploads", "updates"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    # Run from install dir so relative paths / DLLs resolve
    try:
        os.chdir(_install_dir())
    except OSError:
        pass

    env_file = _env_path()
    _load_env_file(env_file)

    # First boot / failed installer init → create secrets automatically
    if not env_file.is_file() or not _secrets_ok():
        log("Clinic secrets missing or insecure — running --init-clinic")
        init_clinic()
        _load_env_file(env_file)

    os.environ.setdefault("APP_ENV", "production")
    os.environ.setdefault("HOST", "0.0.0.0")
    os.environ.setdefault("BACKEND_PORT", "8001")
    db_path = root / "data" / "clinica.db"
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    os.environ.setdefault("UPLOAD_DIR", str(root / "uploads"))
    os.environ.setdefault("NKDENTALSOFT_INSTALL_DIR", str(_install_dir()))
    os.environ.setdefault("NKDENTALSOFT_UI_DIR", str(_install_dir() / "web"))

    install = _install_dir()
    meipass = _meipass()
    for p in (meipass, install):
        if p and p.exists() and str(p) not in sys.path:
            sys.path.insert(0, str(p))

    if not _secrets_ok():
        raise RuntimeError(
            "No hay secretos de producción válidos en "
            f"{env_file}. Ejecute: nkdentalsoft-server.exe --init-clinic"
        )
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
    log(f"install_dir={_install_dir()}")
    log(f"programdata={root}")
    log(f"APP_ENV={os.environ.get('APP_ENV')}")
    try:
        bootstrap_schema()
    except Exception as exc:  # noqa: BLE001
        log(f"schema bootstrap failed: {exc}")
        traceback.print_exc()
        raise

    import uvicorn
    from app.main import app as fastapi_app

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("BACKEND_PORT", "8001"))
    cert = root / "certs" / "server.crt"
    key = root / "certs" / "server.key"
    kwargs: dict = {
        "app": fastapi_app,  # object import — required for PyInstaller frozen EXE
        "host": host,
        "port": port,
        "log_level": "info",
    }
    if cert.is_file() and key.is_file():
        kwargs["ssl_certfile"] = str(cert)
        kwargs["ssl_keyfile"] = str(key)
        log(f"HTTPS listening on https://{host}:{port}/")
    else:
        log(f"WARNING: no TLS certs — HTTP on http://{host}:{port}/")
    uvicorn.run(**kwargs)


def pause_if_interactive() -> None:
    if sys.stdin is None or not sys.stdin.isatty():
        # Still try to keep a console visible when double-clicked
        try:
            input("\nPresione Enter para cerrar...")
        except Exception:
            import time

            time.sleep(20)
        return
    try:
        input("\nPresione Enter para cerrar...")
    except Exception:
        pass


def main() -> None:
    try:
        run_server()
    except Exception as exc:
        log(f"FATAL: {exc}")
        traceback.print_exc()
        print(
            "\nNo se pudo iniciar N&K DentalSoft Server.\n"
            f"Revise el log: {_log_path()}\n",
            flush=True,
        )
        pause_if_interactive()
        sys.exit(1)


if __name__ == "__main__":
    main()
