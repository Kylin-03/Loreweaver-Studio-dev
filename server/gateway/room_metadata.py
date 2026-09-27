"""Persistent public room labels; identifiers and access keys stay immutable."""
from __future__ import annotations

import unicodedata
from typing import Any

from infra.room_facets import STORAGE_ROOM_STATE, RoomStateFacet

ROOM_NAME_KEY = "room_name"


def validate_room_name(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("invalid room name")
    # Reject controls before trimming, so a newline cannot be silently accepted.
    if any(unicodedata.category(char) in {"Cc", "Cf", "Cs", "Zl", "Zp"} for char in value):
        raise ValueError("invalid room name")
    name = value.strip()
    if not 1 <= len(name) <= 80:
        raise ValueError("invalid room name")
    return name


async def get_room_name(store: Any, chat_key: str) -> str:
    stored = await store.state_get(chat_key, ROOM_NAME_KEY)
    try:
        return validate_room_name(stored)
    except ValueError:
        return chat_key.rsplit(":", 1)[-1]


async def set_room_name(store: Any, chat_key: str, value: Any) -> str:
    name = validate_room_name(value)
    await store.state_set(chat_key, ROOM_NAME_KEY, name)
    return name


ROOM_FACETS = (
    RoomStateFacet(
        name="room_metadata",
        owner="gateway.room_metadata",
        reset_scope=None,
        survives_because="The room's display label is configuration, not campaign content.",
        state_keys=frozenset({ROOM_NAME_KEY}),
        storages=frozenset({STORAGE_ROOM_STATE}),
    ),
)
