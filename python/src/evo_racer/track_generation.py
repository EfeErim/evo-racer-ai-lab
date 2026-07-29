"""Deterministic bounded track generation and editor closure assistance."""

from __future__ import annotations

import hashlib
import itertools
import json
from dataclasses import replace
from typing import Final, Literal, cast

from evo_racer.tracks import (
    SegmentKind,
    TrackPieceV1,
    TrackV1,
    TrackValidationError,
    compile_track,
    parse_track,
)

GENERATOR_CONTRACT_VERSION: Final = 1
GENERATOR_VERSION: Final = 1
MAX_GENERATOR_CANDIDATES: Final = 200

type TrackLength = Literal["short", "medium", "long"]
type TrackDifficulty = Literal["easy", "technical", "hard"]

LENGTH_TARGETS: Final[dict[TrackLength, int]] = {
    "short": 12,
    "medium": 18,
    "long": 24,
}
DIFFICULTY_WIDTHS: Final[dict[TrackDifficulty, float]] = {
    "easy": 12.0,
    "technical": 10.0,
    "hard": 8.5,
}
_CLOSURE_SEGMENTS: Final = (
    "turn-left-90",
    "turn-right-90",
    "straight-short",
    "straight-long",
)


def generate_track_payload(payload: object) -> dict[str, object]:
    """Generate one deterministic closed TrackV1 with a bounded candidate search."""
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return _failure("INVALID_GENERATOR_PAYLOAD", "request", "Expected a JSON object.")

    if payload.get("contractVersion") != GENERATOR_CONTRACT_VERSION:
        errors.append(
            _issue(
                "UNSUPPORTED_GENERATOR_VERSION",
                "contractVersion",
                "Generator contractVersion must be 1.",
            )
        )

    seed = payload.get("seed")
    if not isinstance(seed, int) or isinstance(seed, bool) or seed < 0 or seed > 2_147_483_647:
        errors.append(
            _issue(
                "INVALID_GENERATOR_SEED",
                "seed",
                "seed must be a whole number from 0 to 2147483647.",
            )
        )

    length = payload.get("length")
    if length not in LENGTH_TARGETS:
        errors.append(
            _issue(
                "UNKNOWN_GENERATOR_LENGTH",
                "length",
                "length must be short, medium, or long.",
            )
        )

    difficulty = payload.get("difficulty")
    if difficulty not in DIFFICULTY_WIDTHS:
        errors.append(
            _issue(
                "UNKNOWN_GENERATOR_DIFFICULTY",
                "difficulty",
                "difficulty must be easy, technical, or hard.",
            )
        )

    if errors:
        return {
            "contractVersion": GENERATOR_CONTRACT_VERSION,
            "valid": False,
            "errors": errors,
        }

    assert isinstance(seed, int)
    assert length in LENGTH_TARGETS
    assert difficulty in DIFFICULTY_WIDTHS
    target = LENGTH_TARGETS[length]
    candidates = _rectangle_candidates(seed, length, difficulty, target)

    for candidate_count, pieces in enumerate(candidates, start=1):
        track = TrackV1(
            schema_version=1,
            track_id=_generated_id(seed, length, difficulty, pieces),
            name=f"{difficulty.title()} {length.title()} {seed}",
            road_width=DIFFICULTY_WIDTHS[difficulty],
            pieces=pieces,
        )
        try:
            compiled = compile_track(track)
        except TrackValidationError:
            continue
        return {
            "contractVersion": GENERATOR_CONTRACT_VERSION,
            "generatorVersion": GENERATOR_VERSION,
            "valid": True,
            "errors": [],
            "candidateCount": candidate_count,
            "inputs": {
                "seed": seed,
                "length": length,
                "difficulty": difficulty,
                "targetSegments": target,
            },
            "compiled": compiled,
        }

    return {
        "contractVersion": GENERATOR_CONTRACT_VERSION,
        "generatorVersion": GENERATOR_VERSION,
        "valid": False,
        "errors": [
            _issue(
                "GENERATOR_SEARCH_EXHAUSTED",
                "generator",
                f"No valid track was found within {MAX_GENERATOR_CANDIDATES} candidates.",
            )
        ],
        "candidateCount": min(len(candidates), MAX_GENERATOR_CANDIDATES),
    }


def assist_track_closure_payload(payload: object) -> dict[str, object]:
    """Append a short Python-validated suffix to an editor track when possible."""
    if not isinstance(payload, dict):
        return _failure("INVALID_ASSIST_PAYLOAD", "request", "Expected a JSON object.")
    if payload.get("contractVersion") != GENERATOR_CONTRACT_VERSION:
        return _failure(
            "UNSUPPORTED_ASSIST_VERSION",
            "contractVersion",
            "Closure-assist contractVersion must be 1.",
        )

    try:
        track = parse_track(payload.get("track"))
    except TrackValidationError as error:
        return {
            "contractVersion": GENERATOR_CONTRACT_VERSION,
            "valid": False,
            "errors": [issue.to_payload() for issue in error.issues],
        }

    try:
        return {
            "contractVersion": GENERATOR_CONTRACT_VERSION,
            "valid": True,
            "errors": [],
            "addedPieces": [],
            "candidateCount": 1,
            "compiled": compile_track(track),
        }
    except TrackValidationError:
        pass

    candidate_count = 1
    for added_count in range(1, 6):
        for suffix in itertools.product(_CLOSURE_SEGMENTS, repeat=added_count):
            candidate_count += 1
            if candidate_count > MAX_GENERATOR_CANDIDATES:
                return _closure_exhausted(candidate_count - 1)
            candidate = replace(
                track,
                pieces=track.pieces
                + tuple(TrackPieceV1(cast(SegmentKind, kind)) for kind in suffix),
            )
            try:
                compiled = compile_track(candidate)
            except TrackValidationError:
                continue
            return {
                "contractVersion": GENERATOR_CONTRACT_VERSION,
                "valid": True,
                "errors": [],
                "addedPieces": list(suffix),
                "candidateCount": candidate_count,
                "compiled": compiled,
            }

    return _closure_exhausted(candidate_count)


def _rectangle_candidates(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    target: int,
) -> list[tuple[TrackPieceV1, ...]]:
    # A rectangle has four quarter-turns. Opposite sides use equal distances;
    # the start/finish piece accounts for one short straight on its side.
    pair_budget = (target - 6) // 2
    layouts = [
        (top_count, pair_budget - top_count)
        for top_count in range(pair_budget)
        if pair_budget - top_count >= 1
    ]
    directions = ("left", "right")
    ranked = sorted(
        itertools.product(layouts, directions),
        key=lambda candidate: _rank(seed, length, difficulty, candidate),
    )

    results: list[tuple[TrackPieceV1, ...]] = []
    for (top_count, side_count), direction in ranked[:MAX_GENERATOR_CANDIDATES]:
        turn = f"turn-{direction}-90"
        kinds = (
            ["start-finish"]
            + ["straight-short"] * top_count
            + [turn]
            + ["straight-short"] * side_count
            + [turn]
            + ["straight-short"] * (top_count + 1)
            + [turn]
            + ["straight-short"] * side_count
            + [turn]
        )
        results.append(tuple(TrackPieceV1(cast(SegmentKind, kind)) for kind in kinds))
    return results


def _rank(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    candidate: tuple[tuple[int, int], str],
) -> bytes:
    material = json.dumps(
        [GENERATOR_VERSION, seed, length, difficulty, candidate],
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(material).digest()


def _generated_id(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    pieces: tuple[TrackPieceV1, ...],
) -> str:
    material = json.dumps(
        {
            "generatorVersion": GENERATOR_VERSION,
            "seed": seed,
            "length": length,
            "difficulty": difficulty,
            "pieces": [piece.kind for piece in pieces],
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return f"generated-{hashlib.sha256(material).hexdigest()[:16]}"


def _closure_exhausted(candidate_count: int) -> dict[str, object]:
    return {
        "contractVersion": GENERATOR_CONTRACT_VERSION,
        "valid": False,
        "errors": [
            _issue(
                "ASSISTED_CLOSURE_NOT_FOUND",
                "pieces",
                "No safe closure was found within the bounded search.",
            )
        ],
        "candidateCount": candidate_count,
    }


def _failure(code: str, field: str, message: str) -> dict[str, object]:
    return {
        "contractVersion": GENERATOR_CONTRACT_VERSION,
        "valid": False,
        "errors": [_issue(code, field, message)],
    }


def _issue(code: str, field: str, message: str) -> dict[str, str]:
    return {"code": code, "field": field, "message": message}
