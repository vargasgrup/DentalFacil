"""Unit tests for packaging/server/desktop_runtime.py (desktop self-heal)."""

from __future__ import annotations

import importlib.util
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "packaging" / "server" / "desktop_runtime.py"


def _load():
    spec = importlib.util.spec_from_file_location("desktop_runtime", MODULE)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["desktop_runtime"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def rt():
    return _load()


def test_port_open_false_on_unused_port(rt):
    assert rt.port_open(1, timeout=0.2) is False


def test_http_ready_and_server_ready(rt):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            return

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        assert rt.http_ready(f"http://127.0.0.1:{port}/api/system/health") is True
        assert rt.server_ready(port) is True
        assert rt.port_open(port) is True
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_http_ready_false_when_nothing_listens(rt):
    assert rt.http_ready("http://127.0.0.1:1/api/system/health", timeout=0.2) is False
    assert rt.server_ready(1) is False


def test_wait_until_ready_success(rt):
    state = {"n": 0}

    def is_ready():
        state["n"] += 1
        return state["n"] >= 3

    result = rt.wait_until_ready(
        timeout=2.0,
        is_ready=is_ready,
        sleep_fn=lambda _s: None,
        poll=0.01,
        progress_every=99,
        child_dead_grace=99,
    )
    assert result.ok is True
    assert result.reason == "ready"


def test_wait_until_ready_timeout(rt):
    now = {"t": 0.0}

    def clock():
        return now["t"]

    def sleep(_s):
        now["t"] += 0.5

    result = rt.wait_until_ready(
        timeout=1.0,
        is_ready=lambda: False,
        sleep_fn=sleep,
        now_fn=clock,
        poll=0.5,
        progress_every=99,
        child_dead_grace=99,
    )
    assert result.ok is False
    assert result.reason == "timeout"


def test_wait_until_ready_child_exited_after_grace(rt):
    now = {"t": 0.0}

    def clock():
        return now["t"]

    def sleep(_s):
        now["t"] += 1.0

    result = rt.wait_until_ready(
        timeout=30.0,
        is_ready=lambda: False,
        child_alive=lambda: False,
        sleep_fn=sleep,
        now_fn=clock,
        poll=1.0,
        progress_every=99,
        child_dead_grace=2.0,
    )
    assert result.ok is False
    assert result.reason == "child_exited"


def test_wait_until_ready_keeps_waiting_while_child_alive(rt):
    now = {"t": 0.0}
    notes: list[str] = []

    def clock():
        return now["t"]

    def sleep(_s):
        now["t"] += 1.0

    result = rt.wait_until_ready(
        timeout=3.0,
        is_ready=lambda: False,
        child_alive=lambda: True,
        log_progress=notes.append,
        sleep_fn=sleep,
        now_fn=clock,
        poll=1.0,
        progress_every=2.0,
        child_dead_grace=0.1,
    )
    assert result.ok is False
    assert result.reason == "timeout"
    assert any("esperando servidor" in n for n in notes)


def test_tail_log_and_diagnose(rt, tmp_path: Path):
    log = tmp_path / "startup.log"
    log.write_text("\n".join(f"line {i}" for i in range(1, 60)), encoding="utf-8")
    tail = rt.tail_log(log, 5)
    assert "line 56" in tail
    assert "line 59" in tail
    assert "line 1" not in tail

    missing = tmp_path / "foreground.log"
    diag = rt.diagnose_failure(log, missing)
    assert "startup.log" in diag
    assert "line 59" in diag
    assert "vacío o no existe" in diag


def test_log_recently_written(rt, tmp_path: Path):
    path = tmp_path / "startup.log"
    path.write_text("boot\n", encoding="utf-8")
    assert rt.log_recently_written(path, within_seconds=30) is True
    os.utime(path, (1_000_000, 1_000_000))
    assert rt.log_recently_written(path, within_seconds=30) is False
    assert rt.log_recently_written(tmp_path / "missing.log") is False


def test_sibling_pids_never_include_self(rt):
    pids = rt.sibling_server_pids()
    assert os.getpid() not in pids


def test_terminate_pids_skips_self(rt):
    assert rt.terminate_pids([os.getpid(), 0, -1]) == []


def test_foreground_log_path(rt, tmp_path: Path):
    assert rt.foreground_log_path(tmp_path) == tmp_path / "logs" / "foreground.log"


def test_data_writable_ok_on_fresh_root(rt, tmp_path: Path):
    ok, reason = rt.data_writable(tmp_path)
    assert ok is True
    assert reason == ""
    assert (tmp_path / "data").is_dir()
    assert not (tmp_path / "data" / ".nkds_write_probe").exists()


def test_data_writable_ok_with_writable_db(rt, tmp_path: Path):
    db = tmp_path / "data" / "clinica.db"
    db.parent.mkdir(parents=True)
    db.write_bytes(b"sqlite")
    ok, reason = rt.data_writable(tmp_path)
    assert ok is True
    assert reason == ""


def test_data_writable_detects_readonly_db(rt, tmp_path: Path, monkeypatch):
    db = tmp_path / "data" / "clinica.db"
    db.parent.mkdir(parents=True)
    db.write_bytes(b"sqlite")

    real_open = Path.open

    def fake_open(self, mode="r", *args, **kwargs):
        if self.name == "clinica.db" and "+" in mode:
            raise PermissionError("Access is denied")
        return real_open(self, mode, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fake_open)
    ok, reason = rt.data_writable(tmp_path)
    assert ok is False
    assert "solo lectura" in reason
    assert "clinica.db" in reason


def test_data_writable_detects_readonly_folder(rt, tmp_path: Path, monkeypatch):
    def fake_write_bytes(self, _data):
        raise PermissionError("Access is denied")

    monkeypatch.setattr(Path, "write_bytes", fake_write_bytes)
    ok, reason = rt.data_writable(tmp_path)
    assert ok is False
    assert "sin permiso de escritura" in reason
