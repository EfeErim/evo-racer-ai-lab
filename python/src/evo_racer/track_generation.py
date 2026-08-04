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
GENERATOR_VERSION: Final = 2
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
    """Repair a draft with a bounded suffix search and limited trailing rollback."""
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
            "removedPieces": 0,
            "candidateCount": 1,
            "compiled": compile_track(track),
        }
    except TrackValidationError:
        pass

    candidate_count = 1
    max_removed = min(6, len(track.pieces) - 1)
    search_plans = itertools.chain(
        ((removed_count, ()) for removed_count in range(1, max_removed + 1)),
        (
            (removed_count, suffix)
            for added_count in range(1, 4)
            for suffix in itertools.product(_CLOSURE_SEGMENTS, repeat=added_count)
            for removed_count in range(max_removed + 1)
        ),
    )
    for removed_count, suffix in search_plans:
        base_pieces = track.pieces if removed_count == 0 else track.pieces[:-removed_count]
        candidate_count += 1
        if candidate_count > MAX_GENERATOR_CANDIDATES:
            return _closure_exhausted(candidate_count - 1)
        candidate = replace(
            track,
            pieces=base_pieces + tuple(TrackPieceV1(cast(SegmentKind, kind)) for kind in suffix),
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
            "removedPieces": removed_count,
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
    candidates = _varied_rectangle_candidates(difficulty, target)
    if difficulty == "hard":
        candidates.extend(_stadium_candidates(difficulty, target))

    unique = {_piece_key(candidate): candidate for candidate in candidates}
    fallbacks = _simple_rectangle_candidates(target)
    fallback_keys = {_piece_key(candidate) for candidate in fallbacks}

    if difficulty == "hard":
        preferred = [
            candidate
            for key, candidate in unique.items()
            if key not in fallback_keys
            and any(piece.kind.startswith("hairpin-") for piece in candidate)
        ]
    elif difficulty == "technical":
        preferred = [
            candidate
            for key, candidate in unique.items()
            if key not in fallback_keys
            and any(piece.kind.startswith("chicane-") for piece in candidate)
        ]
    else:
        preferred = [
            candidate
            for key, candidate in unique.items()
            if key not in fallback_keys
            and not any(
                piece.kind.startswith("chicane-") or piece.kind.startswith("hairpin-")
                for piece in candidate
            )
        ]

    preferred = sorted(
        preferred,
        key=lambda candidate: _rank(seed, length, difficulty, _piece_key(candidate)),
    )
    preferred_keys = {_piece_key(candidate) for candidate in preferred}
    remaining = sorted(
        (
            candidate
            for key, candidate in unique.items()
            if key not in fallback_keys and key not in preferred_keys
        ),
        key=lambda candidate: _rank(seed, length, difficulty, _piece_key(candidate)),
    )
    ranked_fallbacks = sorted(
        fallbacks,
        key=lambda candidate: _rank(seed, length, difficulty, _piece_key(candidate)),
    )
    fallback_budget = min(12, len(ranked_fallbacks))
    return (preferred + remaining)[: MAX_GENERATOR_CANDIDATES - fallback_budget] + ranked_fallbacks[
        :fallback_budget
    ]


def _varied_rectangle_candidates(
    difficulty: TrackDifficulty, target: int
) -> list[tuple[TrackPieceV1, ...]]:
    results: list[tuple[TrackPieceV1, ...]] = []
    for split_count in (0, 2, 4):
        remaining = target - 6 - split_count
        if remaining < 0 or remaining % 2 != 0:
            continue
        pair_budget = remaining // 2
        for top_count in range(pair_budget):
            side_count = pair_budget - top_count
            if side_count < 1:
                continue
            for top in _sequence_options(top_count, difficulty):
                for side in _sequence_options(side_count, difficulty):
                    for split_corners in itertools.combinations(range(4), split_count):
                        split_set = set(split_corners)
                        for direction in ("left", "right"):
                            corners = [
                                (f"turn-{direction}-45", f"turn-{direction}-45")
                                if index in split_set
                                else (f"turn-{direction}-90",)
                                for index in range(4)
                            ]
                            kinds = (
                                ("start-finish",)
                                + top
                                + corners[0]
                                + side
                                + corners[1]
                                + top
                                + ("straight-short",)
                                + corners[2]
                                + side
                                + corners[3]
                            )
                            results.append(_pieces(kinds))
    return results


def _stadium_candidates(difficulty: TrackDifficulty, target: int) -> list[tuple[TrackPieceV1, ...]]:
    side_count = (target - 4) // 2
    if side_count < 1 or 4 + side_count * 2 != target:
        return []
    results: list[tuple[TrackPieceV1, ...]] = []
    for side in _sequence_options(side_count, difficulty):
        for direction in ("left", "right"):
            hairpin = f"hairpin-{direction}"
            kinds = ("start-finish",) + side + (hairpin,) + side + ("straight-short", hairpin)
            results.append(_pieces(kinds))
    return results


def _sequence_options(count: int, difficulty: TrackDifficulty) -> list[tuple[str, ...]]:
    if count == 0:
        return [()]
    options: list[tuple[str, ...]] = [
        ("straight-short",) * count,
        ("straight-long",) * count,
        tuple("straight-short" if index % 2 == 0 else "straight-long" for index in range(count)),
        tuple("straight-long" if index % 2 == 0 else "straight-short" for index in range(count)),
    ]
    if difficulty in {"technical", "hard"}:
        for index in range(count):
            for chicane in ("chicane-left", "chicane-right"):
                sequence = ["straight-short"] * count
                sequence[index] = chicane
                options.append(tuple(sequence))
        if count >= 2:
            options.extend(
                [
                    tuple(
                        "chicane-left" if index % 2 == 0 else "chicane-right"
                        for index in range(count)
                    ),
                    tuple(
                        "chicane-right" if index % 2 == 0 else "chicane-left"
                        for index in range(count)
                    ),
                ]
            )
    return list(dict.fromkeys(options))


def _simple_rectangle_candidates(target: int) -> list[tuple[TrackPieceV1, ...]]:
    pair_budget = (target - 6) // 2
    results: list[tuple[TrackPieceV1, ...]] = []
    for top_count in range(pair_budget):
        side_count = pair_budget - top_count
        if side_count < 1:
            continue
        for direction in ("left", "right"):
            turn = f"turn-{direction}-90"
            kinds = (
                ("start-finish",)
                + ("straight-short",) * top_count
                + (turn,)
                + ("straight-short",) * side_count
                + (turn,)
                + ("straight-short",) * (top_count + 1)
                + (turn,)
                + ("straight-short",) * side_count
                + (turn,)
            )
            results.append(_pieces(kinds))
    return results


def _pieces(kinds: tuple[str, ...]) -> tuple[TrackPieceV1, ...]:
    return tuple(TrackPieceV1(cast(SegmentKind, kind)) for kind in kinds)


def _piece_key(pieces: tuple[TrackPieceV1, ...]) -> tuple[str, ...]:
    return tuple(piece.kind for piece in pieces)


def _rank(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    candidate: tuple[str, ...],
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
