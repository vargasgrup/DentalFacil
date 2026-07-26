"""UDP LAN discovery for N&K DentalSoft desktop clients.

Clients broadcast NKDS_DISCOVER on UDP 37020; the Server replies with JSON
containing port + LAN IPs so stations can open http://<ip>:8001/ without a
manual scan of the whole /24 (which fails across guest Wi-Fi / slow links).
"""

from __future__ import annotations

import json
import logging
import socket
import threading
import time
from typing import Any

from app.version import PRODUCT_VERSION

logger = logging.getLogger("dentalfacil.lan_discovery")

DISCOVERY_PORT = 37020
MAGIC = "NKDS1"
PROBE = b"NKDS_DISCOVER"


def _lan_ips() -> list[str]:
    try:
        from app.services.lan_network import clinic_ipv4_list

        return clinic_ipv4_list()
    except Exception:  # noqa: BLE001
        return []


def build_announce_payload(*, http_port: int) -> dict[str, Any]:
    ips = _lan_ips()
    hostname = socket.gethostname()
    return {
        "magic": MAGIC,
        "product": "N&K DentalSoft",
        "version": PRODUCT_VERSION,
        "port": int(http_port),
        "hostname": hostname,
        "ips": ips,
        "urls": [f"http://{ip}:{http_port}/" for ip in ips],
    }


class LanDiscoveryService:
    """Background UDP responder + optional beacon."""

    def __init__(self, *, http_port: int = 8001) -> None:
        self.http_port = int(http_port)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._sock: socket.socket | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="nk-lan-discovery",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "LAN UDP discovery listening on 0.0.0.0:%s (HTTP %s)",
            DISCOVERY_PORT,
            self.http_port,
        )

    def stop(self) -> None:
        self._stop.set()
        try:
            if self._sock is not None:
                self._sock.close()
        except Exception:  # noqa: BLE001
            pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)

    def _run(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock = sock
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            except OSError:
                pass
            sock.bind(("0.0.0.0", DISCOVERY_PORT))
            sock.settimeout(1.0)
        except OSError as exc:
            logger.warning("LAN discovery bind failed on UDP %s: %s", DISCOVERY_PORT, exc)
            return

        payload = json.dumps(build_announce_payload(http_port=self.http_port)).encode("utf-8")
        last_beacon = 0.0

        while not self._stop.is_set():
            now = time.monotonic()
            if now - last_beacon >= 8.0:
                self._beacon(sock, payload)
                last_beacon = now
                # refresh IPs periodically (DHCP / cable plug)
                payload = json.dumps(build_announce_payload(http_port=self.http_port)).encode("utf-8")

            try:
                data, addr = sock.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                if self._stop.is_set():
                    break
                continue

            if not data:
                continue
            text = data.decode("utf-8", errors="ignore").strip().upper()
            if "NKDS_DISCOVER" not in text and MAGIC not in text:
                continue
            try:
                sock.sendto(payload, addr)
                logger.debug("LAN discovery reply → %s", addr)
            except OSError as exc:
                logger.debug("LAN discovery reply failed: %s", exc)

        try:
            sock.close()
        except Exception:  # noqa: BLE001
            pass

    def _beacon(self, sock: socket.socket, payload: bytes) -> None:
        targets = [("255.255.255.255", DISCOVERY_PORT)]
        for ip in _lan_ips():
            parts = ip.split(".")
            if len(parts) == 4:
                targets.append((".".join(parts[:3] + ["255"]), DISCOVERY_PORT))
        for target in targets:
            try:
                sock.sendto(payload, target)
            except OSError:
                pass


_service: LanDiscoveryService | None = None


def start_lan_discovery(*, http_port: int = 8001) -> LanDiscoveryService | None:
    global _service
    try:
        svc = LanDiscoveryService(http_port=http_port)
        svc.start()
        _service = svc
        return svc
    except Exception as exc:  # noqa: BLE001
        logger.warning("LAN discovery not started: %s", exc)
        return None


def stop_lan_discovery(handle: Any = None) -> None:
    global _service
    svc = handle or _service
    if svc is not None:
        try:
            svc.stop()
        except Exception as exc:  # noqa: BLE001
            logger.debug("stop_lan_discovery: %s", exc)
    _service = None
