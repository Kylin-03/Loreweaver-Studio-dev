"""The human transcript is durable; prompt branches and private projections stay separate."""

from types import SimpleNamespace

import pytest

from agent.history import DEFAULT_HISTORY_KEY, append_message, load_chain, trim_folded
from gateway.hub import Event, RoomHub
from net.chat_history import PUBLIC_DISPLAY_KEY, ChatHistory
from net.keystore import Keystore
from net.room_backup import _replace_room_history, export_room, import_room
from tests.net.test_admin import _services
from tests.net.test_chat_history import archive, member


async def test_offline_public_transcript_survives_fold_undo_and_window_caps():
    history = archive()
    hub = RoomHub()
    hub.archive_public = history.capture_public
    viewer = member()
    for index in range(205):
        record_id = await append_message(
            history.services,
            viewer.session_key,
            DEFAULT_HISTORY_KEY,
            role="assistant",
            content=f"line {index}",
            turn=index,
        )
        event = Event.narrative("kp", f"line {index}", name="Keeper")
        event.origin_id = record_id
        await hub.publish(viewer.session_key, event)
    chain = await load_chain(history.services, viewer.session_key, DEFAULT_HISTORY_KEY)
    assert len(await trim_folded(history.services, viewer.session_key, DEFAULT_HISTORY_KEY, chain, 204)) == 0
    await history.store.state_set(viewer.session_key, "chat_history_leaf", "")
    found = []
    request = {}
    while True:
        page = await history.page(viewer, request)
        found[0:0] = page["items"]
        if not page["has_more"]:
            break
        request = {"cursor": page["next_cursor"]}
    assert [frame["text"] for frame in found] == [f"line {index}" for index in range(205)]
    assert all(frame["name"] == "Keeper" for frame in found)
    assert (await history.page(member(room="other"), {}))["items"] == []


async def test_public_archive_dedupes_tool_and_recipient_copies_in_public_sequence():
    from gateway.turn import record_turn_events

    history = archive()
    viewer = member()
    event = Event.dice("Alice", "roll", expr="1d6", total=4)
    await history.capture_public(viewer.session_key, event)
    public_seq = await history.store.history_sequence(viewer.session_key, PUBLIC_DISPLAY_KEY)
    await record_turn_events(history.services, viewer.session_key, [event])
    delivered = await history.capture(viewer, {"type": "dice", "history_id": event.origin_id, **event.data})
    assert delivered["history_seq"] == public_seq
    page = await history.page(viewer, {})
    assert len(page["items"]) == 1
    assert page["items"][0]["history_seq"] == public_seq


async def test_only_unrestricted_broadcasts_enter_public_archive():
    history = archive()
    hub = RoomHub()
    hub.archive_public = history.capture_public
    viewer = member()
    await hub.publish(viewer.session_key, Event.system("info", "public notice"))
    await hub.publish(viewer.session_key, Event.system("info", "private notice"), only_user="alice")
    await hub.publish(viewer.session_key, Event.narrative("kp", "secret", private=True))
    await hub.publish(viewer.session_key, Event.system("info", "excluded"), exclude_user="bob")
    await hub.publish(viewer.session_key, Event.narrative_delta("kp", "draft", frame_id="draft"))
    page = await history.page(member("bob"), {})
    assert [frame["text"] for frame in page["items"]] == ["public notice"]


async def test_search_is_literal_unicode_case_insensitive_and_permission_scoped():
    history = archive()
    viewer = member()
    await history.capture_public(viewer.session_key, Event.narrative("npc", "Harbor 100%", name="Guide"))
    await history.capture_public(viewer.session_key, Event.narrative("kp", "Second harbor"))
    await history.capture(member(role="keeper"), {"type": "system", "text": "harbor secret"})
    first = await history.page(viewer, {"query": " HARBOR ", "limit": 1})
    assert first["query"] == "HARBOR"
    await history.capture_public(viewer.session_key, Event.narrative("kp", "New harbor"))
    second = await history.page(viewer, {"query": "HARBOR", "limit": 1, "cursor": first["next_cursor"]})
    assert [frame["text"] for frame in second["items"]] == ["Harbor 100%"]
    assert [frame["text"] for frame in (await history.page(viewer, {"query": "%"}))["items"]] == ["Harbor 100%"]
    assert (await history.page(viewer, {"query": "secret"}))["items"] == []
    await history.capture_public(viewer.session_key, Event.narrative("kp", "\u6e2f\u53e3\u7684\u96fe"))
    assert len((await history.page(viewer, {"query": "\u6e2f\u53e3"}))["items"]) == 1
    with pytest.raises(ValueError):
        await history.page(viewer, {"query": "different", "cursor": first["next_cursor"]})
    for query in [None, [], 3, "x" * 201, "\ud800"]:
        with pytest.raises(ValueError):
            await history.page(viewer, {"query": query})


async def test_local3_persisted_public_events_survive_rewind_without_rewriting_rows():
    from gateway.turn import record_turn_events

    history = archive()
    viewer = member()
    await append_message(
        history.services, viewer.session_key, DEFAULT_HISTORY_KEY, role="assistant", content="old turn", turn=1
    )
    await record_turn_events(history.services, viewer.session_key, [Event.dice("Alice", "roll", total=5)])
    before = await history.store.history_rows(viewer.session_key)
    await history.store.state_set(viewer.session_key, "chat_history_leaf", "")
    page = await history.page(viewer, {})
    assert [frame["total"] for frame in page["items"]] == [5]
    assert await history.store.history_rows(viewer.session_key) == before


async def test_sparse_search_continues_beyond_500_rows_and_long_frames_are_not_truncated():
    history = archive()
    viewer = member()
    text = "needle " + "a" * (256 * 1024)
    await history.capture(viewer, {"type": "system", "text": text})
    for index in range(510):
        await history.capture(viewer, {"type": "system", "text": f"unrelated {index}"})
    first = await history.page(viewer, {"query": "needle"})
    assert first["items"] == [] and first["has_more"]
    second = await history.page(viewer, {"query": "needle", "cursor": first["next_cursor"]})
    assert second["items"][0]["text"] == text


async def test_restore_keeps_cross_lane_chronology_and_all_archive_payloads(tmp_path):
    services = _services(str(tmp_path))
    history = ChatHistory(services)
    viewer = member(room="tui:group:room-a")
    await history.capture_public(viewer.session_key, Event.narrative("kp", "first"))
    await history.capture(viewer, {"type": "error", "message": "private failure"})
    await history.capture_public(viewer.session_key, Event.system("info", "third"))
    original = await history.page(viewer, {})
    keys = Keystore()
    keys.add("room-a", role="keeper")
    backup = await export_room(services, keys, "room-a")
    await import_room(services, keys, backup["path"], expected_room="room-a")
    restored = await history.page(viewer, {})
    assert [item["history_id"] for item in restored["items"]] == [item["history_id"] for item in original["items"]]
    assert restored["history_scope"] != original["history_scope"]
    # Legacy snapshots without sequence retain their serialized order, too.
    rows = await services.store.history_rows(viewer.session_key)
    for row in rows:
        row.pop("seq")
    await _replace_room_history(SimpleNamespace(store=services.store), viewer.session_key, rows)
    assert [row["id"] for row in await services.store.history_rows(viewer.session_key)] == [row["id"] for row in rows]
