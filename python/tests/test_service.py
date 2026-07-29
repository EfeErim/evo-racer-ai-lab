from __future__ import annotations

import json
import threading
from http import HTTPStatus
from typing import Any
from urllib.request import urlopen

from evo_racer.service import LOOPBACK_HOST, create_server


def test_health_contract_is_served_on_loopback() -> None:
    server = create_server(port=0)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        with urlopen(f"http://{host}:{port}/health", timeout=2) as response:  # noqa: S310
            payload: dict[str, Any] = json.load(response)

        assert response.status == HTTPStatus.OK
        assert host == LOOPBACK_HOST
        assert payload == {
            "contractVersion": 1,
            "host": "127.0.0.1",
            "service": "evo-racer-core",
            "status": "ready",
        }
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
