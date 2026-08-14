"""Desktop startup helpers for N&K DentalSoft on Windows.

Kept free of win32/pywebview imports so unit tests can cover the wait/recover
logic that previously failed as a silent "server did not open port".
"""

from __future__ import annotations

import os
import socket
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import URLError
from urllib.request import Request, urlopen


DESKTOP_WAIT_SECONDS = 180
DESKTOP_RETRY_WAIT_SECONDS = 90
INPROCESS_WAIT_SECONDS = 180
POLL_SECONDS = 0.5
PROGRESS_EVERY_SECONDS = 5.0
CHILD_DEAD_GRACE_SECONDS = 8.0
STALE_LOG_SECONDS = 45.0
HTTP_PROBE_TIMEOUT = 1.5

SERVER_EXE_NAME = "nkdentalsoft-server.exe"
CLINIC_DB_NAME = "clinica.db"
MUTEX_HELD_NOT_LISTENING = 2


@dataclass(frozen=True)
class WaitResult:
    ok: bool
    elapsed: float
    reason: str


def port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def http_ready(url: str, timeout: float = HTTP_PROBE_TIMEOUT) -> bool:
    """True when anything HTTP answers (200–499). Connection refused → False."""
    try:
        req = Request(url, method="GET")
        with urlopen(req, timeout=timeout) as resp:
            return 200 <= int(getattr(resp, "status", 200)) < 500
    except (URLError, OSError, TimeoutError, ValueError):
        return False


def server_ready(port: int, *, use_tls: bool = False) -> bool:
    scheme = "https" if use_tls else "http"
    base = f"{scheme}://127.0.0.1:{port}"
    if http_ready(f"{base}/api/system/health"):
        return True
    if http_ready(f"{base}/"):
        return True
    return port_open(port)


def tail_log(path: Path, lines: int = 40) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    body = text.splitlines()
    if not body:
        return ""
    return "\n".join(body[-max(1, lines) :])


def log_recently_written(path: Path, within_seconds: float = STALE_LOG_SECONDS) -> bool:
    try:
        return (time.time() - path.stat().st_mtime) <= within_seconds
    except OSError:
        return False


def diagnose_failure(*log_paths: Path) -> str:
    chunks: list[str] = []
    for path in log_paths:
        snippet = tail_log(path, 40)
        if snippet:
            chunks.append(f"--- {path} ---\n{snippet}")
        elif path:
            chunks.append(f"--- {path} --- (vacío o no existe)")
    return "\n\n".join(chunks)


def wait_until_ready(
    *,
    timeout: float,
    is_ready: Callable[[], bool],
    child_alive: Callable[[], bool] | None = None,
    log_progress: Callable[[str], None] | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
    poll: float = POLL_SECONDS,
    progress_every: float = PROGRESS_EVERY_SECONDS,
    child_dead_grace: float = CHILD_DEAD_GRACE_SECONDS,
    now_fn: Callable[[], float] | None = None,
) -> WaitResult:
    """Poll until HTTP/TCP ready, the child dies, or timeout.

    A child that exits in the first ``child_dead_grace`` seconds is treated as
    a hard failure (typical mutex-zombie / AV-kill / import crash). After that
    grace window, a dead child also fails immediately so we do not wait minutes
    on a process that already quit.
    """
    clock = now_fn or time.monotonic
    started = clock()
    deadline = started + max(0.1, timeout)
    next_progress = started + progress_every
    saw_child = False

    while True:
        now = clock()
        elapsed = now - started
        if is_ready():
            return WaitResult(True, elapsed, "ready")

        if child_alive is not None:
            alive = False
            try:
                alive = bool(child_alive())
            except Exception:
                alive = False
            if alive:
                saw_child = True
            elif saw_child or elapsed >= child_dead_grace:
                return WaitResult(False, elapsed, "child_exited")

        if now >= deadline:
            return WaitResult(False, elapsed, "timeout")

        if log_progress and now >= next_progress:
            log_progress(f"esperando servidor… {elapsed:.0f}s")
            next_progress = now + progress_every

        remaining = deadline - now
        sleep_fn(min(poll, max(0.05, remaining)))


def sibling_server_pids(exe_name: str = SERVER_EXE_NAME) -> list[int]:
    """PIDs of other nkdentalsoft-server.exe processes (never includes self)."""
    me = os.getpid()
    found: list[int] = []
    if sys.platform != "win32":
        return found
    try:
        import ctypes
        from ctypes import wintypes

        TH32CS_SNAPPROCESS = 0x00000002
        INVALID = wintypes.HANDLE(-1).value

        class PROCESSENTRY32(ctypes.Structure):
            _fields_ = (
                ("dwSize", wintypes.DWORD),
                ("cntUsage", wintypes.DWORD),
                ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                ("th32ModuleID", wintypes.DWORD),
                ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD),
                ("pcPriClassBase", ctypes.c_long),
                ("dwFlags", wintypes.DWORD),
                ("szExeFile", ctypes.c_char * 260),
            )

        kernel32 = ctypes.windll.kernel32
        snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if snap == INVALID:
            return found
        try:
            entry = PROCESSENTRY32()
            entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
            if not kernel32.Process32First(snap, ctypes.byref(entry)):
                return found
            target = exe_name.lower()
            while True:
                name = entry.szExeFile.decode("mbcs", errors="ignore").lower()
                pid = int(entry.th32ProcessID)
                if name == target and pid != me and pid > 0:
                    found.append(pid)
                if not kernel32.Process32Next(snap, ctypes.byref(entry)):
                    break
        finally:
            kernel32.CloseHandle(snap)
    except Exception:
        return found
    return found


def terminate_pids(pids: list[int]) -> list[int]:
    """Terminate other processes. Never signals our own PID."""
    me = os.getpid()
    killed: list[int] = []
    for pid in pids:
        if pid == me or pid <= 0:
            continue
        try:
            os.kill(pid, 9)
            killed.append(pid)
        except OSError:
            continue
    return killed


def foreground_log_path(root: Path) -> Path:
    return Path(root) / "logs" / "foreground.log"


def data_writable(root: Path, db_name: str = CLINIC_DB_NAME) -> tuple[bool, str]:
    """Can this process write the clinic data? Returns (ok, reason).

    %ProgramData% only inherits "read & execute" for standard users on files, so
    a database created by an elevated install is read-only for the clinic user
    and the server dies before it can listen. Detect that up front instead of
    failing as an opaque startup timeout.
    """
    data_dir = Path(root) / "data"
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return False, f"no se puede crear la carpeta de datos {data_dir}: {exc}"

    probe = data_dir / ".nkds_write_probe"
    try:
        probe.write_bytes(b"probe")
    except OSError as exc:
        return False, f"sin permiso de escritura en {data_dir}: {exc}"
    finally:
        try:
            probe.unlink()
        except OSError:
            pass

    db = data_dir / db_name
    if db.is_file():
        try:
            with db.open("r+b"):
                pass
        except OSError as exc:
            return False, f"la base de datos {db} es de solo lectura para este usuario: {exc}"
    return True, ""
