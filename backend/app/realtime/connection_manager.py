"""WebSocket connection hub for LAN multi-client realtime sync."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("dentalfacil.realtime")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._meta: dict[str, dict[str, Any]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(
        self,
        websocket: WebSocket,
        *,
        user_id: str,
        role: str,
        nombre: str = "",
        email: str = "",
        client_ip: str = "",
    ) -> str:
        await websocket.accept()
        conn_id = f"{user_id}:{id(websocket)}"
        now = _utc_now_iso()
        async with self._lock:
            self._connections[conn_id] = websocket
            self._meta[conn_id] = {
                "user_id": user_id,
                "role": role or "",
                "nombre": nombre or "",
                "email": email or "",
                "client_ip": client_ip or "",
                "connected_at": now,
                "last_seen": now,
            }
        logger.info(
            "ws connected user=%s role=%s ip=%s total=%s",
            user_id,
            role,
            client_ip,
            len(self._connections),
        )
        return conn_id

    async def touch(self, conn_id: str) -> None:
        async with self._lock:
            meta = self._meta.get(conn_id)
            if meta is not None:
                meta["last_seen"] = _utc_now_iso()

    async def disconnect(self, conn_id: str) -> None:
        async with self._lock:
            self._connections.pop(conn_id, None)
            self._meta.pop(conn_id, None)

    async def broadcast(self, message: dict[str, Any], *, exclude_user: str | None = None) -> None:
        dead: list[str] = []
        async with self._lock:
            items = list(self._connections.items())
            meta = dict(self._meta)
        for conn_id, ws in items:
            if exclude_user and meta.get(conn_id, {}).get("user_id") == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                dead.append(conn_id)
        for conn_id in dead:
            await self.disconnect(conn_id)

    def emit_threadsafe(self, message: dict[str, Any], *, exclude_user: str | None = None) -> None:
        """Safe to call from sync FastAPI route handlers (threadpool)."""
        loop = self._loop
        if loop is None or not loop.is_running():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast(message, exclude_user=exclude_user),
                loop,
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("emit_threadsafe failed: %s", exc)

    def snapshot(self) -> dict[str, Any]:
        """
        Live presence for Configuración.
        Aggregates multiple tabs/sockets per user into one row.
        """
        by_user: dict[str, dict[str, Any]] = {}
        for meta in list(self._meta.values()):
            uid = str(meta.get("user_id") or "")
            if not uid:
                continue
            row = by_user.get(uid)
            if row is None:
                by_user[uid] = {
                    "user_id": uid,
                    "nombre": meta.get("nombre") or "",
                    "email": meta.get("email") or "",
                    "role": meta.get("role") or "",
                    "client_ips": [meta.get("client_ip")] if meta.get("client_ip") else [],
                    "sockets": 1,
                    "connected_at": meta.get("connected_at"),
                    "last_seen": meta.get("last_seen"),
                }
                continue
            row["sockets"] = int(row.get("sockets") or 0) + 1
            ip = meta.get("client_ip") or ""
            if ip and ip not in row["client_ips"]:
                row["client_ips"].append(ip)
            # Keep earliest connected_at / latest last_seen
            ca = meta.get("connected_at") or ""
            ls = meta.get("last_seen") or ""
            if ca and (not row.get("connected_at") or ca < row["connected_at"]):
                row["connected_at"] = ca
            if ls and (not row.get("last_seen") or ls > row["last_seen"]):
                row["last_seen"] = ls
            if not row.get("nombre") and meta.get("nombre"):
                row["nombre"] = meta["nombre"]
            if not row.get("email") and meta.get("email"):
                row["email"] = meta["email"]

        connections = sorted(
            by_user.values(),
            key=lambda r: (str(r.get("role") or ""), str(r.get("nombre") or "").lower()),
        )
        role_counts: dict[str, int] = {}
        for row in connections:
            role = str(row.get("role") or "DESCONOCIDO").upper()
            role_counts[role] = role_counts.get(role, 0) + 1

        return {
            "total_users": len(connections),
            "total_sockets": len(self._connections),
            "by_role": role_counts,
            "connections": connections,
        }


manager = ConnectionManager()


def publish_event(
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    actor: str | None = None,
) -> None:
    message = {
        "type": event_type,
        "payload": payload or {},
        "actor": actor,
    }
    manager.emit_threadsafe(message)
