"""Serve the static Next.js export (frontend/out) from FastAPI.

Used by the Windows Server .exe so UI + API share one origin/port.
Serving is done via HTTP middleware so `/` always hits the SPA even when
route registration order would otherwise yield FastAPI `{"detail":"Not Found"}`.
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from starlette.requests import Request

logger = logging.getLogger("dentalfacil.frontend_static")

_cached_ui_root: Path | None | bool = False  # False = unset, None = missing, Path = found
_mirror_attempted = False


def _exe_dir() -> Path | None:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return None


def _meipass_dir() -> Path | None:
    raw = getattr(sys, "_MEIPASS", None)
    return Path(raw).resolve() if raw else None


def ensure_web_dir_beside_exe() -> None:
    """If UI lives only under _internal/web, mirror it next to the .exe for services."""
    global _mirror_attempted
    if _mirror_attempted:
        return
    _mirror_attempted = True
    exe_dir = _exe_dir()
    meipass = _meipass_dir()
    if not exe_dir or not meipass:
        return
    dest = exe_dir / "web"
    src = meipass / "web"
    if (dest / "index.html").is_file():
        return
    if not (src / "index.html").is_file():
        return
    try:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(src, dest)
        logger.info("mirrored UI web/ from _internal to %s", dest)
    except OSError as exc:
        logger.warning("could not mirror web/ beside exe: %s", exc)


def resolve_ui_root() -> Path | None:
    global _cached_ui_root
    if _cached_ui_root is not False:
        return _cached_ui_root  # type: ignore[return-value]

    ensure_web_dir_beside_exe()
    env = os.environ.get("NKDENTALSOFT_UI_DIR") or os.environ.get("FRONTEND_OUT_DIR")
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env))
    exe_dir = _exe_dir()
    meipass = _meipass_dir()
    if exe_dir:
        candidates.extend([exe_dir / "web", exe_dir / "frontend" / "out"])
    if meipass:
        candidates.append(meipass / "web")
    repo = Path(__file__).resolve().parents[2]
    candidates.append(repo / "frontend" / "out")

    for c in candidates:
        try:
            if (c / "index.html").is_file():
                _cached_ui_root = c.resolve()
                return _cached_ui_root
        except OSError:
            continue
    logger.warning("UI not found. Searched: %s", [str(c) for c in candidates])
    _cached_ui_root = None
    return None


def _safe_file(root: Path, candidate: Path) -> Path | None:
    try:
        resolved = candidate.resolve()
        resolved.relative_to(root.resolve())
    except (OSError, ValueError):
        return None
    return resolved if resolved.is_file() else None


def pick_ui_file(root: Path, url_path: str) -> Path | None:
    rel = (url_path or "").strip("/")
    candidates: list[Path] = []
    if not rel:
        candidates.append(root / "index.html")
    else:
        candidates.append(root / rel)
        candidates.append(root / f"{rel}.html")
        candidates.append(root / rel / "index.html")
        parts = rel.split("/")
        if len(parts) >= 2 and parts[0] == "pacientes" and parts[1] not in {"nuevo", "_"}:
            candidates.append(root / "pacientes" / "_" / "index.html")
    for c in candidates:
        hit = _safe_file(root, c)
        if hit is not None:
            return hit
    last = rel.rsplit("/", 1)[-1] if rel else ""
    if last and "." in last and not last.endswith(".html"):
        return None
    return _safe_file(root, root / "index.html")


_MISSING_UI_HTML = """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>N&amp;K DentalSoft</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#0f172a}
code{background:#f1f5f9;padding:.1rem .35rem;border-radius:4px}</style></head>
<body>
<h1>UI no empaquetada</h1>
<p>El API del servidor responde, pero falta la carpeta <code>web/</code> con el frontend.</p>
<p>Reinstale <strong>NKDentalSoft-Server-Setup-x64.exe</strong> (build con UI embebida) o copie
<code>frontend/out</code> a <code>Program Files\\NKDentalSoft\\Server\\web</code>.</p>
<p>Compruebe: <a href="/api/system/health">/api/system/health</a></p>
</body></html>
"""


def mount_frontend_static(app: FastAPI) -> Path | None:
    """Attach middleware that serves the Next export for non-API GET/HEAD requests."""
    root = resolve_ui_root()

    @app.middleware("http")
    async def frontend_spa_middleware(request: Request, call_next):
        path = request.url.path or "/"
        if request.method not in {"GET", "HEAD"}:
            return await call_next(request)
        if (
            path.startswith("/api")
            or path.startswith("/docs")
            or path.startswith("/openapi")
            or path.startswith("/redoc")
            or path.startswith("/assets/uploads")
        ):
            return await call_next(request)

        ui = resolve_ui_root()
        if ui is None:
            if path == "/" or path == "":
                return HTMLResponse(_MISSING_UI_HTML, status_code=503)
            return await call_next(request)

        hit = pick_ui_file(ui, path)
        if hit is None:
            return await call_next(request)
        return FileResponse(hit)

    if root is not None:
        # Tiny JSON hint for operators
        @app.get("/api/system/ui-root")
        def ui_root_info():
            return {"ui_root": str(root), "index": (root / "index.html").is_file()}

        logger.info("frontend UI ready at %s", root)
    else:
        @app.get("/api/system/ui-root")
        def ui_root_missing():
            return JSONResponse(
                {"ui_root": None, "detail": "web/ not found beside server"},
                status_code=503,
            )
        logger.error("frontend UI NOT FOUND — / will show setup instructions")

    return root
