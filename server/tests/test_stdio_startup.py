"""Regressions for redirected Windows logs and local launcher readiness."""

import io
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from infra.stdio import configure_stdio

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("initial_encoding", ["gbk", "ascii"])
def test_stdio_reconfigures_real_pipes_and_flushes_lines(monkeypatch, initial_encoding):
    stdout_bytes, stderr_bytes = io.BytesIO(), io.BytesIO()
    stdout = io.TextIOWrapper(stdout_bytes, encoding=initial_encoding)
    stderr = io.TextIOWrapper(stderr_bytes, encoding=initial_encoding)
    with monkeypatch.context() as patch:
        patch.setattr(sys, "stdout", stdout)
        patch.setattr(sys, "stderr", stderr)
        configure_stdio()
        configure_stdio()  # Runtime hook + entrypoint must be safe together.
        print("\u4e2d\u6587 \U0001f409")
        print("\u5c31\u7eea \udcff", file=sys.stderr)
        assert sys.stdout is stdout
        assert stdout_bytes.getvalue().decode("utf-8").rstrip() == "\u4e2d\u6587 \U0001f409"
        assert stderr_bytes.getvalue().decode("utf-8").rstrip() == "\u5c31\u7eea \\udcff"


def test_missing_custom_and_closed_streams_are_preserved(monkeypatch):
    closed = io.TextIOWrapper(io.BytesIO())
    closed.close()
    for stream in (None, io.StringIO(), closed):
        with monkeypatch.context() as patch:
            patch.setattr(sys, "stdout", stream)
            patch.setattr(sys, "stderr", stream)
            configure_stdio()
            assert sys.stdout is stream
            assert sys.stderr is stream


@pytest.mark.parametrize("entry", ["import app", "import runpy; runpy.run_path('scripts/pyi_runtime_utf8.py')"])
def test_entrypoints_override_environment_encoding(entry):
    env = {key: value for key, value in os.environ.items() if not key.startswith("TRPG_")}
    env.update(PYTHONIOENCODING="gbk", PYTHONUTF8="0")
    code = entry + "; import sys; print('\\u4e2d\\u6587 \\U0001f409'); print('\\u5c31\\u7eea', file=sys.stderr)"
    result = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, timeout=60)
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert result.stdout.decode("utf-8").strip() == "\u4e2d\u6587 \U0001f409"
    assert result.stderr.decode("utf-8").strip() == "\u5c31\u7eea"


@pytest.mark.parametrize("token", [None, "", "test-launch-token\n\u4e2d"])
def test_readiness_is_opt_in_ascii_and_precedes_banner(monkeypatch, tmp_path, capsys, token):
    import app
    from infra.i18n import get_i18n

    monkeypatch.delenv("TRPG_HOST_READY_TOKEN", raising=False)
    if token is not None:
        monkeypatch.setenv("TRPG_HOST_READY_TOKEN", token)
    ticket = "endpoint" + "a" * 40
    keys = tmp_path / "keys.toml"
    keys.write_text("secret-keeper-key", encoding="utf-8")
    app._announce_iroh_ticket(get_i18n("zh"), ticket, str(keys))
    lines = capsys.readouterr().err.splitlines()
    if token:
        assert lines[0].isascii()
        assert lines[0].startswith("LOREWEAVER_READY=")
        assert json.loads(lines[0].partition("=")[2]) == {"version": 1, "token": token, "ticket": ticket}
    else:
        assert not any(line.startswith("LOREWEAVER_READY=") for line in lines)
    assert "secret-keeper-key" not in "\n".join(lines)
    assert (tmp_path / "iroh-ticket.txt").read_text(encoding="utf-8") == f"ticket={ticket}\n"
