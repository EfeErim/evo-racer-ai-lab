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
    preview_track,
)

GENERATOR_CONTRACT_VERSION: Final = 1
GENERATOR_VERSION: Final = 4
MAX_GENERATOR_CANDIDATES: Final = 200
_DESIGNED_CANDIDATE_BUDGET: Final = 176
_HALF_LAYOUT_BUDGET: Final = 512

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
_TURN_DEGREES: Final[dict[str, int]] = {
    "straight-short": 0,
    "straight-long": 0,
    "turn-left-45": 45,
    "turn-right-45": -45,
    "turn-left-90": 90,
    "turn-right-90": -90,
    "hairpin-left": 180,
    "hairpin-right": -180,
    "chicane-left": 0,
    "chicane-right": 0,
}


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
    candidates = _search_candidates(seed, length, difficulty, target)

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
            "features": _generation_features(pieces),
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


def _search_candidates(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    target: int,
) -> list[tuple[TrackPieceV1, ...]]:
    candidates = _balanced_loop_candidates(seed, length, difficulty, target)
    candidates = sorted(
        candidates,
        key=lambda candidate: _layout_rank(seed, length, difficulty, candidate),
    )

    fallbacks = _varied_rectangle_candidates(difficulty, target)
    if difficulty == "hard":
        fallbacks.extend(_stadium_candidates(difficulty, target))
    fallbacks.extend(_simple_rectangle_candidates(target))
    ranked_fallbacks = sorted(
        {_piece_key(candidate): candidate for candidate in fallbacks}.values(),
        key=lambda candidate: _rank(seed, length, difficulty, _piece_key(candidate)),
    )
    seen = {_piece_key(candidate) for candidate in candidates}
    for fallback in ranked_fallbacks:
        if len(candidates) >= MAX_GENERATOR_CANDIDATES:
            break
        if _piece_key(fallback) not in seen:
            candidates.append(fallback)
            seen.add(_piece_key(fallback))
    return candidates


def _balanced_loop_candidates(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    target: int,
) -> list[tuple[TrackPieceV1, ...]]:
    """Pair distinct compatible half laps into closed, asymmetric circuits."""
    half_target = target // 2
    target_turn = 180 if _rank(seed, length, difficulty, ("turn-direction",))[0] % 2 == 0 else -180
    allowed = _allowed_generator_pieces(difficulty, target_turn)
    halves: list[tuple[str, ...]] = []

    def search(prefix: tuple[str, ...], turn_total: int) -> None:
        if len(halves) >= _HALF_LAYOUT_BUDGET:
            return
        slots_left = half_target - len(prefix)
        if slots_left == 0:
            if turn_total != target_turn or not _half_meets_difficulty(prefix, difficulty):
                return
            halves.append(prefix)
            return

        ordered = sorted(
            allowed,
            key=lambda kind: (
                _choice_penalty(prefix, turn_total, target_turn, slots_left, kind),
                _rank(seed, length, difficulty, prefix + (kind,)),
            ),
        )
        for kind in ordered:
            if not _prefix_accepts(prefix, kind):
                continue
            next_turn = turn_total + _TURN_DEGREES[kind]
            remaining_slots = slots_left - 1
            if abs(target_turn - next_turn) > 180 * remaining_slots:
                continue
            search(prefix + (kind,), next_turn)

    search(("start-finish",), 0)
    groups: dict[tuple[float, float], list[tuple[str, ...]]] = {}
    for half in halves:
        groups.setdefault(_half_endpoint_key(half), []).append(half)

    paired: list[tuple[TrackPieceV1, ...]] = []
    for matching_halves in groups.values():
        for first, second in itertools.permutations(matching_halves, 2):
            if _half_difference(first, second) < 2:
                continue
            second_without_start = tuple(
                "straight-short" if kind == "start-finish" else kind for kind in second
            )
            paired.append(_pieces(first + second_without_start))

    paired = sorted(
        {_piece_key(candidate): candidate for candidate in paired}.values(),
        key=lambda candidate: _layout_rank(seed, length, difficulty, candidate),
    )
    if len(paired) >= _DESIGNED_CANDIDATE_BUDGET:
        return paired[:_DESIGNED_CANDIDATE_BUDGET]

    seen = {_piece_key(candidate) for candidate in paired}
    mirrored = sorted(
        (
            _pieces(
                half + tuple("straight-short" if kind == "start-finish" else kind for kind in half)
            )
            for half in halves
        ),
        key=lambda candidate: _layout_rank(seed, length, difficulty, candidate),
    )
    for candidate in mirrored:
        if len(paired) >= _DESIGNED_CANDIDATE_BUDGET:
            break
        if _piece_key(candidate) not in seen:
            paired.append(candidate)
            seen.add(_piece_key(candidate))
    return paired


def _half_endpoint_key(half: tuple[str, ...]) -> tuple[float, float]:
    preview = preview_track(
        TrackV1(
            schema_version=1,
            track_id="generator-half",
            name="Generator half",
            road_width=10.0,
            pieces=_pieces(half),
        )
    )
    geometry = cast(dict[str, object], preview["geometry"])
    centerline = cast(list[list[float]], geometry["centerline"])
    return centerline[-1][0], centerline[-1][1]


def _half_difference(first: tuple[str, ...], second: tuple[str, ...]) -> int:
    return sum(left != right for left, right in zip(first, second, strict=True))


def _generation_features(pieces: tuple[TrackPieceV1, ...]) -> dict[str, object]:
    kinds = _piece_key(pieces)
    half_length = len(kinds) // 2
    first_half = kinds[:half_length]
    second_half = ("start-finish",) + kinds[half_length + 1 :]
    signed_turns = [
        _TURN_DEGREES[kind] for kind in kinds if kind in _TURN_DEGREES and _TURN_DEGREES[kind] != 0
    ]
    turn_signs = [1 if turn > 0 else -1 for turn in signed_turns]
    return {
        "layout": "asymmetric" if _half_difference(first_half, second_half) >= 2 else "balanced",
        "straightCount": sum(
            kind == "start-finish" or kind.startswith("straight-") for kind in kinds
        ),
        "cornerCount": sum(kind.startswith("turn-") for kind in kinds),
        "chicaneCount": sum(kind.startswith("chicane-") for kind in kinds),
        "hairpinCount": sum(kind.startswith("hairpin-") for kind in kinds),
        "directionChanges": sum(
            first != second for first, second in itertools.pairwise(turn_signs)
        ),
    }


def _allowed_generator_pieces(
    difficulty: TrackDifficulty,
    target_turn: int,
) -> tuple[str, ...]:
    target_side = "left" if target_turn > 0 else "right"
    opposite_side = "right" if target_turn > 0 else "left"
    if difficulty == "easy":
        return (
            "straight-short",
            "straight-long",
            f"turn-{target_side}-45",
            f"turn-{opposite_side}-45",
            f"turn-{target_side}-90",
        )
    common = (
        "straight-short",
        "straight-long",
        f"turn-{target_side}-45",
        f"turn-{opposite_side}-45",
        f"turn-{target_side}-90",
        f"turn-{opposite_side}-90",
        "chicane-left",
        "chicane-right",
    )
    if difficulty == "technical":
        return common
    return common + (f"hairpin-{target_side}", f"hairpin-{opposite_side}")


def _choice_penalty(
    prefix: tuple[str, ...],
    turn_total: int,
    target_turn: int,
    slots_left: int,
    kind: str,
) -> tuple[float, int]:
    angle = _TURN_DEGREES[kind]
    ideal_turn = (target_turn - turn_total) / slots_left
    repeated = int(bool(prefix) and prefix[-1] == kind)
    return abs(ideal_turn - angle), repeated


def _prefix_accepts(prefix: tuple[str, ...], kind: str) -> bool:
    if len(prefix) >= 2 and prefix[-1] == prefix[-2] == kind:
        return False
    if kind.startswith("hairpin-") and prefix[-1].startswith("hairpin-"):
        return False
    if _TURN_DEGREES[kind] == 0 and len(prefix) >= 2:
        if all(_TURN_DEGREES.get(previous, 0) == 0 for previous in prefix[-2:]):
            return False
    return True


def _half_meets_difficulty(prefix: tuple[str, ...], difficulty: TrackDifficulty) -> bool:
    kinds = prefix[1:]
    turns = [_TURN_DEGREES[kind] for kind in kinds if _TURN_DEGREES[kind] != 0]
    magnitudes = {abs(turn) for turn in turns}
    signs = {1 if turn > 0 else -1 for turn in turns}
    if difficulty == "easy":
        return 45 in magnitudes and 90 in magnitudes and len(turns) >= 3
    has_chicane = any(kind.startswith("chicane-") for kind in kinds)
    if difficulty == "technical":
        return has_chicane and 45 in magnitudes and 90 in magnitudes and len(signs) == 2
    return (
        has_chicane
        and any(kind.startswith("hairpin-") for kind in kinds)
        and len(signs) == 2
        and len(turns) >= 3
    )


def _layout_rank(
    seed: int,
    length: TrackLength,
    difficulty: TrackDifficulty,
    candidate: tuple[TrackPieceV1, ...],
) -> tuple[object, ...]:
    all_kinds = _piece_key(candidate)
    half_length = len(candidate) // 2
    kinds = all_kinds[:half_length]
    second_half = ("start-finish",) + all_kinds[half_length + 1 :]
    symmetry = -_half_difference(kinds, second_half)
    turns = [_TURN_DEGREES[kind] for kind in kinds if kind in _TURN_DEGREES and _TURN_DEGREES[kind]]
    signs = [1 if turn > 0 else -1 for turn in turns]
    direction_changes = sum(first != second for first, second in itertools.pairwise(signs))
    repeated = sum(first == second for first, second in itertools.pairwise(kinds))
    variety = len(set(kinds))
    chicanes = sum(kind.startswith("chicane-") for kind in kinds)
    hairpins = sum(kind.startswith("hairpin-") for kind in kinds)
    design: tuple[int, ...]
    if difficulty == "easy":
        design = (repeated, -variety)
    elif difficulty == "technical":
        design = (abs(chicanes - 1), -direction_changes, repeated, -variety)
    else:
        design = (
            abs(hairpins - 1),
            abs(chicanes - 1),
            -direction_changes,
            repeated,
            -variety,
        )
    return (symmetry,) + design + (_rank(seed, length, difficulty, all_kinds),)


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
