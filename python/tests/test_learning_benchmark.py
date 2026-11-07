from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from evo_racer.evolution import episode_fitness
from evo_racer.observer import best_pure_pursuit_episode
from evo_racer.simulation import (
    FIXED_TIME_STEP,
    EpisodeResult,
    PurePursuitBaseline,
    SetupAwarePurePursuit,
    VehicleSetup,
    evaluate_episode,
    preset_geometry,
)
from learning_benchmark import BenchmarkCase, run_case, summarize

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "learning-benchmark-v2.json"
# An evolved setup that turns far less sharply than the default car.
LOW_AGILITY_SETUP = VehicleSetup(
    max_speed=30.8,
    acceleration=7.0,
    brake_strength=9.0,
    steering_agility=0.8,
    grip_recovery=4.0,
    front_brake_bias=0.5,
    front_drive_bias=0.5,
)


def _fitness(episode: EpisodeResult, seconds: float) -> float:
    return episode_fitness(episode, round(seconds / FIXED_TIME_STEP)).fitness


def test_fixed_speed_pursuit_crashes_a_low_agility_car_that_the_reference_can_drive() -> None:
    geometry = preset_geometry("technical-circuit")

    fixed = evaluate_episode(geometry, PurePursuitBaseline(), LOW_AGILITY_SETUP, max_seconds=120.0)
    best = best_pure_pursuit_episode(geometry, LOW_AGILITY_SETUP, max_seconds=120.0)

    assert fixed.termination == "collision"
    assert best.finished
    assert best.controller == "pure-pursuit"


def test_reference_is_never_worse_than_fixed_speed_pursuit() -> None:
    default_setup = VehicleSetup()
    for track_id in ("easy-oval", "technical-circuit", "chicane-challenge"):
        geometry = preset_geometry(track_id)
        for setup in (default_setup, LOW_AGILITY_SETUP):
            fixed = evaluate_episode(geometry, PurePursuitBaseline(), setup, max_seconds=30.0)
            best = best_pure_pursuit_episode(geometry, setup, max_seconds=30.0)
            assert _fitness(best, 30.0) >= _fitness(fixed, 30.0)


def test_reference_choice_is_deterministic() -> None:
    geometry = preset_geometry("chicane-challenge")

    first = best_pure_pursuit_episode(geometry, LOW_AGILITY_SETUP, max_seconds=30.0)
    second = best_pure_pursuit_episode(geometry, LOW_AGILITY_SETUP, max_seconds=30.0)

    assert first.steps == second.steps
    assert first.progress_fraction == second.progress_fraction
    assert first.controller_parameters == second.controller_parameters


def test_setup_aware_controller_keeps_its_parameters_fixed_in_an_episode() -> None:
    controller = SetupAwarePurePursuit(LOW_AGILITY_SETUP, 0.6)
    before = controller.parameters

    evaluate_episode(preset_geometry("easy-oval"), controller, LOW_AGILITY_SETUP, max_seconds=5.0)

    assert controller.parameters == before
    assert before[-1] == 0.6


def test_saved_benchmark_case_reproduces() -> None:
    saved = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    expected = cast(list[BenchmarkCase], saved["cases"])[0]

    actual = run_case(expected["presetId"], "fixed-ga", expected["seed"])

    assert expected["algorithm"] == "fixed-ga"
    assert actual == expected


def test_saved_summary_matches_saved_cases() -> None:
    saved = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert summarize(cast(list[BenchmarkCase], saved["cases"])) == saved["summary"]
    assert len(saved["cases"]) == 30


def test_summary_counts_cases_without_averaging_them_into_one_claim() -> None:
    case: BenchmarkCase = {
        "presetId": "easy-oval",
        "algorithm": "neat",
        "seed": 1,
        "firstGenerationBest": 10.0,
        "championFitness": 30.0,
        "championProgress": 0.5,
        "championFinished": False,
        "controlFitness": 40.0,
        "controlProgress": 0.6,
        "controlFinished": False,
        "pursuitFitness": 20.0,
        "pursuitFinished": False,
        "pursuitCrashed": True,
        "randomFitness": 0.0,
    }

    row = summarize([case])[0]

    assert row["improvedOverFirstGeneration"] == 1
    assert row["beatSameBudgetControl"] == 0
    assert row["beatPurePursuit"] == 1
    assert row["pursuitCrashed"] == 1
