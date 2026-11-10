"""Deterministic regression matrix: 18 small runs whose result hashes are pinned.

`python/tests/test_regression_matrix.py` compares a fresh run with
`contracts/regression-matrix-v2.json`. After an intended simulation change, regenerate
that fixture with `--print-fixture`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from typing import Final, Literal, cast

from evo_racer.observer import RunSession, RunSettings
from evo_racer.onboarding import validate_setup
from evo_racer.simulation import SIMULATION_CONTRACT_VERSION
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

MATRIX_CONTRACT_VERSION: Final = 1
SMOKE_SEEDS: Final = (19, 73, 211)
SMOKE_ALGORITHMS: Final = ("fixed-ga", "neat")
SMOKE_POPULATION_SIZE: Final = 10
SMOKE_GENERATIONS: Final = 1
SMOKE_EPISODE_SECONDS: Final = 15.0


def build_regression_matrix() -> dict[str, object]:
    """Run the complete deterministic matrix and return its stable signatures."""
    cases: list[dict[str, object]] = []
    for preset in PRESET_TRACKS:
        compiled = compile_track_payload(preset.to_payload())
        for algorithm in SMOKE_ALGORITHMS:
            for seed in SMOKE_SEEDS:
                cases.append(
                    _run_case(
                        compiled_track=compiled,
                        preset_id=preset.track_id,
                        algorithm=algorithm,
                        seed=seed,
                    )
                )
    return {
        "contractVersion": MATRIX_CONTRACT_VERSION,
        "kind": "deterministic-regression",
        "configuration": {
            "simulationContractVersion": SIMULATION_CONTRACT_VERSION,
            "seeds": list(SMOKE_SEEDS),
            "presets": [preset.track_id for preset in PRESET_TRACKS],
            "algorithms": list(SMOKE_ALGORITHMS),
            "populationSize": SMOKE_POPULATION_SIZE,
            "generations": SMOKE_GENERATIONS,
            "episodeSeconds": SMOKE_EPISODE_SECONDS,
            "fixedTimeStep": 1.0 / 60.0,
        },
        "cases": cases,
    }


def _run_case(
    *,
    compiled_track: dict[str, object],
    preset_id: str,
    algorithm: str,
    seed: int,
) -> dict[str, object]:
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
        raise RuntimeError("A regression-matrix case is outside the product setup contract.")
    session = RunSession(
        run_id=f"regression-{preset_id}-{algorithm}-{seed}",
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
        raise RuntimeError("A regression-matrix case did not complete.")
    result = cast(dict[str, object], snapshot["result"])
    metadata = cast(dict[str, object], result["metadata"])
    champion = cast(dict[str, object], result["champion"])
    comparisons = cast(list[dict[str, object]], result["baselineComparisons"])
    if len(comparisons) != 3:
        raise RuntimeError("A regression-matrix result is missing a baseline comparison.")
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


def main() -> int:
    """Print the current deterministic fixture JSON."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--print-fixture",
        action="store_true",
        required=True,
        help="Print the current deterministic fixture JSON.",
    )
    parser.parse_args()
    print(json.dumps(build_regression_matrix(), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
