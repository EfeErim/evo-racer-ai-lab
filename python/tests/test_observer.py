from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from evo_racer.observer import (
    RunSession,
    RunSettings,
    parse_observation_snapshot,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase7-observation.json"


def _session(
    *,
    algorithm: str = "fixed-ga",
    generations: int = 2,
    run_id: str = "run-phase7-test",
) -> RunSession:
    return RunSession(
        run_id=run_id,
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm=algorithm,  # type: ignore[arg-type]
            population_size=4,
            generations=generations,
            episode_seconds=0.2,
            seed=73,
        ),
    )


def _complete(session: RunSession) -> dict[str, Any]:
    while session.snapshot()["status"] == "running":
        session.advance()
    snapshot = session.snapshot()
    assert snapshot["status"] == "completed"
    result = snapshot["result"]
    assert isinstance(result, dict)
    return result


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_pause_resume_does_not_change_seeded_outcome(algorithm: str) -> None:
    uninterrupted = _session(algorithm=algorithm)
    uninterrupted.advance()
    uninterrupted.advance()
    uninterrupted_snapshot = uninterrupted.snapshot()

    paused = _session(algorithm=algorithm)
    paused.advance()
    paused.command("pause")
    paused.advance()
    assert paused.snapshot()["generation"] == 1
    paused.command("resume")
    paused.advance()

    assert paused.snapshot() == uninterrupted_snapshot


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_batched_observation_completes_both_algorithms(algorithm: str) -> None:
    result = _complete(_session(algorithm=algorithm))
    metadata = result["metadata"]

    assert metadata == {
        "contractVersion": 1,
        "runId": "run-phase7-test",
        "status": "completed",
        "algorithm": algorithm,
        "seed": 73,
        "trackId": "easy-oval",
        "trackName": "Easy Oval",
        "trackSha256": metadata["trackSha256"],
        "populationSize": 4,
        "generationsRequested": 2,
        "generationsCompleted": 2,
        "episodeSeconds": 0.2,
        "fixedTimeStep": 1.0 / 60.0,
        "simulationContractVersion": 1,
        "evolutionContractVersion": 1,
        "observationContractVersion": 1,
    }
    assert len(metadata["trackSha256"]) == 64
    assert len(result["baselineComparisons"]) == 3


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_replay_reproduces_motion_controls_and_fixed_vehicle_setup(
    algorithm: str,
) -> None:
    first = _complete(_session(algorithm=algorithm))
    second = _complete(_session(algorithm=algorithm))

    assert first["replay"]["frames"] == second["replay"]["frames"]
    assert first["replay"]["controllerParameters"] == second["replay"]["controllerParameters"]
    assert first["replay"]["vehicleSetup"] == first["champion"]["vehicleSetup"]
    assert first["replay"]["vehicleSetup"] == second["replay"]["vehicleSetup"]


def test_stop_returns_a_terminal_result_after_a_completed_generation() -> None:
    session = _session(generations=3)
    session.advance()
    session.command("stop")
    snapshot = session.snapshot()

    assert snapshot["status"] == "stopped"
    assert snapshot["generation"] == 1
    result = snapshot["result"]
    assert isinstance(result, dict)
    assert result["metadata"]["generationsCompleted"] == 1


def test_shared_phase7_observation_fixture_round_trips_in_python() -> None:
    fixture: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert parse_observation_snapshot(fixture) == fixture
