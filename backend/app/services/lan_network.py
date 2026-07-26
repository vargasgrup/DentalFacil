"""Clinic LAN addressing — prefer real Ethernet, never VPN/APIPA/Hyper-V."""

from __future__ import annotations

import socket
import subprocess
from typing import Any


def _is_bad_ip(ip: str) -> bool:
    if not ip or ip.startswith("127."):
        return True
    if ip.startswith("169.254."):  # APIPA / link-local broken Wi-Fi
        return True
    if ip.startswith("10.2."):  # common ProTUN / CGNAT tunnels in this clinic
        return True
    parts = ip.split(".")
    if len(parts) != 4:
        return True
    try:
        a, b = int(parts[0]), int(parts[1])
    except ValueError:
        return True
    # Hyper-V / Docker / WSL default switches
    if a == 172 and 16 <= b <= 31:
        return True
    return False


def _iface_is_virtual(name: str, description: str = "") -> bool:
    blob = f"{name} {description}".lower()
    keys = (
        "vpn",
        "tun",
        "tap",
        "protun",
        "wireguard",
        "openvpn",
        "nord",
        "zerotier",
        "hamachi",
        "vethernet",
        "hyper-v",
        "virtualbox",
        "vmware",
        "docker",
        "wsl",
        "loopback",
        "bluetooth",
    )
    return any(k in blob for k in keys)


def get_clinic_lan_ips() -> list[dict[str, Any]]:
    """
    Return candidate LAN IPs with metadata, Ethernet first.
    Uses PowerShell Get-NetIPAddress when available (accurate on Windows).
    """
    rows: list[dict[str, Any]] = []
    try:
        ps = (
            "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | "
            "Where-Object { $_.IPAddress -notlike '127.*' } | "
            "ForEach-Object { "
            "  $a = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue; "
            "  '{0}|{1}|{2}|{3}|{4}' -f $_.IPAddress,$_.PrefixLength,$_.InterfaceAlias,"
            "($a.MediaType),($a.InterfaceDescription)"
            "}"
        )
        r = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                ps,
            ],
            capture_output=True,
            text=True,
            timeout=12,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for line in (r.stdout or "").splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = line.split("|")
            if len(parts) < 5:
                continue
            ip, plen, alias, media, desc = parts[0], parts[1], parts[2], parts[3], parts[4]
            if _is_bad_ip(ip) or _iface_is_virtual(alias, desc):
                continue
            media_l = (media or "").lower()
            alias_l = (alias or "").lower()
            is_ethernet = ("802.3" in media_l) or ("ethernet" in alias_l) or ("ethernet" in (desc or "").lower())
            is_wifi = ("native802.11" in media_l) or ("wi-fi" in alias_l) or ("wifi" in alias_l) or ("wlan" in alias_l)
            try:
                prefix = int(plen)
            except ValueError:
                prefix = 24
            rows.append(
                {
                    "ip": ip,
                    "prefix": prefix,
                    "alias": alias,
                    "ethernet": is_ethernet,
                    "wifi": is_wifi,
                }
            )
    except Exception:  # noqa: BLE001
        rows = []

    if not rows:
        # Fallback: classic sockets tricks
        try:
            hostname = socket.gethostname()
            for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
                ip = info[4][0]
                if _is_bad_ip(ip):
                    continue
                rows.append({"ip": ip, "prefix": 24, "alias": "unknown", "ethernet": False, "wifi": False})
        except Exception:  # noqa: BLE001
            pass
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                if not _is_bad_ip(ip) and not any(r["ip"] == ip for r in rows):
                    rows.insert(0, {"ip": ip, "prefix": 24, "alias": "default", "ethernet": True, "wifi": False})
            finally:
                s.close()
        except Exception:  # noqa: BLE001
            pass

    # Ethernet first, then Wi-Fi, then others
    def sort_key(r: dict[str, Any]) -> tuple:
        return (0 if r.get("ethernet") else 1 if r.get("wifi") else 2, r.get("ip") or "")

    rows.sort(key=sort_key)
    # de-dupe by ip
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        ip = r["ip"]
        if ip in seen:
            continue
        seen.add(ip)
        out.append(r)
    return out


def clinic_ipv4_list() -> list[str]:
    return [r["ip"] for r in get_clinic_lan_ips()]


def same_subnet(ip_a: str, ip_b: str, prefix: int = 24) -> bool:
    try:
        pa = [int(x) for x in ip_a.split(".")]
        pb = [int(x) for x in ip_b.split(".")]
        if len(pa) != 4 or len(pb) != 4:
            return False
        mask = (0xFFFFFFFF << (32 - int(prefix))) & 0xFFFFFFFF
        na = (pa[0] << 24) | (pa[1] << 16) | (pa[2] << 8) | pa[3]
        nb = (pb[0] << 24) | (pb[1] << 16) | (pb[2] << 8) | pb[3]
        return (na & mask) == (nb & mask)
    except Exception:  # noqa: BLE001
        return False
