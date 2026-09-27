"""Room creation grants only the new isolated room and never mutates a running campaign."""

import json

import pytest

from gateway.room_metadata import get_room_name
from gateway.rooms import session_key_for_room
from infra.i18n import get_i18n
from net.admin import AdminService, is_admin_frame
from net.keystore import Keystore
from net.session import welcome_frame
from net.tui_server import TuiServer
from tests.net.test_admin import _services
from tests.net.test_tui_server import _connect_and_join, _recv_until, _start


async def test_create_isolated_room_and_keep_existing_data(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    old_key = keys.add("existing", name="Keeper", role="keeper")
    await services.store.state_set(session_key_for_room("existing"), "sentinel", "campaign")
    admin = AdminService(services, keys)
    frame = {"type": "admin_create_room", "request_id": "create-1", "name": "Second campaign", "room": "existing"}
    created = await admin.dispatch("keeper", "existing", frame, get_i18n("en"))
    assert created["type"] == "admin_room_created" and created["request_id"] == "create-1"
    assert created["room"] != "existing"
    assert keys.get(created["key"]).room == created["room"]
    assert keys.get(created["key"]).role == "keeper"
    assert keys.get(old_key).room == "existing"
    assert await services.store.state_get(session_key_for_room("existing"), "sentinel") == "campaign"
    assert await services.store.state_get(session_key_for_room(created["room"]), "sentinel") is None
    assert await get_room_name(services.store, session_key_for_room(created["room"])) == "Second campaign"
    assert is_admin_frame("admin_create_room")


@pytest.mark.parametrize("role", ["player", "spectator"])
async def test_nonkeepers_cannot_create(role, tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    response = await AdminService(services, keys).dispatch(
        role, "old", {"type": "admin_create_room", "name": "New"}, get_i18n("en")
    )
    assert response["code"] == "forbidden"
    assert not keys.entries()


async def test_validation_and_revocation_are_correlated(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    admin = AdminService(services, keys)
    for name in ["", "x" * 81, "bad\nname", None]:
        response = await admin.dispatch(
            "keeper", "old", {"type": "admin_create_room", "request_id": "r", "name": name}, get_i18n("en")
        )
        assert response["code"] == "bad_request" and response["request_id"] == "r"
    response = await admin.dispatch(
        "keeper",
        "old",
        {"type": "admin_create_room", "request_id": "r", "name": "Good"},
        get_i18n("en"),
        reauthorize=lambda: False,
    )
    assert response["code"] == "forbidden" and response["request_id"] == "r"
    assert not keys.entries()


async def test_revocation_during_label_write_cleans_only_new_label(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    checks = iter([True, False])
    response = await AdminService(services, keys).dispatch(
        "keeper",
        "old",
        {"type": "admin_create_room", "request_id": "r", "name": "New"},
        get_i18n("en"),
        reauthorize=lambda: next(checks),
    )
    assert response["code"] == "forbidden" and response["request_id"] == "r"
    assert not keys.entries()
    async with services.store._lock:
        rows = services.store._ensure_conn().execute("SELECT value FROM room_state WHERE key='room_name'").fetchall()
    assert rows == []


def test_creation_feature_is_keeper_only():
    fields = {"room": "old", "name": "a", "id": "a", "role": "keeper", "locale": "en"}
    assert "room_creation" in welcome_frame(fields)["features"]
    assert "room_creation" not in welcome_frame({**fields, "role": "player"})["features"]


async def test_create_room_over_wire_and_join_without_old_history(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    key = keys.add("existing", role="keeper")
    server = TuiServer(services, keys, port=0)
    sockets = []
    try:
        url = await _start(server)
        ws, welcome, *_ = await _connect_and_join(url, key)
        sockets.append(ws)
        assert "room_creation" in welcome["features"]
        await ws.send(json.dumps({"type": "admin_create_room", "request_id": "new", "name": "Second"}))
        created = await _recv_until(ws, "admin_room_created")
        other, new_welcome, *_ = await _connect_and_join(url, created["key"])
        sockets.append(other)
        assert new_welcome["room"] == created["room"]
        assert new_welcome["you"]["id"] == created["identity"]
        assert new_welcome["you"]["role"] == "keeper"
        await other.send(json.dumps({"type": "history_request", "request_id": "empty"}))
        assert (await _recv_until(other, "history_page"))["items"] == []
        await ws.send(json.dumps({"type": "history_request", "request_id": "no-key-leak"}))
        assert (await _recv_until(ws, "history_page"))["items"] == []
    finally:
        for ws in sockets:
            await ws.close()
        await server.close()
