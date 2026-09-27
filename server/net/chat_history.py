"""Viewer-scoped display history, separate from the Keeper's prompt history.

Only already projected wire frames enter this journal. It shares the conversation
table's existing story-reset/delete/export lifecycle, but never its prompt key.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from typing import Any

from agent.history import DEFAULT_HISTORY_KEY, leaf_key
from gateway.hub import Event
from gateway.turn import TURN_EVENT_HISTORY_CAP, TURN_EVENT_HISTORY_KEY
from infra.room_facets import STORAGE_ROOM_STATE, RoomStateFacet

logger = logging.getLogger(__name__)
_KINDS = {"narrative": "chat", "dice": "dice", "system": "system", "error": "system"}
_MAX_SCAN = 500
PUBLIC_DISPLAY_KEY = "client_public_display"


def matches_query(frame: dict[str, Any], query: str) -> bool:
    """Search display fields only; internal IDs and hidden metadata are not text."""
    text = " ".join(str(frame.get(key, "")) for key in ("text", "message", "name", "actor", "expr", "total"))
    return query.casefold() in text.casefold()


def journal_key(member: Any) -> str:
    identity = json.dumps([member.user_key, member.role], separators=(",", ":"))
    return "client_log:" + hashlib.sha256(identity.encode()).hexdigest()


def public_frame(record: Any) -> dict[str, Any] | None:
    from net.session import render_frame

    payload = record.get("event") if isinstance(record, dict) else None
    if not isinstance(payload, dict) or payload.get("kind") not in {"dice", "narrative"} or payload.get("private"):
        return None
    return render_frame(
        Event(
            kind=payload["kind"],
            speaker=str(payload.get("speaker") or ""),
            text=str(payload.get("text") or ""),
            name=str(payload.get("name") or ""),
            fmt=str(payload.get("fmt") or "plain"),
            data=payload.get("data") if isinstance(payload.get("data"), dict) else {},
        )
    )


class ChatHistory:
    def __init__(self, services: Any) -> None:
        self.services = services
        self.store = services.store
        self._signing_key = secrets.token_bytes(32)

    async def metadata(self, member: Any) -> dict[str, Any]:
        epoch = await self.store.history_epoch(member.session_key)
        key = journal_key(member)
        scope = hashlib.sha256(json.dumps([epoch, member.session_key, key]).encode()).hexdigest()
        return {
            "history_scope": scope,
            "history_high_watermark": await self.store.history_sequence(member.session_key, ""),
        }

    async def capture(self, member: Any, frame: dict[str, Any]) -> dict[str, Any]:
        """Persist only the exact recipient's display lanes, never auth/admin/config frames."""
        kind = _KINDS.get(frame.get("type"))
        if kind is None or frame.get("replay") or frame.get("spinner"):
            return frame
        if frame.get("type") == "narrative" and not frame.get("text"):
            return frame
        if member.authorize is not None and not member.authorize():
            return frame
        try:
            copied = dict(frame)
            record_id = str(frame.get("history_id") or frame.get("id") or uuid.uuid4().hex)
            copied["history_id"] = record_id
            payload = json.dumps(copied, ensure_ascii=False)
            key = journal_key(member)
            await self.store.history_append(
                member.session_key,
                key,
                [
                    {
                        "id": record_id,
                        "role": kind,
                        "content": payload,
                        "turn": 0,
                    }
                ],
            )
            copied["history_seq"] = await self.record_sequence(member, record_id)
            copied["history_scope"] = (await self.metadata(member))["history_scope"]
            return copied
        except Exception:
            # A full disk must not prevent live play; the missing archive remains explicit.
            logger.warning("Could not archive display history", exc_info=True)
            return frame

    async def capture_public(self, room: str, event: Event) -> None:
        """Keep the exact public display even with no connected recipients or after undo."""
        from net.session import render_frame

        if event.private:
            return
        frame = render_frame(event)
        if not frame or frame.get("type") not in _KINDS or frame.get("spinner"):
            return
        if frame.get("type") == "narrative" and not frame.get("text"):
            return
        record_id = event.origin_id or event.data.get("frame_id") or event.display_id
        # Join can hold this same Event while reading the archive. Stamp the identity
        # before awaiting storage so the hold flush drops exactly the replayed copy.
        event.origin_id = record_id
        frame["history_id"] = record_id
        try:
            await self.store.history_append(
                room,
                PUBLIC_DISPLAY_KEY,
                [
                    {
                        "id": record_id,
                        "role": _KINDS[frame["type"]],
                        "content": json.dumps(frame, ensure_ascii=False),
                    }
                ],
            )
        except Exception:
            logger.warning("Could not archive public display history", exc_info=True)

    async def replay_frame(self, member: Any, frame: dict[str, Any], origin_id: str) -> dict[str, Any]:
        if frame.get("type") not in _KINDS:
            return frame
        record_id = origin_id or str(frame.get("id") or "")
        return {
            **frame,
            "replay": True,
            "history_id": record_id,
            "history_seq": await self.record_sequence(member, record_id) if record_id else 0,
            "history_scope": (await self.metadata(member))["history_scope"],
        }

    async def record_sequence(self, member: Any, record_id: str) -> int:
        for key in (PUBLIC_DISPLAY_KEY, journal_key(member), DEFAULT_HISTORY_KEY, "client_public_events"):
            sequence = await self.store.history_sequence(member.session_key, key, record_id)
            if sequence:
                return sequence
        return 0

    async def recent(self, member: Any, limit: int = 30) -> list[dict[str, Any]]:
        return (await self.page(member, {"limit": min(50, limit)}))["items"]

    def _encode(self, payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode()
        signed = hmac.digest(self._signing_key, raw, "sha256") + raw
        return base64.urlsafe_b64encode(signed).decode()

    def _decode(self, cursor: str, scope: str, filter_name: str, query: str) -> dict[str, Any]:
        if not isinstance(cursor, str) or len(cursor) > 4096:
            raise ValueError("invalid history cursor")
        try:
            raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
            signature, data = raw[:32], raw[32:]
            if not hmac.compare_digest(signature, hmac.digest(self._signing_key, data, "sha256")):
                raise ValueError("invalid history cursor")
            payload = json.loads(data)
            if payload["scope"] != scope or payload["filter"] != filter_name or payload.get("query", "") != query:
                raise ValueError("invalid history cursor")
            return payload
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError("invalid history cursor") from exc

    async def page(self, member: Any, request: dict[str, Any]) -> dict[str, Any]:
        """At most 50 items and 500 inspected rows; cursors pin the first-page boundary."""
        filter_name = request.get("filter", "all")
        limit = request.get("limit", 50)
        request_id = request.get("request_id", "")
        query = request.get("query", "")
        if not isinstance(query, str) or len(query) > 200 or any(0xD800 <= ord(char) <= 0xDFFF for char in query):
            raise ValueError("invalid history query")
        query = query.strip()
        if filter_name not in {"all", "chat", "dice", "system"}:
            raise ValueError("invalid history filter")
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError("invalid history limit")
        if not isinstance(request_id, str) or len(request_id) > 128:
            raise ValueError("invalid history request id")
        metadata = await self.metadata(member)
        scope = metadata["history_scope"]
        high = metadata["history_high_watermark"]
        key = journal_key(member)
        room = member.session_key
        cursor = request.get("cursor")
        state = (
            self._decode(cursor, scope, filter_name, query)
            if cursor
            else {
                "scope": scope,
                "filter": filter_name,
                "query": query,
                "before": high + 1,
                "high": high,
                "leaf": await self.store.state_get(room, leaf_key(DEFAULT_HISTORY_KEY)) or "",
                "phase": "journal",
                "event_index": 0,
            }
        )
        # Legacy public events are already bounded by the writer; absent private notices
        # cannot be reconstructed. Reuse the same public event lane as join replay.
        try:
            raw_events = json.loads(await self.store.state_get(room, TURN_EVENT_HISTORY_KEY) or "[]")
        except (ValueError, TypeError):
            raw_events = []
        events: dict[str, list[dict[str, Any]]] = {}
        if isinstance(raw_events, list):
            for record in raw_events[-TURN_EVENT_HISTORY_CAP:]:
                if isinstance(record, dict) and isinstance(record.get("event"), dict):
                    events.setdefault(str(record.get("after_id") or ""), []).append(record)
        items: list[dict[str, Any]] = []
        inspected = 0
        while len(items) < limit and inspected < _MAX_SCAN:
            if state["phase"] == "journal":
                rows = await self.store.history_display_page(
                    room,
                    key,
                    state["leaf"],
                    state["before"],
                    min(50, limit - len(items), _MAX_SCAN - inspected),
                    state["high"],
                )
                if not rows:
                    state["phase"] = "legacy"
                    continue
                for row in rows:
                    inspected += 1
                    state["before"] = row["seq"]
                    if row["key"] == DEFAULT_HISTORY_KEY:
                        text = row["content"].strip()
                        role = row["role"]
                        if (
                            not text
                            or role not in {"user", "assistant"}
                            or (role == "user" and text.startswith((".", "/")))
                        ):
                            continue
                        item = {
                            "type": "narrative",
                            "id": row["id"],
                            "speaker": "player" if role == "user" else "kp",
                            "text": text,
                            "format": "plain" if role == "user" else "markdown",
                        }
                    else:
                        try:
                            item = json.loads(row["content"])
                        except (ValueError, TypeError):
                            continue
                        if row["key"] == "client_public_events":
                            item = public_frame(item)
                    if not isinstance(item, dict) or item.get("type") not in _KINDS:
                        continue
                    if filter_name != "all" and _KINDS[item["type"]] != filter_name:
                        continue
                    if query and not matches_query(item, query):
                        continue
                    items.append(
                        {
                            **item,
                            "history_id": row["id"],
                            "history_seq": row["seq"],
                            "history_scope": scope,
                            "replay": True,
                        }
                    )
            elif state["phase"] == "legacy":
                anchored = list(reversed(events.get(state["leaf"], [])))
                index = state.get("event_index", 0)
                if index < len(anchored):
                    from net.session import render_frame

                    record = anchored[index]
                    state["event_index"] = index + 1
                    inspected += 1
                    record_id = str(record.get("id") or "")
                    payload = record["event"]
                    if not record_id or payload.get("kind") not in {"dice", "narrative"} or payload.get("private"):
                        continue
                    if await self.record_sequence(member, record_id):
                        continue
                    event = Event(
                        kind=payload["kind"],
                        speaker=str(payload.get("speaker") or ""),
                        text=str(payload.get("text") or ""),
                        name=str(payload.get("name") or ""),
                        fmt=str(payload.get("fmt") or "plain"),
                        data=payload.get("data") if isinstance(payload.get("data"), dict) else {},
                    )
                    item = render_frame(event)
                    if (
                        item
                        and (filter_name == "all" or _KINDS.get(item["type"]) == filter_name)
                        and matches_query(item, query)
                    ):
                        items.append(
                            {
                                **item,
                                "history_id": record_id,
                                "history_seq": await self.record_sequence(member, record_id),
                                "history_scope": scope,
                                "replay": True,
                            }
                        )
                    continue
                if not state["leaf"]:
                    state["phase"] = "done"
                    break
                # Follow only the active chain captured at page one, never scan abandoned branches.
                row = await self.store.history_record(room, DEFAULT_HISTORY_KEY, state["leaf"])
                if not row:
                    state["phase"] = "done"
                    break
                inspected += 1
                state["leaf"] = row.get("parent_id") or ""
                state["event_index"] = 0
            else:
                break
        # A boundary page may have an empty terminal page; bounded work beats unbounded lookahead.
        more = state["phase"] != "done"
        return {
            "type": "history_page",
            "request_id": request_id,
            "filter": filter_name,
            "query": query,
            "items": list(reversed(items)),
            "next_cursor": self._encode(state) if more else None,
            "has_more": more,
            "high_watermark": state["high"],
            "history_scope": scope,
        }


ROOM_FACETS = (
    RoomStateFacet(
        name="client_history_identity",
        owner="net.chat_history",
        reset_scope="story",
        state_keys=frozenset({"client_history_epoch"}),
        storages=frozenset({STORAGE_ROOM_STATE}),
    ),
)
