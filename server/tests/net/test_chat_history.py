"""Display pagination is bounded and scoped to the authenticated viewer, never the AI prompt."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from agent.history import DEFAULT_HISTORY_KEY, append_message
from infra.store import Store
from net.chat_history import ChatHistory, journal_key


def member(user="alice", role="player", room="room-a"):
    return SimpleNamespace(user_key=user, role=role, session_key=room, authorize=None)


def archive(store=None):
    return ChatHistory(SimpleNamespace(store=store or Store()))


async def test_join_merges_notices_and_offline_arrivals_in_sequence():
    from net.keystore import Keystore
    from net.session import SessionCore
    from tests.net.test_tui_server import _services

    core = SessionCore(_services(), Keystore())
    viewer = member()
    old = await append_message(
        core.services, viewer.session_key, DEFAULT_HISTORY_KEY, role="user", content="old", turn=1
    )
    await core.chat_history.capture(
        viewer, {"type": "narrative", "history_id": old, "text": "old", "speaker": "player"}
    )
    await core.chat_history.capture(viewer, {"type": "system", "text": "notice"})
    cutoff = (await core.chat_history.metadata(viewer))["history_high_watermark"]
    await append_message(
        core.services, viewer.session_key, DEFAULT_HISTORY_KEY, role="assistant", content="offline", turn=1
    )
    sent = []

    async def send(frame):
        sent.append(frame)

    viewer.send_frame = send
    replayed = set()
    await core._replay_history_body(viewer, viewer.session_key, replayed)
    assert [frame["text"] for frame in sent] == ["old", "notice", "offline"]
    assert [frame["history_seq"] for frame in sent] == sorted(frame["history_seq"] for frame in sent)
    assert [frame["text"] for frame in sent if frame["history_seq"] > cutoff] == ["offline"]
    assert replayed == {frame["history_id"] for frame in sent}


@pytest.mark.parametrize("change", ["revoke", "downgrade", "reset"])
async def test_join_rechecks_permission_and_scope_before_each_frame(change):
    from net.keystore import Keystore
    from net.session import SessionCore
    from tests.net.test_tui_server import _services

    core = SessionCore(_services(), Keystore())
    viewer = member(role="keeper")
    await core.chat_history.capture(viewer, {"type": "system", "text": "first"})
    await core.chat_history.capture(viewer, {"type": "system", "text": "secret"})
    sent = []

    async def send(frame):
        sent.append(frame)
        if change == "revoke":
            viewer.authorize = lambda: False
        elif change == "downgrade":
            viewer.role = "player"
        else:
            await core.services.store.history_delete_room(viewer.session_key)

    viewer.send_frame = send
    replayed = set()
    await core._replay_history_body(viewer, viewer.session_key, replayed)
    assert [frame["text"] for frame in sent] == ["first"]
    assert replayed == {sent[0]["history_id"]}


async def test_cursor_keeps_canonical_row_if_journal_copy_arrives_after_watermark():
    history = archive()
    viewer = member()
    old = await append_message(
        history.services, viewer.session_key, DEFAULT_HISTORY_KEY, role="user", content="old", turn=1
    )
    await append_message(
        history.services, viewer.session_key, DEFAULT_HISTORY_KEY, role="assistant", content="new", turn=1
    )
    first = await history.page(viewer, {"limit": 1})
    await history.capture(viewer, {"type": "narrative", "history_id": old, "text": "old", "speaker": "player"})
    second = await history.page(viewer, {"limit": 1, "cursor": first["next_cursor"]})
    assert [frame["text"] for frame in second["items"]] == ["old"]
    assert second["high_watermark"] == first["high_watermark"]


async def test_private_log_isolated_by_room_identity_and_current_role():
    history = archive()
    keeper = member(role="keeper")
    await history.capture(keeper, {"type": "system", "text": "keeper-only secret", "level": "info"})
    for outsider in [member(), member("bob", "keeper"), member(role="keeper", room="room-b")]:
        assert (await history.page(outsider, {}))["items"] == []
    assert (await history.page(keeper, {}))["items"][0]["text"] == "keeper-only secret"
    keeper.role = "player"
    assert (await history.page(keeper, {}))["items"] == []


async def test_forward_arrivals_do_not_shift_older_pages_and_filters_apply():
    history = archive()
    viewer = member()
    for index in range(110):
        await history.capture(viewer, {"type": "system", "text": str(index), "level": "info"})
    first = await history.page(viewer, {"filter": "system"})
    assert [item["text"] for item in first["items"]] == [str(i) for i in range(60, 110)]
    await history.capture(viewer, {"type": "system", "text": "new arrival", "level": "info"})
    second = await history.page(viewer, {"filter": "system", "cursor": first["next_cursor"]})
    assert [item["text"] for item in second["items"]] == [str(i) for i in range(10, 60)]
    assert second["high_watermark"] == 110
    assert not (await history.page(viewer, {"filter": "chat"}))["items"]


async def test_same_event_captured_concurrently_is_idempotent_and_prompt_untouched():
    history = archive()
    viewer = member()
    frame = {"type": "narrative", "id": "frame", "history_id": "canonical", "speaker": "kp", "text": "hello"}
    results = await asyncio.gather(*(history.capture(viewer, frame) for _ in range(5)))
    assert {result["history_seq"] for result in results} == {1}
    assert len((await history.page(viewer, {}))["items"]) == 1
    assert await history.store.history_record(viewer.session_key, DEFAULT_HISTORY_KEY, "canonical") is None
    assert await history.store.state_get(viewer.session_key, "chat_history_leaf") is None


async def test_cursor_is_scoped_signed_filter_bound_and_reset_invalidates():
    history = archive()
    viewer = member()
    await history.capture(viewer, {"type": "system", "text": "one", "level": "info"})
    page = await history.page(viewer, {"limit": 1})
    cursor = page["next_cursor"]
    for outsider in [member("bob"), member(role="keeper"), member(room="other")]:
        with pytest.raises(ValueError):
            await history.page(outsider, {"cursor": cursor})
    with pytest.raises(ValueError):
        await history.page(viewer, {"cursor": cursor, "filter": "system"})
    with pytest.raises(ValueError):
        await history.page(viewer, {"cursor": "x" + cursor[1:]})
    old_scope = page["history_scope"]
    await history.store.history_delete_room(viewer.session_key)
    assert (await history.metadata(viewer))["history_scope"] != old_scope
    with pytest.raises(ValueError):
        await history.page(viewer, {"cursor": cursor})


async def test_restart_preserves_scope_sequence_and_clear_watermark(tmp_path):
    path = tmp_path / "history.sqlite"
    history = archive(Store(path))
    viewer = member()
    before = await history.capture(viewer, {"type": "system", "text": "before clear", "level": "info"})
    restarted = archive(Store(path))
    assert await restarted.metadata(viewer) == await history.metadata(viewer)
    after = await restarted.capture(viewer, {"type": "system", "text": "after clear", "level": "info"})
    replay = await restarted.recent(viewer)
    assert all(frame["replay"] for frame in replay)
    assert [frame["text"] for frame in replay if frame["history_seq"] > before["history_seq"]] == ["after clear"]
    assert after["history_seq"] > before["history_seq"]


async def test_legacy_uses_active_chain_only_and_dedupes_modern_journal():
    history = archive()
    viewer = member()
    services = history.services
    abandoned = await append_message(
        services, "room-a", DEFAULT_HISTORY_KEY, role="assistant", content="abandoned", turn=0
    )
    await history.store.state_set("room-a", "chat_history_leaf", "")
    old = await append_message(services, "room-a", DEFAULT_HISTORY_KEY, role="user", content="old player", turn=1)
    new = await append_message(services, "room-a", DEFAULT_HISTORY_KEY, role="assistant", content="new reply", turn=1)
    await history.capture(
        viewer, {"type": "narrative", "id": "frame", "history_id": new, "speaker": "kp", "text": "new reply"}
    )
    page = await history.page(viewer, {})
    assert [item["history_id"] for item in page["items"]] == [old, new]
    assert abandoned not in json.dumps(page)
    assert page["items"][0]["history_seq"] > 0


async def test_offline_public_arrivals_have_new_sequence_and_merge_in_order():
    history = archive()
    viewer = member()
    old = await append_message(
        history.services, "room-a", DEFAULT_HISTORY_KEY, role="user", content="before clear", turn=1
    )
    clear = (await history.metadata(viewer))["history_high_watermark"]
    await history.capture(viewer, {"type": "system", "level": "info", "text": "notice"})
    fresh = await append_message(
        history.services, "room-a", DEFAULT_HISTORY_KEY, role="assistant", content="while offline", turn=1
    )
    replay = await history.replay_frame(viewer, {"type": "narrative", "id": "wire", "text": "while offline"}, fresh)
    assert replay["history_seq"] > clear
    old_replay = await history.replay_frame(viewer, {"type": "narrative", "id": "wire", "text": "before clear"}, old)
    assert old_replay["history_seq"] <= clear
    page = await history.page(viewer, {"limit": 2})
    assert [item["text"] for item in page["items"]] == ["notice", "while offline"]
    next_page = await history.page(viewer, {"limit": 2, "cursor": page["next_cursor"]})
    assert [item["text"] for item in next_page["items"]] == ["before clear"]


async def test_old_public_roll_lane_is_available_but_private_and_abandoned_events_are_not():
    history = archive()
    viewer = member()
    await history.store.state_set(
        "room-a",
        "turn_event_history",
        json.dumps(
            [
                {
                    "id": "roll",
                    "after_id": "",
                    "event": {"kind": "dice", "data": {"actor": "a", "expr": "1d6", "total": 4}},
                },
                {"id": "private", "after_id": "", "event": {"kind": "narrative", "text": "private", "private": True}},
                {"id": "abandoned", "after_id": "unreachable", "event": {"kind": "narrative", "text": "abandoned"}},
            ]
        ),
    )
    page = await history.page(viewer, {"filter": "dice"})
    assert [item["history_id"] for item in page["items"]] == ["roll"]


@pytest.mark.parametrize(
    "payload",
    [
        {"limit": 51},
        {"limit": 0},
        {"limit": True},
        {"limit": "50"},
        {"filter": "secret"},
        {"request_id": "x" * 129},
        {"cursor": "x" * 5000},
    ],
)
async def test_invalid_bounds_are_rejected(payload):
    with pytest.raises(ValueError):
        await archive().page(member(), payload)


async def test_ephemeral_admin_and_revoked_frames_are_not_archived():
    history = archive()
    viewer = member()
    for frame in [
        {"type": "admin_config", "api_key": "secret"},
        {"type": "admin_keys", "key": "bearer"},
        {"type": "narrative_delta", "id": "draft", "text": "partial"},
        {"type": "system", "spinner": True, "text": "progress"},
    ]:
        assert await history.capture(viewer, frame) == frame
    viewer.authorize = lambda: False
    await history.capture(viewer, {"type": "system", "text": "revoked"})
    assert await history.store.history_sequence("room-a", journal_key(viewer)) == 0


async def test_filter_scan_work_is_bounded_and_resumable():
    history = archive()
    viewer = member()
    await history.store.history_append(
        "room-a", journal_key(viewer), [{"id": str(i), "role": "system", "content": "{}"} for i in range(700)]
    )
    page = await history.page(viewer, {"filter": "chat"})
    assert page["items"] == [] and page["has_more"]
    final = await history.page(viewer, {"filter": "chat", "cursor": page["next_cursor"]})
    assert final["items"] == [] and not final["has_more"]


async def test_wire_endpoint_private_notice_replay_and_scoped_errors():
    import websockets

    from gateway.hub import Event
    from net.keystore import Keystore
    from net.tui_server import TuiServer
    from tests.net.test_tui_server import _connect_and_join, _join, _recv_until, _services, _start

    services = _services()
    keys = Keystore()
    alice_key = keys.add(room="history-room", name="Alice", role="keeper")
    bob_key = keys.add(room="history-room", name="Bob", role="player")
    server = TuiServer(services, keys, port=0)
    url = await _start(server)
    try:
        alice, welcome, *_ = await _connect_and_join(url, alice_key)
        bob, other_welcome, *_ = await _connect_and_join(url, bob_key)
        assert "chat_history" in welcome["features"]
        assert welcome["history_scope"] != other_welcome["history_scope"]
        viewer = next(peer for peer in server.hub.rooms["tui:group:history-room"] if peer.name == "Alice")
        await viewer.deliver(Event.system("info", "private sentinel"))
        live = await _recv_until(alice, "system")
        assert live["history_seq"] == 1
        await bob.send(json.dumps({"type": "history_request", "request_id": "bob", "room": "history-room"}))
        page = await _recv_until(bob, "history_page")
        assert page["request_id"] == "bob" and not page["items"]
        await alice.send(json.dumps({"type": "history_request", "request_id": "bad", "limit": 1000}))
        error = await _recv_until(alice, "history_error")
        assert error["request_id"] == "bad" and error["code"] == "bad_frame"
        await alice.close()
        again = await websockets.connect(url)
        again_welcome = await _join(again, alice_key)
        assert again_welcome["history_high_watermark"] == 1
        replay = await _recv_until(again, "system")
        assert replay["history_id"] == live["history_id"]
        assert replay["history_seq"] == 1 and replay["replay"]
        await again.send(json.dumps({"type": "history_request", "request_id": "again"}))
        page = await _recv_until(again, "history_page")
        assert len(page["items"]) == 1
        await again.close()
        await bob.close()
    finally:
        await server.close()
