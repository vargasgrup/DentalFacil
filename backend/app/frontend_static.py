"""Serve the embedded Next.js export from FastAPI (same origin as /api).

Professional pattern (Starlette):
  1. Register all API routers first.
  2. Mount SpaStaticFiles at "/" LAST so unmatched paths (including "/")
     are served as the SPA, while /api/* keeps matching the routers.

This avoids FastAPI's default ``{"detail":"Not Found"}`` on the clinic homepage.
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

logger = logging.getLogger("dentalfacil.frontend_static")

_cached_ui_root: Path | None | bool = False  # False=unset
_mirror_attempted = False


def _install_dir() -> Path | None:
    env = (os.environ.get("NKDENTALSOFT_INSTALL_DIR") or "").strip()
    if env:
        p = Path(env)
        if p.is_dir():
            return p.resolve()
    if getattr(sys, "frozen", False):
        for raw in (sys.argv[0] if sys.argv else None, getattr(sys, "executable", None)):
            if not raw:
                continue
            p = Path(raw).resolve()
            if p.suffix.lower() == ".exe" and p.parent.is_dir():
                return p.parent
    return None


def _meipass_dir() -> Path | None:
    raw = getattr(sys, "_MEIPASS", None)
    return Path(raw).resolve() if raw else None


def ensure_web_dir_beside_exe() -> None:
    global _mirror_attempted
    if _mirror_attempted:
        return
    _mirror_attempted = True
    install = _install_dir()
    meipass = _meipass_dir()
    if not install or not meipass:
        return
    dest = install / "web"
    src = meipass / "web"
    if (dest / "index.html").is_file():
        return
    if not (src / "index.html").is_file():
        return
    try:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(src, dest)
        logger.info("mirrored UI to %s", dest)
    except OSError as exc:
        logger.warning("could not mirror web/: %s", exc)


def resolve_ui_root() -> Path | None:
    global _cached_ui_root
    if _cached_ui_root is not False:
        return _cached_ui_root  # type: ignore[return-value]

    ensure_web_dir_beside_exe()
    candidates: list[Path] = []

    env = (os.environ.get("NKDENTALSOFT_UI_DIR") or os.environ.get("FRONTEND_OUT_DIR") or "").strip()
    if env:
        candidates.append(Path(env))

    install = _install_dir()
    meipass = _meipass_dir()
    if install:
        candidates.extend([install / "web", install / "_internal" / "web"])
    if meipass:
        candidates.append(meipass / "web")

    # Dev / source tree
    repo = Path(__file__).resolve().parents[2]
    candidates.append(repo / "frontend" / "out")

    seen: set[str] = set()
    for c in candidates:
        key = str(c)
        if key in seen:
            continue
        seen.add(key)
        try:
            index = c / "index.html"
            if index.is_file():
                _cached_ui_root = c.resolve()
                logger.info("UI root resolved: %s", _cached_ui_root)
                return _cached_ui_root
        except OSError:
            continue

    logger.error("UI root NOT found. Tried: %s", [str(c) for c in candidates])
    _cached_ui_root = None
    return None


def pick_ui_relpath(root: Path, url_path: str) -> str | None:
    """Return path relative to root (posix) suitable for StaticFiles, or None.

    Starlette on Windows may pass backslash paths (``pacientes\\uuid``). Always
    normalize to ``/`` before matching Next.js ``output: "export"`` files.

    Never fall back to root ``index.html`` for missing app routes — that HTML is
    the login shell and authenticated clients bounce to ``/dashboard``.
    """
    rel = (url_path or "").replace("\\", "/").strip("/")
    candidates: list[Path] = []
    if not rel:
        candidates.append(root / "index.html")
    else:
        candidates.append(root / rel)
        candidates.append(root / f"{rel}.html")
        candidates.append(root / rel / "index.html")
        parts = [p for p in rel.split("/") if p]
        last = parts[-1] if parts else ""
        looks_like_asset = bool(last and "." in last and not last.endswith(".html"))

        # Dynamic patient ficha: export only embeds pacientes/_/index.html
        if (
            len(parts) >= 2
            and parts[0] == "pacientes"
            and parts[1] not in {"nuevo", "_"}
            and not looks_like_asset
        ):
            candidates.append(root / "pacientes" / "_" / "index.html")

    for c in candidates:
        try:
            resolved = c.resolve()
            resolved.relative_to(root.resolve())
        except (OSError, ValueError):
            continue
        if resolved.is_file():
            return resolved.relative_to(root.resolve()).as_posix()
    return None


class SpaStaticFiles(StaticFiles):
    """StaticFiles with Next.js export + client-route fallbacks."""

    def __init__(self, directory: Path, **kwargs):
        super().__init__(directory=str(directory), html=True, check_dir=True, **kwargs)
        self._root = Path(directory).resolve()

    async def get_response(self, path: str, scope: Scope) -> Response:
        # Starlette StaticFiles on Windows uses "\\" in path segments.
        path_norm = (path or "").replace("\\", "/")
        if not path_norm or path_norm in {".", "/"}:
            path_norm = "index.html"

        try:
            response = await super().get_response(path_norm, scope)
            if getattr(response, "status_code", 200) != 404:
                return response
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise

        alt = pick_ui_relpath(self._root, path_norm)
        if alt and alt != path_norm.lstrip("/"):
            try:
                return await super().get_response(alt, scope)
            except StarletteHTTPException:
                pass

        raise StarletteHTTPException(status_code=404, detail="Not Found")


_MISSING_UI_HTML = """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>N&amp;K DentalSoft</title>
<style>
 body{font-family:"Segoe UI",system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.25rem;color:#0f172a;line-height:1.5}
 h1{font-size:1.35rem} code{background:#f1f5f9;padding:.15rem .4rem;border-radius:6px}
 .box{border:1px solid #e2e8f0;border-radius:12px;padding:1rem 1.1rem;background:#f8fafc;margin:1rem 0}
 a{color:#1d4ed8}
</style></head><body>
<h1>Interfaz no encontrada</h1>
<p>El API responde en este puerto, pero falta el frontend embebido (<code>web/index.html</code>).</p>
<div class="box">
 <p><strong>Solucion:</strong> reinstale el Setup mas reciente
 <code>NKDentalSoft-Server-Setup-x64.exe</code> (incluye la carpeta <code>web/</code>).</p>
 <p>Verifique: <a href="/api/system/ui-root">/api/system/ui-root</a> ·
 <a href="/api/system/health">/api/system/health</a></p>
</div>
</body></html>
"""


def mount_frontend_static(app: FastAPI) -> Path | None:
    """Mount SPA at '/' AFTER all API routers have been registered."""
    root = resolve_ui_root()

    @app.get("/api/system/ui-root")
    def ui_root_info():
        current = resolve_ui_root()
        return {
            "ui_root": str(current) if current else None,
            "index": bool(current and (current / "index.html").is_file()),
            "install_dir": str(_install_dir()) if _install_dir() else None,
            "meipass": str(_meipass_dir()) if _meipass_dir() else None,
            "frozen": bool(getattr(sys, "frozen", False)),
        }

    if root is None:

        @app.get("/")
        async def ui_missing_root():
            return HTMLResponse(_MISSING_UI_HTML, status_code=503)

        logger.error("SPA mount skipped — web/ missing")
        return None

    # Mount LAST: only unmatched paths (not /api/*) reach this.
    app.mount("/", SpaStaticFiles(directory=root), name="nkdentalsoft_spa")
    logger.info("SPA mounted at / from %s", root)
    return root
