"""Room labels are persistent metadata, never room identity mutations."""
import asyncio
import json

import pytest

from agent.context import AgentCtx
from gateway.room_metadata import get_room_name, set_room_name, validate_room_name
from infra.i18n import get_i18n
from infra.store import Store
from net.admin import AdminService
from net.keystore import Keystore
from net.room_backup import chat_key_for_room, delete_room_data, export_room, import_room, reset_room_state
from net.state import build_room_state
from net.tui_server import TuiServer
from tests.net.test_admin import _services
from tests.net.test_tui_server import _connect_and_join, _recv, _recv_until, _start


@pytest.mark.parametrize("value", [None, 12, "", "   ", "x" * 81, "a\nb", "a\tb", "a\x00b", "a\u202eb", "a\ud800b", "a\u2028b"])
def test_invalid_names(value):
    with pytest.raises(ValueError):
        validate_room_name(value)


def test_unicode_trim_and_codepoint_limit():
    assert validate_room_name("  \u96fe\u6e2f \U0001f3b2  ") == "\u96fe\u6e2f \U0001f3b2"
    assert len(validate_room_name("\U0001f3b2" * 80)) == 80


async def test_persists_across_store_reopen(tmp_path):
    path = tmp_path / "room.db"
    original = Store(path)
    key = chat_key_for_room("immutable")
    assert await get_room_name(original, key) == "immutable"
    await set_room_name(original, key, "  New room  ")
    reopened = Store(path)
    assert await get_room_name(reopened, key) == "New room"
    assert await get_room_name(reopened, chat_key_for_room("other")) == "other"


async def test_auth_and_lifecycle(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    token = keys.add(room="stable", name="Keeper", role="keeper")
    admin = AdminService(services, keys)
    request = {"type": "admin_set_room_name", "name": " New label ", "room": "other"}
    for role in ["player", "spectator"]:
        denied = await admin.dispatch(role, "stable", request, get_i18n("en"))
        assert denied["code"] == "forbidden"
    denied = await admin.dispatch("keeper", "stable", request, get_i18n("en"), reauthorize=lambda: False)
    assert denied["code"] == "forbidden"
    invalid = await admin.dispatch("keeper", "stable", {**request, "name": "\n"}, get_i18n("en"))
    assert invalid["code"] == "bad_request"
    reply = await admin.dispatch("keeper", "stable", request, get_i18n("en"))
    assert reply == {"type": "admin_room_name", "room": "stable", "name": "New label"}
    chat_key = chat_key_for_room("stable")
    ctx = AgentCtx(chat_key=chat_key)
    assert (await build_room_state(services, ctx))["room_name"] == "New label"
    for scope in ["story", "chars", "all"]:
        await reset_room_state(services, chat_key, scope=scope, keystore=keys)
        assert await get_room_name(services.store, chat_key) == "New label"
    snapshot = await export_room(services, keys, "stable")
    await set_room_name(services.store, chat_key, "Changed")
    await import_room(services, keys, snapshot["path"], expected_room="stable")
    assert await get_room_name(services.store, chat_key) == "New label"
    assert keys.get(token).room == "stable"
    await delete_room_data(services, keys, "stable")
    assert await get_room_name(services.store, chat_key) == "stable"


async def test_wire_same_room_broadcast_and_reconnect(tmp_path):
    services = _services(str(tmp_path))
    keys = Keystore()
    keeper = keys.add(room="stable", name="Keeper", role="keeper")
    player = keys.add(room="stable", name="Player", role="player")
    outsider = keys.add(room="other", name="Other", role="player")
    server = TuiServer(services, keys, port=0)
    url = await _start(server)
    sockets = []
    try:
        a, _, _, state = await _connect_and_join(url, keeper)
        sockets.append(a)
        assert state["room_name"] == "stable" and state["room_name_editable"] is True
        b, *_ = await _connect_and_join(url, player)
        sockets.append(b)
        await _recv_until(a, "state")
        c, *_ = await _connect_and_join(url, outsider)
        sockets.append(c)
        await a.send(json.dumps({"type": "admin_set_room_name", "name": "New label"}))
        assert (await _recv_until(b, "state"))["room_name"] == "New label"
        assert (await _recv_until(a, "state"))["room_name"] == "New label"
        assert (await _recv_until(a, "admin_room_name"))["room"] == "stable"
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(c.recv(), timeout=0.1)
        await b.send(json.dumps({"type": "admin_set_room_name", "name": "Forbidden"}))
        assert (await _recv(b))["code"] == "forbidden"
        d, welcome, _, state = await _connect_and_join(url, player)
        sockets.append(d)
        assert welcome["room"] == "stable" and state["room_name"] == "New label"
    finally:
        for socket in sockets:
            await socket.close()
        await server.close()
