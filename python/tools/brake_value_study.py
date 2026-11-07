"""Exploratory: how much lap time can a varying brake buy over holding one speed?

Every driver uses the same Pure Pursuit steering law. Only the speed policy differs:
hold one target speed, or slow for upcoming curvature with SetupAwarePurePursuit.
Both grids are coarse, so the gaps are lower bounds on what varied braking can buy.
"""

from __future__ import annotations

import json
import math
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

from evo_racer import simulation as sim
from evo_racer.evolution import VehicleGenome, episode_fitness
from evo_racer.track_generation import generate_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

LIMIT_SECONDS = 60.0
HOLD_SPEEDS = tuple(value / 2 for value in range(8, 80))
CAUTIONS = tuple(value / 20 for value in range(3, 80))


def _steering(observation: sim.Observation, geometry: sim.TrackGeometry) -> float:
    """The steering law shared with PurePursuitBaseline and SetupAwarePurePursuit."""
    speed = observation.state.forward_speed
    target = geometry.point_at(observation.progress_distance + 5.0 + 0.3 * speed)
    heading = math.atan2(target[1] - observation.state.y, target[0] - observation.state.x)
    delta = (heading - observation.state.heading + math.pi) % (2.0 * math.pi) - math.pi
    return max(-1.0, min(1.0, delta * 1.8))


class HoldSpeed:
    """Reach one target speed and keep it for the whole lap."""

    def __init__(self, speed: float) -> None:
        self._speed = speed

    @property
    def name(self) -> str:
        return "hold-speed"

    @property
    def parameters(self) -> tuple[float, ...]:
        return (self._speed,)

    def control(self, observation: sim.Observation, geometry: sim.TrackGeometry) -> sim.Controls:
        error = self._speed - observation.state.forward_speed
        return sim.Controls(
            _steering(observation, geometry),
            max(0.0, min(1.0, error / 4.0)),
            max(0.0, min(1.0, -error / 4.0)),
        )


class NoBrake:
    """A driver with only its brake output removed."""

    def __init__(self, driver: sim.Controller) -> None:
        self._driver = driver

    @property
    def name(self) -> str:
        return f"{self._driver.name}:no-brake"

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._driver.parameters

    def control(self, observation: sim.Observation, geometry: sim.TrackGeometry) -> sim.Controls:
        controls = self._driver.control(observation, geometry)
        return sim.Controls(controls.steering, controls.throttle, 0.0)


def _fastest(
    geometry: sim.TrackGeometry,
    setup: sim.VehicleSetup,
    drivers: list[tuple[float, sim.Controller]],
) -> dict[str, object]:
    finishers: list[tuple[float, float, float]] = []
    for parameter, driver in drivers:
        episode = sim.evaluate_episode(
            geometry, driver, setup, max_seconds=LIMIT_SECONDS, telemetry_interval_steps=1
        )
        if episode.finished:
            hard = sum(f.controls.brake > 0.5 for f in episode.telemetry) / len(episode.telemetry)
            finishers.append((episode.simulated_seconds, parameter, hard))
    if not finishers:
        return {"finished": 0, "tried": len(drivers), "lapSeconds": None}
    seconds, parameter, hard = min(finishers)
    return {
        "finished": len(finishers),
        "tried": len(drivers),
        "lapSeconds": seconds,
        "parameter": parameter,
        "hardBrakingStepFraction": hard,
    }


def study() -> dict[str, object]:
    generated = generate_track_payload(
        {"contractVersion": 1, "seed": 91009, "length": "short", "difficulty": "technical"}
    )
    tracks = [(preset.track_id, preset.to_payload()) for preset in PRESET_TRACKS]
    tracks.append(("generator-v5-91009", cast(Any, generated["compiled"])["track"]))
    setups = {
        "default": sim.VehicleSetup(),
        "balanced-genome": VehicleGenome((0.0,) * 5, 0.5, 0.5).to_setup(),
    }
    max_steps = round(30.0 / sim.FIXED_TIME_STEP)
    rows: list[dict[str, object]] = []
    for setup_name, setup in setups.items():
        for track_id, track in tracks:
            geometry = sim.TrackGeometry.from_compiled(compile_track_payload(track))
            hold = _fastest(geometry, setup, [(v, HoldSpeed(v)) for v in HOLD_SPEEDS])
            varied = _fastest(
                geometry, setup, [(c, sim.SetupAwarePurePursuit(setup, c)) for c in CAUTIONS]
            )
            unbraked = _fastest(
                geometry,
                setup,
                [(c, NoBrake(sim.SetupAwarePurePursuit(setup, c))) for c in CAUTIONS],
            )
            rows.append(
                {
                    "setup": setup_name,
                    "trackId": track_id,
                    "holdSpeed": hold,
                    "variedBrake": varied,
                    "variedWithoutBrake": unbraked,
                }
            )
    # Fitness gained by the same clean finish arriving one second sooner, under the 30 s limit.
    reference = sim.evaluate_episode(
        sim.preset_geometry("easy-oval"), sim.PurePursuitBaseline(), sim.VehicleSetup()
    )
    assert reference.finished and reference.steps > 60
    one_second = (
        episode_fitness(replace(reference, steps=reference.steps - 60), max_steps).fitness
        - episode_fitness(reference, max_steps).fitness
    )
    return {
        "kind": "brake-value-study",
        "simulationContractVersion": sim.SIMULATION_CONTRACT_VERSION,
        "limitSeconds": LIMIT_SECONDS,
        "holdSpeeds": list(HOLD_SPEEDS),
        "cautions": list(CAUTIONS),
        "setups": {name: setup.to_payload() for name, setup in setups.items()},
        "fitnessPerLapSecondAt30s": one_second,
        "limitations": "Exploratory. Coarse grids over two hand-written speed policies with "
        "one steering law, so gaps are lower bounds. Not an optimal-control result.",
        "rows": rows,
    }


if __name__ == "__main__":
    result = study()
    destination = Path("contracts/brake-value-v2.json")
    destination.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("fitness per lap second:", result["fitnessPerLapSecondAt30s"])
    for row in cast(list[dict[str, Any]], result["rows"]):
        print(
            row["setup"],
            row["trackId"],
            *(
                (
                    row[k]["lapSeconds"] and round(row[k]["lapSeconds"], 2),
                    f"{row[k]['finished']}/{row[k]['tried']}",
                )
                for k in ("holdSpeed", "variedBrake", "variedWithoutBrake")
            ),
        )
