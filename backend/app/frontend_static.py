"""Serve the static Next.js export (frontend/out) from FastAPI.

Used by the Windows Server .exe so UI + API share one origin/port (HTTPS :8001).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def resolve_ui_root() -> Path | None:
    env = os.environ.get("NKDENTALSOFT_UI_DIR") or os.environ.get("FRONTEND_OUT_DIR")
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env))
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", sys.executable)).resolve()
        exe_dir = Path(sys.executable).resolve().parent
        candidates.extend(
            [
                exe_dir / "web",
                meipass / "web",
                exe_dir / "frontend" / "out",
            ]
        )
    else:
        # backend/app/frontend_static.py → repo root is parents[2]
        repo = Path(__file__).resolve().parents[2]
        candidates.append(repo / "frontend" / "out")
    for c in candidates:
        if (c / "index.html").is_file():
            return c.resolve()
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
    # Client-side routes: serve shell (not for missing static assets)
    last = rel.rsplit("/", 1)[-1] if rel else ""
    if last and "." in last and not last.endswith(".html"):
        return None
    return _safe_file(root, root / "index.html")


def mount_frontend_static(app: FastAPI) -> Path | None:
    """Register static mounts + SPA catch-all. Call AFTER API routers."""
    root = resolve_ui_root()
    if root is None:
        return None

    next_dir = root / "_next"
    if next_dir.is_dir():
        app.mount("/_next", StaticFiles(directory=str(next_dir)), name="next_assets")

    for name in ("dientes", "odontogram", "login"):
        p = root / name
        if p.is_dir():
            app.mount(f"/{name}", StaticFiles(directory=str(p)), name=f"ui_{name}")

    @app.get("/")
    async def ui_index():
        index = root / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="UI not packaged")
        return FileResponse(index)

    @app.get("/{full_path:path}")
    async def ui_spa(full_path: str):
        # Belt-and-suspenders: never shadow API if a mount order bug appears
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not Found")
        hit = pick_ui_file(root, full_path)
        if hit is None:
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(hit)

    return root
