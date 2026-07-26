"""LAN system endpoints for health, version, env-check, and client updater manifest."""

from __future__ import annotations

import os
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse

from app.config import (
    JWT_SECRET_MIN_LENGTH,
    MAINTENANCE_ACCESS_KEY_DEV_DEFAULT,
    MAINTENANCE_ACCESS_KEY_MIN_LENGTH,
    settings,
)
from app.core.deps import require_roles
from app.core.roles import Rol
from app.migrate import migrations_status
from app.models import User
from app.version import PRODUCT_VERSION

router = APIRouter(prefix="/api/system", tags=["system"])


def build_health_payload(*, scheduler: dict[str, Any] | None = None) -> dict[str, Any]:
    from app.db_health import ping_database, schema_ready

    mig = migrations_status()
    db_connected = ping_database()
    tables_ok, tables_err = schema_ready() if db_connected else (False, None)
    url = settings.DATABASE_URL or ""
    url_ok = (
        (
            url.startswith("postgresql+psycopg://")
            or url.startswith("postgresql://")
            or url.startswith("sqlite:")
        )
        and "@127.0.0.1:1/" not in url
    )
    engine_kind = "sqlite" if settings.is_sqlite else "postgres"
    user_count = None
    if db_connected and tables_ok:
        try:
            from sqlalchemy import text

            from app.database import engine

            with engine.connect() as conn:
                user_count = int(conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0)
        except Exception:  # noqa: BLE001
            user_count = None
    ready = url_ok and db_connected and mig["ok"] and tables_ok
    jwt_ok = settings.jwt_secret_is_secure
    if settings.is_production and not jwt_ok:
        ready = False
    maint_key = (settings.MAINTENANCE_ACCESS_KEY or "").strip()
    maint_ok = bool(
        maint_key
        and maint_key != MAINTENANCE_ACCESS_KEY_DEV_DEFAULT
        and len(maint_key) >= MAINTENANCE_ACCESS_KEY_MIN_LENGTH
    )
    if settings.is_production and not maint_ok:
        ready = False

    ui_root = None
    ui_ok = False
    try:
        from app.frontend_static import resolve_ui_root

        ui_root_path = resolve_ui_root()
        if ui_root_path is not None:
            ui_root = str(ui_root_path)
            ui_ok = (ui_root_path / "index.html").is_file()
    except Exception:  # noqa: BLE001
        ui_ok = False

    return {
        "status": "ok" if ready else "degraded",
        "app": settings.APP_NAME,
        "product": settings.PRODUCT_NAME,
        "version": PRODUCT_VERSION,
        "app_env": settings.APP_ENV,
        "engine": engine_kind,
        "user_count": user_count,
        "database_url_configured": url_ok,
        "database_connected": db_connected,
        "migrations_ok": mig["ok"],
        "migrations_error": mig["error"],
        "schema_ready": tables_ok,
        "schema_error": tables_err,
        "jwt_secret_configured": jwt_ok,
        "ui_mounted": ui_ok,
        "ui_root": ui_root,
        "maintenance_key_configured": maint_ok if settings.is_production else bool(maint_key or True),
        "scheduler": scheduler or {"running": False, "jobs": [], "next_run": None},
    }


@router.get("/health")
def system_health(request: Request):
    """Public connectivity probe for client installers and Tauri wizard."""
    sch = getattr(request.app.state, "scheduler_health", None)
    payload = build_health_payload(scheduler=sch() if callable(sch) else None)
    return payload


@router.get("/version")
def system_version():
    return {
        "version": PRODUCT_VERSION,
        "app": settings.APP_NAME,
        "product": settings.PRODUCT_NAME,
        "product_slug": settings.PRODUCT_SLUG,
    }


@router.get("/env-check")
def system_env_check(
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """
    Post-install verification (ADMIN). Confirms production secrets without
    leaking secret values.
    """
    _ = admin
    jwt_ok = settings.jwt_secret_is_secure
    maint = (settings.MAINTENANCE_ACCESS_KEY or "").strip()
    maint_ok = (
        bool(maint)
        and maint != MAINTENANCE_ACCESS_KEY_DEV_DEFAULT
        and len(maint) >= MAINTENANCE_ACCESS_KEY_MIN_LENGTH
    )
    app_env = (settings.APP_ENV or "").strip().lower()
    production = settings.is_production
    ok = production and jwt_ok and maint_ok
    return {
        "ok": ok,
        "app_env": settings.APP_ENV,
        "is_production": production,
        "jwt_secret_ok": jwt_ok,
        "jwt_secret_min_length": JWT_SECRET_MIN_LENGTH,
        "maintenance_key_ok": maint_ok,
        "maintenance_key_min_length": MAINTENANCE_ACCESS_KEY_MIN_LENGTH,
        "legacy_maintenance_key_rejected": maint != MAINTENANCE_ACCESS_KEY_DEV_DEFAULT,
        "checks": {
            "app_env_production": production,
            "jwt_secret": jwt_ok,
            "maintenance_access_key": maint_ok,
        },
    }


@router.get("/client-manifest.json")
def client_manifest():
    """
    Tauri updater feed (LAN self-hosted). Place signed artifacts under
    %ProgramData%\\NKDentalSoft\\updates\\ when distributing client builds.
    """
    base = Path(
        os.environ.get("NKDENTALSOFT_UPDATES_DIR")
        or (Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "NKDentalSoft" / "updates")
    )
    manifest_path = base / "client-manifest.json"
    if manifest_path.is_file():
        return FileResponse(manifest_path, media_type="application/json")
    return JSONResponse(
        {
            "version": PRODUCT_VERSION,
            "platforms": {},
            "notes": "No client update package published on this server yet.",
        }
    )


def _lan_ipv4_addresses() -> list[str]:
    """Non-loopback clinic LAN IPv4 (Ethernet preferred; no VPN/APIPA/Hyper-V)."""
    from app.services.lan_network import clinic_ipv4_list

    return clinic_ipv4_list()


@router.get("/lan")
def system_lan_info(
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """
    How other PCs join this clinic server (ADMIN).
    Bind is typically 0.0.0.0:8001 — clients use http://<LAN-IP>:8001/
    """
    _ = admin
    return _connect_info_payload()


@router.get("/connect-info")
def system_connect_info():
    """
    Public (no auth) LAN join card for Client installers / ConnectClinic.
    Does not expose secrets — only hostname, port and URLs.
    """
    return _connect_info_payload()


def _connect_info_payload() -> dict[str, Any]:
    from app.services.lan_network import get_clinic_lan_ips

    port = int(os.environ.get("BACKEND_PORT") or 8001)
    # Desktop must always bind all interfaces for LAN clients
    host = "0.0.0.0"
    os.environ["HOST"] = host
    rows = get_clinic_lan_ips()
    ips = [r["ip"] for r in rows]
    hostname = socket.gethostname()
    urls = [f"http://{ip}:{port}/" for ip in ips]
    eth = next((r for r in rows if r.get("ethernet")), None)
    recommended = (
        f"http://{eth['ip']}:{port}/"
        if eth
        else (urls[0] if urls else f"http://127.0.0.1:{port}/")
    )
    return {
        "host_bind": host,
        "port": port,
        "hostname": hostname,
        "listening_all_interfaces": True,
        "lan_ips": ips,
        "interfaces": rows,
        "client_urls": urls,
        "recommended_url": recommended,
        "local_url": f"http://127.0.0.1:{port}/",
        "firewall_rule": "NKDentalSoft Server 8001",
        "discovery_udp_port": 37020,
        "hint": (
            "IMPORTANTE: copie la URL recomendada (IP Ethernet). "
            "Si cambia el PC servidor, la IP cambia — vuelva a Copiar. "
            "Si el Client dice que no hay ping: 1) desconecte VPN  2) use la IP ACTUAL "
            "del Server (no una vieja)  3) active Modo Hotspot de clinica "
            "(menu Inicio → Activar Hotspot clinica) para saltarse el aislamiento del router."
        ),
    }


@router.get("/connections")
def system_connections(
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """Live users connected via WebSocket (ADMIN) — Caja / Doctor / Asistente, etc."""
    _ = admin
    from app.realtime.connection_manager import manager

    snap = manager.snapshot()
    return {
        **snap,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
