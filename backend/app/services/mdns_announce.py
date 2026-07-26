"""mDNS / Zeroconf announce for LAN discovery (_nkdentalsoft._tcp.local.)."""

from __future__ import annotations

import logging
import socket
from typing import Any

logger = logging.getLogger("dentalfacil.mdns")

SERVICE_TYPE = "_nkdentalsoft._tcp.local."


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:  # noqa: BLE001
        return "127.0.0.1"


def start_mdns_announce(
    *,
    port: int = 8001,
    fingerprint_sha256: str = "",
    name: str = "N&K DentalSoft Server",
) -> Any:
    """
    Publish server presence. Returns Zeroconf service info handle or None if
    zeroconf is not installed / announce fails.
    """
    try:
        from zeroconf import ServiceInfo, Zeroconf
    except ImportError:
        logger.warning("zeroconf not installed — mDNS announce disabled")
        return None

    ip = _local_ip()
    props = {
        b"path": b"/api/system/health",
        b"version": b"1.0.0",
        b"tls": b"0",
        b"proto": b"http",
    }
    if fingerprint_sha256:
        props[b"fp"] = fingerprint_sha256.encode("ascii")

    info = ServiceInfo(
        SERVICE_TYPE,
        f"{name.replace(' ', '-')}.{SERVICE_TYPE}",
        addresses=[socket.inet_aton(ip)],
        port=port,
        properties=props,
        server="nkdentalsoft-server.local.",
    )
    zc = Zeroconf()
    zc.register_service(info)
    logger.info("mDNS announced %s on %s:%s fp=%s…", SERVICE_TYPE, ip, port, fingerprint_sha256[:12])
    return (zc, info)


def stop_mdns_announce(handle: Any) -> None:
    if not handle:
        return
    try:
        zc, info = handle
        zc.unregister_service(info)
        zc.close()
    except Exception as exc:  # noqa: BLE001
        logger.debug("stop_mdns_announce: %s", exc)
