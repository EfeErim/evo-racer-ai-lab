"""Presentation-only insight into a generation race: neuron activity and lap times.

Nothing here feeds back into evolution. The leader's episode is replayed once
with a recording wrapper that returns exactly the controls of the real
controller, so the recorded neuron values belong to the race that is shown.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Final

from evo_racer.evolution import (
    NETWORK_HIDDEN_COUNT,
    NETWORK_INPUT_COUNT,
    NETWORK_OUTPUT_COUNT,
    FixedCandidate,
    ScoredCandidate,
    controller_features,
)
from evo_racer.neat_evolution import NEATCandidate, NEATScoredCandidate
from evo_racer.simulation import (
    CORNER_GRIP_BASE,
    CORNER_GRIP_PER_RECOVERY,
    DRAG_COEFFICIENT,
    FIXED_TIME_STEP,
    SENSOR_ANGLES,
    TURN_RATE_AT_REST,
    TURN_RATE_PER_SPEED,
    Controller,
    Controls,
    EpisodeResult,
    Observation,
    TrackGeometry,
    VehicleSetup,
    evaluate_episode,
)

type Point = tuple[float, float]
type Candidate = FixedCandidate | NEATCandidate
type Scored = ScoredCandidate | NEATScoredCandidate

INPUT_LABELS: Final[tuple[str, ...]] = (
    "Speed",
    "Side slip",
    "Heading error",
    *(f"Ray {round(math.degrees(angle)):+d}°" for angle in SENSOR_ANGLES),
)
OUTPUT_LABELS: Final[tuple[str, ...]] = ("Steering", "Throttle", "Brake")
TARGET_LAP_METHOD: Final = "reference-line-speed-profile-v1"
_PROFILE_SUBSTEP_METERS: Final = 0.25


class _RecordingController:
    """Delegates every decision unchanged and records the network's node values."""

    def __init__(
        self,
        inner: Controller,
        trace_nodes: Callable[[Sequence[float], Controls], list[float]],
    ) -> None:
        self._inner = inner
        self._trace_nodes = trace_nodes
        self.records: list[list[float]] = []

    @property
    def name(self) -> str:
        return self._inner.name

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._inner.parameters

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        controls = self._inner.control(observation, geometry)
        self.records.append(self._trace_nodes(controller_features(observation), controls))
        return controls


def _controls_values(controls: Controls) -> list[float]:
    clamped = controls.clamped()
    return [clamped.steering, clamped.throttle, clamped.brake]


def _network_layout(
    candidate: Candidate,
) -> tuple[
    list[dict[str, object]],
    list[dict[str, object]],
    Callable[[Sequence[float], Controls], list[float]],
]:
    """Describe the candidate's network and how to read its node values."""
    nodes: list[dict[str, object]] = [
        {"kind": "input", "label": label, "layer": 0} for label in INPUT_LABELS
    ]
    links: list[dict[str, object]] = []
    if isinstance(candidate, FixedCandidate):
        network = candidate.genome.network
        parameters = network.parameters
        for index in range(NETWORK_HIDDEN_COUNT):
            nodes.append({"kind": "hidden", "label": f"H{index + 1}", "layer": 1})
        for label in OUTPUT_LABELS:
            nodes.append({"kind": "output", "label": label, "layer": 2})
        hidden_offset = NETWORK_INPUT_COUNT
        output_offset = NETWORK_INPUT_COUNT + NETWORK_HIDDEN_COUNT
        for hidden in range(NETWORK_HIDDEN_COUNT):
            for source in range(NETWORK_INPUT_COUNT):
                links.append(
                    {
                        "from": source,
                        "to": hidden_offset + hidden,
                        "weight": parameters[hidden * NETWORK_INPUT_COUNT + source],
                    }
                )
        output_weight_offset = NETWORK_INPUT_COUNT * NETWORK_HIDDEN_COUNT + NETWORK_HIDDEN_COUNT
        for output in range(NETWORK_OUTPUT_COUNT):
            for hidden in range(NETWORK_HIDDEN_COUNT):
                links.append(
                    {
                        "from": hidden_offset + hidden,
                        "to": output_offset + output,
                        "weight": parameters[
                            output_weight_offset + output * NETWORK_HIDDEN_COUNT + hidden
                        ],
                    }
                )

        def trace_fixed(features: Sequence[float], controls: Controls) -> list[float]:
            hidden_values, _ = network.layer_values(features)
            return [*features, *hidden_values, *_controls_values(controls)]

        return nodes, links, trace_fixed

    compiled = candidate.network
    index_of = {key: index for index, key in enumerate(compiled.input_keys)}
    layer_of = dict.fromkeys(compiled.input_keys, 0)
    hidden_nodes = [node for node in compiled.nodes if node.key not in compiled.output_keys]
    for node in compiled.nodes:
        layer_of[node.key] = 1 + max((layer_of[link.source] for link in node.links), default=0)
    output_layer = 1 + max(
        (layer_of[node.key] for node in hidden_nodes),
        default=0,
    )
    for position, node in enumerate(hidden_nodes):
        index_of[node.key] = len(nodes)
        nodes.append({"kind": "hidden", "label": f"H{position + 1}", "layer": layer_of[node.key]})
    for key, label in zip(compiled.output_keys, OUTPUT_LABELS, strict=True):
        index_of[key] = len(nodes)
        nodes.append({"kind": "output", "label": label, "layer": output_layer})
    for node in compiled.nodes:
        for link in node.links:
            links.append(
                {"from": index_of[link.source], "to": index_of[node.key], "weight": link.weight}
            )
    hidden_keys = tuple(node.key for node in hidden_nodes)

    def trace_neat(features: Sequence[float], controls: Controls) -> list[float]:
        values = compiled.node_values(features)
        return [*features, *(values[key] for key in hidden_keys), *_controls_values(controls)]

    return nodes, links, trace_neat


def leader_network_payload(
    geometry: TrackGeometry,
    candidate: Candidate,
    episode: EpisodeResult,
    *,
    max_seconds: float,
    trace_interval_steps: int,
) -> dict[str, object] | None:
    """Neuron values of the race leader, one row per recorded race pose."""
    nodes, links, trace_nodes = _network_layout(candidate)
    recorder = _RecordingController(candidate.controller, trace_nodes)
    replayed = evaluate_episode(
        geometry,
        recorder,
        candidate.setup,
        max_seconds=max_seconds,
        selected_car_id=candidate.candidate_id,
        trace_interval_steps=trace_interval_steps,
    )
    if replayed.trace != episode.trace or not recorder.records:
        return None
    activations: list[float] = []
    for seconds, *_ in episode.trace:
        step = round(seconds / FIXED_TIME_STEP)
        record = recorder.records[min(max(step - 1, 0), len(recorder.records) - 1)]
        activations.extend(round(value, 3) for value in record)
    return {
        "candidateId": candidate.candidate_id,
        "nodes": nodes,
        "links": [{**link, "weight": round(float(link["weight"]), 3)} for link in links],  # type: ignore[arg-type]
        "activations": activations,
    }


def lap_seconds(steps: int, finished: bool) -> float | None:
    """Lap time of a finished attempt, else ``None``."""
    return round(steps * FIXED_TIME_STEP, 3) if finished else None


def lap_record_payload(
    generations: Sequence[tuple[int, Sequence[Scored]]],
) -> dict[str, object]:
    """Best finished lap per generation and the fastest lap of the run so far."""
    history: list[dict[str, object]] = []
    record: dict[str, object] | None = None
    for generation, results in generations:
        best: tuple[int, str] | None = None
        for scored in results:
            evaluation = scored.evaluation
            if evaluation.finished:
                key = (evaluation.steps, scored.candidate.candidate_id)
                best = key if best is None or key < best else best
        seconds = None if best is None else lap_seconds(best[0], True)
        history.append({"generation": generation, "bestLapSeconds": seconds})
        if best is not None and (record is None or best[0] < record["steps"]):  # type: ignore[operator]
            record = {
                "steps": best[0],
                "seconds": seconds,
                "generation": generation,
                "candidateId": best[1],
            }
    return {
        "record": None
        if record is None
        else {key: value for key, value in record.items() if key != "steps"},
        "history": history,
    }


def target_lap_seconds(
    geometry: TrackGeometry,
    setup: VehicleSetup,
    reference: Sequence[Point],
) -> float | None:
    """Estimate a standing-start lap for one setup on the reference line.

    The profile drives the closed reference line from the point nearest the
    spawn. Corner speed is limited by the arcade grip and turn-rate limits of
    ``step_physics``; straights use its drive, brake and drag terms. Lateral
    slip and steering lag are ignored, so this is an estimate, not a bound.
    """
    ring = list(reference[:-1] if reference and reference[0] == reference[-1] else reference)
    if len(ring) < 3:
        return None
    spawn = (geometry.spawn.x, geometry.spawn.y)
    start = min(range(len(ring)), key=lambda index: math.dist(ring[index], spawn))
    heading = (math.cos(geometry.spawn.heading), math.sin(geometry.spawn.heading))
    ahead = ring[(start + 1) % len(ring)]
    if (ahead[0] - ring[start][0]) * heading[0] + (ahead[1] - ring[start][1]) * heading[1] < 0:
        ring.reverse()
        start = len(ring) - 1 - start
    ring = ring[start:] + ring[:start]
    count = len(ring)
    grip = CORNER_GRIP_BASE + CORNER_GRIP_PER_RECOVERY * setup.grip_recovery
    caps: list[float] = []
    for index in range(count):
        curvature = _menger_curvature(ring[index - 1], ring[index], ring[(index + 1) % count])
        cap = setup.max_speed
        if curvature > 1e-9:
            cap = min(cap, math.sqrt(grip / curvature))
            excess = curvature - setup.steering_agility * TURN_RATE_PER_SPEED / setup.max_speed
            if excess > 0.0:
                cap = min(cap, setup.steering_agility * TURN_RATE_AT_REST / excess)
        caps.append(cap)
    caps.append(caps[0])
    lengths = [math.dist(ring[index], ring[(index + 1) % count]) for index in range(count)]

    forward = [0.0] * (count + 1)
    for index, length in enumerate(lengths):
        speed = forward[index]
        for piece in _pieces(length):
            accel = setup.acceleration * (1.0 - min(speed / setup.max_speed, 1.0))
            accel -= DRAG_COEFFICIENT * speed * speed
            speed = min(setup.max_speed, math.sqrt(max(0.0, speed * speed + 2.0 * accel * piece)))
        forward[index + 1] = min(speed, caps[index + 1])
    backward = [0.0] * (count + 1)
    backward[count] = caps[count]
    for index in range(count - 1, -1, -1):
        speed = backward[index + 1]
        for piece in _pieces(lengths[index]):
            decel = setup.brake_strength + DRAG_COEFFICIENT * speed * speed
            speed = math.sqrt(speed * speed + 2.0 * decel * piece)
        backward[index] = min(speed, caps[index])
    profile = [min(first, second) for first, second in zip(forward, backward, strict=True)]
    profile[0] = 0.0
    total = 0.0
    for index, length in enumerate(lengths):
        mean = (profile[index] + profile[index + 1]) / 2.0
        if mean <= 1e-9:
            return None
        total += length / mean
    return round(total, 2) if math.isfinite(total) else None


def _pieces(length: float) -> list[float]:
    count = max(1, math.ceil(length / _PROFILE_SUBSTEP_METERS))
    return [length / count] * count


def _menger_curvature(first: Point, middle: Point, last: Point) -> float:
    a = math.dist(first, middle)
    b = math.dist(middle, last)
    c = math.dist(first, last)
    if a * b * c <= 1e-12:
        return 0.0
    cross = (middle[0] - first[0]) * (last[1] - first[1]) - (middle[1] - first[1]) * (
        last[0] - first[0]
    )
    return 2.0 * abs(cross) / (a * b * c)
