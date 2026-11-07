"""Deterministic learning benchmark: does evolution beat the same work without selection?

Each case runs the real RunSession. The evolved run spends its evaluation budget over
generations. Its control spends the same budget in one generation, so it samples the
same number of cars with no selection, crossover, or mutation.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Final, Literal, TypedDict, cast

from evo_racer.observer import RunSession, RunSettings
from evo_racer.simulation import SIMULATION_CONTRACT_VERSION
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

BENCHMARK_CONTRACT_VERSION: Final = 1
BENCHMARK_SEEDS: Final = (42, 19, 73, 211, 1009)
BENCHMARK_ALGORITHMS: Final = ("fixed-ga", "neat")
POPULATION_SIZE: Final = 16
GENERATIONS: Final = 10
EPISODE_SECONDS: Final = 30.0

type Algorithm = Literal["fixed-ga", "neat"]


class BenchmarkCase(TypedDict):
    presetId: str
    algorithm: str
    seed: int
    firstGenerationBest: float
    championFitness: float
    championProgress: float
    championFinished: bool
    controlFitness: float
    controlProgress: float
    controlFinished: bool
    pursuitFitness: float
    pursuitFinished: bool
    pursuitCrashed: bool
    randomFitness: float


def _run(
    preset_id: str,
    algorithm: Algorithm,
    seed: int,
    population_size: int,
    generations: int,
) -> dict[str, object]:
    preset = next(track for track in PRESET_TRACKS if track.track_id == preset_id)
    session = RunSession(
        run_id=f"learning-{preset_id}-{algorithm}-{seed}-{generations}",
        compiled_track=compile_track_payload(preset.to_payload()),
        settings=RunSettings(
            algorithm=algorithm,
            population_size=population_size,
            generations=generations,
            episode_seconds=EPISODE_SECONDS,
            seed=seed,
        ),
    )
    for _ in range(generations):
        session.advance()
    snapshot = session.snapshot()
    if snapshot["status"] != "completed":
        raise RuntimeError("A learning benchmark run did not complete.")
    return cast(dict[str, object], snapshot["result"])


def run_case(preset_id: str, algorithm: Algorithm, seed: int) -> BenchmarkCase:
    """Run one evolved run and its same-budget control."""
    evolved = _run(preset_id, algorithm, seed, POPULATION_SIZE, GENERATIONS)
    control = _run(preset_id, algorithm, seed, POPULATION_SIZE * GENERATIONS, 1)
    history = cast(list[dict[str, float]], evolved["fitnessHistory"])
    comparisons = {
        cast(str, item["label"]): item
        for item in cast(list[dict[str, object]], evolved["baselineComparisons"])
    }
    champion = comparisons["Champion"]
    pursuit = comparisons["Pure Pursuit"]
    control_champion = cast(list[dict[str, object]], control["baselineComparisons"])[0]
    return {
        "presetId": preset_id,
        "algorithm": algorithm,
        "seed": seed,
        "firstGenerationBest": history[0]["bestFitness"],
        "championFitness": cast(float, champion["fitness"]),
        "championProgress": cast(float, champion["progress"]),
        "championFinished": cast(bool, champion["finished"]),
        "controlFitness": cast(float, control_champion["fitness"]),
        "controlProgress": cast(float, control_champion["progress"]),
        "controlFinished": cast(bool, control_champion["finished"]),
        "pursuitFitness": cast(float, pursuit["fitness"]),
        "pursuitFinished": cast(bool, pursuit["finished"]),
        "pursuitCrashed": not pursuit["finished"] and cast(int, pursuit["collisionCount"]) > 0,
        "randomFitness": cast(float, comparisons["Seeded random network"]["fitness"]),
    }


def summarize(cases: list[BenchmarkCase]) -> list[dict[str, object]]:
    """Report each preset and algorithm as counts, never as a single averaged claim."""
    groups: dict[tuple[str, str], list[BenchmarkCase]] = {}
    for case in cases:
        groups.setdefault((case["presetId"], case["algorithm"]), []).append(case)
    return [
        {
            "presetId": preset_id,
            "algorithm": algorithm,
            "cases": len(group),
            "improvedOverFirstGeneration": sum(
                case["championFitness"] > case["firstGenerationBest"] for case in group
            ),
            "beatSameBudgetControl": sum(
                case["championFitness"] > case["controlFitness"] for case in group
            ),
            "beatPurePursuit": sum(
                case["championFitness"] > case["pursuitFitness"] for case in group
            ),
            "championFinishedLap": sum(case["championFinished"] for case in group),
            "controlFinishedLap": sum(case["controlFinished"] for case in group),
            "pursuitFinishedLap": sum(case["pursuitFinished"] for case in group),
            "pursuitCrashed": sum(case["pursuitCrashed"] for case in group),
            "medianChampionFitness": statistics.median(case["championFitness"] for case in group),
            "medianControlFitness": statistics.median(case["controlFitness"] for case in group),
            "medianPursuitFitness": statistics.median(case["pursuitFitness"] for case in group),
        }
        for (preset_id, algorithm), group in groups.items()
    ]


def build_benchmark(workers: int | None = None) -> dict[str, object]:
    """Run the matrix. Each case is independent, so workers cannot change its result."""
    keys = [
        (preset.track_id, algorithm, seed)
        for preset in PRESET_TRACKS
        for algorithm in BENCHMARK_ALGORITHMS
        for seed in BENCHMARK_SEEDS
    ]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        cases = list(pool.map(run_case, *zip(*keys, strict=True)))
    return {
        "contractVersion": BENCHMARK_CONTRACT_VERSION,
        "kind": "learning-benchmark",
        "configuration": {
            "simulationContractVersion": SIMULATION_CONTRACT_VERSION,
            "seeds": list(BENCHMARK_SEEDS),
            "presets": [preset.track_id for preset in PRESET_TRACKS],
            "algorithms": list(BENCHMARK_ALGORITHMS),
            "populationSize": POPULATION_SIZE,
            "generations": GENERATIONS,
            "episodeSeconds": EPISODE_SECONDS,
            "controlPopulationSize": POPULATION_SIZE * GENERATIONS,
            "controlGenerations": 1,
        },
        "summary": summarize(cases),
        "cases": cases,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, help="Fail if results differ from this file.")
    parser.add_argument("--write", type=Path, help="Write the results to this file.")
    parser.add_argument("--workers", type=int, help="Parallel processes. Results do not change.")
    return parser


def main() -> int:
    """Verify or write the saved benchmark from the command line."""
    args = _parser().parse_args()
    if not args.fixture and not args.write:
        raise SystemExit("Choose --fixture or --write.")
    benchmark = build_benchmark(args.workers)
    if args.write:
        args.write.parent.mkdir(parents=True, exist_ok=True)
        args.write.write_text(
            json.dumps(benchmark, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {len(cast(list[object], benchmark['cases']))} cases: {args.write}")
    if args.fixture:
        expected: object = json.loads(args.fixture.read_text(encoding="utf-8"))
        if benchmark != expected:
            print(f"Learning benchmark drifted from {args.fixture.as_posix()}.", file=sys.stderr)
            return 1
        print(f"Verified {len(cast(list[object], benchmark['cases']))} deterministic cases.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
