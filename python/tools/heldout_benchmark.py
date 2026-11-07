"""Predeclared v2 experiment; see docs/verification/heldout-v2-plan.md."""

from __future__ import annotations

import itertools
import json
import statistics
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

from evo_racer import observer
from evo_racer.evolution import VehicleGenome
from evo_racer.observer import RunSession, RunSettings
from evo_racer.simulation import EpisodeResult, evaluate_episode
from evo_racer.track_generation import generate_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

DESTINATION = Path("contracts/heldout-v2")
SEEDS = (31013, 51031, 71053)


def run_one(
    track: dict[str, Any], algorithm: str, seed: int, population: int, generations: int, fixed: bool
) -> dict[str, Any]:
    counts = {"episodes": 0, "trainingSteps": 0, "otherSteps": 0}
    evaluate = evaluate_episode
    original_post_init = VehicleGenome.__post_init__

    def frozen_vehicle(self: VehicleGenome) -> None:
        original_post_init(self)
        if fixed:
            object.__setattr__(self, "performance_logits", (0.0,) * 5)
            object.__setattr__(self, "front_brake_bias", 0.5)
            object.__setattr__(self, "front_drive_bias", 0.5)

    def counted(*args: Any, **kwargs: Any) -> EpisodeResult:
        result = evaluate(*args, **kwargs)
        if "telemetry_callback" in kwargs:
            counts["episodes"] += 1
            counts["trainingSteps"] += result.steps
        else:
            counts["otherSteps"] += result.steps
        return result

    with (
        patch.object(VehicleGenome, "__post_init__", frozen_vehicle),
        patch.object(observer, "evaluate_episode", counted),
    ):
        session = RunSession(
            run_id=f"heldout-{track['id']}-{algorithm}-{seed}-{population}-{generations}-{fixed}",
            compiled_track=compile_track_payload(track),
            settings=RunSettings(
                algorithm=cast(Any, algorithm),
                population_size=population,
                generations=generations,
                episode_seconds=30.0,
                seed=seed,
            ),
        )
        for _ in range(generations):
            session.advance()
        result = cast(dict[str, Any], session.result)
        assert counts["episodes"] == population * generations
        if fixed:
            assert (
                result["champion"]["vehicleSetup"]
                == VehicleGenome((0.0,) * 5, 0.5, 0.5).to_setup().to_payload()
            )
        champion = result["baselineComparisons"][0]
        return {
            "counts": counts,
            "metadata": result["metadata"],
            "champion": result["champion"],
            "fitnessHistory": result["fitnessHistory"],
            "baselineComparisons": result["baselineComparisons"],
            "termination": result["replay"]["termination"],
            "lapSeconds": champion["steps"] / 60 if champion["finished"] else None,
        }


def paired_case(key: tuple[dict[str, Any], str, int, str, bool]) -> dict[str, Any]:
    track, algorithm, seed, budget, fixed = key
    population, generations = (16, 10) if budget == "quick" else (24, 20)
    name = f"{track['id']}-{algorithm}-{seed}-{budget}-{'fixed' if fixed else 'evolved'}"
    path = DESTINATION / f"{name}.json"
    if path.exists():
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    result = {
        "track": track,
        "algorithm": algorithm,
        "seed": seed,
        "budget": budget,
        "fixedVehicle": fixed,
        "simulationContractVersion": 2,
        "evolved": run_one(track, algorithm, seed, population, generations, fixed),
        "control": run_one(track, algorithm, seed, population * generations, 1, fixed),
    }
    path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(name, flush=True)
    return result


def summarize(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str, bool], list[dict[str, Any]]] = {}
    for case in cases:
        key = (case["track"]["id"], case["algorithm"], case["budget"], case["fixedVehicle"])
        groups.setdefault(key, []).append(case)
    summary = []
    for key, group in groups.items():
        deltas = [
            c["evolved"]["champion"]["fitness"] - c["control"]["champion"]["fitness"] for c in group
        ]
        samples = sorted(
            statistics.mean(sample) for sample in itertools.product(deltas, repeat=len(deltas))
        )
        summary.append(
            {
                "trackId": key[0],
                "algorithm": key[1],
                "budget": key[2],
                "fixedVehicle": key[3],
                "seeds": [c["seed"] for c in group],
                "pairedFitnessDifferences": deltas,
                "meanDifference": statistics.mean(deltas),
                "pairedBootstrap95": [
                    samples[int(0.025 * len(samples))],
                    samples[min(len(samples) - 1, int(0.975 * len(samples)))],
                ],
                **{
                    kind: {
                        "finished": sum(c[kind]["termination"] == "lap_complete" for c in group),
                        "collided": sum(c[kind]["termination"] == "collision" for c in group),
                        "timeout": sum(c[kind]["termination"] == "timeout" for c in group),
                        "finishedLapSeconds": [
                            c[kind]["lapSeconds"]
                            for c in group
                            if c[kind]["lapSeconds"] is not None
                        ],
                        "trainingSteps": [c[kind]["counts"]["trainingSteps"] for c in group],
                    }
                    for kind in ("evolved", "control")
                },
            }
        )
    return summary


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    generated = generate_track_payload(
        {"contractVersion": 1, "seed": 91009, "length": "short", "difficulty": "technical"}
    )
    assert generated["valid"]
    tracks = [preset.to_payload() for preset in PRESET_TRACKS] + [
        cast(Any, generated["compiled"])["track"]
    ]
    keys = list(
        itertools.product(tracks, ("fixed-ga", "neat"), SEEDS, ("quick", "balanced"), (False, True))
    )
    with ProcessPoolExecutor(max_workers=4) as pool:
        cases = list(pool.map(paired_case, keys))
    Path("contracts/heldout-v2-summary.json").write_text(
        json.dumps(summarize(cases), indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
