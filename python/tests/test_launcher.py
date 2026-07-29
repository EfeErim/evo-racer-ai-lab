from __future__ import annotations

import webbrowser
from pathlib import Path
from typing import Any

from evo_racer import launcher


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
