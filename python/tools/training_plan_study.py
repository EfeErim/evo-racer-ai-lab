"""Predeclared training-plan measurement; see docs/experiments/training-plan.md."""

from __future__ import annotations

import argparse
import itertools
import json
import statistics
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, cast

from champion_brake_study import FixedBrake, champion_controller, describe
from evo_racer.simulation import EpisodeResult, TrackGeometry, evaluate_episode
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload
from heldout_benchmark import run_one

PLANS = {
    "quick": (16, 10, 30.0),
    "balanced": (24, 20, 30.0),
    "thorough": (48, 40, 60.0),
}
STAGE_SEEDS = {"a": (20011, 22013, 24019), "b": (26021, 28027, 30011)}


def brake_replays(
    track: dict[str, Any], algorithm: str, genome: dict[str, Any], seconds: float
) -> dict[str, Any]:
    geometry = TrackGeometry.from_compiled(compile_track_payload(track))
    controller, genes = champion_controller(algorithm, genome)
    setup = genes.to_setup()

    def drive(driver: Any) -> EpisodeResult:
        return evaluate_episode(
            geometry, driver, setup, max_seconds=seconds, telemetry_interval_steps=1
        )

    evolved = drive(controller)
    mean = statistics.fmean(f.controls.brake for f in evolved.telemetry)
    return {
        "withBrake": describe(evolved),
        "withoutBrake": describe(drive(FixedBrake(controller, 0.0))),
        "constantMeanBrake": describe(drive(FixedBrake(controller, mean))),
    }


def run_case(key: tuple[str, str, dict[str, Any], str, int, float | None]) -> dict[str, Any]:
    stage, plan, track, algorithm, seed, override = key
    population, generations, seconds = PLANS[plan]
    seconds = override or seconds
    label = f"{plan}-{int(seconds)}s"
    path = (
        Path(f"contracts/training-plans-{stage}") / f"{track['id']}-{label}-{algorithm}-{seed}.json"
    )
    if path.exists():
        return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    started = time.perf_counter()
    evolved = run_one(track, algorithm, seed, population, generations, False, seconds)
    evolved_seconds = time.perf_counter() - started
    started = time.perf_counter()
    control = run_one(track, algorithm, seed, population * generations, 1, False, seconds)
    control_seconds = time.perf_counter() - started
    case = {
        "stage": stage,
        "plan": plan,
        "episodeSeconds": seconds,
        "trackId": track["id"],
        "algorithm": algorithm,
        "seed": seed,
        "evolved": {
            "termination": evolved["termination"],
            "lapSeconds": evolved["lapSeconds"],
            "fitness": evolved["champion"]["fitness"],
            "trainingSteps": evolved["counts"]["trainingSteps"],
            "wallSeconds": evolved_seconds,
            "baselineComparisons": evolved["baselineComparisons"],
            "champion": evolved["champion"],
            "fitnessHistory": evolved["fitnessHistory"],
        },
        "control": {
            "termination": control["termination"],
            "lapSeconds": control["lapSeconds"],
            "fitness": control["champion"]["fitness"],
            "trainingSteps": control["counts"]["trainingSteps"],
            "wallSeconds": control_seconds,
        },
        "brake": brake_replays(track, algorithm, evolved["champion"]["genome"], seconds),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(case, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(path.name, flush=True)
    return case


def summarize(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, float, str, str], list[dict[str, Any]]] = {}
    for case in cases:
        key = (case["plan"], case["episodeSeconds"], case["trackId"], case["algorithm"])
        groups.setdefault(key, []).append(case)
    rows = []
    for (plan, seconds, track, algorithm), group in sorted(groups.items()):
        finished = sum(c["evolved"]["termination"] == "lap_complete" for c in group)
        beat = sum(c["evolved"]["fitness"] > c["control"]["fitness"] for c in group)
        finishers = [c for c in group if c["brake"]["withBrake"]["finished"]]
        rows.append(
            {
                "plan": plan,
                "episodeSeconds": seconds,
                "trackId": track,
                "algorithm": algorithm,
                "runs": len(group),
                "finished": finished,
                "beatControl": beat,
                "works": finished * 3 >= 2 * len(group) and beat * 3 >= 2 * len(group),
                "controlFinished": sum(
                    c["control"]["termination"] == "lap_complete" for c in group
                ),
                "collided": sum(c["evolved"]["termination"] == "collision" for c in group),
                "timedOut": sum(c["evolved"]["termination"] == "timeout" for c in group),
                "lapSeconds": sorted(
                    c["evolved"]["lapSeconds"] for c in group if c["evolved"]["lapSeconds"]
                ),
                "needVariedBrake": sum(
                    not c["brake"]["constantMeanBrake"]["finished"] for c in finishers
                ),
                "medianWallSeconds": statistics.median(c["evolved"]["wallSeconds"] for c in group),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=sorted(STAGE_SEEDS))
    parser.add_argument("--plan", action="append", choices=sorted(PLANS))
    parser.add_argument("--track", action="append")
    parser.add_argument("--episode-seconds", type=float)
    args = parser.parse_args()
    tracks = [
        preset.to_payload()
        for preset in PRESET_TRACKS
        if not args.track or preset.track_id in args.track
    ]
    keys = list(
        itertools.product(
            (args.stage,),
            args.plan or sorted(PLANS, key=lambda name: -PLANS[name][1]),
            tracks,
            ("fixed-ga", "neat"),
            STAGE_SEEDS[args.stage],
            (args.episode_seconds,),
        )
    )
    with ProcessPoolExecutor(max_workers=4) as pool:
        cases = list(pool.map(run_case, keys))
    rows = summarize(cases)
    suffix = f"-{int(args.episode_seconds)}s" if args.episode_seconds else ""
    Path(f"contracts/training-plans-{args.stage}{suffix}-summary.json").write_text(
        json.dumps(
            {"plan": "docs/experiments/training-plan.md", "rows": rows},
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    for row in rows:
        print(json.dumps({k: v for k, v in row.items() if k != "lapSeconds"}))


if __name__ == "__main__":
    main()
