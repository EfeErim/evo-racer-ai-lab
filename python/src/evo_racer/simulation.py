"""Deterministic arcade physics, sensing, evaluation, and baselines."""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final, Protocol

from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

# Physics revision recorded on saved results. Version 2 lowered drag and added the corner limit.
SIMULATION_CONTRACT_VERSION: Final = 2
FIXED_TIME_STEP: Final = 1.0 / 60.0
DRAG_COEFFICIENT: Final = 0.004
CORNER_GRIP_BASE: Final = 6.0
CORNER_GRIP_PER_RECOVERY: Final = 1.0
VEHICLE_RADIUS: Final = 0.8
SENSOR_RANGE: Final = 36.0
SENSOR_ANGLES: Final[tuple[float, ...]] = tuple(
    math.radians(degrees) for degrees in (-75.0, -45.0, -22.5, 0.0, 22.5, 45.0, 75.0)
)
TELEMETRY_INTERVAL_STEPS: Final = 30
type TracePose = tuple[float, float, float, float, float]
"""Presentation-only pose: simulated seconds, x, y, heading, forward speed."""
type Point = tuple[float, float]


@dataclass(frozen=True, slots=True)
class VehicleSetup:
    """Episode-fixed arcade vehicle parameters."""

    max_speed: float = 34.0
    acceleration: float = 8.0
    brake_strength: float = 12.0
    steering_agility: float = 1.35
    grip_recovery: float = 5.0
    front_brake_bias: float = 0.58
    front_drive_bias: float = 0.5

    def __post_init__(self) -> None:
        positive = (
            self.max_speed,
            self.acceleration,
            self.brake_strength,
            self.steering_agility,
            self.grip_recovery,
        )
        if any(not math.isfinite(value) or value <= 0.0 for value in positive):
            raise ValueError("Vehicle performance values must be finite and positive.")
        if not 0.0 <= self.front_brake_bias <= 1.0:
            raise ValueError("front_brake_bias must stay in [0,1].")
        if not 0.0 <= self.front_drive_bias <= 1.0:
            raise ValueError("front_drive_bias must stay in [0,1].")

    def to_payload(self) -> dict[str, float]:
        """Return stable public field names for telemetry and evidence."""
        return {
            "maxSpeed": self.max_speed,
            "acceleration": self.acceleration,
            "brakeStrength": self.brake_strength,
            "steeringAgility": self.steering_agility,
            "gripRecovery": self.grip_recovery,
            "frontBrakeBias": self.front_brake_bias,
            "frontDriveBias": self.front_drive_bias,
        }


@dataclass(frozen=True, slots=True)
class Controls:
    """Continuous controller outputs."""

    steering: float
    throttle: float
    brake: float

    def __post_init__(self) -> None:
        if any(not math.isfinite(value) for value in (self.steering, self.throttle, self.brake)):
            raise ValueError("Controller outputs must be finite.")

    def clamped(self) -> Controls:
        """Clamp untrusted controller output to the product ranges."""
        return Controls(
            steering=_clamp(self.steering, -1.0, 1.0),
            throttle=_clamp(self.throttle, 0.0, 1.0),
            brake=_clamp(self.brake, 0.0, 1.0),
        )


@dataclass(frozen=True, slots=True)
class VehicleState:
    """Minimal product-contract vehicle state."""

    x: float
    y: float
    heading: float
    forward_speed: float = 0.0
    lateral_speed: float = 0.0
    steering: float = 0.0

    def __post_init__(self) -> None:
        values = (
            self.x,
            self.y,
            self.heading,
            self.forward_speed,
            self.lateral_speed,
            self.steering,
        )
        if any(not math.isfinite(value) for value in values):
            raise ValueError("Vehicle state values must be finite.")
        if self.forward_speed < 0.0:
            raise ValueError("Vehicle forward speed cannot be negative.")
        if not -1.0 <= self.steering <= 1.0:
            raise ValueError("Vehicle steering must stay in [-1,1].")


@dataclass(frozen=True, slots=True)
class TrackProjection:
    """Closest centerline location and tangent."""

    point: Point
    distance: float
    path_distance: float
    tangent_heading: float


@dataclass(frozen=True, slots=True)
class Observation:
    """Controller-facing deterministic observation."""

    state: VehicleState
    progress_distance: float
    progress_fraction: float
    heading_error: float
    sensor_distances: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class StepResult:
    """One fixed physics step and its collision status."""

    state: VehicleState
    controls: Controls
    collided: bool
    projection: TrackProjection


@dataclass(frozen=True, slots=True)
class TelemetrySnapshot:
    """Versioned selected-car telemetry at one simulated instant."""

    selected_car_id: str
    simulated_seconds: float
    state: VehicleState
    controls: Controls
    progress_fraction: float
    sensor_distances: tuple[float, ...]

    def __post_init__(self) -> None:
        if not self.selected_car_id:
            raise ValueError("Selected car id must be non-empty.")
        if not math.isfinite(self.simulated_seconds) or self.simulated_seconds < 0.0:
            raise ValueError("Telemetry time must be finite and non-negative.")
        if not -1.0 <= self.controls.steering <= 1.0:
            raise ValueError("Telemetry steering must stay in [-1,1].")
        if not 0.0 <= self.controls.throttle <= 1.0:
            raise ValueError("Telemetry throttle must stay in [0,1].")
        if not 0.0 <= self.controls.brake <= 1.0:
            raise ValueError("Telemetry brake must stay in [0,1].")
        if not math.isfinite(self.progress_fraction) or not 0.0 <= self.progress_fraction <= 1.0:
            raise ValueError("Telemetry progress must stay in [0,1].")
        if len(self.sensor_distances) != len(SENSOR_ANGLES) or any(
            not math.isfinite(distance) or not 0.0 <= distance <= SENSOR_RANGE
            for distance in self.sensor_distances
        ):
            raise ValueError("Telemetry sensors must contain seven distances in range.")

    def to_payload(self) -> dict[str, object]:
        """Serialize telemetry for the TypeScript observer UI."""
        return {
            "selectedCarId": self.selected_car_id,
            "simulatedSeconds": _rounded(self.simulated_seconds),
            "x": _rounded(self.state.x),
            "y": _rounded(self.state.y),
            "heading": _rounded(self.state.heading),
            "speed": _rounded(self.state.forward_speed),
            "lateralSpeed": _rounded(self.state.lateral_speed),
            "steering": _rounded(self.controls.steering),
            "throttle": _rounded(self.controls.throttle),
            "brake": _rounded(self.controls.brake),
            "progress": _rounded(self.progress_fraction),
            "sensorDistances": [_rounded(distance) for distance in self.sensor_distances],
        }


@dataclass(frozen=True, slots=True)
class EpisodeResult:
    """Complete deterministic episode outcome."""

    controller: str
    termination: str
    finished: bool
    steps: int
    simulated_seconds: float
    progress_fraction: float
    collision_count: int
    setup: VehicleSetup
    controller_parameters: tuple[float, ...]
    telemetry: tuple[TelemetrySnapshot, ...]
    trace: tuple[TracePose, ...] = ()

    def to_payload(self) -> dict[str, object]:
        """Serialize a compact baseline or preview result."""
        selected = self.telemetry[-1]
        return {
            "controller": self.controller,
            "termination": self.termination,
            "finished": self.finished,
            "steps": self.steps,
            "simulatedSeconds": _rounded(self.simulated_seconds),
            "progress": _rounded(self.progress_fraction),
            "collisionCount": self.collision_count,
            "vehicleSetup": self.setup.to_payload(),
            "selectedCar": selected.to_payload(),
        }


class Controller(Protocol):
    """Episode controller whose parameters must remain immutable."""

    @property
    def name(self) -> str: ...

    @property
    def parameters(self) -> tuple[float, ...]: ...

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls: ...


class TrackGeometry:
    """Derived simulation geometry built from the canonical Python compiler."""

    def __init__(
        self,
        centerline: tuple[Point, ...],
        left_boundary: tuple[Point, ...],
        right_boundary: tuple[Point, ...],
        road_width: float,
        spawn: VehicleState,
    ) -> None:
        if len(centerline) < 3 or centerline[0] != centerline[-1]:
            raise ValueError("Simulation centerline must be a closed loop.")
        if (
            not isinstance(road_width, (int, float))
            or isinstance(road_width, bool)
            or not math.isfinite(float(road_width))
            or road_width <= 0.0
        ):
            raise ValueError("Simulation road width must be finite and positive.")
        if any(len(boundary) < 2 for boundary in (left_boundary, right_boundary)):
            raise ValueError("Simulation boundaries must contain line segments.")
        self.centerline = centerline
        self.boundaries = (left_boundary, right_boundary)
        self.road_width = road_width
        self.spawn = spawn
        cumulative = [0.0]
        centerline_segments: list[tuple[float, float, float, float, float, float, float]] = []
        for start, end in zip(centerline, centerline[1:], strict=False):
            segment_x = end[0] - start[0]
            segment_y = end[1] - start[1]
            length_squared = segment_x * segment_x + segment_y * segment_y
            if length_squared <= 0.0:
                raise ValueError("Simulation centerline cannot contain zero-length segments.")
            cumulative.append(cumulative[-1] + math.dist(start, end))
            centerline_segments.append(
                (
                    start[0],
                    start[1],
                    segment_x,
                    segment_y,
                    length_squared,
                    math.sqrt(length_squared),
                    math.atan2(segment_y, segment_x),
                )
            )
        self.cumulative_distances = tuple(cumulative)
        self.length = cumulative[-1]
        self.centerline_segments = tuple(centerline_segments)
        self.boundary_segments = tuple(
            (
                start[0],
                start[1],
                end[0] - start[0],
                end[1] - start[1],
                min(start[0], end[0]),
                max(start[0], end[0]),
                min(start[1], end[1]),
                max(start[1], end[1]),
            )
            for boundary in self.boundaries
            for start, end in zip(boundary, boundary[1:], strict=False)
        )

    @classmethod
    def from_compiled(cls, compiled: dict[str, object]) -> TrackGeometry:
        """Build from Python-owned compiler output."""
        geometry_value = compiled.get("geometry")
        track_value = compiled.get("track")
        if not isinstance(geometry_value, dict) or not isinstance(track_value, dict):
            raise ValueError("Compiled track geometry is missing.")
        centerline_value = geometry_value.get("centerline")
        left_boundary_value = geometry_value.get("leftBoundary")
        right_boundary_value = geometry_value.get("rightBoundary")
        spawn_value = geometry_value.get("spawnPose")
        road_width_value = track_value.get("roadWidth")
        if (
            not isinstance(centerline_value, list)
            or not isinstance(left_boundary_value, list)
            or not isinstance(right_boundary_value, list)
            or not isinstance(spawn_value, dict)
            or not isinstance(road_width_value, (int, float))
            or isinstance(road_width_value, bool)
        ):
            raise ValueError("Compiled track geometry has an invalid shape.")
        centerline = tuple(_parse_point(point) for point in centerline_value)
        left_boundary = tuple(_parse_point(point) for point in left_boundary_value)
        right_boundary = tuple(_parse_point(point) for point in right_boundary_value)
        x = _finite_number(spawn_value.get("x"), "spawnPose.x")
        y = _finite_number(spawn_value.get("y"), "spawnPose.y")
        heading = _finite_number(spawn_value.get("heading"), "spawnPose.heading")
        return cls(
            centerline=centerline,
            left_boundary=left_boundary,
            right_boundary=right_boundary,
            road_width=float(road_width_value),
            spawn=VehicleState(x=x, y=y, heading=heading),
        )

    def project(self, point: Point) -> TrackProjection:
        """Project a point onto the closest closed centerline segment."""
        best_point: Point | None = None
        best_distance_squared = math.inf
        best_path_distance = 0.0
        best_tangent_heading = 0.0
        for index, (
            start_x,
            start_y,
            segment_x,
            segment_y,
            length_squared,
            segment_length,
            tangent_heading,
        ) in enumerate(self.centerline_segments):
            if length_squared == 0.0:
                continue
            offset_x = point[0] - start_x
            offset_y = point[1] - start_y
            along = _clamp(
                (offset_x * segment_x + offset_y * segment_y) / length_squared,
                0.0,
                1.0,
            )
            closest = (start_x + segment_x * along, start_y + segment_y * along)
            distance_x = point[0] - closest[0]
            distance_y = point[1] - closest[1]
            distance_squared = distance_x * distance_x + distance_y * distance_y
            if distance_squared < best_distance_squared:
                best_point = closest
                best_distance_squared = distance_squared
                best_path_distance = self.cumulative_distances[index] + segment_length * along
                best_tangent_heading = tangent_heading
        if best_point is None:
            raise ValueError("Track contains no usable centerline segment.")
        return TrackProjection(
            point=best_point,
            distance=math.sqrt(best_distance_squared),
            path_distance=best_path_distance,
            tangent_heading=best_tangent_heading,
        )

    def point_at(self, path_distance: float) -> Point:
        """Interpolate a point at wrapped distance around the loop."""
        wrapped = path_distance % self.length
        for index, end_distance in enumerate(self.cumulative_distances[1:]):
            if wrapped <= end_distance:
                start_distance = self.cumulative_distances[index]
                segment_length = end_distance - start_distance
                amount = (
                    0.0 if segment_length == 0.0 else (wrapped - start_distance) / segment_length
                )
                start = self.centerline[index]
                end = self.centerline[index + 1]
                return (
                    start[0] + (end[0] - start[0]) * amount,
                    start[1] + (end[1] - start[1]) * amount,
                )
        return self.centerline[0]

    def on_road(self, point: Point) -> bool:
        """Check the vehicle-disc center against the track corridor."""
        return self.project(point).distance <= self.road_width / 2.0 - VEHICLE_RADIUS

    def _sweep_with_projection(
        self,
        start: Point,
        end: Point,
        start_projection: TrackProjection | None,
    ) -> tuple[Point, bool, TrackProjection]:
        """Sweep once and retain the projection of the returned safe point."""
        distance = math.dist(start, end)
        sample_count = max(1, math.ceil(distance / 0.2))
        last_safe = start
        last_projection = start_projection if start_projection is not None else self.project(start)
        for sample in range(1, sample_count + 1):
            amount = sample / sample_count
            point = (
                start[0] + (end[0] - start[0]) * amount,
                start[1] + (end[1] - start[1]) * amount,
            )
            projection = self.project(point)
            if projection.distance > self.road_width / 2.0 - VEHICLE_RADIUS:
                return last_safe, True, last_projection
            last_safe = point
            last_projection = projection
        return end, False, last_projection

    def sensor_distances(self, state: VehicleState) -> tuple[float, ...]:
        """Intersect deterministic rays with Python-derived road boundaries."""
        distances: list[float] = []
        search_min_x = state.x - SENSOR_RANGE
        search_max_x = state.x + SENSOR_RANGE
        search_min_y = state.y - SENSOR_RANGE
        search_max_y = state.y + SENSOR_RANGE
        nearby_segments = tuple(
            segment
            for segment in self.boundary_segments
            if not (
                segment[5] < search_min_x
                or segment[4] > search_max_x
                or segment[7] < search_min_y
                or segment[6] > search_max_y
            )
        )
        for angle in SENSOR_ANGLES:
            heading = state.heading + angle
            direction_x = math.cos(heading)
            direction_y = math.sin(heading)
            ray_end_x = state.x + direction_x * SENSOR_RANGE
            ray_end_y = state.y + direction_y * SENSOR_RANGE
            ray_min_x = min(state.x, ray_end_x)
            ray_max_x = max(state.x, ray_end_x)
            ray_min_y = min(state.y, ray_end_y)
            ray_max_y = max(state.y, ray_end_y)
            nearest = SENSOR_RANGE
            for (
                start_x,
                start_y,
                segment_x,
                segment_y,
                segment_min_x,
                segment_max_x,
                segment_min_y,
                segment_max_y,
            ) in nearby_segments:
                if (
                    segment_max_x < ray_min_x
                    or segment_min_x > ray_max_x
                    or segment_max_y < ray_min_y
                    or segment_min_y > ray_max_y
                ):
                    continue
                offset_x = start_x - state.x
                offset_y = start_y - state.y
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


class PurePursuitBaseline:
    """Lookahead path tracker based on Coulter's Pure Pursuit method."""

    def __init__(self, lookahead_base: float = 5.0, lookahead_speed_gain: float = 0.3) -> None:
        self._parameters: tuple[float, ...] = (lookahead_base, lookahead_speed_gain)

    @property
    def name(self) -> str:
        return "pure-pursuit"

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._parameters

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        lookahead = self._parameters[0] + observation.state.forward_speed * self._parameters[1]
        target = geometry.point_at(observation.progress_distance + lookahead)
        target_heading = math.atan2(
            target[1] - observation.state.y,
            target[0] - observation.state.x,
        )
        heading_error = _signed_heading_delta(target_heading, observation.state.heading)
        steering = _clamp(heading_error * 1.8, -1.0, 1.0)
        corner = abs(steering)
        target_speed = 10.0 + 18.0 * (1.0 - corner) ** 2
        speed_error = target_speed - observation.state.forward_speed
        throttle = _clamp(speed_error / 6.0, 0.0, 1.0)
        brake = _clamp(-speed_error / 8.0, 0.0, 1.0)
        return Controls(steering=steering, throttle=throttle, brake=brake)


class SetupAwarePurePursuit(PurePursuitBaseline):
    """Pure Pursuit steering with a speed policy fitted to one vehicle setup.

    Evolved setups can turn far less sharply than the default car, so fixed speed
    targets crash a reference that was never given the chance to drive that car.
    This policy brakes for upcoming curvature using the setup's own turn rate.
    `caution` scales the radius it plans for: lower is slower and safer.
    """

    def __init__(self, setup: VehicleSetup, caution: float) -> None:
        super().__init__()
        self._setup = setup
        self._caution = caution
        self._parameters = (*self._parameters, caution)

    def _corner_speed(self, curvature: float) -> float:
        """Speed at which this setup's full-lock turn matches the planned radius."""
        radius = self._caution / curvature
        grip_speed = math.sqrt(corner_grip(self._setup) * radius)
        reach = radius * self._setup.steering_agility
        remainder = 1.0 - 1.3 * reach / self._setup.max_speed
        if remainder <= 0.0:
            return min(self._setup.max_speed, grip_speed)
        return min(self._setup.max_speed, grip_speed, 0.2 * reach / remainder)

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        speed = observation.state.forward_speed
        progress = observation.progress_distance
        target = geometry.point_at(progress + 5.0 + 0.3 * speed)
        heading_error = _signed_heading_delta(
            math.atan2(target[1] - observation.state.y, target[0] - observation.state.x),
            observation.state.heading,
        )
        steering = _clamp(heading_error * 1.8, -1.0, 1.0)

        braking = max(1.0, self._setup.brake_strength * 0.6)
        horizon = speed * speed / (2.0 * braking) + 6.0
        limit = self._setup.max_speed
        sample = 3.0
        before = geometry.point_at(progress)
        current = geometry.point_at(progress + sample)
        heading = math.atan2(current[1] - before[1], current[0] - before[0])
        ahead = 0.0
        while ahead < horizon:
            following = geometry.point_at(progress + ahead + 2.0 * sample)
            next_heading = math.atan2(following[1] - current[1], following[0] - current[0])
            curvature = abs(_signed_heading_delta(next_heading, heading)) / sample
            if curvature > 1e-4:
                corner = max(2.5, self._corner_speed(curvature))
                limit = min(limit, math.sqrt(corner * corner + 2.0 * braking * ahead))
            heading, current = next_heading, following
            ahead += sample

        target_speed = max(2.5, limit * (1.0 - 0.5 * abs(steering)))
        speed_error = target_speed - speed
        return Controls(
            steering=steering,
            throttle=_clamp(speed_error / 4.0, 0.0, 1.0),
            brake=_clamp(-speed_error / 4.0, 0.0, 1.0),
        )


class RandomNetworkBaseline:
    """Deterministic random fixed-weight controller baseline."""

    def __init__(self, seed: int) -> None:
        generator = random.Random(seed)
        self._parameters = tuple(generator.uniform(-1.0, 1.0) for _ in range(33))

    @property
    def name(self) -> str:
        return "random-network"

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._parameters

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        del geometry
        features = (
            observation.state.forward_speed / 34.0,
            observation.state.lateral_speed / 10.0,
            observation.heading_error / math.pi,
            *(distance / SENSOR_RANGE for distance in observation.sensor_distances),
        )
        outputs: list[float] = []
        width = len(features)
        for output_index in range(3):
            offset = output_index * (width + 1)
            total = self._parameters[offset + width]
            total += sum(
                feature * self._parameters[offset + index] for index, feature in enumerate(features)
            )
            outputs.append(total)
        return Controls(
            steering=math.tanh(outputs[0]),
            throttle=_sigmoid(outputs[1]),
            brake=_sigmoid(outputs[2]),
        )


def corner_grip(setup: VehicleSetup) -> float:
    """Sideways acceleration this setup can hold in a corner, in m/s²."""
    return CORNER_GRIP_BASE + CORNER_GRIP_PER_RECOVERY * setup.grip_recovery


def step_physics(
    state: VehicleState,
    controls: Controls,
    setup: VehicleSetup,
    geometry: TrackGeometry,
    *,
    dt: float = FIXED_TIME_STEP,
    current_projection: TrackProjection | None = None,
) -> StepResult:
    """Advance exactly one fixed arcade-physics step."""
    if dt != FIXED_TIME_STEP:
        raise ValueError("Physics accepts only the fixed 1/60 s step.")
    controls = controls.clamped()
    steering = _move_toward(state.steering, controls.steering, 5.0 * dt)

    front_drive = controls.throttle * setup.front_drive_bias
    rear_drive = controls.throttle * (1.0 - setup.front_drive_bias)
    front_brake = controls.brake * setup.front_brake_bias
    rear_brake = controls.brake * (1.0 - setup.front_brake_bias)

    drive_understeer = 1.0 - 0.18 * front_drive
    brake_understeer = 1.0 - 0.16 * front_brake
    rear_slip = 1.0 + 0.55 * rear_drive + 0.7 * rear_brake

    speed_ratio = _clamp(state.forward_speed / setup.max_speed, 0.0, 1.0)
    drive_force = setup.acceleration * controls.throttle * (1.0 - speed_ratio)
    braking_force = setup.brake_strength * controls.brake
    drag_force = DRAG_COEFFICIENT * state.forward_speed * state.forward_speed
    forward_speed = _clamp(
        state.forward_speed + (drive_force - braking_force - drag_force) * dt,
        0.0,
        setup.max_speed,
    )

    lateral_force = -steering * forward_speed * 0.75 * rear_slip
    lateral_speed = (state.lateral_speed + lateral_force * dt) * math.exp(-setup.grip_recovery * dt)
    heading_rate = (
        steering
        * setup.steering_agility
        * (0.2 + 1.3 * speed_ratio)
        * drive_understeer
        * brake_understeer
    )
    if forward_speed > 1e-6:
        turn_limit = corner_grip(setup) / forward_speed
        heading_rate = _clamp(heading_rate, -turn_limit, turn_limit)
    heading = (state.heading + heading_rate * dt) % (2.0 * math.pi)

    velocity_x = math.cos(heading) * forward_speed - math.sin(heading) * lateral_speed
    velocity_y = math.sin(heading) * forward_speed + math.cos(heading) * lateral_speed
    candidate = (state.x + velocity_x * dt, state.y + velocity_y * dt)
    position, collided, projection = geometry._sweep_with_projection(
        (state.x, state.y), candidate, current_projection
    )
    if collided:
        forward_speed = 0.0
        lateral_speed = 0.0

    return StepResult(
        state=VehicleState(
            x=position[0],
            y=position[1],
            heading=heading,
            forward_speed=forward_speed,
            lateral_speed=lateral_speed,
            steering=steering,
        ),
        controls=controls,
        collided=collided,
        projection=projection,
    )


def episode_step_limit(max_seconds: float) -> int:
    """Number of fixed physics steps in an episode time limit."""
    return round(max_seconds / FIXED_TIME_STEP)


def evaluate_episode(
    geometry: TrackGeometry,
    controller: Controller,
    setup: VehicleSetup | None = None,
    *,
    max_seconds: float = 120.0,
    selected_car_id: str = "baseline-01",
    telemetry_interval_steps: int = TELEMETRY_INTERVAL_STEPS,
    telemetry_callback: Callable[[TelemetrySnapshot], None] | None = None,
    trace_interval_steps: int | None = None,
) -> EpisodeResult:
    """Run one deterministic episode independently of render cadence.

    ``trace_interval_steps`` records a dense presentation-only pose trace. It
    reads the state after each step and never feeds anything back.
    """
    if (
        not isinstance(max_seconds, (int, float))
        or isinstance(max_seconds, bool)
        or not math.isfinite(float(max_seconds))
    ):
        raise ValueError("max_seconds must be a finite number.")
    if (
        not isinstance(telemetry_interval_steps, int)
        or isinstance(telemetry_interval_steps, bool)
        or telemetry_interval_steps <= 0
    ):
        raise ValueError("telemetry_interval_steps must be a positive integer.")
    if trace_interval_steps is not None and (
        not isinstance(trace_interval_steps, int)
        or isinstance(trace_interval_steps, bool)
        or trace_interval_steps <= 0
    ):
        raise ValueError("trace_interval_steps must be a positive integer.")
    max_steps = episode_step_limit(max_seconds)
    if max_steps <= 0:
        raise ValueError("max_seconds must include at least one fixed step.")
    state = geometry.spawn
    projection = geometry.project((state.x, state.y))
    previous_path_distance = projection.path_distance
    travelled_progress = 0.0
    best_progress = 0.0
    collision_count = 0
    fixed_setup = setup if setup is not None else VehicleSetup()
    fixed_parameters = controller.parameters
    telemetry: list[TelemetrySnapshot] = []
    trace: list[TracePose] = (
        []
        if trace_interval_steps is None
        else [(0.0, state.x, state.y, state.heading, state.forward_speed)]
    )
    controls = Controls(0.0, 0.0, 0.0)
    termination = "timeout"
    steps = 0

    for step_index in range(max_steps):
        sensors = geometry.sensor_distances(state)
        observation = Observation(
            state=state,
            progress_distance=projection.path_distance,
            progress_fraction=_clamp(best_progress / geometry.length, 0.0, 1.0),
            heading_error=_signed_heading_delta(projection.tangent_heading, state.heading),
            sensor_distances=sensors,
        )
        controls = controller.control(observation, geometry).clamped()
        if controller.parameters != fixed_parameters:
            raise RuntimeError("Controller and vehicle parameters must remain fixed in an episode.")

        result = step_physics(
            state,
            controls,
            fixed_setup,
            geometry,
            current_projection=projection,
        )
        state = result.state
        steps = step_index + 1
        next_projection = result.projection
        delta = next_projection.path_distance - previous_path_distance
        if delta < -geometry.length / 2.0:
            delta += geometry.length
        elif delta > geometry.length / 2.0:
            delta -= geometry.length
        travelled_progress += delta
        best_progress = max(best_progress, travelled_progress)
        previous_path_distance = next_projection.path_distance
        projection = next_projection

        if trace_interval_steps is not None and (
            steps % trace_interval_steps == 0
            or result.collided
            or travelled_progress >= geometry.length
            or steps == max_steps
        ):
            trace.append(
                (steps * FIXED_TIME_STEP, state.x, state.y, state.heading, state.forward_speed)
            )

        if step_index % telemetry_interval_steps == 0 or result.collided:
            snapshot = TelemetrySnapshot(
                selected_car_id=selected_car_id,
                simulated_seconds=steps * FIXED_TIME_STEP,
                state=state,
                controls=controls,
                progress_fraction=_clamp(best_progress / geometry.length, 0.0, 1.0),
                sensor_distances=geometry.sensor_distances(state),
            )
            telemetry.append(snapshot)
            if telemetry_callback is not None:
                telemetry_callback(snapshot)

        if result.collided:
            collision_count += 1
            termination = "collision"
            break
        if travelled_progress >= geometry.length:
            termination = "lap_complete"
            break

    if not telemetry or telemetry[-1].simulated_seconds != steps * FIXED_TIME_STEP:
        snapshot = TelemetrySnapshot(
            selected_car_id=selected_car_id,
            simulated_seconds=steps * FIXED_TIME_STEP,
            state=state,
            controls=controls,
            progress_fraction=_clamp(best_progress / geometry.length, 0.0, 1.0),
            sensor_distances=geometry.sensor_distances(state),
        )
        telemetry.append(snapshot)
        if telemetry_callback is not None:
            telemetry_callback(snapshot)

    return EpisodeResult(
        controller=controller.name,
        termination=termination,
        finished=termination == "lap_complete",
        steps=steps,
        simulated_seconds=steps * FIXED_TIME_STEP,
        progress_fraction=_clamp(best_progress / geometry.length, 0.0, 1.0),
        collision_count=collision_count,
        setup=fixed_setup,
        controller_parameters=fixed_parameters,
        telemetry=tuple(telemetry),
        trace=tuple(trace),
    )


def preset_geometry(track_id: str) -> TrackGeometry:
    """Compile a bundled preset through the canonical public compiler."""
    track = next((candidate for candidate in PRESET_TRACKS if candidate.track_id == track_id), None)
    if track is None:
        raise ValueError(f"Unknown preset: {track_id}")
    return TrackGeometry.from_compiled(compile_track_payload(track.to_payload()))


def _parse_point(value: object) -> Point:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("Geometry point must contain two numbers.")
    return (_finite_number(value[0], "point.x"), _finite_number(value[1], "point.y"))


def _finite_number(value: object, field: str) -> float:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(float(value))
    ):
        raise ValueError(f"{field} must be a finite number.")
    return float(value)


def _move_toward(value: float, target: float, maximum_delta: float) -> float:
    if abs(target - value) <= maximum_delta:
        return target
    return value + math.copysign(maximum_delta, target - value)


def _signed_heading_delta(heading: float, target: float) -> float:
    return (heading - target + math.pi) % (2.0 * math.pi) - math.pi


def _sigmoid(value: float) -> float:
    if value >= 0.0:
        return 1.0 / (1.0 + math.exp(-value))
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _rounded(value: float) -> float:
    rounded = round(value, 6)
    return 0.0 if rounded == 0.0 else rounded
