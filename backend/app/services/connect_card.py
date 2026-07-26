"""Persist a double-clickable Internet Shortcut so staff can share the clinic URL."""

from __future__ import annotations

import logging
import os
import socket
from pathlib import Path

logger = logging.getLogger("dentalfacil.connect_card")


def _lan_ips() -> list[str]:
    found: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in found:
                found.append(ip)
    except Exception:  # noqa: BLE001
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in found:
                found.insert(0, ip)
        finally:
            s.close()
    except Exception:  # noqa: BLE001
        pass
    return found


def write_connect_card(*, http_port: int = 8001) -> str | None:
    """
    Write ProgramData + Public Desktop Internet Shortcuts pointing at the LAN URL.
    Clients can open the .url or paste the same address in ConnectClinic.
    """
    ips = _lan_ips()
    if not ips:
        return None
    url = f"http://{ips[0]}:{int(http_port)}/"
    hostname = socket.gethostname()
    body = "\r\n".join(
        [
            "[InternetShortcut]",
            f"URL={url}",
            "IDList=",
            "HotKey=0",
            f"IconFile={os.environ.get('SystemRoot', r'C:\\Windows')}\\System32\\shell32.dll",
            "IconIndex=13",
            "",
        ]
    )
    targets: list[Path] = []
    program_data = Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData")
    targets.append(program_data / "NKDentalSoft" / "connect.url")
    public = os.environ.get("PUBLIC") or r"C:\Users\Public"
    targets.append(Path(public) / "Desktop" / "NKDentalSoft-Servidor.url")
    # Also a plain text card for non-technical staff
    targets.append(program_data / "NKDentalSoft" / "IP-DEL-SERVIDOR.txt")

    written = None
    for path in targets:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.suffix.lower() == ".txt":
                path.write_text(
                    "N&K DentalSoft — URL para otros PCs de la clinica\r\n"
                    f"Hostname: {hostname}\r\n"
                    f"URL: {url}\r\n"
                    f"IPs: {', '.join(ips)}\r\n"
                    "\r\n"
                    "En el Client: pegue la URL o escriba solo la IP "
                    f"({ips[0]}) y pulse Conectar.\r\n",
                    encoding="utf-8",
                )
            else:
                path.write_text(body, encoding="utf-8")
            written = url
            logger.info("connect card written → %s (%s)", path, url)
        except Exception as exc:  # noqa: BLE001
            logger.debug("connect card skip %s: %s", path, exc)
    return written
