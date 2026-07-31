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
    """Clinic data root. Frozen builds ignore a polluted PROGRAMDATA env."""
    override = (os.environ.get("NKDENTALSOFT_DATA_DIR") or "").strip()
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        # Always the real machine ProgramData — never a parent-shell temp override
        root = Path(os.environ.get("SystemDrive", "C:") + r"\ProgramData") / "NKDentalSoft"
        return root
    pd = os.environ.get("PROGRAMDATA") or str(Path(os.environ.get("SystemDrive", "C:")) / "ProgramData")
    return Path(pd) / "NKDentalSoft"


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
        key = k.strip()
        val = v.strip()
        # Allow launcher TLS/UI flags to win; port/host always come from clinic .env
        # when present (avoids polluted BACKEND_PORT from parent shells).
        if key.startswith("NKDENTALSOFT_") and key in os.environ:
            continue
        os.environ[key] = val


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


def _generate_selfsigned_cert(
    out_dir: Path,
    *,
    common_name: str = "nkdentalsoft-server.local",
    extra_hosts: list[str] | None = None,
    days: int = 825,
) -> dict[str, str]:
    """Create server.crt/key using cryptography from the frozen bundle (not loose scripts)."""
    import hashlib
    import ipaddress
    from datetime import datetime, timedelta, timezone

    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError as exc:
        raise RuntimeError(
            f"cryptography no disponible en el Server empaquetado: {exc!r}"
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, common_name)]
    )
    alt_names: list = [x509.DNSName(common_name)]
    for h in extra_hosts or []:
        h = (h or "").strip()
        if not h:
            continue
        try:
            alt_names.append(x509.IPAddress(ipaddress.ip_address(h)))
        except ValueError:
            alt_names.append(x509.DNSName(h))

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .sign(key, hashes.SHA256())
    )

    key_path = out_dir / "server.key"
    cert_path = out_dir / "server.crt"
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    fingerprint = hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    (out_dir / "fingerprint.sha256").write_text(fingerprint + "\n", encoding="utf-8")
    return {
        "key": str(key_path),
        "cert": str(cert_path),
        "fingerprint_sha256": fingerprint,
    }


def init_clinic(host: str | None = None) -> None:
    """Generate unique .env + self-signed cert under ProgramData."""
    root = _programdata()
    for sub in (
        "config",
        "data",
        "logs",
        "certs",
        "uploads",
        "updates",
        "complementary_tests",
        "tooth_media",
        "historical_documents",
    ):
        (root / sub).mkdir(parents=True, exist_ok=True)

    gps, _gsc = _import_init_helpers()
    out_env = _env_path()
    jwt_secret, maint = gps.generate_secrets()
    gps.write_env(out_env, jwt_secret=jwt_secret, maintenance_key=maint)
    log(f"Wrote production env: {out_env}")

    lan = (host or "").strip() or _detect_lan_ip()
    hosts = ["127.0.0.1", "localhost", "nkdentalsoft-server.local", lan]
    info = _generate_selfsigned_cert(
        root / "certs",
        common_name="nkdentalsoft-server.local",
        extra_hosts=hosts,
    )
    log(f"lan_ip={lan}")
    log(f"fingerprint_sha256={info['fingerprint_sha256']}")


def prepare_environment() -> Path:
    root = _programdata()
    for sub in (
        "config",
        "data",
        "logs",
        "certs",
        "uploads",
        "updates",
        "complementary_tests",
        "tooth_media",
        "historical_documents",
    ):
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

    # TLS certs may be missing even when .env exists (partial install)
    cert = root / "certs" / "server.crt"
    key = root / "certs" / "server.key"
    if not cert.is_file() or not key.is_file():
        log("TLS certs missing — regenerating self-signed certificate")
        try:
            lan = _detect_lan_ip()
            info = _generate_selfsigned_cert(
                root / "certs",
                common_name="nkdentalsoft-server.local",
                extra_hosts=["127.0.0.1", "localhost", "nkdentalsoft-server.local", lan],
            )
            log(f"fingerprint_sha256={info['fingerprint_sha256']}")
        except Exception as exc:  # noqa: BLE001
            log(f"WARNING: could not generate TLS certs: {exc}")

    os.environ.setdefault("APP_ENV", "production")
    # Always listen on all interfaces for clinic LAN (never 127.0.0.1)
    os.environ["HOST"] = "0.0.0.0"
    os.environ.setdefault("BACKEND_PORT", "8001")
    db_path = root / "data" / "clinica.db"
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    os.environ.setdefault("UPLOAD_DIR", str(root / "uploads"))
    # Clinical media must be writable (never under Program Files / PyInstaller _MEIPASS)
    os.environ.setdefault("COMPLEMENTARY_TESTS_ROOT", str(root / "complementary_tests"))
    os.environ.setdefault("TOOTH_MEDIA_ROOT", str(root / "tooth_media"))
    os.environ.setdefault("HISTORICAL_DOCUMENTS_ROOT", str(root / "historical_documents"))
    os.environ.setdefault("NKDENTALSOFT_INSTALL_DIR", str(_install_dir()))
    # Prefer a real web/ tree for the SPA mount
    for candidate in (
        _install_dir() / "web",
        (_meipass() / "web") if _meipass() else None,
        _install_dir() / "_internal" / "web",
    ):
        if candidate and (candidate / "index.html").is_file():
            os.environ["NKDENTALSOFT_UI_DIR"] = str(candidate.resolve())
            break
    else:
        os.environ.setdefault("NKDENTALSOFT_UI_DIR", str(_install_dir() / "web"))

    # Help Alembic find bundled ini when cwd differs
    meipass = _meipass()
    for candidate in (meipass, _install_dir()):
        if candidate and (candidate / "alembic.ini").is_file():
            os.environ.setdefault("ALEMBIC_CONFIG", str(candidate / "alembic.ini"))
            break

    install = _install_dir()
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


def _port_holder(port: int) -> str | None:
    """If something accepts TCP on port, return a marker; else None (free)."""
    import socket

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.6):
            return f"tcp-accept on 127.0.0.1:{port}"
    except OSError:
        return None


def _assert_port_free(port: int) -> None:
    holder = _port_holder(port)
    if holder is None:
        return
    msg = (
        f"Puerto {port} ya esta en uso ({holder}). "
        "Ejecute scripts\\stop_for_upgrade.ps1 o repair_startup.cmd "
        "como Administrador y vuelva a abrir N&K DentalSoft."
    )
    log(f"FATAL: {msg}")
    raise RuntimeError(msg)


def run_server() -> None:
    # Desktop default: HTTP. HTTPS only with NKDENTALSOFT_FORCE_TLS=1.
    os.environ.pop("NKDENTALSOFT_FORCE_TLS", None)
    os.environ["NKDENTALSOFT_DISABLE_TLS"] = "1"
    root = prepare_environment()
    log(f"install_dir={_install_dir()}")
    log(f"programdata={root}")
    log(f"APP_ENV={os.environ.get('APP_ENV')}")
    log(f"UI_DIR={os.environ.get('NKDENTALSOFT_UI_DIR')}")
    ui_probe = Path(os.environ.get("NKDENTALSOFT_UI_DIR") or (_install_dir() / "web"))
    log(f"UI index exists={ (ui_probe / 'index.html').is_file() } path={ui_probe / 'index.html'}")
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
    _assert_port_free(port)
    cert = root / "certs" / "server.crt"
    key = root / "certs" / "server.key"
    force_tls = (os.environ.get("NKDENTALSOFT_FORCE_TLS") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    use_tls = bool(force_tls and cert.is_file() and key.is_file())

    kwargs: dict = {
        "app": fastapi_app,  # object import — required for PyInstaller frozen EXE
        "host": host,
        "port": port,
        "log_level": "info",
    }
    if use_tls:
        kwargs["ssl_certfile"] = str(cert)
        kwargs["ssl_keyfile"] = str(key)
        log(f"HTTPS listening on https://{host}:{port}/")
    else:
        log(f"HTTP listening on http://{host}:{port}/ (desktop mode)")
    # Open Windows Firewall for other clinic PCs (best-effort; needs admin for full effect)
    try:
        from app.services.firewall_lan import ensure_lan_firewall

        ensure_lan_firewall(http_port=port)
        log("firewall LAN rules applied (or attempted)")
    except Exception as fw_exc:  # noqa: BLE001
        log(f"firewall ensure skipped: {fw_exc}")
    try:
        uvicorn.run(**kwargs)
    except Exception as exc:
        log(f"uvicorn exited with error: {exc}")
        traceback.print_exc()
        raise


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
