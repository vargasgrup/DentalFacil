"""WebSocket connection hub for LAN multi-client realtime sync."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("dentalfacil.realtime")


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._meta: dict[str, dict[str, str]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket, *, user_id: str, role: str) -> str:
        await websocket.accept()
        conn_id = f"{user_id}:{id(websocket)}"
        async with self._lock:
            self._connections[conn_id] = websocket
            self._meta[conn_id] = {"user_id": user_id, "role": role}
        logger.info("ws connected user=%s role=%s total=%s", user_id, role, len(self._connections))
        return conn_id

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
