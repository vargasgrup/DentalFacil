"""
Windows Service wrapper for N&K DentalSoft Server (pywin32).

Install (elevated):
  python windows_service.py install
  python windows_service.py start

Requires pywin32. Plan B: NSSM (documented in packaging/README.md).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def _programdata() -> Path:
    return Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "NKDentalSoft"


def run_uvicorn() -> None:
    root = _programdata()
    _load_env_file(root / "config" / ".env")
    os.environ.setdefault("APP_ENV", "production")
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("BACKEND_PORT", "8001"))
    cert = root / "certs" / "server.crt"
    key = root / "certs" / "server.key"
    # Ensure backend package is importable when frozen / installed
    install_dir = Path(os.environ.get("NKDENTALSOFT_INSTALL_DIR", Path(sys.executable).parent))
    if str(install_dir) not in sys.path:
        sys.path.insert(0, str(install_dir))

    import uvicorn

    kwargs: dict = {
        "app": "app.main:app",
        "host": host,
        "port": port,
        "log_level": "info",
    }
    if cert.is_file() and key.is_file():
        kwargs["ssl_certfile"] = str(cert)
        kwargs["ssl_keyfile"] = str(key)
    uvicorn.run(**kwargs)


try:
    import win32event
    import win32service
    import win32serviceutil
    import servicemanager
except ImportError:
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
            self.proc = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.stop_event)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            run_uvicorn()


def main() -> None:
    if win32serviceutil is None:
        print("pywin32 not installed — running foreground uvicorn instead")
        run_uvicorn()
        return
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(NKDentalSoftServerService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(NKDentalSoftServerService)


if __name__ == "__main__":
    main()
