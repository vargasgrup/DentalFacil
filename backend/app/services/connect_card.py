"""Persist a double-clickable Internet Shortcut so staff can share the clinic URL."""

from __future__ import annotations

import logging
import os
import socket
from pathlib import Path

logger = logging.getLogger("dentalfacil.connect_card")


def write_connect_card(*, http_port: int = 8001) -> str | None:
    """
    Write ProgramData + Public Desktop Internet Shortcuts pointing at the LAN URL.
    Clients can open the .url or paste the same address in ConnectClinic.
    """
    from app.services.lan_network import get_clinic_lan_ips

    rows = get_clinic_lan_ips()
    ips = [r["ip"] for r in rows]
    if not ips:
        return None
    eth = next((r for r in rows if r.get("ethernet")), None)
    best = eth["ip"] if eth else ips[0]
    url = f"http://{best}:{int(http_port)}/"
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
    targets.append(program_data / "NKDentalSoft" / "IP-DEL-SERVIDOR.txt")

    written = None
    for path in targets:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.suffix.lower() == ".txt":
                path.write_text(
                    "N&K DentalSoft — URL para otros PCs (USE LA IP ACTUAL)\r\n"
                    f"URL recomendada: {url}\r\n"
                    f"IP del servidor: {best}\r\n"
                    f"Puerto: {int(http_port)}\r\n"
                    f"Nombre de este PC (NO usar): {hostname}\r\n"
                    f"Otras IPs: {', '.join(ips)}\r\n"
                    "\r\n"
                    "Si el Client no hace ping: active Hotspot de clinica en el Server\r\n"
                    "y conecte los Clients a ese Wi-Fi (IP tipica 192.168.137.1).\r\n",
                    encoding="utf-8",
                )
            else:
                path.write_text(body, encoding="utf-8")
            written = url
            logger.info("connect card written → %s (%s)", path, url)
        except Exception as exc:  # noqa: BLE001
            logger.debug("connect card skip %s: %s", path, exc)
    return written
