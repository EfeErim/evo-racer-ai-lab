from __future__ import annotations

import json
import random
import time
from pathlib import Path
from typing import Any, cast

import pytest

from evo_racer.observer import RunSession, RunSettings
from evo_racer.run_manager import RunManager
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "observation.json"


def _session(
    *,
    algorithm: str = "fixed-ga",
    generations: int = 2,
    run_id: str = "run-observer-test",
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
        "runId": "run-observer-test",
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
        "simulationContractVersion": 2,
        "evolutionContractVersion": 1,
        "observationContractVersion": 1,
    }
    assert len(metadata["trackSha256"]) == 64
    assert len(result["baselineComparisons"]) == 3
    racing_line = result["racingLineComparison"]
    assert racing_line["method"] == "minimum-curvature-v1"
    assert racing_line["championFinished"] == result["baselineComparisons"][0]["finished"]
    assert 3 <= len(racing_line["referenceLine"]) <= 64
    assert racing_line["referenceLine"][0] == racing_line["referenceLine"][-1]


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


def test_observation_fixture_is_exactly_what_python_sends() -> None:
    """The TypeScript tests parse this fixture, so it must be real producer output."""
    fixture: dict[str, Any] = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    session = _session(run_id="run-observation-fixture")
    _complete(session)
    # previousRuns is filled in by RunManager from the local library, not by the session.
    snapshot = json.loads(json.dumps(session.snapshot()))

    assert {**snapshot, "previousRuns": fixture["previousRuns"]} == fixture


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


def _neat_settings(seed: int) -> RunSettings:
    return RunSettings("neat", 10, 3, 15.0, seed)


def _easy_oval() -> dict[str, object]:
    preset = next(track for track in PRESET_TRACKS if track.track_id == "easy-oval")
    return compile_track_payload(preset.to_payload())


def _best_fitness_history(session: RunSession) -> list[float]:
    return [report.best_fitness for report in session.reports]


def test_a_second_neat_run_cannot_change_the_first_runs_results() -> None:
    track = _easy_oval()
    solo = RunSession(run_id="solo", compiled_track=track, settings=_neat_settings(7))
    for _ in range(3):
        solo.advance()

    first = RunSession(run_id="first", compiled_track=track, settings=_neat_settings(7))
    first.advance()
    second = RunSession(run_id="second", compiled_track=track, settings=_neat_settings(99))
    for _ in range(2):
        second.advance()
        first.advance()

    assert _best_fitness_history(first) == _best_fitness_history(solo)


def test_neat_runs_leave_the_process_random_state_alone() -> None:
    random.seed(123)
    expected = random.getstate()

    session = RunSession(run_id="quiet", compiled_track=_easy_oval(), settings=_neat_settings(7))
    session.advance()

    assert random.getstate() == expected


def test_concurrent_neat_runs_can_both_be_resumed_after_restart(tmp_path: Path) -> None:
    manager = RunManager(tmp_path)

    def start(seed: int) -> str:
        response = manager.start(
            {
                "contractVersion": 1,
                "trackPreset": "easy-oval",
                "settings": {
                    "algorithm": "neat",
                    "populationSize": 10,
                    "generations": 30,
                    "episodeSeconds": 15,
                    "seed": seed,
                },
            }
        )
        return cast(str, response["snapshot"]["runId"])  # type: ignore[index]

    run_ids = (start(7), start(8))

    # Both runs train on their own workers at once. A pause asked for while a
    # generation is in progress applies at its end, so neither run can finish; 30
    # generations leave a slow machine room before the second pause arrives.
    def observed(run_id: str) -> dict[str, Any]:
        response = manager.observe({"contractVersion": 1, "runId": run_id})
        return cast(dict[str, Any], response["snapshot"])

    for run_id in run_ids:
        deadline = time.monotonic() + 120
        while not (
            observed(run_id)["generationInProgress"] and observed(run_id)["generation"] >= 1
        ):
            assert time.monotonic() < deadline
            time.sleep(0.005)
        manager.command({"contractVersion": 1, "runId": run_id, "command": "pause"})
    for run_id in run_ids:
        assert manager.wait_until_idle(run_id, 120.0)
        snapshot = observed(run_id)
        assert snapshot["status"] == "paused"
        assert 2 <= snapshot["generation"] < 30

    restarted = RunManager(tmp_path)
    for run_id in run_ids:
        assert restarted.resume({"contractVersion": 1, "runId": run_id})["valid"] is True
