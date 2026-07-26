"""
Windows Service + foreground runner for N&K DentalSoft Server.

Frozen EXE (clinic):
  nkdentalsoft-server.exe install | start | stop | remove
  nkdentalsoft-server.exe --foreground

Dev:
  python packaging/server/windows_service.py --foreground
"""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path


def _install_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _ensure_path() -> None:
    install = _install_dir()
    os.environ.setdefault("NKDENTALSOFT_INSTALL_DIR", str(install))
    for p in (install, Path(__file__).resolve().parent):
        if p.exists() and str(p) not in sys.path:
            sys.path.insert(0, str(p))


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


def init_clinic(host: str | None = None) -> None:
    """Generate unique .env + self-signed cert under ProgramData (installer step)."""
    _ensure_path()
    from pathlib import Path as P

    scripts = _install_dir() / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))

    try:
        import generate_production_secrets as gps
        import generate_selfsigned_cert as gsc
    except ImportError:
        pkg = Path(__file__).resolve().parent / "scripts"
        sys.path.insert(0, str(pkg))
        import generate_production_secrets as gps
        import generate_selfsigned_cert as gsc

    out_env = gps._default_env_path()
    jwt_secret, maint = gps.generate_secrets()
    gps.write_env(out_env, jwt_secret=jwt_secret, maintenance_key=maint)
    print(f"Wrote {out_env}")

    lan = (host or "").strip() or _detect_lan_ip()
    hosts = ["127.0.0.1", "localhost", "nkdentalsoft-server.local", lan]
    certs = (
        P(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
        / "NKDentalSoft"
        / "certs"
    )
    info = gsc.generate_cert(
        certs,
        common_name="nkdentalsoft-server.local",
        extra_hosts=hosts,
    )
    print(f"lan_ip={lan}")
    print(f"fingerprint_sha256={info['fingerprint_sha256']}")


def main() -> None:
    _ensure_path()
    argv = sys.argv[1:]
    lowered = [a.lower() for a in argv]

    if "--init-clinic" in lowered:
        host = None
        for i, a in enumerate(argv):
            if a.lower() == "--host" and i + 1 < len(argv):
                host = argv[i + 1]
                break
        init_clinic(host)
        return

    if "--foreground" in lowered or "-f" in lowered:
        run_uvicorn()
        return

    if win32serviceutil is None:
        print("pywin32 not installed — running foreground server")
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


if __name__ == "__main__":
    main()
