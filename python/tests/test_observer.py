from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import pytest

import evo_racer.observer as observer_module
from evo_racer.observer import (
    RunManager,
    RunSession,
    RunSettings,
    parse_observation_snapshot,
)
from evo_racer.simulation import evaluate_episode as simulation_evaluate_episode
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


@pytest.mark.parametrize("command", ["pause", "stop"])
def test_first_generation_boundary_command_is_queued_before_worker_start(
    command: str,
) -> None:
    session = _session(generations=3)

    session.command(command)
    queued = session.snapshot()

    assert queued["status"] == "running"
    assert queued["generation"] == 0
    assert queued["pendingCommand"] == command
    session.advance()
    finished = session.snapshot()
    assert finished["generation"] == 1
    assert finished["status"] == ("paused" if command == "pause" else "stopped")
    if command == "stop":
        assert isinstance(finished["result"], dict)


def test_manager_streams_live_candidate_position_while_generation_runs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_evaluate_episode = simulation_evaluate_episode

    def slowed_evaluate_episode(*args: Any, **kwargs: Any) -> Any:
        callback = kwargs.get("telemetry_callback")
        if callback is None:
            return original_evaluate_episode(*args, **kwargs)

        def publish_and_yield(snapshot: Any) -> None:
            callback(snapshot)
            time.sleep(0.002)

        kwargs["max_seconds"] = 0.5
        kwargs["telemetry_interval_steps"] = 1
        kwargs["telemetry_callback"] = publish_and_yield
        return original_evaluate_episode(*args, **kwargs)

    monkeypatch.setattr(observer_module, "evaluate_episode", slowed_evaluate_episode)
    manager = RunManager(tmp_path)
    started = manager.start(
        {
            "contractVersion": 1,
            "trackPreset": "easy-oval",
            "track": None,
            "settings": {
                "algorithm": "fixed-ga",
                "populationSize": 10,
                "generations": 1,
                "episodeSeconds": 15,
                "seed": 91,
            },
        }
    )
    snapshot = started["snapshot"]
    assert isinstance(snapshot, dict)
    run_id = snapshot["runId"]
    assert isinstance(run_id, str)

    deadline = time.monotonic() + 5
    live_snapshot: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        response = manager.observe({"contractVersion": 1, "runId": run_id})
        candidate = response["snapshot"]
        assert isinstance(candidate, dict)
        selected = candidate.get("selectedCar")
        if candidate.get("generationInProgress") is True and isinstance(selected, dict):
            live_snapshot = candidate
            break
        time.sleep(0.005)

    assert live_snapshot is not None
    assert live_snapshot["activeCandidate"]["index"] >= 1
    selected = live_snapshot["selectedCar"]
    assert {"x", "y", "heading"} <= selected.keys()

    while time.monotonic() < deadline:
        response = manager.observe({"contractVersion": 1, "runId": run_id})
        completed = response["snapshot"]
        assert isinstance(completed, dict)
        if completed["status"] == "completed":
            assert completed["generation"] == 1
            assert completed["generationInProgress"] is False
            break
        time.sleep(0.005)
    else:
        pytest.fail("Background generation did not complete.")


def test_shared_phase7_observation_fixture_round_trips_in_python() -> None:
    fixture: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert parse_observation_snapshot(fixture) == fixture


def test_shared_observation_parser_rejects_inconsistent_generation_history() -> None:
    missing_history: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    missing_history["fitnessHistory"].pop()
    with pytest.raises(ValueError, match="generation history is inconsistent"):
        parse_observation_snapshot(missing_history)

    wrong_report: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    wrong_report["generationReport"]["generation"] = 0
    with pytest.raises(ValueError, match="generation history is inconsistent"):
        parse_observation_snapshot(wrong_report)

    mismatched_result: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    mismatched_result["result"]["fitnessHistory"][0]["bestFitness"] += 1
    with pytest.raises(ValueError, match="fitness history does not match"):
        parse_observation_snapshot(mismatched_result)


def test_shared_observation_parser_rejects_inconsistent_terminal_result() -> None:
    nonterminal_result: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    nonterminal_result["status"] = "running"
    with pytest.raises(ValueError, match="Non-terminal observation"):
        parse_observation_snapshot(nonterminal_result)

    missing_result: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    missing_result["result"] = None
    with pytest.raises(ValueError, match="require a result"):
        parse_observation_snapshot(missing_result)

    incomplete_result: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    incomplete_result["totalGenerations"] = 3
    with pytest.raises(ValueError, match="every requested generation"):
        parse_observation_snapshot(incomplete_result)

    foreign_result: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    foreign_result["result"]["metadata"]["runId"] = "run-other"
    with pytest.raises(ValueError, match="identity does not match"):
        parse_observation_snapshot(foreign_result)

    mismatched_replay: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    mismatched_replay["result"]["replay"]["candidateId"] = "candidate-other"
    with pytest.raises(ValueError, match="does not match the result champion"):
        parse_observation_snapshot(mismatched_replay)


def test_generation_boundary_exposes_transient_champion_replay() -> None:
    session = RunSession(
        run_id="run-generation-replay",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm="fixed-ga",
            population_size=4,
            generations=2,
            episode_seconds=0.2,
            seed=17,
        ),
    )

    session.advance()

    live_snapshot = session.snapshot()
    replay = live_snapshot["generationReplay"]
    selected_car = live_snapshot["selectedCar"]
    assert isinstance(replay, dict)
    assert isinstance(selected_car, dict)
    assert replay["candidateId"] == selected_car["selectedCarId"]
    assert len(replay["frames"]) >= 1
    assert "generationReplay" not in session.snapshot(include_live=False)


def test_known_generation_replay_is_omitted_without_rebuilding_frames(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = RunSession(
        run_id="run-known-generation-replay",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm="fixed-ga",
            population_size=4,
            generations=2,
            episode_seconds=0.2,
            seed=17,
        ),
    )
    session.advance()
    full_snapshot = session.snapshot()
    replay = full_snapshot["generationReplay"]
    assert isinstance(replay, dict)
    replay_id = replay["candidateId"]
    assert isinstance(replay_id, str)

    def unexpected_replay_build(_: object) -> dict[str, object]:
        raise AssertionError("Known replay frames must not be rebuilt.")

    monkeypatch.setattr(observer_module, "_replay_frame", unexpected_replay_build)
    delta_snapshot = session.snapshot(known_generation_replay_candidate_id=replay_id)

    assert "generationReplay" not in delta_snapshot
    delta_projection = dict(delta_snapshot)
    full_projection = dict(full_snapshot)
    full_projection.pop("generationReplay")
    assert delta_projection == full_projection


def test_observe_rejects_invalid_known_replay_id(tmp_path: Path) -> None:
    manager = RunManager(tmp_path)
    started = manager.start(
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
        }
    )
    snapshot = started["snapshot"]
    assert isinstance(snapshot, dict)

    response = manager.observe(
        {
            "contractVersion": 1,
            "runId": snapshot["runId"],
            "knownGenerationReplayCandidateId": "",
        }
    )

    assert response["valid"] is False
    assert response["errors"] == [
        {
            "code": "KNOWN_REPLAY_ID_INVALID",
            "field": "knownGenerationReplayCandidateId",
            "message": "Known generation replay candidate id must be a non-empty string.",
        }
    ]


def test_observe_returns_a_delta_for_an_acknowledged_generation_replay(
    tmp_path: Path,
) -> None:
    session = RunSession(
        run_id="run-replay-delta",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm="fixed-ga",
            population_size=4,
            generations=2,
            episode_seconds=0.2,
            seed=17,
        ),
    )
    session.advance()
    session.command("pause")
    manager = RunManager(tmp_path)
    manager._sessions[session.run_id] = session

    full_response = manager.observe({"contractVersion": 1, "runId": session.run_id})
    full_snapshot = full_response["snapshot"]
    assert isinstance(full_snapshot, dict)
    replay = full_snapshot["generationReplay"]
    assert isinstance(replay, dict)
    replay_id = replay["candidateId"]
    assert isinstance(replay_id, str)

    delta_response = manager.observe(
        {
            "contractVersion": 1,
            "runId": session.run_id,
            "knownGenerationReplayCandidateId": replay_id,
        }
    )
    delta_snapshot = delta_response["snapshot"]

    assert isinstance(delta_snapshot, dict)
    assert "generationReplay" not in delta_snapshot
    assert delta_snapshot["runId"] == session.run_id


def test_active_observation_skips_run_library_scan_and_repeated_setup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = RunManager(tmp_path)
    started = manager.start(
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
        }
    )
    snapshot = started["snapshot"]
    assert isinstance(snapshot, dict)
    run_id = snapshot["runId"]
    assert isinstance(run_id, str)
    manager.command({"contractVersion": 1, "runId": run_id, "command": "pause"})

    def unexpected_library_scan() -> dict[str, object]:
        raise AssertionError("Active observations must not scan the run library.")

    monkeypatch.setattr(manager, "library", unexpected_library_scan)
    observed = manager.observe({"contractVersion": 1, "runId": run_id})
    observed_snapshot = observed["snapshot"]

    assert isinstance(observed_snapshot, dict)
    assert observed_snapshot["previousRuns"] == []
    assert "setup" not in observed

    resumed = manager.resume({"contractVersion": 1, "runId": run_id})
    assert "setup" in resumed
