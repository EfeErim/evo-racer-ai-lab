from __future__ import annotations

import socket
import webbrowser
from pathlib import Path
from threading import Thread
from typing import Any

import pytest

from evo_racer import launcher
from evo_racer.service import create_server


class _FakeServer:
    server_port = 8765

    def __init__(self) -> None:
        self.served = False
        self.closed = False

    def serve_forever(self) -> None:
        self.served = True

    def server_close(self) -> None:
        self.closed = True


def test_launcher_opens_production_frontend_and_closes_server(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    static_root = tmp_path / "web"
    static_root.mkdir()
    (static_root / "index.html").write_text("<main>EvoRacer</main>", encoding="utf-8")
    fake_server = _FakeServer()
    opened_urls: list[str] = []

    def open_tab(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(launcher, "create_server", lambda **_kwargs: fake_server)
    monkeypatch.setattr(launcher, "_install_signal_handlers", lambda _server: None)
    monkeypatch.setattr(webbrowser, "open_new_tab", open_tab)

    launcher.run_launcher(static_root=static_root)

    assert opened_urls == ["http://127.0.0.1:8765/"]
    assert fake_server.served
    assert fake_server.closed


def _static_root(tmp_path: Path) -> Path:
    static_root = tmp_path / "web"
    static_root.mkdir()
    (static_root / "index.html").write_text("<main>EvoRacer</main>", encoding="utf-8")
    return static_root


def _record_opened_tabs(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    opened_urls: list[str] = []

    def open_tab(url: str) -> bool:
        opened_urls.append(url)
        return True

    monkeypatch.setattr(webbrowser, "open_new_tab", open_tab)
    return opened_urls


def test_second_launch_opens_the_running_instance_without_serving(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = create_server(port=0, data_root=tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    opened_urls = _record_opened_tabs(monkeypatch)
    try:
        launcher.run_launcher(port=server.server_port, static_root=_static_root(tmp_path))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert opened_urls == [f"http://127.0.0.1:{server.server_port}/"]


def test_launcher_explains_a_port_held_by_another_program(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    opened_urls = _record_opened_tabs(monkeypatch)
    with socket.socket() as other_program:
        other_program.bind(("127.0.0.1", 0))
        other_program.listen()
        port = other_program.getsockname()[1]
        with pytest.raises(RuntimeError, match=f"Port {port} is in use by another program"):
            launcher.run_launcher(port=port, static_root=_static_root(tmp_path))

    assert opened_urls == []


def test_launcher_accepts_portable_data_root_environment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EVORACER_DATA_ROOT", str(tmp_path))

    assert launcher.parse_args([]).data_root == tmp_path
