"""Deterministic Phase 10 regression and performance smoke matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Literal, TypedDict, cast

from evo_racer.observer import RunSession, RunSettings
from evo_racer.onboarding import validate_setup
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

PHASE10_CONTRACT_VERSION: Final = 1
SMOKE_SEEDS: Final = (19, 73, 211)
SMOKE_ALGORITHMS: Final = ("fixed-ga", "neat")
SMOKE_POPULATION_SIZE: Final = 10
SMOKE_GENERATIONS: Final = 1
SMOKE_EPISODE_SECONDS: Final = 15.0


class _TimingEntry(TypedDict):
    presetId: str
    algorithm: str
    seed: int
    elapsedSeconds: float


def build_regression_matrix() -> dict[str, object]:
    """Run the complete deterministic matrix and return its stable signatures."""
    matrix, _ = _run_matrix()
    return matrix


def build_performance_report() -> dict[str, object]:
    """Run the matrix once and retain wall-clock timings outside the fixture."""
    started = time.perf_counter()
    matrix, timings = _run_matrix(measure=True)
    total_seconds = time.perf_counter() - started
    return _performance_report(matrix, timings, total_seconds)


def _performance_report(
    matrix: dict[str, object],
    timings: list[_TimingEntry],
    total_seconds: float,
) -> dict[str, object]:
    return {
        "contractVersion": PHASE10_CONTRACT_VERSION,
        "generatedAtUtc": datetime.now(UTC).isoformat(),
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor() or "unknown",
        },
        "configuration": matrix["configuration"],
        "caseCount": len(timings),
        "totalSeconds": round(total_seconds, 6),
        "medianCaseSeconds": round(
            statistics.median(timing["elapsedSeconds"] for timing in timings),
            6,
        ),
        "cases": timings,
        "regressionSha256": _canonical_sha256(matrix),
    }


def verify_fixture(fixture_path: Path) -> dict[str, object]:
    """Fail closed when a deterministic result differs from the reviewed fixture."""
    actual = build_regression_matrix()
    _assert_fixture(actual, fixture_path)
    return actual


def _assert_fixture(actual: dict[str, object], fixture_path: Path) -> None:
    expected: object = json.loads(fixture_path.read_text(encoding="utf-8"))
    if actual != expected:
        raise RuntimeError(
            f"Phase 10 deterministic regression drifted from {fixture_path.as_posix()}."
        )


def _run_matrix(
    *,
    measure: bool = False,
) -> tuple[dict[str, object], list[_TimingEntry]]:
    cases: list[dict[str, object]] = []
    timings: list[_TimingEntry] = []
    for preset in PRESET_TRACKS:
        compiled = compile_track_payload(preset.to_payload())
        for algorithm_value in SMOKE_ALGORITHMS:
            algorithm = algorithm_value
            if algorithm not in {"fixed-ga", "neat"}:
                raise AssertionError("Phase 10 contains an unsupported algorithm.")
            for seed in SMOKE_SEEDS:
                case_started = time.perf_counter()
                case = _run_case(
                    compiled_track=compiled,
                    preset_id=preset.track_id,
                    algorithm=algorithm,
                    seed=seed,
                )
                elapsed_seconds = time.perf_counter() - case_started
                cases.append(case)
                if measure:
                    timings.append(
                        {
                            "presetId": preset.track_id,
                            "algorithm": algorithm,
                            "seed": seed,
                            "elapsedSeconds": round(elapsed_seconds, 6),
                        }
                    )
    return (
        {
            "contractVersion": PHASE10_CONTRACT_VERSION,
            "kind": "phase10-deterministic-regression",
            "configuration": {
                "seeds": list(SMOKE_SEEDS),
                "presets": [preset.track_id for preset in PRESET_TRACKS],
                "algorithms": list(SMOKE_ALGORITHMS),
                "populationSize": SMOKE_POPULATION_SIZE,
                "generations": SMOKE_GENERATIONS,
                "episodeSeconds": SMOKE_EPISODE_SECONDS,
                "fixedTimeStep": 1.0 / 60.0,
            },
            "cases": cases,
        },
        timings,
    )


def _run_case(
    *,
    compiled_track: dict[str, object],
    preset_id: str,
    algorithm: str,
    seed: int,
) -> dict[str, object]:
    if algorithm not in {"fixed-ga", "neat"}:
        raise ValueError("Smoke algorithm must be fixed-ga or neat.")
    validation = validate_setup(
        {
            "contractVersion": 1,
            "trackPreset": preset_id,
            "settings": {
                "algorithm": algorithm,
                "populationSize": SMOKE_POPULATION_SIZE,
                "generations": SMOKE_GENERATIONS,
                "episodeSeconds": int(SMOKE_EPISODE_SECONDS),
                "seed": seed,
            },
        }
    )
    if validation["valid"] is not True:
        raise RuntimeError("A Phase 10 smoke case is outside the product setup contract.")
    session = RunSession(
        run_id=f"phase10-{preset_id}-{algorithm}-{seed}",
        compiled_track=compiled_track,
        settings=RunSettings(
            algorithm=cast(Literal["fixed-ga", "neat"], algorithm),
            population_size=SMOKE_POPULATION_SIZE,
            generations=SMOKE_GENERATIONS,
            episode_seconds=SMOKE_EPISODE_SECONDS,
            seed=seed,
        ),
    )
    session.advance()
    snapshot = session.snapshot()
    if snapshot["status"] != "completed":
        raise RuntimeError("A Phase 10 smoke case did not complete.")
    result = cast(dict[str, object], snapshot["result"])
    metadata = cast(dict[str, object], result["metadata"])
    champion = cast(dict[str, object], result["champion"])
    comparisons = cast(list[dict[str, object]], result["baselineComparisons"])
    if len(comparisons) != 3:
        raise RuntimeError("A Phase 10 result is missing a baseline comparison.")
    random_comparison = comparisons[1]
    pursuit_comparison = comparisons[2]
    replay = cast(dict[str, object], result["replay"])
    frames = cast(list[dict[str, object]], replay["frames"])
    return {
        "presetId": preset_id,
        "algorithm": algorithm,
        "seed": seed,
        "trackSha256": metadata["trackSha256"],
        "championFitness": champion["fitness"],
        "championProgress": champion["progress"],
        "randomFitness": random_comparison["fitness"],
        "randomProgress": random_comparison["progress"],
        "pursuitFitness": pursuit_comparison["fitness"],
        "pursuitProgress": pursuit_comparison["progress"],
        "replayFrameCount": len(frames),
        "resultSha256": _canonical_sha256(result),
    }


def _canonical_sha256(value: object) -> str:
    encoded = json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, help="Reviewed deterministic fixture to verify.")
    parser.add_argument("--report", type=Path, help="Write a measured JSON performance report.")
    parser.add_argument(
        "--print-fixture",
        action="store_true",
        help="Print the current deterministic fixture JSON.",
    )
    return parser


def main() -> int:
    """Run fixture verification and/or measured reporting from the command line."""
    args = _parser().parse_args()
    if not args.fixture and not args.report and not args.print_fixture:
        raise SystemExit("Choose --fixture, --report, or --print-fixture.")
    matrix: dict[str, object] | None = None
    timings: list[_TimingEntry] = []
    total_seconds = 0.0
    if args.report:
        started = time.perf_counter()
        matrix, timings = _run_matrix(measure=True)
        total_seconds = time.perf_counter() - started
    elif args.fixture or args.print_fixture:
        matrix = build_regression_matrix()
    if args.fixture:
        assert matrix is not None
        _assert_fixture(matrix, args.fixture)
        print(f"Verified {len(cast(list[object], matrix['cases']))} deterministic cases.")
    if args.print_fixture:
        matrix = matrix or build_regression_matrix()
        print(json.dumps(matrix, ensure_ascii=False, indent=2, sort_keys=True))
    if args.report:
        assert matrix is not None
        report = _performance_report(matrix, timings, total_seconds)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(
            f"Measured {report['caseCount']} cases in "
            f"{report['totalSeconds']} seconds: {args.report}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
