from __future__ import annotations

import json
import threading
from http import HTTPStatus
from typing import Any
from urllib.request import Request, urlopen

from evo_racer.service import LOOPBACK_HOST, create_server
from evo_racer.tracks import PRESET_TRACKS


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


def test_setup_validation_contract_does_not_start_a_run() -> None:
    server = create_server(port=0)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    request = Request(  # noqa: S310
        f"http://{host}:{port}/v1/setup/validate",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Origin": "http://127.0.0.1:4173",
        },
        data=json.dumps(
            {
                "contractVersion": 1,
                "trackPreset": "easy-oval",
                "settings": {
                    "algorithm": "fixed-ga",
                    "populationSize": 48,
                    "generations": 30,
                    "episodeSeconds": 90,
                    "seed": 42,
                },
            }
        ).encode("utf-8"),
    )

    try:
        with urlopen(request, timeout=2) as response:  # noqa: S310
            payload: dict[str, Any] = json.load(response)

        assert response.status == HTTPStatus.OK
        assert response.headers["Access-Control-Allow-Origin"] == ("http://127.0.0.1:4173")
        assert payload == {"contractVersion": 1, "valid": True, "errors": []}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_compiled_track_presets_are_served_from_the_loopback_core() -> None:
    server = create_server(port=0)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    request = Request(  # noqa: S310
        f"http://{host}:{port}/v1/tracks/presets",
        method="GET",
        headers={"Origin": "http://127.0.0.1:4173"},
    )

    try:
        with urlopen(request, timeout=2) as response:  # noqa: S310
            payload: dict[str, Any] = json.load(response)

        assert response.status == HTTPStatus.OK
        assert response.headers["Access-Control-Allow-Origin"] == ("http://127.0.0.1:4173")
        assert payload["contractVersion"] == 1
        presets = payload["presets"]
        assert isinstance(presets, list)
        assert [preset["track"]["id"] for preset in presets] == [
            track.track_id for track in PRESET_TRACKS
        ]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
