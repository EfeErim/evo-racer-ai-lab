"""Deterministic geometric racing-line reference and champion comparison."""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from typing import Final

REFERENCE_LINE_CONTRACT_VERSION: Final = 1
REFERENCE_LINE_POINT_LIMIT: Final = 64
REFERENCE_LINE_METHOD: Final = "minimum-curvature-v1"
_OPTIMIZATION_PASSES: Final = 10
_STEP_DECAY: Final = 0.62
_VEHICLE_CENTER_MARGIN: Final = 1.75

type Point = tuple[float, float]


def minimum_curvature_reference(
    centerline: Sequence[Point],
    road_width: float,
) -> tuple[Point, ...]:
    """Return a bounded closed reference optimized inside the track corridor.

    The optimizer varies lateral offsets from an evenly sampled centerline and
    deterministically minimizes discrete squared curvature. It is intentionally
    geometric: it is a transparent benchmark, not a minimum-lap-time claim.
    """
    if (
        len(centerline) < 4
        or centerline[0] != centerline[-1]
        or not math.isfinite(road_width)
        or road_width <= 0.0
    ):
        raise ValueError("Racing-line reference requires a finite closed track.")

    unique_count = min(REFERENCE_LINE_POINT_LIMIT - 1, max(24, (len(centerline) - 1) * 2))
    base = _resample_closed(centerline, unique_count)
    normals = _normal_vectors(base)
    lateral_limit = max(0.0, road_width / 2.0 - _VEHICLE_CENTER_MARGIN)
    offsets = [0.0] * unique_count
    step = lateral_limit

    for _ in range(_OPTIMIZATION_PASSES):
        if step <= 1e-6:
            break
        for index in range(unique_count):
            current = offsets[index]
            candidates = {
                max(-lateral_limit, min(lateral_limit, current + step * amount))
                for amount in (-1.0, -0.5, 0.0, 0.5, 1.0)
            }
            offsets[index] = min(
                candidates,
                key=lambda value: (
                    _reference_objective(base, normals, offsets, index, value),
                    abs(value),
                    value,
                ),
            )
        step *= _STEP_DECAY

    optimized = _offset_points(base, normals, offsets)
    rounded = tuple((_rounded(x), _rounded(y)) for x, y in optimized)
    return (*rounded, rounded[0])


def compare_with_reference(
    reference: Sequence[Point],
    champion_points: Sequence[Point],
    *,
    road_width: float,
    champion_finished: bool,
) -> dict[str, object]:
    """Compare one recorded champion path with the geometric reference."""
    if len(reference) < 3 or reference[0] != reference[-1]:
        raise ValueError("Racing-line comparison requires a closed reference.")
    if not champion_points:
        raise ValueError("Racing-line comparison requires champion points.")
    if not math.isfinite(road_width) or road_width <= 0.0:
        raise ValueError("Racing-line comparison requires a positive road width.")

    sampled_champion = _bounded_sample(champion_points, REFERENCE_LINE_POINT_LIMIT)
    champion_deviations = [_distance_to_polyline(point, reference) for point in sampled_champion]
    reference_deviations = [
        _distance_to_polyline(point, sampled_champion) for point in reference[:-1]
    ]
    deviations = champion_deviations + reference_deviations
    mean_deviation = statistics.fmean(deviations)
    ordered = sorted(deviations)
    p95_deviation = ordered[min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)]
    mean_tolerance = max(0.75, road_width * 0.10)
    p95_tolerance = max(1.50, road_width * 0.22)
    matched = (
        champion_finished and mean_deviation <= mean_tolerance and p95_deviation <= p95_tolerance
    )

    return {
        "contractVersion": REFERENCE_LINE_CONTRACT_VERSION,
        "method": REFERENCE_LINE_METHOD,
        "referenceLine": [[_rounded(x), _rounded(y)] for x, y in reference],
        "championFinished": champion_finished,
        "meanDeviationMeters": _rounded(mean_deviation),
        "p95DeviationMeters": _rounded(p95_deviation),
        "meanToleranceMeters": _rounded(mean_tolerance),
        "p95ToleranceMeters": _rounded(p95_tolerance),
        "matched": matched,
    }


def _resample_closed(points: Sequence[Point], count: int) -> tuple[Point, ...]:
    segments = tuple(zip(points, points[1:], strict=False))
    lengths = tuple(math.dist(start, end) for start, end in segments)
    if any(length <= 0.0 or not math.isfinite(length) for length in lengths):
        raise ValueError("Racing-line centerline contains an invalid segment.")
    total_length = sum(lengths)
    sampled: list[Point] = []
    segment_index = 0
    segment_start_distance = 0.0
    for sample_index in range(count):
        target = total_length * sample_index / count
        while (
            segment_index < len(lengths) - 1
            and target > segment_start_distance + lengths[segment_index]
        ):
            segment_start_distance += lengths[segment_index]
            segment_index += 1
        start, end = segments[segment_index]
        amount = (target - segment_start_distance) / lengths[segment_index]
        sampled.append(
            (
                start[0] + (end[0] - start[0]) * amount,
                start[1] + (end[1] - start[1]) * amount,
            )
        )
    return tuple(sampled)


def _normal_vectors(points: Sequence[Point]) -> tuple[Point, ...]:
    normals: list[Point] = []
    for index in range(len(points)):
        previous = points[index - 1]
        following = points[(index + 1) % len(points)]
        tangent_x = following[0] - previous[0]
        tangent_y = following[1] - previous[1]
        magnitude = math.hypot(tangent_x, tangent_y)
        if magnitude <= 0.0:
            raise ValueError("Racing-line reference has an undefined tangent.")
        normals.append((-tangent_y / magnitude, tangent_x / magnitude))
    return tuple(normals)


def _offset_points(
    base: Sequence[Point],
    normals: Sequence[Point],
    offsets: Sequence[float],
) -> tuple[Point, ...]:
    return tuple(
        (point[0] + normal[0] * offset, point[1] + normal[1] * offset)
        for point, normal, offset in zip(base, normals, offsets, strict=True)
    )


def _reference_objective(
    base: Sequence[Point],
    normals: Sequence[Point],
    offsets: list[float],
    changed_index: int,
    changed_value: float,
) -> float:
    candidate_offsets = offsets.copy()
    candidate_offsets[changed_index] = changed_value
    points = _offset_points(base, normals, candidate_offsets)
    curvature_cost = 0.0
    path_length = 0.0
    for index, point in enumerate(points):
        previous = points[index - 1]
        following = points[(index + 1) % len(points)]
        first_length = math.dist(previous, point)
        second_length = math.dist(point, following)
        chord_length = math.dist(previous, following)
        if min(first_length, second_length, chord_length) <= 1e-9:
            return math.inf
        cross = abs(
            (point[0] - previous[0]) * (following[1] - point[1])
            - (point[1] - previous[1]) * (following[0] - point[0])
        )
        curvature = 2.0 * cross / (first_length * second_length * chord_length)
        curvature_cost += curvature * curvature * (first_length + second_length) * 0.5
        path_length += second_length
    offset_roughness = sum(
        (
            candidate_offsets[index - 1]
            - 2.0 * candidate_offsets[index]
            + candidate_offsets[(index + 1) % len(candidate_offsets)]
        )
        ** 2
        for index in range(len(candidate_offsets))
    )
    return curvature_cost + path_length * 1e-7 + offset_roughness * 1e-5


def _bounded_sample(points: Sequence[Point], limit: int) -> tuple[Point, ...]:
    if len(points) <= limit:
        return tuple(points)
    last_index = len(points) - 1
    return tuple(points[round(index * last_index / (limit - 1))] for index in range(limit))


def _distance_to_polyline(point: Point, polyline: Sequence[Point]) -> float:
    best = math.inf
    for start, end in zip(polyline, polyline[1:], strict=False):
        segment_x = end[0] - start[0]
        segment_y = end[1] - start[1]
        length_squared = segment_x * segment_x + segment_y * segment_y
        if length_squared <= 0.0:
            continue
        amount = max(
            0.0,
            min(
                1.0,
                ((point[0] - start[0]) * segment_x + (point[1] - start[1]) * segment_y)
                / length_squared,
            ),
        )
        closest_x = start[0] + segment_x * amount
        closest_y = start[1] + segment_y * amount
        best = min(best, math.hypot(point[0] - closest_x, point[1] - closest_y))
    if not math.isfinite(best):
        best = min(
            (math.dist(point, candidate) for candidate in polyline),
            default=math.inf,
        )
    if not math.isfinite(best):
        raise ValueError("Racing-line comparison has no usable point.")
    return best


def _rounded(value: float) -> float:
    return round(value, 6)
