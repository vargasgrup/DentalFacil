"""WebSocket endpoint for LAN realtime sync."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.security import decode_token, is_token_revoked
from app.database import SessionLocal
from app.models import User
from app.realtime.connection_manager import manager

router = APIRouter(tags=["realtime"])


@router.websocket("/api/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    user_id = ""
    role = ""
    nombre = ""
    email = ""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4401)
            return
        user_id = str(payload.get("sub") or "")
        role = str(payload.get("role") or "")
        token_ver = int(payload.get("ver") or 0)
        jti = payload.get("jti")
        with SessionLocal() as db:
            if is_token_revoked(db, jti):
                await websocket.close(code=4401)
                return
            user = db.get(User, user_id)
            if not user or not getattr(user, "activo", True):
                await websocket.close(code=4401)
                return
            if token_ver != int(getattr(user, "token_version", 0) or 0):
                await websocket.close(code=4401)
                return
            role = user.rol or role
            nombre = str(user.nombre or "")
            email = str(user.email or "")
    except Exception:  # noqa: BLE001
        await websocket.close(code=4401)
        return

    conn_id = await manager.connect(
        websocket,
        user_id=user_id,
        role=role,
        nombre=nombre,
        email=email,
        client_ip=(websocket.client.host if websocket.client else "") or "",
    )
    try:
        await websocket.send_json({"type": "realtime.connected", "payload": {"userId": user_id}})
        while True:
            # Keepalive / ignore client pings; server is push-only for v1
            data = await websocket.receive_text()
            if data in ("ping", '{"type":"ping"}'):
                await manager.touch(conn_id)
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(conn_id)
