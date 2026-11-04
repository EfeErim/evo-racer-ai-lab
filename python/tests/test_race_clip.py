from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from evo_racer.observer import RunManager, RunSession, RunSettings
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


def _session(algorithm: str, run_id: str = "run-race-clip") -> RunSession:
    return RunSession(
        run_id=run_id,
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm=algorithm,  # type: ignore[arg-type]
            population_size=4,
            generations=2,
            episode_seconds=1.0,
            seed=819,
        ),
    )


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_race_clip_is_the_latest_finished_car_with_its_recorded_frames(algorithm: str) -> None:
    session = _session(algorithm)
    assert session.snapshot(include_race_clip=True)["raceClip"] is None

    session.advance()

    clip = cast(dict[str, Any], session.snapshot(include_race_clip=True)["raceClip"])
    assert clip["candidateIndex"] == 4
    assert clip["populationSize"] == 4
    assert clip["generation"] == 1
    assert clip["frames"]
    assert [frame["simulatedSeconds"] for frame in clip["frames"]] == sorted(
        frame["simulatedSeconds"] for frame in clip["frames"]
    )


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_race_clip_requests_cannot_change_evolution_or_persist(algorithm: str) -> None:
    # NEAT draws from process-global randomness, so each run finishes before the next starts.
    def run(*, request_clips: bool) -> dict[str, object]:
        session = _session(algorithm)
        for _ in range(2):
            session.advance()
            if request_clips:
                session.snapshot(include_race_clip=True)
        return session.to_run_document()

    observed = run(request_clips=True)
    assert observed == run(request_clips=False)
    assert "raceClip" not in json.dumps(observed)


def test_race_clip_is_only_sent_when_requested() -> None:
    session = _session("fixed-ga")
    session.advance()
    assert "raceClip" not in session.snapshot()


def test_observe_rejects_a_non_boolean_race_clip_request(tmp_path: Path) -> None:
    manager = RunManager(tmp_path)
    started = manager.start(
        {
            "contractVersion": 1,
            "trackPreset": "easy-oval",
            "settings": {
                "algorithm": "fixed-ga",
                "populationSize": 10,
                "generations": 1,
                "episodeSeconds": 15,
                "seed": 819,
            },
            "track": None,
        }
    )
    assert started["valid"] is True, started
    run_id = cast(dict[str, Any], started["snapshot"])["runId"]
    rejected = manager.observe({"contractVersion": 1, "runId": run_id, "includeRaceClip": "yes"})
    assert rejected["valid"] is False
    errors = cast(list[dict[str, Any]], rejected["errors"])
    assert errors[0]["code"] == "INCLUDE_RACE_CLIP_INVALID"
