from __future__ import annotations

import json
import threading
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from evo_racer.observer import RunSession, RunSettings
from evo_racer.run_library import save_run_document
from evo_racer.service import LOOPBACK_HOST, create_server
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


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


def test_phase_three_generator_and_library_stay_on_versioned_loopback_contracts(
    tmp_path: Path,
) -> None:
    server = create_server(port=0, data_root=tmp_path)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def post(path: str, payload: object) -> dict[str, Any]:
        request = Request(  # noqa: S310
            f"http://{host}:{port}{path}",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Origin": "http://127.0.0.1:4173",
            },
            data=json.dumps(payload).encode("utf-8"),
        )
        with urlopen(request, timeout=2) as response:  # noqa: S310
            assert response.status == HTTPStatus.OK
            result: dict[str, Any] = json.load(response)
            return result

    try:
        generated = post(
            "/v1/tracks/generate",
            {
                "contractVersion": 1,
                "seed": 44,
                "length": "short",
                "difficulty": "easy",
            },
        )
        assert generated["valid"] is True
        compiled = generated["compiled"]
        assert isinstance(compiled, dict)
        saved = post(
            "/v1/tracks/library",
            {"contractVersion": 1, "track": compiled["track"]},
        )
        assert saved["saved"] is True

        request = Request(  # noqa: S310
            f"http://{host}:{port}/v1/tracks/library",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        with urlopen(request, timeout=2) as response:  # noqa: S310
            library: dict[str, Any] = json.load(response)
        assert library["tracks"] == [compiled]
        assert library["isolated"] == []

        track = compiled["track"]
        assert isinstance(track, dict)
        track_id = track["id"]
        assert isinstance(track_id, str)
        preflight = Request(  # noqa: S310
            f"http://{host}:{port}/v1/tracks/library/{track_id}",
            method="OPTIONS",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        with urlopen(preflight, timeout=2) as response:  # noqa: S310
            assert response.status == HTTPStatus.NO_CONTENT
            assert "DELETE" in response.headers["Access-Control-Allow-Methods"]

        deletion = Request(  # noqa: S310
            f"http://{host}:{port}/v1/tracks/library/{track_id}",
            method="DELETE",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        with urlopen(deletion, timeout=2) as response:  # noqa: S310
            deleted: dict[str, Any] = json.load(response)
        assert deleted["deleted"] is True
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_phase_four_preview_is_served_on_the_versioned_loopback_contract() -> None:
    server = create_server(port=0)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    request = Request(  # noqa: S310
        f"http://{host}:{port}/v1/simulation/preview",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Origin": "http://127.0.0.1:4173",
        },
        data=json.dumps(
            {
                "contractVersion": 1,
                "trackPreset": "easy-oval",
                "controller": "pure-pursuit",
                "durationSeconds": 0.5,
            }
        ).encode("utf-8"),
    )

    try:
        with urlopen(request, timeout=2) as response:  # noqa: S310
            payload: dict[str, Any] = json.load(response)

        assert response.status == HTTPStatus.OK
        assert payload["contractVersion"] == 1
        assert payload["valid"] is True
        episode = payload["episode"]
        assert isinstance(episode, dict)
        assert episode["controller"] == "pure-pursuit"
        selected_car = episode["selectedCar"]
        assert isinstance(selected_car, dict)
        assert selected_car["selectedCarId"] == "selected-baseline"
        sensors = selected_car["sensorDistances"]
        assert isinstance(sensors, list)
        assert len(sensors) == 7
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_phase_seven_run_commands_are_served_on_the_loopback_contract(
    tmp_path: Path,
) -> None:
    server = create_server(port=0, data_root=tmp_path)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def post(path: str, payload: object) -> dict[str, Any]:
        request = Request(  # noqa: S310
            f"http://{host}:{port}{path}",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Origin": "http://127.0.0.1:4173",
            },
            data=json.dumps(payload).encode("utf-8"),
        )
        with urlopen(request, timeout=10) as response:  # noqa: S310
            result: dict[str, Any] = json.load(response)
            return result

    try:
        started = post(
            "/v1/runs/start",
            {
                "contractVersion": 1,
                "trackPreset": "easy-oval",
                "track": None,
                "settings": {
                    "algorithm": "fixed-ga",
                    "populationSize": 10,
                    "generations": 1,
                    "episodeSeconds": 15,
                    "seed": 42,
                },
            },
        )
        assert started["valid"] is True
        run_id = started["snapshot"]["runId"]
        paused = post(
            "/v1/runs/command",
            {"contractVersion": 1, "runId": run_id, "command": "pause"},
        )
        assert paused["snapshot"]["status"] == "paused"
        unchanged = post(
            "/v1/runs/observe",
            {"contractVersion": 1, "runId": run_id},
        )
        assert unchanged["snapshot"]["generation"] == 0
        post(
            "/v1/runs/command",
            {"contractVersion": 1, "runId": run_id, "command": "resume"},
        )
        completed = post(
            "/v1/runs/observe",
            {"contractVersion": 1, "runId": run_id},
        )

        snapshot = completed["snapshot"]
        assert snapshot["status"] == "completed"
        assert snapshot["generation"] == 1
        assert snapshot["result"]["metadata"]["runId"] == run_id
        assert snapshot["result"]["replay"]["frames"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_phase_eight_run_library_resume_export_and_delete_survive_restart(
    tmp_path: Path,
) -> None:
    session = RunSession(
        run_id="run-service-phase8",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm="fixed-ga",
            population_size=4,
            generations=2,
            episode_seconds=0.2,
            seed=83,
        ),
    )
    session.advance()
    save_run_document(session.to_run_document(), tmp_path)

    server = create_server(port=0, data_root=tmp_path)
    address = server.server_address
    host = address[0]
    port = address[1]
    assert isinstance(host, str)
    assert isinstance(port, int)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def get(path: str) -> dict[str, Any]:
        request = Request(  # noqa: S310
            f"http://{host}:{port}{path}",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        with urlopen(request, timeout=5) as response:  # noqa: S310
            result: dict[str, Any] = json.load(response)
            return result

    def post(path: str, payload: object) -> dict[str, Any]:
        request = Request(  # noqa: S310
            f"http://{host}:{port}{path}",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Origin": "http://127.0.0.1:4173",
            },
            data=json.dumps(payload).encode("utf-8"),
        )
        with urlopen(request, timeout=5) as response:  # noqa: S310
            result: dict[str, Any] = json.load(response)
            return result

    try:
        library = get("/v1/runs/library")
        assert library["runs"][0]["runId"] == session.run_id
        assert library["runs"][0]["resumable"] is True

        resumed = post(
            "/v1/runs/resume",
            {"contractVersion": 1, "runId": session.run_id},
        )
        assert resumed["snapshot"]["status"] == "running"
        completed = post(
            "/v1/runs/observe",
            {"contractVersion": 1, "runId": session.run_id},
        )
        assert completed["snapshot"]["status"] == "completed"

        exported = get(f"/v1/runs/library/{session.run_id}/export")
        assert exported["valid"] is True
        assert exported["run"]["schemaVersion"] == 1

        deletion = Request(  # noqa: S310
            f"http://{host}:{port}/v1/runs/library/{session.run_id}",
            method="DELETE",
            headers={"Origin": "http://127.0.0.1:4173"},
        )
        with urlopen(deletion, timeout=5) as response:  # noqa: S310
            deleted: dict[str, Any] = json.load(response)
        assert deleted["deleted"] is True
        assert get("/v1/runs/library")["runs"] == []
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
