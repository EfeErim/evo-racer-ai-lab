"""Predeclared lap-time weight experiment; see docs/experiments/lap-weight-plan.md.

Fitness is patched only inside this process. The application is unchanged.
"""

from __future__ import annotations

import argparse
import itertools
import json
import statistics
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

from champion_brake_study import FixedBrake, champion_controller, describe
from evo_racer import observer
from evo_racer.evolution import CandidateEvaluation, episode_fitness
from evo_racer.observer import RunSession, RunSettings
from evo_racer.simulation import EpisodeResult, TrackGeometry, evaluate_episode
from evo_racer.track_generation import generate_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

CURRENT_WEIGHT = 300.0
STAGES = {
    "dev": {"seeds": (6007, 8009, 9011), "generated": 52021, "weights": (300.0, 1500.0, 3000.0)},
    "confirm": {"seeds": (12011, 14013, 16019), "generated": 61031, "weights": (300.0,)},
}


def weighted_fitness(weight: float) -> Any:
    """Current fitness with only the finish-time weight changed."""

    def fitness(result: EpisodeResult, max_steps: int) -> CandidateEvaluation:
        base = episode_fitness(result, max_steps)
        if not result.finished:
            return base
        share = max(0.0, min(1.0, 1.0 - result.steps / max_steps))
        return replace(base, fitness=base.fitness + (weight - CURRENT_WEIGHT) * share)

    return fitness


def run_case(key: tuple[str, dict[str, Any], str, int, float]) -> dict[str, Any]:
    stage, track, algorithm, seed, weight = key
    path = Path(f"contracts/lap-weight-{stage}") / (
        f"{track['id']}-{algorithm}-{seed}-w{int(weight)}.json"
    )
    if path.exists():
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    compiled = compile_track_payload(track)
    with patch.object(observer, "episode_fitness", weighted_fitness(weight)):
        session = RunSession(
            run_id=f"lap-weight-{track['id']}-{algorithm}-{seed}-{int(weight)}",
            compiled_track=compiled,
            settings=RunSettings(
                algorithm=cast(Any, algorithm),
                population_size=24,
                generations=20,
                episode_seconds=30.0,
                seed=seed,
            ),
        )
        for _ in range(20):
            session.advance()
    result = cast(dict[str, Any], session.result)
    geometry = TrackGeometry.from_compiled(compiled)
    controller, genes = champion_controller(algorithm, result["champion"]["genome"])
    setup = genes.to_setup()

    def drive(driver: Any) -> EpisodeResult:
        return evaluate_episode(
            geometry, driver, setup, max_seconds=30.0, telemetry_interval_steps=1
        )

    evolved = drive(controller)
    assert evolved.steps == result["baselineComparisons"][0]["steps"], path.name
    mean_brake = statistics.fmean(f.controls.brake for f in evolved.telemetry)
    case = {
        "stage": stage,
        "trackId": track["id"],
        "algorithm": algorithm,
        "seed": seed,
        "lapTimeWeight": weight,
        "simulationContractVersion": result["metadata"]["simulationContractVersion"],
        "championFitness": result["champion"]["fitness"],
        "fitnessHistory": result["fitnessHistory"],
        "champion": result["champion"],
        "withBrake": describe(evolved),
        "withoutBrake": describe(drive(FixedBrake(controller, 0.0))),
        "constantMeanBrake": describe(drive(FixedBrake(controller, mean_brake))),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(case, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(path.name, flush=True)
    return case


def summarize(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for weight in sorted({c["lapTimeWeight"] for c in cases}):
        for algorithm in ("all", "fixed-ga", "neat"):
            group = [
                c
                for c in cases
                if c["lapTimeWeight"] == weight and algorithm in ("all", c["algorithm"])
            ]
            finishers = [c for c in group if c["withBrake"]["finished"]]
            rows.append(
                {
                    "lapTimeWeight": weight,
                    "algorithm": algorithm,
                    "runs": len(group),
                    "finished": len(finishers),
                    "brakeDependent": sum(not c["withoutBrake"]["finished"] for c in finishers),
                    "brakeModulationDependent": sum(
                        not c["constantMeanBrake"]["finished"] for c in finishers
                    ),
                    "medianHardBrakingFraction": statistics.median(
                        [c["withBrake"]["hardBrakingStepFraction"] for c in finishers] or [0.0]
                    ),
                    "lapSeconds": sorted(c["withBrake"]["lapSeconds"] for c in finishers),
                }
            )
    return rows


def paired_laps(cases: list[dict[str, Any]], weight: float) -> list[tuple[float, float]]:
    """Lap seconds at the current weight and at `weight`, for runs that finish under both."""
    index = {(c["trackId"], c["algorithm"], c["seed"], c["lapTimeWeight"]): c for c in cases}
    pairs = []
    for (track, algorithm, seed, w), case in index.items():
        if w != weight:
            continue
        base = index[(track, algorithm, seed, CURRENT_WEIGHT)]
        if case["withBrake"]["finished"] and base["withBrake"]["finished"]:
            pairs.append((base["withBrake"]["lapSeconds"], case["withBrake"]["lapSeconds"]))
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=sorted(STAGES))
    parser.add_argument("--weight", type=float, action="append", default=[])
    args = parser.parse_args()
    config = STAGES[args.stage]
    weights = tuple(sorted({*cast(tuple[float, ...], config["weights"]), *args.weight}))
    generated = generate_track_payload(
        {
            "contractVersion": 1,
            "seed": config["generated"],
            "length": "short",
            "difficulty": "technical",
        }
    )
    assert generated["valid"]
    tracks = [preset.to_payload() for preset in PRESET_TRACKS]
    tracks.append(cast(Any, generated["compiled"])["track"])
    keys = list(
        itertools.product(
            (args.stage,),
            tracks,
            ("fixed-ga", "neat"),
            cast(tuple[int, ...], config["seeds"]),
            weights,
        )
    )
    with ProcessPoolExecutor(max_workers=4) as pool:
        cases = list(pool.map(run_case, keys))
    summary = {
        "stage": args.stage,
        "plan": "docs/experiments/lap-weight-plan.md",
        "rows": summarize(cases),
        "pairedLapSeconds": {
            str(int(w)): paired_laps(cases, w) for w in weights if w != CURRENT_WEIGHT
        },
    }
    Path(f"contracts/lap-weight-{args.stage}-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    for row in summary["rows"]:
        print(json.dumps({k: v for k, v in row.items() if k != "lapSeconds"}))
    for weight, pairs in summary["pairedLapSeconds"].items():
        if pairs:
            print(
                weight,
                "paired finishes",
                len(pairs),
                "median lap current",
                round(statistics.median(p[0] for p in pairs), 2),
                "candidate",
                round(statistics.median(p[1] for p in pairs), 2),
            )


if __name__ == "__main__":
    main()
