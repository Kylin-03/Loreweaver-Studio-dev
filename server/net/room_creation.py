"""Create an isolated campaign without exposing or copying another room."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from gateway.room_metadata import ROOM_NAME_KEY, set_room_name, validate_room_name
from gateway.rooms import session_key_for_room
from net.keystore import member_id_for_key

logger = logging.getLogger(__name__)


async def create_room(
    services: Any, keystore: Any, frame: dict[str, Any], i18n: Any, reauthorize: Any
) -> dict[str, Any]:
    request_id = frame.get("request_id", "")

    def error(code: str) -> dict[str, Any]:
        return {
            "type": "admin_error",
            "request_id": request_id[:128] if isinstance(request_id, str) else "",
            "code": code,
            "message": i18n.t(f"tui.admin.error.{code}"),
        }

    try:
        if not isinstance(request_id, str) or len(request_id) > 128:
            raise ValueError("invalid request id")
        name = validate_room_name(frame.get("name"))
    except ValueError:
        return error("bad_request")
    if reauthorize is not None and not reauthorize():
        return error("forbidden")
    # IDs are server-generated, so a client can never choose an existing destination.
    room = "room-" + uuid.uuid4().hex
    created = False
    try:
        await set_room_name(services.store, session_key_for_room(room), name)
        if reauthorize is not None and not reauthorize():
            return error("forbidden")
        with keystore.persisted_mutation():
            key = keystore.add(room=room, name="", role="keeper")
        created = True
    except Exception:
        logger.warning("Could not create isolated room", exc_info=True)
        return error("op_failed")
    finally:
        if not created:
            await services.store.state_delete(session_key_for_room(room), ROOM_NAME_KEY)
    return {
        "type": "admin_room_created",
        "request_id": request_id,
        "room": room,
        "name": name,
        "key": key,
        "identity": member_id_for_key(key),
    }
