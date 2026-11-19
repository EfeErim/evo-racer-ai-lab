from __future__ import annotations

import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from evo_racer.observer import RunSession, RunSettings
from evo_racer.run_library import save_run_document
from evo_racer.service import LOOPBACK_HOST, EvoRacerServer, create_server
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


@dataclass
class Service:
    server: EvoRacerServer

    @property
    def origin(self) -> str:
        return f"http://{LOOPBACK_HOST}:{self.server.server_port}"

    def call(self, path: str, payload: object = None, method: str | None = None) -> Any:
        request = Request(  # noqa: S310
            self.origin + path,
            method=method or ("GET" if payload is None else "POST"),
            headers={"Content-Type": "application/json", "Origin": self.origin},
            data=None if payload is None else json.dumps(payload).encode("utf-8"),
        )
        # Generator v5 alone takes about 2 s here, and CI machines can be slower.
        with urlopen(request, timeout=30) as response:  # noqa: S310
            assert response.status == HTTPStatus.OK
            return json.load(response)

    def wait_for_status(self, run_id: str, status: str) -> dict[str, Any]:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            snapshot: dict[str, Any] = self.call(
                "/v1/runs/observe", {"contractVersion": 1, "runId": run_id}
            )["snapshot"]
            if snapshot["status"] == status:
                return snapshot
            time.sleep(0.01)
        pytest.fail(f"Run {run_id} did not reach {status}.")


@contextmanager
def serving(server: EvoRacerServer) -> Iterator[Service]:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield Service(server)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture
def service(tmp_path: Path) -> Iterator[Service]:
    with serving(create_server(port=0, data_root=tmp_path)) as running:
        yield running


def test_health_is_served_on_loopback(service: Service) -> None:
    assert service.server.server_address[0] == LOOPBACK_HOST
    assert service.call("/health") == {
        "contractVersion": 1,
        "host": "127.0.0.1",
        "service": "evo-racer-core",
        "status": "ready",
    }


def test_production_frontend_is_served_with_a_strict_csp(tmp_path: Path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<main>EvoRacer</main>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("export {};", encoding="utf-8")
    with serving(create_server(port=0, static_root=tmp_path)) as running:
        with urlopen(f"{running.origin}/", timeout=2) as response:  # noqa: S310
            assert response.read() == b"<main>EvoRacer</main>"
        with urlopen(f"{running.origin}/assets/app.js", timeout=2) as response:  # noqa: S310
            assert response.read() == b"export {};"
            assert response.headers["Content-Security-Policy"] == (
                "default-src 'self'; img-src 'self' data:; "
                "style-src 'self'; script-src 'self'; connect-src 'self'"
            )
        with pytest.raises(HTTPError) as error:
            urlopen(f"{running.origin}/%2e%2e/secret.txt", timeout=2)  # noqa: S310
        assert error.value.code == HTTPStatus.FORBIDDEN


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5173", "http://example.test"])
def test_server_rejects_foreign_origins(service: Service, origin: str) -> None:
    request = Request(  # noqa: S310
        f"{service.origin}/v1/setup/validate",
        method="POST",
        headers={"Content-Type": "application/json", "Origin": origin},
        data=b"{}",
    )
    with pytest.raises(HTTPError) as error:
        urlopen(request, timeout=2)  # noqa: S310
    assert error.value.code == HTTPStatus.FORBIDDEN
    assert error.value.headers["Access-Control-Allow-Origin"] is None


def test_server_rejects_a_foreign_host_name(service: Service) -> None:
    # A DNS-rebinding page reaches 127.0.0.1 under its own host name and sends no Origin.
    request = Request(  # noqa: S310
        f"{service.origin}/v1/runs/library",
        headers={"Host": f"rebind.example.test:{service.server.server_port}"},
    )
    with pytest.raises(HTTPError) as error:
        urlopen(request, timeout=2)  # noqa: S310
    assert error.value.code == HTTPStatus.FORBIDDEN


def test_setup_validation_does_not_start_a_run(service: Service) -> None:
    validated = service.call(
        "/v1/setup/validate",
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
        },
    )

    assert validated == {"contractVersion": 1, "valid": True, "errors": []}
    assert service.call("/v1/runs/library")["runs"] == []


def test_presets_generator_and_track_library(service: Service) -> None:
    presets = service.call("/v1/tracks/presets")["presets"]
    assert [preset["track"]["id"] for preset in presets] == [
        track.track_id for track in PRESET_TRACKS
    ]

    generated = service.call(
        "/v1/tracks/generate",
        {"contractVersion": 1, "seed": 44, "length": "short", "difficulty": "easy"},
    )
    compiled = generated["compiled"]
    saved = service.call("/v1/tracks/library", {"contractVersion": 1, "track": compiled["track"]})
    assert saved["saved"] is True
    library = service.call("/v1/tracks/library")
    assert library["tracks"] == [compiled]
    assert library["isolated"] == []

    track_path = f"/v1/tracks/library/{compiled['track']['id']}"
    assert service.call(track_path, method="DELETE")["deleted"] is True


def test_run_trains_pauses_and_completes_over_http(service: Service) -> None:
    started = service.call(
        "/v1/runs/start",
        {
            "contractVersion": 1,
            "trackPreset": "easy-oval",
            "track": None,
            "settings": {
                "algorithm": "fixed-ga",
                "populationSize": 10,
                "generations": 2,
                "episodeSeconds": 15,
                "seed": 42,
            },
        },
    )
    run_id = started["snapshot"]["runId"]
    paused = service.call(
        "/v1/runs/command", {"contractVersion": 1, "runId": run_id, "command": "pause"}
    )
    assert paused["snapshot"]["pendingCommand"] == "pause"
    assert service.wait_for_status(run_id, "paused")["generation"] == 1

    service.call("/v1/runs/command", {"contractVersion": 1, "runId": run_id, "command": "resume"})
    completed = service.wait_for_status(run_id, "completed")
    assert completed["generation"] == 2
    assert completed["result"]["metadata"]["runId"] == run_id
    assert completed["result"]["replay"]["frames"]


def test_saved_run_resumes_exports_and_deletes_after_restart(tmp_path: Path) -> None:
    session = RunSession(
        run_id="run-service-library",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm="fixed-ga", population_size=4, generations=2, episode_seconds=0.2, seed=83
        ),
    )
    session.advance()
    save_run_document(session.to_run_document(), tmp_path)

    with serving(create_server(port=0, data_root=tmp_path)) as running:
        listed = running.call("/v1/runs/library")["runs"]
        assert [(run["runId"], run["resumable"]) for run in listed] == [(session.run_id, True)]

        running.call("/v1/runs/resume", {"contractVersion": 1, "runId": session.run_id})
        running.wait_for_status(session.run_id, "completed")

        exported = running.call(f"/v1/runs/library/{session.run_id}/export")
        assert exported["run"]["schemaVersion"] == 1
        deleted = running.call(f"/v1/runs/library/{session.run_id}", method="DELETE")
        assert deleted["deleted"] is True
        assert running.call("/v1/runs/library")["runs"] == []


def test_shutdown_stops_the_server_and_frees_its_port(tmp_path: Path) -> None:
    server = create_server(port=0, data_root=tmp_path)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with pytest.raises(OSError):
            create_server(port=port, data_root=tmp_path)
        request = Request(  # noqa: S310
            f"http://{LOOPBACK_HOST}:{port}/v1/app/shutdown",
            method="POST",
            headers={"Origin": f"http://127.0.0.1:{port}"},
        )
        with urlopen(request, timeout=2) as response:  # noqa: S310
            assert json.load(response) == {"contractVersion": 1, "status": "shutting-down"}
        thread.join(timeout=5)
        assert not thread.is_alive()
    finally:
        server.server_close()

    create_server(port=port, data_root=tmp_path).server_close()
