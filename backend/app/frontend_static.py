"""Serve the embedded Next.js export from FastAPI (same origin as /api).

Professional pattern (Starlette):
  1. Register all API routers first.
  2. Mount SpaStaticFiles at "/" LAST so unmatched paths (including "/")
     are served as the SPA, while /api/* keeps matching the routers.

Never return bare ``{"detail":"Not Found"}`` JSON for browser navigations
(text/html Accept) — that blank-white WebView after login/resume is fatal for
clinic desktop mode.
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
from starlette.responses import FileResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

logger = logging.getLogger("dentalfacil.frontend_static")

_cached_ui_root: Path | None | bool = False  # False=unset
_mirror_attempted = False

_RECOVERY_HTML = """<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>N&amp;K DentalSoft</title>
<meta http-equiv="refresh" content="2;url=/"/>
<style>
 body{font-family:"Segoe UI",system-ui,sans-serif;max-width:28rem;margin:15vh auto;padding:0 1.25rem;
  color:#0f172a;line-height:1.5;text-align:center}
 h1{font-size:1.15rem;margin:0 0 .5rem}
 p{color:#475569;font-size:.95rem}
 a{color:#1d4ed8}
 .spin{width:2rem;height:2rem;margin:1rem auto;border:3px solid #e2e8f0;border-top-color:#55BBF9;
  border-radius:50%;animation:s .7s linear infinite}
 @keyframes s{to{transform:rotate(360deg)}}
</style>
</head><body>
<div class="spin" aria-hidden="true"></div>
<h1>Reconectando la interfaz</h1>
<p>El servidor respondió sin la pantalla de la clínica (posiblemente tras reanudar el PC del suspensión).</p>
<p><a href="/">Volver al inicio de sesión</a> · <a href="/dashboard/">Ir al panel</a></p>
<script>
try {
  var t = (document.body && document.body.innerText || "").trim();
  if (t.indexOf('{"detail"') === 0) { location.replace("/"); }
} catch (e) {}
</script>
</body></html>
"""

_KNOWN_APP_SHELLS = frozenset(
    {
        "dashboard",
        "pacientes",
        "agenda",
        "caja",
        "reportes",
        "configuracion",
        "ops",
        "recuperar-clave",
    }
)


def invalidate_ui_root_cache() -> None:
    """Drop cached UI root (e.g. after sleep when disk was briefly offline)."""
    global _cached_ui_root
    _cached_ui_root = False


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
    """Mirror packaged UI beside the exe; refresh on upgrade when MEIPASS is newer."""
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
    if not (src / "index.html").is_file():
        return

    need_sync = not (dest / "index.html").is_file()
    if not need_sync:
        try:
            src_mtime = (src / "index.html").stat().st_mtime
            dest_mtime = (dest / "index.html").stat().st_mtime
            if src_mtime > dest_mtime + 1:
                need_sync = True
            else:
                hero = dest / "login" / "dental-equipment-bg-v2.webp"
                src_hero = src / "login" / "dental-equipment-bg-v2.webp"
                if src_hero.is_file() and not hero.is_file():
                    need_sync = True
        except OSError:
            need_sync = True

    if not need_sync:
        return
    try:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(src, dest)
        logger.info("mirrored UI to %s", dest)
    except OSError as exc:
        logger.warning("could not mirror web/: %s", exc)


def resolve_ui_root(*, force: bool = False) -> Path | None:
    global _cached_ui_root
    if force:
        _cached_ui_root = False
    if _cached_ui_root is not False:
        root = _cached_ui_root
        if root is not None and not (Path(root) / "index.html").is_file():
            _cached_ui_root = False
        else:
            return root  # type: ignore[return-value]

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
    """Return path relative to root (posix) suitable for StaticFiles, or None."""
    rel = (url_path or "").replace("\\", "/").strip("/")
    rel = rel.split("?", 1)[0].split("#", 1)[0]
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

        if (
            len(parts) >= 2
            and parts[0] == "pacientes"
            and parts[1] not in {"nuevo", "_"}
            and not looks_like_asset
        ):
            candidates.append(root / "pacientes" / "_" / "index.html")

        if parts and parts[0] in _KNOWN_APP_SHELLS:
            candidates.append(root / parts[0] / "index.html")

    root_res = root.resolve()
    for c in candidates:
        try:
            resolved = c.resolve()
            resolved.relative_to(root_res)
        except (OSError, ValueError):
            continue
        if resolved.is_file():
            return resolved.relative_to(root_res).as_posix()
    return None


class SpaStaticFiles(StaticFiles):
    """StaticFiles with Next.js export + client-route fallbacks."""

    def __init__(self, directory: Path, **kwargs):
        super().__init__(directory=str(directory), html=True, check_dir=True, **kwargs)
        self._root = Path(directory).resolve()

    def _html_accepts(self, scope: Scope) -> bool:
        headers = scope.get("headers") or []
        accept = b""
        for k, v in headers:
            if k == b"accept":
                accept = v
                break
        if not accept:
            return True
        al = accept.lower()
        if b"application/json" in al and b"text/html" not in al:
            return False
        return True

    def _recovery_response(self) -> Response:
        for name in ("404.html", "index.html"):
            p = self._root / name
            if p.is_file():
                try:
                    return FileResponse(
                        p,
                        media_type="text/html; charset=utf-8",
                        headers={
                            "Cache-Control": "no-cache, must-revalidate",
                            "Pragma": "no-cache",
                        },
                    )
                except OSError:
                    pass
        return HTMLResponse(
            _RECOVERY_HTML,
            status_code=200,
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )

    async def get_response(self, path: str, scope: Scope) -> Response:
        if not self._root.is_dir() or not (self._root / "index.html").is_file():
            fresh = resolve_ui_root(force=True)
            if fresh is not None:
                self._root = fresh
                self.directory = str(fresh)

        path_norm = (path or "").replace("\\", "/")
        if not path_norm or path_norm in {".", "/"}:
            path_norm = "index.html"

        try:
            response = await super().get_response(path_norm, scope)
            if getattr(response, "status_code", 200) != 404:
                self._apply_asset_cache_headers(path_norm, response)
                return response
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise

        for attempt in range(2):
            alt = pick_ui_relpath(self._root, path_norm)
            if alt:
                try:
                    response = await super().get_response(alt, scope)
                    if getattr(response, "status_code", 200) != 404:
                        self._apply_asset_cache_headers(alt, response)
                        return response
                except StarletteHTTPException as exc:
                    if exc.status_code != 404:
                        raise
            if attempt == 0:
                fresh = resolve_ui_root(force=True)
                if fresh is not None:
                    self._root = fresh
                    self.directory = str(fresh)

        if self._html_accepts(scope):
            logger.warning("SPA path missing (serving recovery HTML): %s", path_norm)
            return self._recovery_response()

        raise StarletteHTTPException(status_code=404, detail="Not Found")

    @staticmethod
    def _apply_asset_cache_headers(path: str, response: Response) -> None:
        lower = (path or "").replace("\\", "/").lower()
        if lower.endswith((".html",)) or "/login/" in lower or lower.startswith("login/"):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"


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
        current = resolve_ui_root(force=False)
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

    app.mount("/", SpaStaticFiles(directory=root), name="nkdentalsoft_spa")
    logger.info("SPA mounted at / from %s", root)
    return root
