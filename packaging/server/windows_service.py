"""
Windows entry for N&K DentalSoft Server (PyInstaller).

Desktop-first runtime (reliable on clinic PCs):
  nkdentalsoft-server.exe --desktop     # ensure listen + optional browser
  nkdentalsoft-server.exe --foreground  # long-running server (Task Scheduler)
  nkdentalsoft-server.exe --init-clinic
  nkdentalsoft-server.exe install|start|stop|remove  # optional legacy service
"""

from __future__ import annotations

import os
import sys
import threading
import time
import traceback
from pathlib import Path


def _boot_log(msg: str) -> None:
    """Log before server_entry is importable (service / early crashes)."""
    line = msg.rstrip() + "\n"
    try:
        pd = os.environ.get("PROGRAMDATA") or (os.environ.get("SystemDrive", "C:") + r"\ProgramData")
        path = Path(pd) / "NKDentalSoft" / "logs" / "startup.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError:
        pass
    print(line, end="", flush=True)


def _install_dir() -> Path:
    # Frozen: ALWAYS the folder of the running EXE (never a stale env override
    # pointing at an older Program Files tree that shadows PYZ modules).
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    env = (os.environ.get("NKDENTALSOFT_INSTALL_DIR") or "").strip()
    if env and Path(env).is_dir():
        return Path(env).resolve()
    return Path(__file__).resolve().parent


def _purge_shadow_modules(*roots: Path) -> None:
    for root in roots:
        if not root:
            continue
        for stale in (
            root / "server_entry.py",
            root / "_internal" / "server_entry.py",
            root / "windows_service.py",
            root / "_internal" / "windows_service.py",
        ):
            try:
                if stale.is_file():
                    stale.unlink()
                    _boot_log(f"[boot] removed shadow module {stale}")
            except OSError as exc:
                _boot_log(f"[boot] could not remove {stale}: {exc}")


def _ensure_path() -> None:
    install = _install_dir()
    os.environ["NKDENTALSOFT_INSTALL_DIR"] = str(install)
    # Never inherit a polluted PROGRAMDATA from a parent shell (dev/smoke tests).
    if getattr(sys, "frozen", False):
        windir_pd = os.environ.get("SystemDrive", "C:") + r"\ProgramData"
        cur = (os.environ.get("PROGRAMDATA") or "").strip()
        real = str(Path(windir_pd).resolve())
        try:
            cur_ok = cur and Path(cur).resolve() == Path(real).resolve()
        except OSError:
            cur_ok = False
        if not cur_ok:
            os.environ["PROGRAMDATA"] = real

    try:
        os.chdir(install)
    except OSError:
        pass

    # Drop any prior sys.path entries that point at other NKDentalSoft trees
    # (e.g. Program Files leftover from NKDENTALSOFT_INSTALL_DIR in parent shells).
    cleaned: list[str] = []
    for entry in sys.path:
        try:
            low = str(entry).replace("\\", "/").lower()
            if "nkdentalsoft" in low and "server" in low:
                # keep only paths under this running install / its _MEIPASS
                if str(install.resolve()).replace("\\", "/").lower() in low:
                    cleaned.append(entry)
                elif getattr(sys, "_MEIPASS", None) and str(Path(sys._MEIPASS).resolve()).replace("\\", "/").lower() in low:
                    cleaned.append(entry)
                else:
                    _boot_log(f"[boot] dropping shadow path {entry}")
                    continue
            else:
                cleaned.append(entry)
        except Exception:
            cleaned.append(entry)
    sys.path[:] = cleaned

    meipass = getattr(sys, "_MEIPASS", None)
    # Only expose _MEIPASS for bundled datas. Never prepend install dir — that
    # allowed Program Files\_internal\server_entry.py to shadow the PYZ module.
    if meipass:
        mp = str(Path(meipass).resolve())
        if mp in sys.path:
            sys.path.remove(mp)
        sys.path.insert(0, mp)

    for candidate in (
        install / "web",
        Path(meipass) / "web" if meipass else None,
        install / "_internal" / "web",
    ):
        if candidate and (candidate / "index.html").is_file():
            os.environ["NKDENTALSOFT_UI_DIR"] = str(candidate.resolve())
            break

    pf = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "NKDentalSoft" / "Server"
    _purge_shadow_modules(install, pf, Path(meipass) if meipass else None)


def run_uvicorn() -> None:
    _ensure_path()
    from server_entry import run_server

    run_server()


def _port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.8) -> bool:
    import socket

    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _start_foreground_detached() -> None:
    """Start a hidden long-lived server process (user session)."""
    import subprocess

    exe = Path(sys.executable).resolve()
    creation = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        creation = 0x00000008 | 0x00000200 | 0x08000000
    subprocess.Popen(
        [str(exe), "--foreground"],
        cwd=str(_install_dir()),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creation,
        close_fds=True,
    )


def _browser_candidates() -> list[Path]:
    """Edge / Chrome install paths (Windows)."""
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    return [
        Path(pf) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(pf86) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(pf) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(pf86) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(local) / "Google" / "Chrome" / "Application" / "chrome.exe" if local else Path(),
    ]


def _open_clinic_ui(url: str) -> str:
    """
    Open UI as a dedicated app window (Edge/Chrome --app) so Windows shows an
    N&K DentalSoft-like taskbar button instead of a normal browser tab.
    Falls back to the default browser if no Chromium browser is found.
    """
    import subprocess

    profile = (
        Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        / "NKDentalSoft"
        / "AppProfile"
    )
    try:
        profile.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    for browser in _browser_candidates():
        if not browser or not browser.is_file():
            continue
        args = [
            str(browser),
            f"--app={url}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
        ]
        try:
            creation = 0
            if sys.platform == "win32":
                creation = 0x00000008 | 0x00000200  # DETACHED | NEW_PROCESS_GROUP
            subprocess.Popen(
                args,
                cwd=str(browser.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation,
                close_fds=True,
            )
            return f"app:{browser.name}"
        except OSError:
            continue

    import webbrowser

    webbrowser.open(url)
    return "webbrowser"


def run_desktop(open_browser: bool = True) -> int:
    """Ensure the API/UI is reachable, then open the clinic app window."""
    _ensure_path()
    from server_entry import prepare_environment, log

    root = prepare_environment()
    port = int(os.environ.get("BACKEND_PORT", "8001"))
    cert = root / "certs" / "server.crt"
    use_tls = cert.is_file() and (root / "certs" / "server.key").is_file()
    # Prefer HTTP for local Firefox reliability unless TLS forced
    force_tls = (os.environ.get("NKDENTALSOFT_FORCE_TLS") or "").strip() in {"1", "true", "yes"}
    prefer_http = (os.environ.get("NKDENTALSOFT_DESKTOP_HTTP") or "1").strip() not in {
        "0",
        "false",
        "no",
    }
    if prefer_http and not force_tls:
        os.environ["NKDENTALSOFT_DISABLE_TLS"] = "1"
        use_tls = False

    url = f"{'https' if use_tls else 'http'}://127.0.0.1:{port}/"
    log(f"desktop ensure url={url}")

    if not _port_open(port):
        log("desktop: port closed — starting detached --foreground")
        _start_foreground_detached()
        for i in range(60):
            time.sleep(0.5)
            if _port_open(port):
                log(f"desktop: port {port} open after {(i + 1) * 0.5:.1f}s")
                break
        else:
            log("desktop: FATAL — server did not open port")
            print(
                f"\nNo responde {url}\n"
                f"Revise: {root / 'logs' / 'startup.log'}\n"
                "Ejecute como Administrador: scripts\\repair_startup.cmd\n",
                flush=True,
            )
            return 1

    if open_browser:
        how = _open_clinic_ui(url)
        log(f"desktop: opened UI via {how} → {url}")
    return 0


try:
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil
except ImportError:
    servicemanager = None  # type: ignore
    win32event = None  # type: ignore
    win32service = None  # type: ignore
    win32serviceutil = None  # type: ignore


if win32serviceutil is not None:

    class NKDentalSoftServerService(win32serviceutil.ServiceFramework):
        _svc_name_ = "NKDentalSoftServer"
        _svc_display_name_ = "N&K DentalSoft Server"
        _svc_description_ = (
            "API FastAPI + SQLite for N&K DentalSoft clinic LAN."
        )

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._worker: threading.Thread | None = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.stop_event)
            # Hard stop — avoids zombie service when uvicorn ignores signals
            os._exit(0)

        def SvcDoRun(self):
            _ensure_path()
            _boot_log("[service] SvcDoRun begin")
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )

            def _worker():
                try:
                    run_uvicorn()
                    _boot_log("[service] run_uvicorn returned (unexpected)")
                except Exception:
                    _boot_log("[service] FATAL in worker:\n" + traceback.format_exc())
                finally:
                    win32event.SetEvent(self.stop_event)

            self._worker = threading.Thread(target=_worker, name="nkds-uvicorn", daemon=True)
            self._worker.start()
            win32event.WaitForSingleObject(self.stop_event, win32event.INFINITE)
            _boot_log("[service] SvcDoRun end — marking stopped")
            # If worker died, leave process so SCM can restart (Recovery options)
            os._exit(1)


def _pause() -> None:
    try:
        input("\nPresione Enter para cerrar...")
    except Exception:
        time.sleep(15)


def main() -> None:
    _ensure_path()
    argv = sys.argv[1:]
    lowered = [a.lower() for a in argv]

    try:
        if "--init-clinic" in lowered:
            from server_entry import init_clinic

            host = None
            for i, a in enumerate(argv):
                if a.lower() == "--host" and i + 1 < len(argv):
                    host = argv[i + 1]
                    break
            init_clinic(host)
            print("Init clinic OK", flush=True)
            return

        if "--desktop" in lowered:
            code = run_desktop(open_browser="--no-browser" not in lowered)
            if code != 0:
                _pause()
            sys.exit(code)

        if "--foreground" in lowered or "-f" in lowered:
            # Desktop HTTP by default (Firefox / no cert warning on same PC)
            if (os.environ.get("NKDENTALSOFT_FORCE_TLS") or "").strip() not in {
                "1",
                "true",
                "yes",
            }:
                os.environ.setdefault("NKDENTALSOFT_DISABLE_TLS", "1")
            run_uvicorn()
            return

        if win32serviceutil is None:
            print("pywin32 not installed — running desktop mode", flush=True)
            sys.exit(run_desktop())

        svc_cmds = {"install", "remove", "start", "stop", "restart", "update", "debug"}
        if svc_cmds.intersection(lowered) or "--startup" in lowered:
            if getattr(sys, "frozen", False):
                sys.argv[0] = sys.executable
            win32serviceutil.HandleCommandLine(NKDentalSoftServerService)
            return

        # Double-click EXE / no args → desktop launcher (not SCM dispatcher)
        if getattr(sys, "frozen", False) and not argv:
            sys.exit(run_desktop())

        sys.exit(run_desktop())
    except Exception as exc:
        _boot_log(f"[nkdentalsoft-server] FATAL: {exc}\n{traceback.format_exc()}")
        print(f"[nkdentalsoft-server] FATAL: {exc}", flush=True)
        traceback.print_exc()
        log_hint = (
            Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
            / "NKDentalSoft"
            / "logs"
            / "startup.log"
        )
        print(f"\nRevise el log: {log_hint}\n", flush=True)
        if "--foreground" in lowered or "-f" in lowered or "--desktop" in lowered or not argv:
            _pause()
        sys.exit(1)


if __name__ == "__main__":
    main()
