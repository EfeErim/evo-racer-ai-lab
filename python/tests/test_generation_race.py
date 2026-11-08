from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from evo_racer.observer import GENERATION_RACE_CAR_LIMIT, RunManager, RunSession, RunSettings
from evo_racer.simulation import (
    FIXED_TIME_STEP,
    PurePursuitBaseline,
    TrackGeometry,
    evaluate_episode,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


def _session(algorithm: str, population: int = 4) -> RunSession:
    return RunSession(
        run_id="run-generation-race",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm=algorithm,  # type: ignore[arg-type]
            population_size=population,
            generations=2,
            episode_seconds=2.0,
            seed=819,
        ),
    )


def test_trace_is_dense_and_does_not_change_the_episode() -> None:
    geometry = TrackGeometry.from_compiled(compile_track_payload(PRESET_TRACKS[0].to_payload()))
    plain = evaluate_episode(geometry, PurePursuitBaseline(), max_seconds=5.0)
    traced = evaluate_episode(
        geometry, PurePursuitBaseline(), max_seconds=5.0, trace_interval_steps=3
    )

    assert plain.trace == ()
    assert traced.telemetry == plain.telemetry
    assert (traced.steps, traced.termination, traced.progress_fraction) == (
        plain.steps,
        plain.termination,
        plain.progress_fraction,
    )
    times = [pose[0] for pose in traced.trace]
    assert times[0] == 0.0
    assert times == sorted(times)
    assert times[-1] == pytest.approx(traced.steps * FIXED_TIME_STEP)
    assert max(b - a for a, b in zip(times, times[1:], strict=False)) <= 3 * FIXED_TIME_STEP + 1e-9


def test_trace_interval_must_be_positive() -> None:
    geometry = TrackGeometry.from_compiled(compile_track_payload(PRESET_TRACKS[0].to_payload()))
    with pytest.raises(ValueError):
        evaluate_episode(geometry, PurePursuitBaseline(), max_seconds=1.0, trace_interval_steps=0)


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_generation_race_holds_the_ranked_cars_of_the_last_generation(algorithm: str) -> None:
    session = _session(algorithm)
    assert "generationRace" not in session.snapshot()

    session.advance()

    race = cast(dict[str, Any], session.snapshot()["generationRace"])
    assert race["generation"] == 1
    assert race["populationSize"] == 4
    cars = race["cars"]
    assert [car["rank"] for car in cars] == [1, 2, 3, 4]
    assert [car["fitness"] for car in cars] == sorted(
        (car["fitness"] for car in cars), reverse=True
    )
    for car in cars:
        poses = car["poses"]
        assert len(poses) % 5 == 0 and len(poses) >= 10
        assert poses[0] == 0.0


def test_generation_race_is_capped_and_skipped_when_known() -> None:
    session = _session("fixed-ga", population=GENERATION_RACE_CAR_LIMIT + 4)
    session.advance()
    race = cast(dict[str, Any], session.snapshot()["generationRace"])
    assert len(race["cars"]) == GENERATION_RACE_CAR_LIMIT
    assert "generationRace" not in session.snapshot(known_generation_race=1)
    assert "generationRace" not in session.snapshot(include_live=False)


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_generation_race_cannot_change_evolution_or_persist(algorithm: str) -> None:
    def run(*, observe: bool) -> dict[str, object]:
        session = _session(algorithm)
        for _ in range(2):
            session.advance()
            if observe:
                session.snapshot()
        return session.to_run_document()

    observed = run(observe=True)
    assert observed == run(observe=False)
    assert "generationRace" not in json.dumps(observed)


def test_observe_rejects_an_invalid_known_race(tmp_path: Path) -> None:
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
    rejected = manager.observe({"contractVersion": 1, "runId": run_id, "knownGenerationRace": "1"})
    assert rejected["valid"] is False
    errors = cast(list[dict[str, Any]], rejected["errors"])
    assert errors[0]["code"] == "KNOWN_RACE_INVALID"


def test_a_checkpoint_with_a_live_race_still_resumes() -> None:
    session = _session("neat")
    session.advance()
    session.command("pause")
    assert "generationRace" in session.snapshot()
    restored = RunSession.from_run_document(session.to_run_document())
    assert restored.snapshot(include_live=False)["generation"] == 1
