from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from evo_racer.simulation import (
    FIXED_TIME_STEP,
    SENSOR_ANGLES,
    SENSOR_RANGE,
    Controls,
    Observation,
    PurePursuitBaseline,
    RandomNetworkBaseline,
    TelemetrySnapshot,
    TrackGeometry,
    TrackProjection,
    VehicleSetup,
    VehicleState,
    evaluate_episode,
    parse_telemetry_payload,
    preset_geometry,
    simulate_preview_payload,
    step_physics,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase4-telemetry.json"


def _unfiltered_sensor_distances(geometry: TrackGeometry, state: VehicleState) -> tuple[float, ...]:
    distances: list[float] = []
    for angle in SENSOR_ANGLES:
        heading = state.heading + angle
        direction_x = math.cos(heading)
        direction_y = math.sin(heading)
        nearest = SENSOR_RANGE
        for boundary in geometry.boundaries:
            for start, end in zip(boundary, boundary[1:], strict=False):
                segment_x = end[0] - start[0]
                segment_y = end[1] - start[1]
                offset_x = start[0] - state.x
                offset_y = start[1] - state.y
                denominator = direction_x * segment_y - direction_y * segment_x
                if abs(denominator) <= 1e-12:
                    continue
                ray_distance = (offset_x * segment_y - offset_y * segment_x) / denominator
                segment_amount = (offset_x * direction_y - offset_y * direction_x) / denominator
                if (
                    ray_distance >= 0.0
                    and 0.0 <= segment_amount <= 1.0
                    and ray_distance <= SENSOR_RANGE
                ):
                    nearest = min(nearest, ray_distance)
        distances.append(nearest)
    return tuple(distances)


def _advance(
    geometry: TrackGeometry,
    state: VehicleState,
    controls: Controls,
    setup: VehicleSetup,
    steps: int,
) -> VehicleState:
    for _ in range(steps):
        result = step_physics(state, controls, setup, geometry)
        assert result.collided is False
        state = result.state
    return state


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_controller_outputs_fail_closed(invalid: float) -> None:
    with pytest.raises(ValueError, match="Controller outputs must be finite"):
        Controls(invalid, 0.5, 0.0)


def test_fractional_controls_have_measurable_effects() -> None:
    geometry = preset_geometry("easy-oval")
    half_throttle = _advance(
        geometry,
        geometry.spawn,
        Controls(0.0, 0.5, 0.0),
        VehicleSetup(),
        60,
    )
    full_throttle = _advance(
        geometry,
        geometry.spawn,
        Controls(0.0, 1.0, 0.0),
        VehicleSetup(),
        60,
    )
    half_steering = _advance(
        geometry,
        VehicleState(geometry.spawn.x, geometry.spawn.y, geometry.spawn.heading, 12.0),
        Controls(0.5, 0.0, 0.0),
        VehicleSetup(),
        8,
    )
    full_steering = _advance(
        geometry,
        VehicleState(geometry.spawn.x, geometry.spawn.y, geometry.spawn.heading, 12.0),
        Controls(1.0, 0.0, 0.0),
        VehicleSetup(),
        8,
    )

    assert full_throttle.forward_speed > half_throttle.forward_speed > 0.0
    assert full_steering.steering > half_steering.steering > 0.0


def test_low_grip_increases_sliding() -> None:
    geometry = preset_geometry("easy-oval")
    initial = VehicleState(geometry.spawn.x, geometry.spawn.y, geometry.spawn.heading, 12.0)
    low_grip = _advance(
        geometry,
        initial,
        Controls(0.65, 0.0, 0.0),
        VehicleSetup(grip_recovery=2.0),
        8,
    )
    high_grip = _advance(
        geometry,
        initial,
        Controls(0.65, 0.0, 0.0),
        VehicleSetup(grip_recovery=8.0),
        8,
    )

    assert abs(low_grip.lateral_speed) > abs(high_grip.lateral_speed)


def test_front_and_rear_bias_extremes_produce_distinct_handling() -> None:
    geometry = preset_geometry("easy-oval")
    initial = VehicleState(geometry.spawn.x, geometry.spawn.y, geometry.spawn.heading, 12.0)
    front_drive = _advance(
        geometry,
        initial,
        Controls(0.7, 0.8, 0.0),
        VehicleSetup(front_drive_bias=1.0),
        6,
    )
    rear_drive = _advance(
        geometry,
        initial,
        Controls(0.7, 0.8, 0.0),
        VehicleSetup(front_drive_bias=0.0),
        6,
    )
    front_brake = _advance(
        geometry,
        initial,
        Controls(0.7, 0.0, 0.5),
        VehicleSetup(front_brake_bias=1.0),
        6,
    )
    rear_brake = _advance(
        geometry,
        initial,
        Controls(0.7, 0.0, 0.5),
        VehicleSetup(front_brake_bias=0.0),
        6,
    )

    assert front_drive.heading != pytest.approx(rear_drive.heading)
    assert abs(rear_drive.lateral_speed) > abs(front_drive.lateral_speed)
    assert front_brake.heading != pytest.approx(rear_brake.heading)
    assert abs(rear_brake.lateral_speed) > abs(front_brake.lateral_speed)


def test_swept_collision_and_sensors_use_derived_track_corridor() -> None:
    geometry = preset_geometry("easy-oval")
    sensors = geometry.sensor_distances(geometry.spawn)
    assert len(sensors) == 7
    assert all(0.0 < distance <= 36.0 for distance in sensors)

    state = VehicleState(
        x=geometry.spawn.x,
        y=geometry.spawn.y,
        heading=geometry.spawn.heading + math.pi / 2.0,
        forward_speed=34.0,
    )
    collided = False
    for _ in range(30):
        result = step_physics(state, Controls(0.0, 0.0, 0.0), VehicleSetup(), geometry)
        state = result.state
        if result.collided:
            collided = True
            break

    assert collided is True
    assert geometry.on_road((state.x, state.y)) is True
    assert state.forward_speed == 0.0


@pytest.mark.parametrize("invalid", [0.0, -1.0, float("nan"), float("inf"), True])
def test_compiled_geometry_rejects_invalid_road_width(invalid: object) -> None:
    compiled = compile_track_payload(PRESET_TRACKS[0].to_payload())
    track = compiled.get("track")
    assert isinstance(track, dict)
    track["roadWidth"] = invalid

    with pytest.raises(ValueError):
        TrackGeometry.from_compiled(compiled)


def test_geometry_rejects_zero_length_centerline_segments() -> None:
    compiled = compile_track_payload(PRESET_TRACKS[0].to_payload())
    geometry = compiled.get("geometry")
    assert isinstance(geometry, dict)
    centerline = geometry.get("centerline")
    assert isinstance(centerline, list)
    assert len(centerline) > 2
    centerline[1] = centerline[0]

    with pytest.raises(ValueError, match="zero-length"):
        TrackGeometry.from_compiled(compiled)


def test_physics_step_reuses_the_swept_safe_projection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    geometry = preset_geometry("easy-oval")
    initial_projection = geometry.project((geometry.spawn.x, geometry.spawn.y))
    real_project = geometry.project
    project_calls = 0

    def counted_project(point: tuple[float, float]) -> TrackProjection:
        nonlocal project_calls
        project_calls += 1
        return real_project(point)

    monkeypatch.setattr(geometry, "project", counted_project)
    result = step_physics(
        geometry.spawn,
        Controls(steering=0.0, throttle=1.0, brake=0.0),
        VehicleSetup(),
        geometry,
        current_projection=initial_projection,
    )

    assert project_calls == 1
    assert result.projection == real_project((result.state.x, result.state.y))


@pytest.mark.parametrize("track_id", tuple(track.track_id for track in PRESET_TRACKS))
@pytest.mark.parametrize("heading_offset", (0.0, 0.37, -1.1))
def test_sensor_bounds_filter_preserves_intersections(track_id: str, heading_offset: float) -> None:
    geometry = preset_geometry(track_id)
    state = VehicleState(
        x=geometry.spawn.x,
        y=geometry.spawn.y,
        heading=geometry.spawn.heading + heading_offset,
    )

    assert geometry.sensor_distances(state) == pytest.approx(
        _unfiltered_sensor_distances(geometry, state), rel=0.0, abs=1e-12
    )


class _MutatingController:
    def __init__(self) -> None:
        self.weight = 0.0

    @property
    def name(self) -> str:
        return "mutating"

    @property
    def parameters(self) -> tuple[float, ...]:
        return (self.weight,)

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        del observation, geometry
        self.weight += 1.0
        return Controls(0.0, 0.0, 0.0)


def test_episode_rejects_controller_parameter_mutation() -> None:
    with pytest.raises(RuntimeError, match="must remain fixed"):
        evaluate_episode(
            preset_geometry("easy-oval"),
            _MutatingController(),
            max_seconds=1.0,
        )


@pytest.mark.parametrize("track_id", [track.track_id for track in PRESET_TRACKS])
def test_pure_pursuit_finishes_every_preset(track_id: str) -> None:
    result = evaluate_episode(
        preset_geometry(track_id),
        PurePursuitBaseline(),
        max_seconds=120.0,
    )

    assert result.finished is True, result.to_payload()
    assert result.termination == "lap_complete"
    assert result.collision_count == 0


def test_render_sampling_cadence_does_not_change_physics_result() -> None:
    geometry = preset_geometry("easy-oval")
    dense = evaluate_episode(
        geometry,
        PurePursuitBaseline(),
        max_seconds=120.0,
        telemetry_interval_steps=1,
    )
    sparse = evaluate_episode(
        geometry,
        PurePursuitBaseline(),
        max_seconds=120.0,
        telemetry_interval_steps=17,
    )

    assert dense.termination == sparse.termination
    assert dense.steps == sparse.steps
    assert dense.progress_fraction == sparse.progress_fraction
    assert dense.telemetry[-1].to_payload() == sparse.telemetry[-1].to_payload()


def test_random_network_baseline_is_seeded_and_fixed() -> None:
    first = evaluate_episode(
        preset_geometry("easy-oval"),
        RandomNetworkBaseline(42),
        max_seconds=2.0,
    )
    second = evaluate_episode(
        preset_geometry("easy-oval"),
        RandomNetworkBaseline(42),
        max_seconds=2.0,
    )

    assert first.controller_parameters == second.controller_parameters
    assert first.to_payload() == second.to_payload()


def test_episode_publishes_real_position_telemetry_without_changing_result() -> None:
    published: list[TelemetrySnapshot] = []
    result = evaluate_episode(
        preset_geometry("easy-oval"),
        PurePursuitBaseline(),
        max_seconds=0.2,
        telemetry_interval_steps=2,
        telemetry_callback=published.append,
    )

    assert tuple(published) == result.telemetry
    assert len(published) > 1
    payload = published[-1].to_payload()
    assert payload["x"] == pytest.approx(published[-1].state.x)
    assert payload["y"] == pytest.approx(published[-1].state.y)
    assert payload["heading"] == pytest.approx(published[-1].state.heading)


def test_shared_telemetry_fixture_round_trips_in_python() -> None:
    fixture: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    telemetry = parse_telemetry_payload(fixture)

    assert telemetry.to_payload() == fixture


@pytest.mark.parametrize(
    ("field", "invalid"),
    [
        ("selectedCarId", "   "),
        ("simulatedSeconds", -0.01),
        ("speed", -0.01),
        ("steering", 1.01),
        ("throttle", -0.01),
        ("brake", 1.01),
        ("progress", -0.01),
        ("progress", 1.01),
        ("sensorDistances", [-0.01, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]),
        ("sensorDistances", [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, SENSOR_RANGE + 0.01]),
    ],
)
def test_shared_telemetry_parser_rejects_impossible_values(
    field: str,
    invalid: object,
) -> None:
    fixture: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert isinstance(fixture, dict)
    fixture[field] = invalid

    with pytest.raises(ValueError):
        parse_telemetry_payload(fixture)


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), -1.0])
def test_episode_rejects_invalid_duration_before_stepping(invalid: float) -> None:
    with pytest.raises(ValueError, match="max_seconds"):
        evaluate_episode(
            preset_geometry("easy-oval"),
            PurePursuitBaseline(),
            max_seconds=invalid,
        )


@pytest.mark.parametrize("invalid", [0, -1, 1.5, True])
def test_episode_rejects_invalid_telemetry_interval(invalid: object) -> None:
    with pytest.raises(ValueError, match="positive integer"):
        evaluate_episode(
            preset_geometry("easy-oval"),
            PurePursuitBaseline(),
            max_seconds=0.5,
            telemetry_interval_steps=invalid,  # type: ignore[arg-type]
        )


def test_preview_contract_uses_python_track_compiler() -> None:
    response = simulate_preview_payload(
        {
            "contractVersion": 1,
            "track": PRESET_TRACKS[0].to_payload(),
            "controller": "pure-pursuit",
            "durationSeconds": 0.5,
        }
    )

    assert response["valid"] is True
    assert compile_track_payload(PRESET_TRACKS[0].to_payload())
    episode = response["episode"]
    assert isinstance(episode, dict)
    assert episode["controller"] == "pure-pursuit"
    assert episode["selectedCar"]


def test_physics_rejects_variable_time_steps() -> None:
    geometry = preset_geometry("easy-oval")
    with pytest.raises(ValueError, match="fixed 1/60"):
        step_physics(
            geometry.spawn,
            Controls(0.0, 0.0, 0.0),
            VehicleSetup(),
            geometry,
            dt=FIXED_TIME_STEP * 2.0,
        )
