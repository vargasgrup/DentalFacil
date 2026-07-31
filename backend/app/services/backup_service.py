"""Consistent SQLite backup + restore packages (zip with DB + uploads)."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import threading
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, BinaryIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.migrate import HEAD_REVISION
from app.models import BackupHistory, BackupSettings, User
from app.models.ids import BACKUP_SETTINGS_ID, new_uuid
from app.paths import BACKEND_ROOT, resolve_sqlite_file, resolve_under_backend
from app.services.audit import log_audit
from app.sqlite_restore import apply_pending_sqlite_restore, stage_pending_restore

logger = get_logger("backup_service")

try:
    CLINIC_TZ = ZoneInfo("America/Lima")
except ZoneInfoNotFoundError:
    # Windows without tzdata: fixed UTC-5 (Peru does not observe DST)
    CLINIC_TZ = timezone(timedelta(hours=-5))
    logger.warning("tzdata missing — using fixed UTC-5 for America/Lima")
BACKUP_FORMAT_VERSION = "1.0"
CONFIRM_TOKEN = "CONFIRMAR"

_BACKEND_ROOT = BACKEND_ROOT
_DEFAULT_BACKUP_DIR = _BACKEND_ROOT / "app" / "backups"
_CLINIC_UPLOADS = Path(__file__).resolve().parents[1] / "assets" / "uploads"

_restore_lock = threading.Lock()
_restoring = False


def is_restore_in_progress() -> bool:
    return _restoring


def _utcnow() -> datetime:
    return _as_utc_aware()


def _slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "clinica").strip().lower()).strip("-")
    return (s or "clinica")[:40]


def expand_backup_path(raw: str) -> Path:
    """Expand %LOCALAPPDATA% / ~ and normalize for Windows desktop paths."""
    expanded = os.path.expandvars(os.path.expanduser((raw or "").strip()))
    return Path(expanded)


def validate_backup_directory(raw: str, *, create: bool = True) -> Path:
    """
    Resolve and optionally create a writable backup folder.
    Absolute paths preferred (e.g. D:\\Backups\\NKDentalSoft).
    Relative paths are anchored under the backend package root.
    """
    text = (raw or "").strip()
    if not text:
        path = _DEFAULT_BACKUP_DIR
    else:
        path = expand_backup_path(text)
        if not path.is_absolute():
            path = resolve_under_backend(path)
        # Block obvious junk
        if str(path) in (".", "..") or any(p == ".." for p in path.parts):
            raise HTTPException(
                status_code=400,
                detail="Ruta de backup no permitida",
            )
    try:
        path = path.resolve()
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Ruta de backup inválida: {exc}",
        ) from exc

    norm = str(path).lower().replace("/", "\\")
    if "\\program files" in norm or norm.startswith("c:\\windows"):
        raise HTTPException(
            status_code=400,
            detail=(
                "No use Program Files ni carpetas de Windows para backups. "
                "Elija Documentos, un disco de datos (D:) o un USB."
            ),
        )

    if create:
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / f".nk_backup_write_{new_uuid()[:8]}"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
        except OSError as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No se puede usar la carpeta de backup «{path}». "
                    f"Compruebe que existe, es escribible y no está bajo Program Files. ({exc})"
                ),
            ) from exc
    return path


_pick_lock = threading.Lock()


def _product_name() -> str:
    return (getattr(settings, "PRODUCT_NAME", None) or settings.APP_NAME or "N&K Dental Soft").strip()


def _product_slug() -> str:
    raw = (getattr(settings, "PRODUCT_SLUG", None) or "").strip()
    if raw:
        return _slug(raw)
    return _slug(_product_name())


def _as_utc_aware(dt: datetime | None = None) -> datetime:
    """Always persist/return timezone-aware UTC (avoids naive→local JS shifts)."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _normalize_initial_dir(initial_dir: str | None) -> str:
    """Folder dialogs require an existing SelectedPath on many Windows builds."""
    candidates: list[str] = []
    if initial_dir:
        try:
            candidates.append(str(expand_backup_path(initial_dir)))
        except Exception:  # noqa: BLE001
            candidates.append(initial_dir)
    try:
        candidates.append(str(_DEFAULT_BACKUP_DIR))
    except Exception:  # noqa: BLE001
        pass
    candidates.append(str(Path.home() / "Documents"))
    candidates.append(str(Path.home()))
    for raw in candidates:
        try:
            p = Path(raw)
            if p.is_dir():
                return str(p.resolve())
            p.mkdir(parents=True, exist_ok=True)
            if p.is_dir():
                return str(p.resolve())
        except OSError:
            continue
    return str(Path.home())


def _windows_powershell_exe() -> str:
    """Absolute powershell.exe — packaged desktop apps often have a broken PATH."""
    import shutil

    root = os.environ.get("SystemRoot") or os.environ.get("WINDIR") or r"C:\Windows"
    candidates = [
        str(Path(root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
        str(Path(root) / "SysWOW64" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
    ]
    for path in candidates:
        if Path(path).is_file():
            return path
    found = shutil.which("powershell.exe") or shutil.which("powershell")
    if found:
        return found
    raise FileNotFoundError(
        "No se encontró powershell.exe. Compruebe System32\\WindowsPowerShell."
    )


def _pick_directory_win32_shell(title: str, initial_dir: str | None) -> str | None:
    """
    Deprecated in-process Win32 browse — can ACCESS_VIOLATE under uvicorn and
    surface as plain «Internal Server Error». Kept only as a no-op raise so
    callers fall through to safe subprocess pickers.
    """
    _ = title, initial_dir
    raise RuntimeError("in-process Win32 picker disabled (use subprocess)")


def _pick_directory_python_subprocess(title: str, initial_dir: str | None) -> str | None:
    """
    Spawn the same Python interpreter with tkinter — works when PATH lacks powershell
    (typical of Windows desktop installers under custom folders).
    Uses a temp .py file so titles with & / accents do not break -c parsing.

    Frozen PyInstaller EXEs must NOT be used as the interpreter: re-launching
    ``nkdentalsoft-server.exe`` with a .py argv falls through to ``--desktop`` and
    opens another browser window instead of a folder dialog.
    """
    import subprocess
    import sys
    import tempfile
    import textwrap

    if getattr(sys, "frozen", False):
        raise RuntimeError("frozen EXE cannot host tkinter picker subprocess")

    start = _normalize_initial_dir(initial_dir)
    code = textwrap.dedent(
        r"""
        import sys
        from tkinter import Tk, filedialog

        title = sys.argv[1]
        initial = sys.argv[2] if len(sys.argv) > 2 else ""
        root = Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        root.update_idletasks()
        chosen = filedialog.askdirectory(
            parent=root,
            title=title,
            initialdir=initial or None,
            mustexist=False,
        )
        try:
            root.destroy()
        except Exception:
            pass
        if chosen:
            sys.stdout.buffer.write(chosen.encode("utf-8", errors="replace"))
        """
    )
    script_path = None
    proc = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".py", delete=False, encoding="utf-8"
        ) as fh:
            fh.write(code)
            script_path = fh.name
        creationflags = 0
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        proc = subprocess.run(
            [sys.executable, script_path, title, start],
            capture_output=True,
            timeout=600,
            creationflags=creationflags,
        )
    finally:
        if script_path:
            try:
                os.unlink(script_path)
            except OSError:
                pass
    if proc is None:
        raise RuntimeError("No se pudo iniciar el selector de carpetas")
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or f"Python folder picker exit={proc.returncode}")
    raw = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
    return raw or None


def _pick_directory_tk(title: str, initial_dir: str | None) -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    start = _normalize_initial_dir(initial_dir)
    chosen_holder: list[str | None] = []
    error_holder: list[BaseException] = []

    def _run() -> None:
        try:
            root = tk.Tk()
            root.withdraw()
            try:
                root.attributes("-topmost", True)
            except tk.TclError:
                pass
            root.update_idletasks()
            chosen = filedialog.askdirectory(
                parent=root,
                title=title,
                initialdir=start,
                mustexist=False,
            )
            root.destroy()
            chosen_holder.append(chosen or None)
        except BaseException as exc:  # noqa: BLE001
            error_holder.append(exc)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=600)
    if t.is_alive():
        raise RuntimeError("El selector de carpetas no respondió a tiempo")
    if error_holder:
        raise error_holder[0]
    return chosen_holder[0] if chosen_holder else None


def _pick_directory_windows_ps(title: str, initial_dir: str | None) -> str | None:
    """
    FolderBrowserDialog via powershell.exe + STA (desktop installer path).

    Important:
    - json.dumps(..., ensure_ascii=False): PowerShell does NOT expand \\u00e1 escapes,
      so ensure_ascii=True showed literal \"\\\\u00e1\" in the dialog description.
    - CREATE_NO_WINDOW + -WindowStyle Hidden: avoid a flashing console behind the dialog.
    - No invisible owner Form: Opacity=0 owners often make ShowDialog return Cancel.
    """
    import json
    import subprocess
    import tempfile

    start = _normalize_initial_dir(initial_dir)
    ps_exe = _windows_powershell_exe()
    # Real Unicode in the .ps1 (BOM); never \\uXXXX escapes for PS string literals.
    title_lit = json.dumps(title, ensure_ascii=False)
    start_lit = json.dumps(start, ensure_ascii=False)
    script = f"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
[System.Windows.Forms.Application]::EnableVisualStyles()
$start = {start_lit}
$title = {title_lit}
if (-not $start -or -not (Test-Path -LiteralPath $start)) {{
  $start = [Environment]::GetFolderPath('MyDocuments')
  if (-not $start) {{ $start = $env:USERPROFILE }}
}}
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $title
$dialog.SelectedPath = $start
$dialog.ShowNewFolderButton = $true
try {{
  $r = $dialog.ShowDialog()
  if ($r -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {{
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [Console]::OutputEncoding = $utf8
    [Console]::Out.WriteLine($dialog.SelectedPath)
  }}
}} finally {{
  $dialog.Dispose()
}}
"""
    with tempfile.NamedTemporaryFile(
        "w", suffix=".ps1", delete=False, encoding="utf-8-sig"
    ) as fh:
        fh.write(script)
        script_path = fh.name
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    try:
        proc = subprocess.run(
            [
                ps_exe,
                "-NoLogo",
                "-NoProfile",
                "-STA",
                "-WindowStyle",
                "Hidden",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_path,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
            creationflags=creationflags,
        )
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(err or "No se pudo abrir el selector de carpetas de Windows")
    lines = [ln.strip() for ln in (proc.stdout or "").splitlines() if ln.strip()]
    if not lines:
        return None
    return lines[-1] or None


def native_folder_picker_available() -> dict[str, Any]:
    """
    Native OS folder dialogs only work when the API process has a desktop GUI.
    Linux/Docker/Railway (no DISPLAY, no tk) must use suggested paths / manual entry.
    """
    platform = "windows" if os.name == "nt" else ("darwin" if sys_platform_is_darwin() else "linux")
    if os.name == "nt":
        return {
            "available": True,
            "platform": platform,
            "reason": "",
        }
    has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    tk_ok = False
    tk_err = ""
    try:
        import tkinter  # noqa: F401

        tk_ok = True
    except Exception as exc:  # noqa: BLE001
        tk_err = str(exc)
    available = bool(has_display and tk_ok)
    reason = ""
    if not has_display:
        reason = "El servidor no tiene escritorio gráfico (DISPLAY)."
    elif not tk_ok:
        reason = f"Tkinter no está disponible en el servidor ({tk_err[:120]})."
    return {"available": available, "platform": platform, "reason": reason}


def sys_platform_is_darwin() -> bool:
    import sys

    return sys.platform == "darwin"


def list_suggested_backup_directories() -> list[dict[str, str]]:
    """Writable candidate folders for one-click setup (server-side paths)."""
    from app.paths import default_data_dir

    suggestions: list[tuple[str, Path]] = []
    home = Path.home()
    data = default_data_dir() / "backups"
    suggestions.append(("Carpeta de datos N&K (recomendado)", data))

    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            suggestions.append(
                ("AppData local", Path(local) / "NKDentalSoft" / "backups")
            )
        suggestions.extend(
            [
                ("Documentos", home / "Documents" / "NKDentalSoft" / "backups"),
                ("Escritorio", home / "Desktop" / "NKDentalSoft-Backups"),
            ]
        )
        for letter in ("D", "E", "F", "G", "H", "I"):
            root = Path(f"{letter}:/")
            if root.exists():
                suggestions.append((f"Disco {letter}:", root / "Backups" / "NKDentalSoft"))
    else:
        suggestions.extend(
            [
                ("Documentos", home / "Documents" / "NKDentalSoft" / "backups"),
                ("Home", home / "NKDentalSoft" / "backups"),
            ]
        )

    suggestions.append(("Predeterminada del sistema", _DEFAULT_BACKUP_DIR))

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for label, path in suggestions:
        try:
            path = path.resolve()
            key = str(path).lower()
            if key in seen:
                continue
            seen.add(key)
            path.mkdir(parents=True, exist_ok=True)
            probe = path / f".nk_write_{new_uuid()[:6]}"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            out.append({"label": label, "path": str(path)})
        except OSError:
            continue
    return out


def pick_backup_directory_interactive(
    *,
    title: str | None = None,
    initial_dir: str | None = None,
) -> str | None:
    """
    Open a native folder picker when a desktop GUI exists.
    Returns absolute path or None if the user cancels.
    Must NOT be called while holding an open SQLAlchemy session (SQLite lock risk).
    """
    status = native_folder_picker_available()
    if not status.get("available"):
        raise HTTPException(
            status_code=400,
            detail=(
                "El selector gráfico no está disponible en este servidor. "
                "Use una carpeta sugerida o escriba la ruta manualmente. "
                f"({status.get('reason') or status.get('platform')})"
            ),
        )

    product = _product_name()
    # Avoid bare "&" in WinForms titles (can look odd); keep accents.
    product_ui = product.replace("&", "y")
    title = title or f"Seleccione la carpeta donde {product_ui} guardará los backups"
    if not _pick_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="Ya hay un selector de carpeta abierto. Termine esa ventana e intente de nuevo.",
        )
    errors: list[str] = []
    try:
        start = _normalize_initial_dir(initial_dir)
        if os.name == "nt":
            # Frozen EXE: never spawn sys.executable (reopens the desktop browser).
            # Prefer PowerShell FolderBrowserDialog first on Windows installers.
            import sys as _sys

            if getattr(_sys, "frozen", False):
                methods: list[tuple[str, Any]] = [
                    ("powershell", lambda: _pick_directory_windows_ps(title, start)),
                    ("tkinter", lambda: _pick_directory_tk(title, start)),
                ]
            else:
                methods = [
                    ("powershell", lambda: _pick_directory_windows_ps(title, start)),
                    ("python-tk", lambda: _pick_directory_python_subprocess(title, start)),
                    ("tkinter", lambda: _pick_directory_tk(title, start)),
                ]
        else:
            methods = [
                ("python-tk", lambda: _pick_directory_python_subprocess(title, start)),
                ("tkinter", lambda: _pick_directory_tk(title, start)),
            ]
        for label, fn in methods:
            try:
                return fn()
            except Exception as exc:  # noqa: BLE001
                logger.warning("folder picker %s failed: %s", label, exc)
                errors.append(f"{label}: {exc}")
        raise HTTPException(
            status_code=400,
            detail=(
                "No se pudo abrir el selector de carpetas. "
                "Use una carpeta sugerida o escriba la ruta manualmente. "
                f"({'; '.join(errors)[:200]})"
            ),
        )
    finally:
        _pick_lock.release()


def choose_and_persist_backup_directory() -> dict[str, Any]:
    """
    Desktop one-shot: native dialog when available; otherwise return suggestions
    (no hard failure — production-safe for Linux/Docker backends).
    """
    from app.database import SessionLocal

    status = native_folder_picker_available()
    suggestions = list_suggested_backup_directories()
    if not status.get("available"):
        return {
            "cancelled": False,
            "picker_unavailable": True,
            "path": None,
            "settings": None,
            "suggestions": suggestions,
            "message": (
                "Este servidor no puede abrir una ventana de carpetas "
                f"({status.get('platform')}: {status.get('reason') or 'sin GUI'}). "
                "Elija una carpeta sugerida o escriba la ruta donde el servidor guardará los backups."
            ),
        }

    try:
        with SessionLocal() as db:
            ensure_backup_ready()
            row = get_or_create_backup_settings(db)
            initial = (getattr(row, "backup_directory", None) or "").strip() or None
            if not initial:
                initial = resolve_effective_backup_dir_safe(db)
            db.commit()

        chosen = pick_backup_directory_interactive(initial_dir=initial)
        if not chosen:
            return {
                "cancelled": True,
                "picker_unavailable": False,
                "path": None,
                "settings": None,
                "suggestions": suggestions,
                "message": None,
            }

        resolved = validate_backup_directory(chosen, create=True)

        with SessionLocal() as db:
            row = get_or_create_backup_settings(db)
            row.backup_directory = str(resolved)
            db.commit()
            db.refresh(row)
            return {
                "cancelled": False,
                "picker_unavailable": False,
                "path": str(resolved),
                "settings": settings_public_dict(row, db),
                "suggestions": suggestions,
                "message": None,
            }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("choose_and_persist_backup_directory failed")
        raise HTTPException(
            status_code=400,
            detail=(
                "No se pudo elegir la carpeta de backup. "
                "Use una carpeta sugerida o escriba la ruta manualmente. "
                f"({exc})"
            ),
        ) from exc


def _default_backup_dir(*, create: bool = True) -> Path:
    path = _DEFAULT_BACKUP_DIR
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def get_backup_dir(db: Session | None = None, *, create: bool = True) -> Path:
    """
    Priority: backup_settings.backup_directory → env BACKUP_DIRECTORY → default app/backups.
    """
    configured = ""
    if db is not None:
        row = get_or_create_backup_settings(db)
        configured = (getattr(row, "backup_directory", None) or "").strip()
    if not configured:
        configured = (os.environ.get("BACKUP_DIRECTORY") or "").strip()
    if configured:
        return validate_backup_directory(configured, create=create)
    return _default_backup_dir(create=create)


def resolve_effective_backup_dir_safe(db: Session | None = None) -> str:
    """Best-effort path for UI/settings GET — never raises (avoids blanking the panel)."""
    try:
        return str(get_backup_dir(db, create=False))
    except HTTPException:
        pass
    except OSError:
        pass
    try:
        configured = ""
        if db is not None:
            row = get_or_create_backup_settings(db)
            configured = (getattr(row, "backup_directory", None) or "").strip()
        if not configured:
            configured = (os.environ.get("BACKUP_DIRECTORY") or "").strip()
        if configured:
            return str(expand_backup_path(configured))
    except Exception:  # noqa: BLE001
        pass
    return str(_DEFAULT_BACKUP_DIR.resolve())


def settings_public_dict(row: BackupSettings, db: Session) -> dict[str, Any]:
    configured = (getattr(row, "backup_directory", None) or "").strip()
    return {
        "auto_backup_enabled": bool(row.auto_backup_enabled),
        "frequency": row.frequency,
        "preferred_hour": row.preferred_hour,
        "retention_count": int(row.retention_count or 10),
        "keep_manual": bool(row.keep_manual),
        "backup_directory": configured,
        "effective_backup_directory": resolve_effective_backup_dir_safe(db),
        "last_backup_at": row.last_backup_at,
    }


def resolve_sqlite_path() -> Path:
    if not settings.is_sqlite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El respaldo completo está disponible para instalaciones SQLite locales. "
                "Esta instancia usa otro motor de base de datos."
            ),
        )
    try:
        return resolve_sqlite_file(settings.DATABASE_URL)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _upload_roots() -> dict[str, Path]:
    from app.paths import resolve_media_root

    return {
        "tooth_media": resolve_media_root("TOOTH_MEDIA_ROOT", "tooth_media"),
        "complementary_tests": resolve_media_root(
            "COMPLEMENTARY_TESTS_ROOT", "complementary_tests"
        ),
        "historical_documents": resolve_media_root(
            "HISTORICAL_DOCUMENTS_ROOT", "historical_documents"
        ),
        "clinic_uploads": _CLINIC_UPLOADS.resolve(),
    }


def ensure_backup_ready() -> None:
    """Apply missing backup tables/columns (e.g. backup_directory) before ORM access."""
    from app.ensure_backup_schema import ensure_backup_schema

    ensure_backup_schema()


def get_or_create_backup_settings(db: Session) -> BackupSettings:
    from sqlalchemy.exc import OperationalError, ProgrammingError

    ensure_backup_ready()
    try:
        row = db.get(BackupSettings, BACKUP_SETTINGS_ID)
    except (OperationalError, ProgrammingError) as exc:
        # Stale process / alembic stamped head without column — heal and retry once
        logger.warning("backup_settings read failed (%s); repairing schema", exc)
        db.rollback()
        ensure_backup_ready()
        row = db.get(BackupSettings, BACKUP_SETTINGS_ID)
    if row:
        return row
    row = BackupSettings(id=BACKUP_SETTINGS_ID)
    db.add(row)
    try:
        db.commit()
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("backup_settings insert failed (%s); repairing schema", exc)
        db.rollback()
        ensure_backup_ready()
        row = db.get(BackupSettings, BACKUP_SETTINGS_ID)
        if row:
            return row
        row = BackupSettings(id=BACKUP_SETTINGS_ID)
        db.add(row)
        db.commit()
    db.refresh(row)
    return row


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _integrity_check(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("PRAGMA integrity_check").fetchone()
        if not row or str(row[0]).lower() != "ok":
            raise HTTPException(
                status_code=500,
                detail=f"La base de datos no pasó integrity_check: {row}",
            )
    finally:
        conn.close()


def _snapshot_sqlite(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def _row_counts(db: Session) -> dict[str, int]:
    insp = inspect(db.bind)
    out: dict[str, int] = {}
    for table in insp.get_table_names():
        try:
            out[table] = int(db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0)
        except Exception:  # noqa: BLE001
            out[table] = -1
    return out


def _copy_tree_into_zip(zf: zipfile.ZipFile, root: Path, arc_prefix: str) -> tuple[int, int]:
    count = 0
    size = 0
    if not root.exists():
        return 0, 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        arc = f"{arc_prefix}/{rel}"
        zf.write(path, arcname=arc)
        count += 1
        size += path.stat().st_size
    return count, size


def create_backup(
    db: Session,
    *,
    triggered_by: str,
    user_id: str | None = None,
    keep: bool = False,
) -> BackupHistory:
    if is_restore_in_progress():
        raise HTTPException(status_code=503, detail="Sistema en mantenimiento — restaurando backup")

    t0 = time.perf_counter()
    settings_row = get_or_create_backup_settings(db)
    db_path = resolve_sqlite_path()
    if not db_path.exists():
        raise HTTPException(status_code=500, detail="No se encontró el archivo de base de datos")

    _integrity_check(db_path)

    clinic_name = settings.CLINIC_NAME or _product_name()
    stamp = datetime.now(CLINIC_TZ).strftime("%Y%m%d_%H%M%S")
    filename = f"{_product_slug()}_backup_{_slug(clinic_name)}_{stamp}.zip"
    history = BackupHistory(
        id=new_uuid(),
        filename=filename,
        abs_path="",
        triggered_by=triggered_by,
        status="error",
        keep=keep or triggered_by == "manual",
        created_at=_as_utc_aware(),
    )
    db.add(history)
    db.commit()

    out_path: Path | None = None
    tmp_db: Path | None = None
    try:
        backup_dir = get_backup_dir(db, create=True)
        out_path = backup_dir / filename
        tmp_db = backup_dir / f"_snap_{new_uuid()}.db"
        history.abs_path = str(out_path)
        db.commit()

        _snapshot_sqlite(db_path, tmp_db)
        rows = _row_counts(db)
        file_count = 0
        files_size = 0
        with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(tmp_db, arcname="database/clinica.db")
            for key, root in _upload_roots().items():
                c, s = _copy_tree_into_zip(zf, root, f"uploads/{key}")
                file_count += c
                files_size += s
            manifest = {
                "app_name": _product_name(),
                "clinic_name": settings.CLINIC_NAME,
                "backup_format_version": BACKUP_FORMAT_VERSION,
                "created_at": datetime.now(CLINIC_TZ).isoformat(),
                "source_head_revision": HEAD_REVISION,
                "source_db_engine": "sqlite",
                "tables_included": len(rows),
                "row_counts": rows,
                "uploads_file_count": file_count,
                "uploads_total_size_bytes": files_size,
                "db_sha256": _sha256_file(tmp_db),
                "generated_by": triggered_by,
                "app_instance_id": BACKUP_SETTINGS_ID,
                "backup_directory": str(backup_dir),
            }
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

        history.status = "success"
        history.size_bytes = out_path.stat().st_size
        history.duration_ms = int((time.perf_counter() - t0) * 1000)
        history.error_message = None
        settings_row.last_backup_at = _utcnow()
        db.commit()
        db.refresh(history)

        log_audit(
            db,
            patient_id=None,
            entity_type="system",
            entity_id="backup",
            action="generate",
            user_id=user_id,
            detail={"filename": filename, "triggered_by": triggered_by, "size": history.size_bytes},
        )
        db.commit()
        apply_retention(db)
        logger.info("backup ok %s (%s bytes)", filename, history.size_bytes)
        return history
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        history.status = "error"
        history.error_message = detail[:2000]
        history.duration_ms = int((time.perf_counter() - t0) * 1000)
        db.commit()
        logger.error("backup failed (http): %s", detail)
        if out_path is not None and out_path.exists():
            try:
                out_path.unlink()
            except OSError:
                pass
        raise
    except Exception as exc:  # noqa: BLE001
        history.status = "error"
        history.error_message = str(exc)[:2000]
        history.duration_ms = int((time.perf_counter() - t0) * 1000)
        db.commit()
        logger.error("backup failed: %s", exc, exc_info=True)
        if out_path is not None and out_path.exists():
            try:
                out_path.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"Error al generar backup: {exc}") from exc
    finally:
        if tmp_db is not None and tmp_db.exists():
            try:
                tmp_db.unlink()
            except OSError:
                pass


def apply_retention(db: Session) -> None:
    cfg = get_or_create_backup_settings(db)
    keep_n = max(1, int(cfg.retention_count or 10))
    autos = (
        db.query(BackupHistory)
        .filter(
            BackupHistory.triggered_by == "scheduled",
            BackupHistory.status == "success",
            BackupHistory.keep.is_(False),
        )
        .order_by(BackupHistory.created_at.desc())
        .all()
    )
    for row in autos[keep_n:]:
        try:
            Path(row.abs_path).unlink(missing_ok=True)
        except OSError:
            pass
        db.delete(row)
    db.commit()


def list_history(db: Session, limit: int = 50) -> list[BackupHistory]:
    from sqlalchemy.exc import OperationalError, ProgrammingError

    ensure_backup_ready()
    try:
        return (
            db.query(BackupHistory)
            .order_by(BackupHistory.created_at.desc())
            .limit(limit)
            .all()
        )
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("backup_history read failed (%s); repairing schema", exc)
        db.rollback()
        ensure_backup_ready()
        return (
            db.query(BackupHistory)
            .order_by(BackupHistory.created_at.desc())
            .limit(limit)
            .all()
        )


def get_history(db: Session, backup_id: str) -> BackupHistory:
    row = db.get(BackupHistory, backup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Backup no encontrado")
    return row


def delete_backup(db: Session, backup_id: str, *, user_id: str | None = None) -> None:
    row = get_history(db, backup_id)
    try:
        Path(row.abs_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(row)
    log_audit(
        db,
        patient_id=None,
        entity_type="system",
        entity_id="backup",
        action="delete",
        user_id=user_id,
        detail={"filename": row.filename},
    )
    db.commit()


@dataclass
class ValidationResult:
    ok: bool
    manifest: dict[str, Any]
    warnings: list[str]
    errors: list[str]


def _safe_extract_member(zf: zipfile.ZipFile, member: str, dest: Path) -> Path:
    info = zf.getinfo(member)
    # Normalize zip member paths (Windows zippers may use backslashes)
    rel = info.filename.replace("\\", "/").lstrip("/")
    if not rel or rel.endswith("/"):
        raise HTTPException(status_code=400, detail="Entrada de zip inválida")
    dest_r = dest.resolve()
    target = (dest / Path(*rel.split("/"))).resolve()
    try:
        if not target.is_relative_to(dest_r):
            raise HTTPException(status_code=400, detail="El zip contiene rutas no permitidas")
    except AttributeError:
        # Python < 3.9 fallback
        if os.path.commonpath([str(dest_r), str(target)]) != str(dest_r):
            raise HTTPException(status_code=400, detail="El zip contiene rutas no permitidas")
    target.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(info) as src, target.open("wb") as out:
        shutil.copyfileobj(src, out)
    return target


def _norm_zip_names(names: list[str] | set[str]) -> set[str]:
    return {n.replace("\\", "/").lstrip("/") for n in names}


def _sqlite_sidecars(db_path: Path) -> list[Path]:
    base = str(db_path)
    return [Path(base + "-wal"), Path(base + "-shm"), Path(base + "-journal")]


def _pause_scheduler() -> None:
    try:
        from app import main as main_mod

        sch = getattr(main_mod, "_scheduler", None)
        if sch is not None and getattr(sch, "running", False):
            sch.pause()
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not pause scheduler: %s", exc)


def _resume_scheduler() -> None:
    try:
        from app import main as main_mod

        sch = getattr(main_mod, "_scheduler", None)
        if sch is not None and getattr(sch, "running", False):
            sch.resume()
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not resume scheduler: %s", exc)


def _close_db_session(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.rollback()
    except Exception:  # noqa: BLE001
        pass
    try:
        db.close()
    except Exception:  # noqa: BLE001
        pass


def _dispose_engine() -> None:
    from app.database import engine

    engine.dispose()
    # Windows may keep the file lock briefly after dispose
    time.sleep(0.2)


def _unlink_sidecars(live: Path) -> None:
    for side in _sqlite_sidecars(live):
        if not side.exists():
            continue
        last_err: Exception | None = None
        for attempt in range(12):
            try:
                side.unlink()
                last_err = None
                break
            except OSError as exc:
                last_err = exc
                try:
                    trash = side.with_name(f"{side.name}.trash-{new_uuid()}")
                    side.rename(trash)
                    last_err = None
                    break
                except OSError:
                    pass
                _dispose_engine()
                time.sleep(0.25 * (attempt + 1))
        if last_err is not None:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"No se pudo liberar {side.name} (archivo en uso en Windows). "
                    "Cierre otras ventanas de N&K Dental Soft e intente de nuevo."
                ),
            ) from last_err


def _quiesce_sqlite_for_replace(live: Path) -> None:
    """
    Release Windows file locks: dispose pool, leave WAL mode, truncate sidecars.
    journal_mode=DELETE checkpoints WAL and drops -wal/-shm when possible.
    """
    import gc

    _dispose_engine()
    gc.collect()
    if not live.exists():
        return
    last_err: Exception | None = None
    for attempt in range(6):
        try:
            conn = sqlite3.connect(str(live), timeout=30)
            try:
                conn.execute("PRAGMA busy_timeout=30000")
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                conn.execute("PRAGMA journal_mode=DELETE")
                conn.commit()
            finally:
                conn.close()
            last_err = None
            break
        except sqlite3.Error as exc:
            last_err = exc
            _dispose_engine()
            gc.collect()
            time.sleep(0.2 * (attempt + 1))
    if last_err is not None:
        logger.warning("sqlite quiesce incomplete: %s", last_err)
    _dispose_engine()
    gc.collect()
    time.sleep(0.15)


def _replace_live_sqlite(snap: Path, live: Path) -> None:
    """Atomically replace SQLite file in a Windows-safe way (handles + WAL/SHM)."""
    live.parent.mkdir(parents=True, exist_ok=True)
    _quiesce_sqlite_for_replace(live)
    _unlink_sidecars(live)

    tmp = live.with_name(f"{live.name}.restore-{new_uuid()}.tmp")
    try:
        shutil.copy2(snap, tmp)
        last_err: Exception | None = None
        for attempt in range(8):
            try:
                os.replace(str(tmp), str(live))
                last_err = None
                break
            except PermissionError as exc:
                last_err = exc
                _dispose_engine()
                time.sleep(0.3 * (attempt + 1))
        if last_err is not None:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Windows no permitió reemplazar clinica.db (archivo en uso). "
                    "Cierre el sistema en otras PCs/sesiones e intente otra vez."
                ),
            ) from last_err
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass

    # Drop any leftover sidecars that could corrupt the restored DB under WAL
    for side in _sqlite_sidecars(live):
        try:
            if side.exists():
                trash = side.with_name(f"{side.name}.trash-{new_uuid()}")
                try:
                    side.rename(trash)
                except OSError:
                    side.unlink(missing_ok=True)
        except OSError:
            pass


def _alembic_revision_order() -> list[str]:
    """Linear revision chain from alembic/versions (oldest → newest)."""
    versions_dir = _BACKEND_ROOT / "alembic" / "versions"
    if not versions_dir.is_dir():
        return [HEAD_REVISION]
    by_rev: dict[str, str | None] = {}
    for path in versions_dir.glob("*.py"):
        text_src = path.read_text(encoding="utf-8", errors="ignore")
        rev_m = re.search(r'^revision\s*[:=]\s*["\']([^"\']+)["\']', text_src, re.M)
        down_m = re.search(r'^down_revision\s*[:=]\s*([^\n]+)', text_src, re.M)
        if not rev_m:
            continue
        rev = rev_m.group(1)
        down_raw = (down_m.group(1).strip() if down_m else "None")
        if down_raw in ("None", "none", ""):
            by_rev[rev] = None
        else:
            dm = re.search(r'["\']([^"\']+)["\']', down_raw)
            by_rev[rev] = dm.group(1) if dm else None
    children = {v: k for k, v in by_rev.items() if v is not None}
    roots = [r for r, d in by_rev.items() if d is None]
    order: list[str] = []
    cur = roots[0] if roots else HEAD_REVISION
    seen: set[str] = set()
    while cur and cur not in seen:
        order.append(cur)
        seen.add(cur)
        cur = children.get(cur)  # type: ignore[assignment]
    if HEAD_REVISION not in order:
        order.append(HEAD_REVISION)
    return order


def validate_backup_bytes(data: bytes) -> ValidationResult:
    warnings: list[str] = []
    errors: list[str] = []
    manifest: dict[str, Any] = {}
    max_mb = int(os.environ.get("BACKUP_MAX_UPLOAD_MB") or "512")
    if len(data) > max_mb * 1024 * 1024:
        errors.append(f"El archivo supera el máximo de {max_mb} MB")
        return ValidationResult(False, {}, warnings, errors)

    import io

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = _norm_zip_names(zf.namelist())
            if "manifest.json" not in names:
                errors.append("Falta manifest.json")
            if "database/clinica.db" not in names:
                errors.append("Falta database/clinica.db")
            if errors:
                return ValidationResult(False, {}, warnings, errors)
            # Prefer forward-slash member; fall back to original zip name
            manifest_member = next(
                (n for n in zf.namelist() if n.replace("\\", "/").lstrip("/") == "manifest.json"),
                "manifest.json",
            )
            db_member = next(
                (
                    n
                    for n in zf.namelist()
                    if n.replace("\\", "/").lstrip("/") == "database/clinica.db"
                ),
                "database/clinica.db",
            )
            manifest = json.loads(zf.read(manifest_member).decode("utf-8"))
            if manifest.get("backup_format_version") != BACKUP_FORMAT_VERSION:
                warnings.append("Versión de formato de backup distinta; se intentará de todos modos")
            src_rev = str(manifest.get("source_head_revision") or "")
            if src_rev and src_rev != HEAD_REVISION:
                order = _alembic_revision_order()
                if src_rev in order and HEAD_REVISION in order:
                    if order.index(src_rev) > order.index(HEAD_REVISION):
                        errors.append(
                            f"El backup es de una versión más nueva ({src_rev}) que esta "
                            f"instalación ({HEAD_REVISION}). Actualice N&K Dental Soft antes de restaurar."
                        )
                    else:
                        warnings.append(
                            f"Revisión de origen ({src_rev}) es anterior a esta instalación "
                            f"({HEAD_REVISION}). Alembic puede aplicar migraciones pendientes."
                        )
                else:
                    warnings.append(
                        f"Revisión de origen ({src_rev}) difiere de esta instalación ({HEAD_REVISION}). "
                        "Actualice el sistema destino si la restauración falla."
                    )
            # Hash check
            import tempfile

            with tempfile.TemporaryDirectory() as td:
                td_path = Path(td)
                extracted = td_path / "clinica.db"
                with zf.open(db_member) as src, extracted.open("wb") as out:
                    shutil.copyfileobj(src, out)
                digest = _sha256_file(extracted)
                expected = str(manifest.get("db_sha256") or "")
                if expected and digest != expected:
                    errors.append("El hash SHA-256 de la base no coincide con el manifest")
                else:
                    try:
                        _integrity_check(extracted)
                    except HTTPException as exc:
                        errors.append(str(exc.detail))
    except zipfile.BadZipFile:
        errors.append("Archivo ZIP inválido o corrupto")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"No se pudo validar el paquete: {exc}")

    return ValidationResult(ok=not errors, manifest=manifest, warnings=warnings, errors=errors)


def _replace_tree(src_dir: Path, dest_dir: Path) -> int:
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    if not src_dir.exists():
        return 0
    for path in src_dir.rglob("*"):
        if path.is_file():
            rel = path.relative_to(src_dir)
            target = dest_dir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            count += 1
    return count


def restore_backup(
    db: Session,
    data: bytes,
    *,
    confirm_token: str,
    user_id: str | None = None,
    allow_empty_bootstrap: bool = False,
) -> dict[str, Any]:
    global _restoring
    if (confirm_token or "").strip().upper() != CONFIRM_TOKEN:
        raise HTTPException(
            status_code=400,
            detail='Debe escribir CONFIRMAR para continuar con la restauración',
        )

    user_count = int(db.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0)
    if user_count > 0 and not allow_empty_bootstrap and not user_id:
        raise HTTPException(status_code=401, detail="Se requiere autenticación de administrador")

    validation = validate_backup_bytes(data)
    if not validation.ok:
        raise HTTPException(status_code=400, detail="; ".join(validation.errors))

    if not _restore_lock.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Ya hay una restauración en curso")

    report: dict[str, Any] = {"ok": False, "warnings": list(validation.warnings)}
    import io
    import tempfile

    paused = False
    try:
        # Release request session early (Windows locks) — safety backup uses its own session
        _close_db_session(db)
        from app.database import SessionLocal

        try:
            if resolve_sqlite_path().exists() and user_count > 0:
                with SessionLocal() as s_safe:
                    create_backup(
                        s_safe,
                        triggered_by="pre_restore_safety",
                        user_id=user_id,
                        keep=True,
                    )
        except Exception as exc:  # noqa: BLE001
            report["warnings"].append(f"No se pudo crear backup de seguridad previo: {exc}")

        _pause_scheduler()
        paused = True
        _restoring = True
        _dispose_engine()

        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for name in zf.namelist():
                    norm = name.replace("\\", "/").rstrip("/")
                    if not norm or name.endswith("/") or name.endswith("\\"):
                        continue
                    _safe_extract_member(zf, name, td_path)

            snap = td_path / "database" / "clinica.db"
            if not snap.exists():
                raise HTTPException(status_code=400, detail="El paquete no incluye database/clinica.db")
            _integrity_check(snap)

            live = resolve_sqlite_path()
            applied_hot = False
            try:
                _replace_live_sqlite(snap, live)
                applied_hot = True
            except HTTPException as exc:
                # Windows file lock: stage for next process start (engine closed)
                logger.warning("hot restore failed (%s) — staging pending restore", exc.detail)
                stage_pending_restore(snap, live)
                report["warnings"].append(
                    "La base quedó programada para aplicarse al reiniciar N&K Dental Soft "
                    "(Windows tenía el archivo en uso)."
                )

            uploads_root = td_path / "uploads"
            restored_files = 0
            for key, dest in _upload_roots().items():
                restored_files += _replace_tree(uploads_root / key, dest)

            rows: dict[str, int] = {}
            if applied_hot:
                _dispose_engine()
                with SessionLocal() as s2:
                    try:
                        s2.execute(
                            text(
                                "UPDATE users SET token_version = COALESCE(token_version, 0) + 1"
                            )
                        )
                        s2.commit()
                    except Exception:  # noqa: BLE001
                        s2.rollback()
                    rows = _row_counts(s2)
                    log_audit(
                        s2,
                        patient_id=None,
                        entity_type="system",
                        entity_id="backup",
                        action="restore",
                        user_id=user_id,
                        detail={"tables": len(rows), "files": restored_files, "hot": True},
                    )
                    s2.commit()
            else:
                # Apply staged DB now that pool is disposed (same process — tests / soft restart)
                if apply_pending_sqlite_restore(settings.DATABASE_URL):
                    applied_hot = True
                    _dispose_engine()
                    with SessionLocal() as s2:
                        try:
                            s2.execute(
                                text(
                                    "UPDATE users SET token_version = COALESCE(token_version, 0) + 1"
                                )
                            )
                            s2.commit()
                        except Exception:  # noqa: BLE001
                            s2.rollback()
                        rows = _row_counts(s2)
                        log_audit(
                            s2,
                            patient_id=None,
                            entity_type="system",
                            entity_id="backup",
                            action="restore",
                            user_id=user_id,
                            detail={
                                "tables": len(rows),
                                "files": restored_files,
                                "hot": False,
                            },
                        )
                        s2.commit()
                else:
                    report["warnings"].append(
                        "Reinicie el servicio backend para terminar de aplicar la base de datos."
                    )

            report.update(
                {
                    "ok": True,
                    "tables_restored": len(rows) if rows else None,
                    "row_counts": rows or None,
                    "files_restored": restored_files,
                    "source_head_revision": validation.manifest.get("source_head_revision"),
                    "restart_required": True,
                    "db_applied": bool(applied_hot),
                    "message": (
                        "Restauración completada. Reinicie N&K Dental Soft e inicie sesión "
                        "con un usuario incluido en el backup."
                        if applied_hot
                        else (
                            "Archivos restaurados. Reinicie N&K Dental Soft para aplicar "
                            "la base de datos y luego inicie sesión."
                        )
                    ),
                }
            )
            logger.info(
                "restore ok applied=%s files=%s", applied_hot, restored_files
            )
            return report
    finally:
        _restoring = False
        if paused:
            _resume_scheduler()
        _restore_lock.release()


def should_run_scheduled(cfg: BackupSettings, now: datetime | None = None) -> bool:
    if not cfg.auto_backup_enabled:
        return False
    now = now or datetime.now(CLINIC_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=CLINIC_TZ)
    else:
        now = now.astimezone(CLINIC_TZ)

    try:
        pref_h, pref_m = (cfg.preferred_hour or "22:00").split(":")
        preferred = now.replace(hour=int(pref_h), minute=int(pref_m), second=0, microsecond=0)
    except Exception:  # noqa: BLE001
        preferred = now.replace(hour=22, minute=0, second=0, microsecond=0)

    last = cfg.last_backup_at
    if last is not None:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        last_local = last.astimezone(CLINIC_TZ)
    else:
        last_local = None

    freq = (cfg.frequency or "daily").lower()
    if freq == "every_12h":
        if last_local and (now - last_local) < timedelta(hours=12):
            return False
        return True
    if freq == "weekly":
        if last_local and (now - last_local) < timedelta(days=7):
            return False
        # run on/after preferred hour once per week window
        return now >= preferred or last_local is None
    # daily
    if last_local and last_local.date() == now.date():
        return False
    return now >= preferred


def run_scheduled_backup_job() -> None:
    """APScheduler entrypoint — check settings and create backup if due."""
    if is_restore_in_progress():
        return
    from app.database import SessionLocal

    try:
        with SessionLocal() as db:
            cfg = get_or_create_backup_settings(db)
            if should_run_scheduled(cfg):
                create_backup(db, triggered_by="scheduled")
    except Exception as exc:  # noqa: BLE001
        logger.error("scheduled backup job failed: %s", exc, exc_info=True)
