"""Post-hoc: do saved held-out champions use brakes, and does removing them hurt?

Exploratory analysis of contracts/heldout-v2, added after that matrix ran. It changes
nothing in the plan's reported cells and tunes nothing.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Any, cast

from evo_racer.evolution import FeedForwardController, FeedForwardNetwork, VehicleGenome
from evo_racer.neat_evolution import CompiledNEATNetwork, NEATController
from evo_racer.simulation import (
    Controller,
    Controls,
    EpisodeResult,
    Observation,
    TrackGeometry,
    VehicleSetup,
    evaluate_episode,
)
from evo_racer.tracks import compile_track_payload

SOURCE = Path("contracts/heldout-v2")
EPISODE_SECONDS = 30.0
BRAKE_THRESHOLD = 0.05


class FixedBrake:
    """The same frozen controller with its brake output replaced by one constant."""

    def __init__(self, driver: Controller, brake: float) -> None:
        self._driver = driver
        self._brake = brake

    @property
    def name(self) -> str:
        return f"{self._driver.name}:fixed-brake"

    @property
    def parameters(self) -> tuple[float, ...]:
        return (*self._driver.parameters, self._brake)

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        controls = self._driver.control(observation, geometry)
        return Controls(controls.steering, controls.throttle, self._brake)


def champion_controller(algorithm: str, genome: dict[str, Any]) -> tuple[Controller, VehicleGenome]:
    genes = genome["vehicleGenes"]
    vehicle = VehicleGenome(
        tuple(genes["performanceLogits"]), genes["frontBrakeBias"], genes["frontDriveBias"]
    )
    if algorithm == "fixed-ga":
        return (
            FeedForwardController(FeedForwardNetwork.from_payload(genome["network"]), "champion"),
            vehicle,
        )
    return (
        NEATController(CompiledNEATNetwork.from_payload(genome["network"]), "champion"),
        vehicle,
    )


def describe(episode: EpisodeResult) -> dict[str, object]:
    frames = episode.telemetry
    brakes = [f.controls.brake for f in frames]
    turning = [abs(f.controls.steering) for f in frames]
    varied = statistics.pstdev(brakes) > 0.0 and statistics.pstdev(turning) > 0.0
    return {
        "termination": episode.termination,
        "finished": episode.finished,
        "progress": episode.progress_fraction,
        "lapSeconds": episode.simulated_seconds if episode.finished else None,
        "brakingStepFraction": sum(b > BRAKE_THRESHOLD for b in brakes) / len(frames),
        "hardBrakingStepFraction": sum(b > 0.5 for b in brakes) / len(frames),
        "meanBrake": statistics.fmean(brakes),
        "brakeStdDev": statistics.pstdev(brakes),
        "brakeSteeringCorrelation": statistics.correlation(brakes, turning) if varied else None,
    }


def study() -> dict[str, object]:
    rows: list[dict[str, object]] = []
    for path in sorted(SOURCE.glob("*.json")):
        case = json.loads(path.read_text(encoding="utf-8"))
        saved = case["evolved"]
        geometry = TrackGeometry.from_compiled(compile_track_payload(case["track"]))
        controller, genes = champion_controller(case["algorithm"], saved["champion"]["genome"])
        setup: VehicleSetup = genes.to_setup()
        assert setup.to_payload() == saved["champion"]["vehicleSetup"]
        on = evaluate_episode(
            geometry, controller, setup, max_seconds=EPISODE_SECONDS, telemetry_interval_steps=1
        )
        off = evaluate_episode(
            geometry,
            FixedBrake(controller, 0.0),
            setup,
            max_seconds=EPISODE_SECONDS,
            telemetry_interval_steps=1,
        )
        flat = evaluate_episode(
            geometry,
            FixedBrake(controller, statistics.fmean(f.controls.brake for f in on.telemetry)),
            setup,
            max_seconds=EPISODE_SECONDS,
            telemetry_interval_steps=1,
        )
        # The replay must reproduce the saved run, or nothing below describes that champion.
        recorded = saved["baselineComparisons"][0]
        assert on.steps == recorded["steps"], path.name
        assert on.finished == recorded["finished"], path.name
        assert on.termination == saved["termination"], path.name
        rows.append(
            {
                "trackId": case["track"]["id"],
                "algorithm": case["algorithm"],
                "seed": case["seed"],
                "budget": case["budget"],
                "fixedVehicle": case["fixedVehicle"],
                "frontBrakeBias": setup.front_brake_bias,
                "brakeStrength": setup.brake_strength,
                "withBrake": describe(on),
                "withoutBrake": describe(off),
                "constantMeanBrake": describe(flat),
            }
        )
    return {
        "kind": "champion-brake-ablation",
        "simulationContractVersion": 2,
        "source": str(SOURCE).replace("\\", "/"),
        "episodeSeconds": EPISODE_SECONDS,
        "brakeThreshold": BRAKE_THRESHOLD,
        "limitations": "Exploratory and post hoc. Alters the brake output of a network that was "
        "selected with it, so it measures dependence on brakes, not what evolution would find "
        "without them. constantMeanBrake holds the mean of the same champion's recorded brake "
        "for the whole episode: finishing that way means the varying brake signal was not needed.",
        "cases": rows,
    }


def report(payload: dict[str, Any]) -> None:
    cases = cast(list[dict[str, Any]], payload["cases"])
    print("cases", len(cases))
    groups: dict[str, list[dict[str, Any]]] = {"all": cases}
    for case in cases:
        groups.setdefault(case["algorithm"], []).append(case)
        groups.setdefault(case["trackId"], []).append(case)
        groups.setdefault(case["budget"], []).append(case)
    for name, group in groups.items():
        finishers = [c for c in group if c["withBrake"]["finished"]]
        kept = [c for c in finishers if c["withoutBrake"]["finished"]]
        faster = [c for c in kept if c["withoutBrake"]["lapSeconds"] < c["withBrake"]["lapSeconds"]]
        slower = [c for c in kept if c["withoutBrake"]["lapSeconds"] > c["withBrake"]["lapSeconds"]]
        gained = [
            c for c in group if not c["withBrake"]["finished"] and c["withoutBrake"]["finished"]
        ]
        fractions = [c["withBrake"]["brakingStepFraction"] for c in group]
        means = [c["withBrake"]["meanBrake"] for c in group]
        deltas = [c["withoutBrake"]["progress"] - c["withBrake"]["progress"] for c in group]
        print(
            f"{name[:22]:22} n={len(group):2} brakingFrac median={statistics.median(fractions):.2f}"
            f" meanBrake median={statistics.median(means):.3f}"
            f" | finishers {len(finishers):2} lost-without {len(finishers) - len(kept):2}"
            f" still {len(kept):2} (faster {len(faster)}, slower {len(slower)})"
            f" | nonfinishers-gained {len(gained)}"
            f" | mean progress change {statistics.fmean(deltas):+.3f}"
        )
        need_brake = [c for c in finishers if not c["withoutBrake"]["finished"]]
        flat_ok = [c for c in need_brake if c["constantMeanBrake"]["finished"]]
        hard = [c["withBrake"]["hardBrakingStepFraction"] for c in finishers] or [0.0]
        spread = [c["withBrake"]["brakeStdDev"] for c in finishers] or [0.0]
        corr = [
            c["withBrake"]["brakeSteeringCorrelation"]
            for c in finishers
            if c["withBrake"]["brakeSteeringCorrelation"] is not None
        ] or [0.0]
        print(
            f"{'':22}   need-brake {len(need_brake):2} of which constant-mean-brake finishes"
            f" {len(flat_ok):2} | finishers: hardBrake median={statistics.median(hard):.3f}"
            f" stdev median={statistics.median(spread):.3f}"
            f" corr(brake,|steer|) median={statistics.median(corr):+.2f}"
        )


if __name__ == "__main__":
    result = study()
    report(result)
    Path("contracts/heldout-v2-brake-use.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
