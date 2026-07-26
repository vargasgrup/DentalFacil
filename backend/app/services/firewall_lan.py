"""Best-effort Windows Firewall open for LAN clients (port + program)."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger("dentalfacil.firewall")


def _server_exe() -> Path | None:
    if getattr(sys, "frozen", False):
        p = Path(sys.executable)
        if p.is_file():
            return p
    env = (os.environ.get("NKDENTALSOFT_INSTALL_DIR") or "").strip()
    if env:
        cand = Path(env) / "nkdentalsoft-server.exe"
        if cand.is_file():
            return cand
    pf = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "NKDentalSoft" / "Server" / "nkdentalsoft-server.exe"
    if pf.is_file():
        return pf
    return None


def _run(cmd: list[str]) -> int:
    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return int(r.returncode)
    except Exception as exc:  # noqa: BLE001
        logger.debug("firewall cmd failed: %s (%s)", cmd, exc)
        return -1


def ensure_lan_firewall(*, http_port: int = 8001, discovery_port: int = 37020) -> None:
    """
    Open inbound TCP/UDP and allow the frozen server EXE.
    Safe to call every startup; fails soft without Administrator rights.
    """
    # Delete+add port rules (idempotent enough)
    for name, proto, port in (
        ("NKDentalSoft Server 8001", "TCP", http_port),
        ("NKDentalSoft LAN Discovery 37020", "UDP", discovery_port),
    ):
        _run(["netsh", "advfirewall", "firewall", "delete", "rule", f"name={name}"])
        rc = _run(
            [
                "netsh",
                "advfirewall",
                "firewall",
                "add",
                "rule",
                f"name={name}",
                "dir=in",
                "action=allow",
                f"protocol={proto}",
                f"localport={port}",
                "profile=any",
                "edge=yes",
                "enable=yes",
            ]
        )
        logger.info("firewall %s %s/%s rc=%s", name, proto, port, rc)

    exe = _server_exe()
    if exe is not None:
        for direction, label in (("in", "NKDentalSoft Server EXE"), ("out", "NKDentalSoft Server EXE Out")):
            _run(["netsh", "advfirewall", "firewall", "delete", "rule", f"name={label}"])
            rc = _run(
                [
                    "netsh",
                    "advfirewall",
                    "firewall",
                    "add",
                    "rule",
                    f"name={label}",
                    f"dir={direction}",
                    "action=allow",
                    f"program={exe}",
                    "profile=any",
                    "enable=yes",
                    "edge=yes",
                ]
            )
            logger.info("firewall program %s %s rc=%s", direction, exe, rc)
    else:
        logger.warning("firewall: server EXE path unknown — port rules only")

    # ICMP echo (Client ping diagnosis)
    _run(["netsh", "advfirewall", "firewall", "delete", "rule", "name=NKDentalSoft ICMP Allow"])
    _run(
        [
            "netsh",
            "advfirewall",
            "firewall",
            "add",
            "rule",
            "name=NKDentalSoft ICMP Allow",
            "protocol=icmpv4:8,any",
            "dir=in",
            "action=allow",
            "profile=any",
            "enable=yes",
        ]
    )
