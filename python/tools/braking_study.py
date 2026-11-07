"""Offline factorial experiment; experimental patches never enter the application."""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from unittest.mock import patch

from evo_racer import simulation as sim
from evo_racer.tracks import PRESET_TRACKS


class BrakeAblation:
    """The same fixed controller policy with only its brake output removed."""

    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled
        self.driver = sim.PurePursuitBaseline()

    @property
    def name(self) -> str:
        return "pure-pursuit-brake-ablation"

    @property
    def parameters(self) -> tuple[float, ...]:
        return (*self.driver.parameters, float(self.enabled))

    def control(self, observation: sim.Observation, geometry: sim.TrackGeometry) -> sim.Controls:
        controls = self.driver.control(observation, geometry)
        return sim.Controls(
            controls.steering, controls.throttle, controls.brake if self.enabled else 0.0
        )


def study() -> dict[str, object]:
    setup = sim.VehicleSetup()
    cases: list[dict[str, object]] = []
    for preset in PRESET_TRACKS:
        geometry = sim.preset_geometry(preset.track_id)
        for seconds in (120.0, 30.0):
            for drag in (0.018, 0.004):
                for limited in (False, True):
                    for brake in (False, True):
                        driver = BrakeAblation(brake)
                        with (
                            patch.object(sim, "DRAG_COEFFICIENT", drag),
                            patch.object(sim, "CORNER_GRIP_BASE", 6.0 if limited else 1e12),
                        ):
                            first = sim.evaluate_episode(
                                geometry,
                                driver,
                                setup,
                                max_seconds=seconds,
                                telemetry_interval_steps=1,
                            )
                            second = sim.evaluate_episode(
                                geometry,
                                BrakeAblation(brake),
                                setup,
                                max_seconds=seconds,
                                telemetry_interval_steps=1,
                            )
                        assert first == second
                        assert first.setup == setup
                        assert first.controller_parameters == driver.parameters
                        # Reproducible entry proxy: first crossing of |steering| >= .25.
                        entries = [
                            frame.state.forward_speed
                            for previous, frame in zip(
                                first.telemetry, first.telemetry[1:], strict=False
                            )
                            if abs(previous.controls.steering)
                            < 0.25
                            <= abs(frame.controls.steering)
                        ]
                        cases.append(
                            {
                                "trackId": preset.track_id,
                                "seconds": seconds,
                                "drag": drag,
                                "cornerLimit": limited,
                                "brakeEnabled": brake,
                                "finished": first.finished,
                                "termination": first.termination,
                                "progress": first.progress_fraction,
                                "collisions": first.collision_count,
                                "steps": first.steps,
                                "lapSeconds": first.simulated_seconds if first.finished else None,
                                "cornerEntrySpeeds": entries,
                                "meanCornerEntrySpeed": statistics.mean(entries)
                                if entries
                                else None,
                                "brakingSteps": sum(t.controls.brake > 0 for t in first.telemetry),
                                "repeatEqual": True,
                            }
                        )
    return {
        "kind": "braking-factorial-study",
        "simulationContractVersion": 2,
        "fixedTimeStep": sim.FIXED_TIME_STEP,
        "vehicleSetup": setup.to_payload(),
        "controller": "fixed-speed Pure Pursuit; identical parameters in all cells",
        "cornerEntryDefinition": "crossing absolute steering 0.25, sampled every physics step",
        "limitations": "One fixed vehicle and deterministic driver; no population inference. "
        "Disabling brakes preserves the throttle policy, not the resulting trajectory.",
        "cases": cases,
    }


if __name__ == "__main__":
    destination = Path("contracts/braking-study-v2.json")
    destination.write_text(json.dumps(study(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(destination)
