"""Neuron traces and lap times shown beside the generation race."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from evo_racer.evolution import NETWORK_INPUT_COUNT
from evo_racer.observer import RunSession, RunSettings, best_pure_pursuit_episode
from evo_racer.race_insight import lap_record_payload, target_lap_seconds
from evo_racer.racing_line import minimum_curvature_reference
from evo_racer.simulation import VehicleSetup, preset_geometry
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


def _advanced_race(algorithm: str, seed: int = 11) -> dict[str, Any]:
    session = RunSession(
        run_id=f"run-insight-{algorithm}",
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm=algorithm,  # type: ignore[arg-type]
            population_size=4,
            generations=2,
            episode_seconds=3.0,
            seed=seed,
        ),
    )
    session.advance()
    race = session.snapshot()["generationRace"]
    assert isinstance(race, dict)
    return json.loads(json.dumps(race))


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_leader_network_has_one_value_row_per_leader_pose(algorithm: str) -> None:
    race = _advanced_race(algorithm)
    leader = next(car for car in race["cars"] if car["rank"] == 1)
    network = race["leaderNetwork"]

    assert network["candidateId"] == leader["candidateId"]
    kinds = [node["kind"] for node in network["nodes"]]
    assert kinds[:NETWORK_INPUT_COUNT] == ["input"] * NETWORK_INPUT_COUNT
    assert kinds[-3:] == ["output"] * 3
    node_count = len(network["nodes"])
    assert len(network["activations"]) == node_count * (len(leader["poses"]) // 5)
    for link in network["links"]:
        assert 0 <= link["from"] < node_count
        assert 0 <= link["to"] < node_count
        assert network["nodes"][link["from"]]["layer"] < network["nodes"][link["to"]]["layer"]
    for row in range(len(network["activations"]) // node_count):
        steering, throttle, brake = network["activations"][
            row * node_count + node_count - 3 : (row + 1) * node_count
        ]
        assert -1.0 <= steering <= 1.0
        assert 0.0 <= throttle <= 1.0
        assert 0.0 <= brake <= 1.0


def test_race_insight_is_deterministic_for_a_seed() -> None:
    first = _advanced_race("fixed-ga", seed=5)
    second = _advanced_race("fixed-ga", seed=5)
    assert first == second


def test_lap_record_keeps_the_fastest_finished_lap() -> None:
    def scored(candidate_id: str, steps: int, finished: bool) -> Any:
        return SimpleNamespace(
            candidate=SimpleNamespace(candidate_id=candidate_id),
            evaluation=SimpleNamespace(steps=steps, finished=finished),
        )

    payload = lap_record_payload(
        [
            (0, [scored("a", 900, False), scored("b", 1500, True)]),
            (1, [scored("c", 600, False)]),
            (2, [scored("d", 1320, True), scored("e", 1380, True)]),
        ]
    )

    assert payload["history"] == [
        {"generation": 0, "bestLapSeconds": 25.0},
        {"generation": 1, "bestLapSeconds": None},
        {"generation": 2, "bestLapSeconds": 22.0},
    ]
    assert payload["record"] == {"seconds": 22.0, "generation": 2, "candidateId": "d"}


def test_target_lap_is_ahead_of_pure_pursuit_and_follows_the_setup() -> None:
    geometry = preset_geometry(PRESET_TRACKS[0].track_id)
    reference = minimum_curvature_reference(geometry.centerline, geometry.road_width)
    default = VehicleSetup()
    faster = VehicleSetup(max_speed=40.0, acceleration=12.0, grip_recovery=8.0)

    target = target_lap_seconds(geometry, default, reference)
    pursuit = best_pure_pursuit_episode(geometry, default, max_seconds=90.0)

    assert target is not None
    assert pursuit.finished
    assert 0.0 < target < pursuit.simulated_seconds
    faster_target = target_lap_seconds(geometry, faster, reference)
    assert faster_target is not None
    assert faster_target < target
