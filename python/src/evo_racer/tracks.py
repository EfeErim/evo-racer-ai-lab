"""Canonical track schema, catalogue, compiler, and validator."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Final, Literal, cast, get_args

from evo_racer.numeric import rounded, signed_heading_delta

TRACK_SCHEMA_VERSION: Final = 1
GEOMETRY_CONTRACT_VERSION: Final = 1
MINIMUM_ROAD_WIDTH: Final = 8.0
MAXIMUM_ROAD_WIDTH: Final = 20.0
POSITION_TOLERANCE: Final = 1e-6
HEADING_TOLERANCE: Final = 1e-6
ARC_SAMPLE_DEGREES: Final = 15

type SegmentKind = Literal[
    "start-finish",
    "straight-short",
    "straight-long",
    "turn-left-45",
    "turn-right-45",
    "turn-left-90",
    "turn-right-90",
    "hairpin-left",
    "hairpin-right",
    "chicane-left",
    "chicane-right",
]
type Point = tuple[float, float]

_SEGMENT_KINDS: Final[frozenset[str]] = frozenset(get_args(SegmentKind.__value__))


@dataclass(frozen=True, slots=True)
class TrackPieceV1:
    """One canonical track piece."""

    kind: SegmentKind


@dataclass(frozen=True, slots=True)
class TrackV1:
    """Versioned canonical track data; generated geometry is intentionally absent."""

    schema_version: int
    track_id: str
    name: str
    road_width: float
    pieces: tuple[TrackPieceV1, ...]

    def to_payload(self) -> dict[str, object]:
        """Serialize only canonical piece data."""
        return {
            "schemaVersion": self.schema_version,
            "id": self.track_id,
            "name": self.name,
            "roadWidth": self.road_width,
            "pieces": [{"kind": piece.kind} for piece in self.pieces],
        }


@dataclass(frozen=True, slots=True)
class TrackIssue:
    """Stable validation issue returned by the Python authority."""

    code: str
    field: str
    message: str

    def to_payload(self) -> dict[str, str]:
        return {"code": self.code, "field": self.field, "message": self.message}


class TrackValidationError(ValueError):
    """Raised when canonical data cannot produce a safe closed track."""

    def __init__(self, issues: tuple[TrackIssue, ...]) -> None:
        super().__init__("Track validation failed.")
        self.issues = issues


@dataclass(slots=True)
class _Pose:
    x: float
    y: float
    heading: float


def parse_track(payload: object) -> TrackV1:
    """Parse untrusted JSON-shaped data into the canonical TrackV1 schema."""
    if not isinstance(payload, dict):
        raise TrackValidationError(
            (
                TrackIssue(
                    "INVALID_TRACK_PAYLOAD",
                    "track",
                    "Track must be a JSON object.",
                ),
            )
        )

    issues: list[TrackIssue] = []
    schema_version = payload.get("schemaVersion")
    if (
        not isinstance(schema_version, int)
        or isinstance(schema_version, bool)
        or schema_version != TRACK_SCHEMA_VERSION
    ):
        issues.append(
            TrackIssue(
                "UNSUPPORTED_TRACK_VERSION",
                "schemaVersion",
                "Track schemaVersion must be 1.",
            )
        )

    track_id = payload.get("id")
    if not isinstance(track_id, str) or not track_id.strip():
        issues.append(TrackIssue("INVALID_TRACK_ID", "id", "Track id must be a non-empty string."))

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        issues.append(
            TrackIssue("INVALID_TRACK_NAME", "name", "Track name must be a non-empty string.")
        )

    road_width_value = payload.get("roadWidth")
    if (
        not isinstance(road_width_value, (int, float))
        or isinstance(road_width_value, bool)
        or not math.isfinite(float(road_width_value))
    ):
        issues.append(
            TrackIssue(
                "INVALID_ROAD_WIDTH",
                "roadWidth",
                "roadWidth must be a finite number.",
            )
        )
        road_width = 0.0
    else:
        road_width = float(road_width_value)
        if road_width < MINIMUM_ROAD_WIDTH:
            issues.append(
                TrackIssue(
                    "CORRIDOR_TOO_NARROW",
                    "roadWidth",
                    f"roadWidth must be at least {MINIMUM_ROAD_WIDTH:.1f}.",
                )
            )
        elif road_width > MAXIMUM_ROAD_WIDTH:
            issues.append(
                TrackIssue(
                    "CORRIDOR_TOO_WIDE",
                    "roadWidth",
                    f"roadWidth must be at most {MAXIMUM_ROAD_WIDTH:.1f}.",
                )
            )

    pieces_value = payload.get("pieces")
    pieces: list[TrackPieceV1] = []
    if not isinstance(pieces_value, list) or not pieces_value:
        issues.append(
            TrackIssue(
                "TRACK_PIECES_REQUIRED",
                "pieces",
                "Track pieces must be a non-empty array.",
            )
        )
    else:
        for index, piece_value in enumerate(pieces_value):
            field = f"pieces[{index}].kind"
            if not isinstance(piece_value, dict):
                issues.append(
                    TrackIssue(
                        "INVALID_TRACK_PIECE",
                        f"pieces[{index}]",
                        "Each track piece must be an object.",
                    )
                )
                continue
            kind = piece_value.get("kind")
            if not isinstance(kind, str) or kind not in _SEGMENT_KINDS:
                issues.append(
                    TrackIssue(
                        "UNKNOWN_SEGMENT_KIND",
                        field,
                        "Track piece kind is not in the version 1 segment catalogue.",
                    )
                )
                continue
            pieces.append(TrackPieceV1(cast(SegmentKind, kind)))

    if sum(piece.kind == "start-finish" for piece in pieces) != 1:
        issues.append(
            TrackIssue(
                "START_FINISH_COUNT",
                "pieces",
                "Track must contain exactly one start-finish piece.",
            )
        )

    if issues:
        raise TrackValidationError(tuple(issues))

    assert isinstance(schema_version, int)
    assert isinstance(track_id, str)
    assert isinstance(name, str)
    return TrackV1(
        schema_version=schema_version,
        track_id=track_id,
        name=name,
        road_width=road_width,
        pieces=tuple(pieces),
    )


def compile_track_payload(payload: object) -> dict[str, object]:
    """Parse, validate, and compile canonical JSON-shaped track data."""
    return compile_track(parse_track(payload))


def compile_track(track: TrackV1) -> dict[str, object]:
    """Compile one canonical TrackV1 into deterministic renderer geometry."""
    # Re-parse so generator and closure candidates pass the same checks as user input.
    track = parse_track(track.to_payload())
    end_pose, centerline, checkpoints = _trace_pieces(track)
    geometry_issues = _validate_compiled_geometry(end_pose, centerline)
    if geometry_issues:
        raise TrackValidationError(tuple(geometry_issues))
    closed_centerline = _normalize_closed_loop(centerline)
    return _geometry_payload(
        track,
        closed_centerline,
        _derive_boundaries(closed_centerline, track.road_width),
        checkpoints,
    )


def preview_track(track: TrackV1) -> dict[str, object]:
    """Compile a parsed draft without pretending that an open loop is valid."""
    _, centerline, checkpoints = _trace_pieces(track)
    return _geometry_payload(
        track,
        centerline,
        _derive_open_boundaries(centerline, track.road_width),
        checkpoints,
    )


def _trace_pieces(track: TrackV1) -> tuple[_Pose, list[Point], list[_Pose]]:
    """Walk the pieces from the origin; return the end pose, centerline and piece starts."""
    pose = _Pose(0.0, 0.0, 0.0)
    centerline: list[Point] = [(pose.x, pose.y)]
    checkpoints: list[_Pose] = []
    for piece in track.pieces:
        checkpoints.append(_Pose(pose.x, pose.y, pose.heading))
        _compile_piece(piece.kind, pose, centerline)
    return pose, centerline, checkpoints


def _geometry_payload(
    track: TrackV1,
    centerline: list[Point],
    boundaries: tuple[list[Point], list[Point]],
    checkpoints: list[_Pose],
) -> dict[str, object]:
    # parse_track guarantees exactly one start-finish piece.
    start = next(
        checkpoint
        for checkpoint, piece in zip(checkpoints, track.pieces, strict=True)
        if piece.kind == "start-finish"
    )
    spawn_distance = 5.0
    left_boundary, right_boundary = boundaries
    return {
        "contractVersion": GEOMETRY_CONTRACT_VERSION,
        "track": track.to_payload(),
        "geometry": {
            "centerline": [_point_payload(point) for point in centerline],
            "leftBoundary": [_point_payload(point) for point in left_boundary],
            "rightBoundary": [_point_payload(point) for point in right_boundary],
            "checkpoints": [
                _checkpoint_payload(index, checkpoint, track.road_width)
                for index, checkpoint in enumerate(checkpoints)
            ],
            "spawnPose": {
                "x": rounded(start.x + math.cos(start.heading) * spawn_distance),
                "y": rounded(start.y + math.sin(start.heading) * spawn_distance),
                "heading": rounded(start.heading % (2.0 * math.pi)),
            },
        },
    }


def validate_track_payload(payload: object) -> dict[str, object]:
    """Return stable validation issues without leaking compiler exceptions."""
    try:
        track = parse_track(payload)
    except TrackValidationError as error:
        return {
            "contractVersion": GEOMETRY_CONTRACT_VERSION,
            "valid": False,
            "errors": [issue.to_payload() for issue in error.issues],
        }
    try:
        compiled = compile_track(track)
    except TrackValidationError as error:
        return {
            "contractVersion": GEOMETRY_CONTRACT_VERSION,
            "valid": False,
            "errors": [issue.to_payload() for issue in error.issues],
            "preview": preview_track(track),
        }
    return {
        "contractVersion": GEOMETRY_CONTRACT_VERSION,
        "valid": True,
        "errors": [],
        "compiled": compiled,
    }


def compiled_presets_payload() -> dict[str, object]:
    """Compile all bundled presets through the same public compiler path."""
    return {
        "contractVersion": GEOMETRY_CONTRACT_VERSION,
        "presets": [compile_track(track) for track in PRESET_TRACKS],
    }


def _compile_piece(kind: SegmentKind, pose: _Pose, points: list[Point]) -> None:
    if kind in {"start-finish", "straight-short"}:
        _append_straight(pose, points, 20.0)
    elif kind == "straight-long":
        _append_straight(pose, points, 40.0)
    elif kind == "turn-left-45":
        _append_arc(pose, points, 45.0)
    elif kind == "turn-right-45":
        _append_arc(pose, points, -45.0)
    elif kind == "turn-left-90":
        _append_arc(pose, points, 90.0)
    elif kind == "turn-right-90":
        _append_arc(pose, points, -90.0)
    elif kind == "hairpin-left":
        _append_arc(pose, points, 180.0)
    elif kind == "hairpin-right":
        _append_arc(pose, points, -180.0)
    elif kind == "chicane-left":
        _append_arc(pose, points, 45.0)
        _append_arc(pose, points, -45.0)
    elif kind == "chicane-right":
        _append_arc(pose, points, -45.0)
        _append_arc(pose, points, 45.0)


def _append_straight(pose: _Pose, points: list[Point], length: float) -> None:
    pose.x += math.cos(pose.heading) * length
    pose.y += math.sin(pose.heading) * length
    points.append((pose.x, pose.y))


def _append_arc(pose: _Pose, points: list[Point], degrees: float) -> None:
    radius = 20.0
    direction = 1.0 if degrees > 0.0 else -1.0
    radians = math.radians(abs(degrees))
    steps = int(abs(degrees) / ARC_SAMPLE_DEGREES)
    center_x = pose.x - direction * math.sin(pose.heading) * radius
    center_y = pose.y + direction * math.cos(pose.heading) * radius
    start_angle = pose.heading - direction * math.pi / 2.0

    for step in range(1, steps + 1):
        progress = step / steps
        radial_angle = start_angle + direction * radians * progress
        points.append(
            (
                center_x + math.cos(radial_angle) * radius,
                center_y + math.sin(radial_angle) * radius,
            )
        )

    pose.x, pose.y = points[-1]
    pose.heading += direction * radians


def _validate_compiled_geometry(pose: _Pose, points: list[Point]) -> list[TrackIssue]:
    issues: list[TrackIssue] = []
    start_x, start_y = points[0]
    if math.hypot(pose.x - start_x, pose.y - start_y) > POSITION_TOLERANCE or (
        abs(signed_heading_delta(pose.heading, 0.0)) > HEADING_TOLERANCE
    ):
        issues.append(
            TrackIssue(
                "LOOP_NOT_CLOSED",
                "pieces",
                "Compiled track must return to its starting position and heading.",
            )
        )
        return issues

    if _has_self_intersection(points):
        issues.append(
            TrackIssue(
                "TRACK_SELF_INTERSECTION",
                "pieces",
                "Compiled track centerline must not self-intersect.",
            )
        )
    return issues


def _has_self_intersection(points: list[Point]) -> bool:
    segment_count = len(points) - 1
    for first in range(segment_count):
        for second in range(first + 1, segment_count):
            if second - first <= 1:
                continue
            if first == 0 and second == segment_count - 1:
                continue
            if _segments_intersect(
                points[first],
                points[first + 1],
                points[second],
                points[second + 1],
            ):
                return True
    return False


def _segments_intersect(a: Point, b: Point, c: Point, d: Point) -> bool:
    def orientation(p: Point, q: Point, r: Point) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    first = orientation(a, b, c)
    second = orientation(a, b, d)
    third = orientation(c, d, a)
    fourth = orientation(c, d, b)
    epsilon = 1e-9
    if ((first > epsilon and second < -epsilon) or (first < -epsilon and second > epsilon)) and (
        (third > epsilon and fourth < -epsilon) or (third < -epsilon and fourth > epsilon)
    ):
        return True

    def lies_on_segment(start: Point, end: Point, point: Point) -> bool:
        return (
            min(start[0], end[0]) - epsilon <= point[0] <= max(start[0], end[0]) + epsilon
            and min(start[1], end[1]) - epsilon <= point[1] <= max(start[1], end[1]) + epsilon
        )

    return (
        abs(first) <= epsilon
        and lies_on_segment(a, b, c)
        or abs(second) <= epsilon
        and lies_on_segment(a, b, d)
        or abs(third) <= epsilon
        and lies_on_segment(c, d, a)
        or abs(fourth) <= epsilon
        and lies_on_segment(c, d, b)
    )


def _normalize_closed_loop(points: list[Point]) -> list[Point]:
    normalized = [(rounded(x), rounded(y)) for x, y in points[:-1]]
    normalized.append(normalized[0])
    return normalized


def _derive_boundaries(points: list[Point], road_width: float) -> tuple[list[Point], list[Point]]:
    unique_points = points[:-1]
    left: list[Point] = []
    right: list[Point] = []
    for index, point in enumerate(unique_points):
        previous = unique_points[index - 1]
        following = unique_points[(index + 1) % len(unique_points)]
        _append_offsets(point, previous, following, road_width / 2.0, left, right)
    left.append(left[0])
    right.append(right[0])
    return left, right


def _derive_open_boundaries(
    points: list[Point], road_width: float
) -> tuple[list[Point], list[Point]]:
    left: list[Point] = []
    right: list[Point] = []
    for index, point in enumerate(points):
        previous = points[max(index - 1, 0)]
        following = points[min(index + 1, len(points) - 1)]
        _append_offsets(point, previous, following, road_width / 2.0, left, right)
    return left, right


def _append_offsets(
    point: Point,
    previous: Point,
    following: Point,
    half_width: float,
    left: list[Point],
    right: list[Point],
) -> None:
    """Offset ``point`` along the normal of the chord from ``previous`` to ``following``."""
    tangent_x = following[0] - previous[0]
    tangent_y = following[1] - previous[1]
    magnitude = math.hypot(tangent_x, tangent_y)
    normal_x = -tangent_y / magnitude
    normal_y = tangent_x / magnitude
    left.append(
        (rounded(point[0] + normal_x * half_width), rounded(point[1] + normal_y * half_width))
    )
    right.append(
        (rounded(point[0] - normal_x * half_width), rounded(point[1] - normal_y * half_width))
    )


def _checkpoint_payload(index: int, checkpoint: _Pose, road_width: float) -> dict[str, object]:
    half_width = road_width / 2.0
    normal_x = -math.sin(checkpoint.heading)
    normal_y = math.cos(checkpoint.heading)
    return {
        "index": index,
        "left": [
            rounded(checkpoint.x + normal_x * half_width),
            rounded(checkpoint.y + normal_y * half_width),
        ],
        "right": [
            rounded(checkpoint.x - normal_x * half_width),
            rounded(checkpoint.y - normal_y * half_width),
        ],
    }


def _point_payload(point: Point) -> list[float]:
    return [rounded(point[0]), rounded(point[1])]


def _pieces(*kinds: SegmentKind) -> tuple[TrackPieceV1, ...]:
    return tuple(TrackPieceV1(kind) for kind in kinds)


PRESET_TRACKS: Final[tuple[TrackV1, ...]] = (
    TrackV1(
        schema_version=1,
        track_id="easy-oval",
        name="Easy Oval",
        road_width=12.0,
        pieces=_pieces(
            "start-finish",
            "straight-long",
            "turn-left-90",
            "turn-left-90",
            "straight-long",
            "straight-short",
            "turn-left-90",
            "turn-left-90",
        ),
    ),
    TrackV1(
        schema_version=1,
        track_id="technical-circuit",
        name="Technical Circuit",
        road_width=9.5,
        pieces=_pieces(
            "start-finish",
            "turn-left-45",
            "straight-short",
            "turn-left-45",
            "straight-long",
            "turn-left-45",
            "straight-short",
            "turn-left-45",
            "straight-short",
            "turn-left-45",
            "straight-short",
            "turn-left-45",
            "straight-long",
            "turn-left-45",
            "straight-short",
            "turn-left-45",
        ),
    ),
    TrackV1(
        schema_version=1,
        track_id="chicane-challenge",
        name="Chicane Challenge",
        road_width=8.5,
        pieces=_pieces(
            "start-finish",
            "straight-long",
            "chicane-left",
            "chicane-right",
            "hairpin-left",
            "chicane-left",
            "chicane-right",
            "straight-long",
            "straight-short",
            "hairpin-left",
        ),
    ),
)
