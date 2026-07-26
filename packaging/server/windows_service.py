"""
Windows Service + foreground runner for N&K DentalSoft Server.

Frozen EXE (clinic):
  nkdentalsoft-server.exe install | start | stop | remove
  nkdentalsoft-server.exe --foreground
  nkdentalsoft-server.exe --init-clinic
"""

from __future__ import annotations

import os
import sys
import threading
import traceback
from pathlib import Path


def _install_dir() -> Path:
    env = (os.environ.get("NKDENTALSOFT_INSTALL_DIR") or "").strip()
    if env and Path(env).is_dir():
        return Path(env).resolve()
    if getattr(sys, "frozen", False):
        for raw in (sys.argv[0] if sys.argv else None, sys.executable):
            if not raw:
                continue
            p = Path(raw).resolve()
            if p.suffix.lower() == ".exe" and p.parent.is_dir():
                return p.parent
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _ensure_path() -> None:
    install = _install_dir()
    os.environ["NKDENTALSOFT_INSTALL_DIR"] = str(install)
    try:
        os.chdir(install)
    except OSError:
        pass

    meipass = getattr(sys, "_MEIPASS", None)
    for p in (Path(meipass) if meipass else None, install, install / "_internal"):
        if p and p.exists() and str(p) not in sys.path:
            sys.path.insert(0, str(p))

    # Pin UI dir before importing FastAPI app (path discovery for Windows Service)
    for candidate in (
        install / "web",
        Path(meipass) / "web" if meipass else None,
        install / "_internal" / "web",
    ):
        if candidate and (candidate / "index.html").is_file():
            os.environ["NKDENTALSOFT_UI_DIR"] = str(candidate.resolve())
            break


def run_uvicorn() -> None:
    _ensure_path()
    from server_entry import run_server

    run_server()


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
            "API FastAPI + SQLite for N&K DentalSoft clinic LAN (HTTPS)."
        )

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.stop_event)
            os._exit(0)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            threading.Thread(target=run_uvicorn, daemon=True).start()
            win32event.WaitForSingleObject(self.stop_event, win32event.INFINITE)


def _pause() -> None:
    try:
        input("\nPresione Enter para cerrar...")
    except Exception:
        import time

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

        if "--foreground" in lowered or "-f" in lowered:
            run_uvicorn()
            return

        if win32serviceutil is None:
            print("pywin32 not installed — running foreground server", flush=True)
            run_uvicorn()
            return

        svc_cmds = {"install", "remove", "start", "stop", "restart", "update", "debug"}
        if svc_cmds.intersection(lowered) or "--startup" in lowered:
            if getattr(sys, "frozen", False):
                sys.argv[0] = sys.executable
            win32serviceutil.HandleCommandLine(NKDentalSoftServerService)
            return

        if getattr(sys, "frozen", False) and not argv:
            try:
                servicemanager.Initialize()
                servicemanager.PrepareToHostSingle(NKDentalSoftServerService)
                servicemanager.StartServiceCtrlDispatcher()
                return
            except Exception:
                run_uvicorn()
                return

        run_uvicorn()
    except Exception as exc:
        print(f"[nkdentalsoft-server] FATAL: {exc}", flush=True)
        traceback.print_exc()
        log_hint = (
            Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
            / "NKDentalSoft"
            / "logs"
            / "startup.log"
        )
        print(f"\nRevise el log: {log_hint}\n", flush=True)
        if "--foreground" in lowered or "-f" in lowered or not argv:
            _pause()
        sys.exit(1)


if __name__ == "__main__":
    main()
