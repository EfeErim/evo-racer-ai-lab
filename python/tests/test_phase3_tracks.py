from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from evo_racer.track_generation import (
    LENGTH_TARGETS,
    MAX_GENERATOR_CANDIDATES,
    assist_track_closure_payload,
    generate_track_payload,
)
from evo_racer.track_library import delete_track, library_payload, save_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload, validate_track_payload

CONTRACTS_DIR = Path(__file__).parents[2] / "contracts"


def _generate(
    seed: int = 731, length: str = "medium", difficulty: str = "technical"
) -> dict[str, Any]:
    return generate_track_payload(
        {
            "contractVersion": 1,
            "seed": seed,
            "length": length,
            "difficulty": difficulty,
        }
    )


def test_same_generator_inputs_reproduce_identical_canonical_json() -> None:
    first = _generate()
    second = _generate()

    assert first["valid"] is True
    assert json.dumps(first, sort_keys=True, separators=(",", ":")) == json.dumps(
        second, sort_keys=True, separators=(",", ":")
    )
    candidate_count = first["candidateCount"]
    assert isinstance(candidate_count, int)
    assert candidate_count <= MAX_GENERATOR_CANDIDATES


def test_every_length_and_difficulty_uses_the_canonical_compiler() -> None:
    for length, target in LENGTH_TARGETS.items():
        for difficulty in ("easy", "technical", "hard"):
            response = _generate(seed=91, length=length, difficulty=difficulty)
            assert response["valid"] is True
            compiled = response["compiled"]
            assert isinstance(compiled, dict)
            track = compiled["track"]
            assert isinstance(track, dict)
            pieces = track["pieces"]
            assert isinstance(pieces, list)
            assert len(pieces) == target
            assert compile_track_payload(track) == compiled
            features = response["features"]
            assert features["layout"] == "asymmetric"


def test_generator_seed_and_difficulty_change_the_canonical_shape_family() -> None:
    generated_ids: set[str] = set()
    for seed in (1, 2, 731):
        easy = _generate(seed=seed, length="medium", difficulty="easy")
        technical = _generate(seed=seed, length="medium", difficulty="technical")
        hard = _generate(seed=seed, length="medium", difficulty="hard")

        for response in (easy, technical, hard):
            assert response["generatorVersion"] == 4
            compiled = response["compiled"]
            assert isinstance(compiled, dict)
            track = compiled["track"]
            assert isinstance(track, dict)
            track_id = track["id"]
            assert isinstance(track_id, str)
            generated_ids.add(track_id)

        technical_kinds = {piece["kind"] for piece in technical["compiled"]["track"]["pieces"]}
        hard_kinds = {piece["kind"] for piece in hard["compiled"]["track"]["pieces"]}
        assert any(kind.startswith("chicane-") for kind in technical_kinds)
        assert any(kind.startswith("hairpin-") for kind in hard_kinds)

    assert len(generated_ids) == 9


def test_generator_v4_uses_asymmetric_non_template_layouts() -> None:
    for difficulty in ("easy", "technical", "hard"):
        response = _generate(seed=731, length="long", difficulty=difficulty)
        assert response["valid"] is True
        assert response["generatorVersion"] == 4
        pieces = response["compiled"]["track"]["pieces"]
        kinds = [piece["kind"] for piece in pieces]
        first_half = kinds[: len(kinds) // 2]
        second_half = ["start-finish", *kinds[len(kinds) // 2 + 1 :]]

        assert (
            sum(first != second for first, second in zip(first_half, second_half, strict=True)) >= 2
        )
        assert len(set(first_half)) >= 4
        assert any(kind.endswith("-45") for kind in first_half)
        assert any(kind.endswith("-90") for kind in first_half)
        if difficulty == "technical":
            assert any(kind.startswith("chicane-") for kind in first_half)
        if difficulty == "hard":
            assert any(kind.startswith("chicane-") for kind in first_half)
            assert any(kind.startswith("hairpin-") for kind in first_half)
        features = response["features"]
        assert features["layout"] == "asymmetric"
        assert features["straightCount"] >= 2
        assert features["cornerCount"] >= 4
        assert features["directionChanges"] >= 1


def test_generator_v4_medium_technical_seed_corpus_is_unique() -> None:
    identifiers: set[str] = set()
    for seed in range(12):
        response = _generate(seed=seed, length="medium", difficulty="technical")
        assert response["valid"] is True
        assert response["features"]["layout"] == "asymmetric"
        track_id = response["compiled"]["track"]["id"]
        assert isinstance(track_id, str)
        identifiers.add(track_id)

    assert len(identifiers) == 12


def test_invalid_editor_draft_keeps_a_python_derived_open_preview() -> None:
    draft = PRESET_TRACKS[0].to_payload()
    pieces = draft["pieces"]
    assert isinstance(pieces, list)
    response = validate_track_payload({**draft, "pieces": [*pieces, {"kind": "straight-short"}]})

    assert response["valid"] is False
    errors = response["errors"]
    assert isinstance(errors, list)
    assert isinstance(errors[0], dict)
    assert errors[0]["code"] == "LOOP_NOT_CLOSED"
    preview = response["preview"]
    assert isinstance(preview, dict)
    geometry = preview["geometry"]
    assert isinstance(geometry, dict)
    centerline = geometry["centerline"]
    assert isinstance(centerline, list)
    assert centerline[0] != centerline[-1]


def test_editor_assistance_closes_a_valid_python_compiled_prefix() -> None:
    easy_oval = PRESET_TRACKS[0].to_payload()
    pieces = easy_oval["pieces"]
    assert isinstance(pieces, list)
    partial = {**easy_oval, "id": "edited-oval", "name": "Edited oval", "pieces": pieces[:-2]}

    response = assist_track_closure_payload({"contractVersion": 1, "track": partial})

    assert response["valid"] is True
    assert response["addedPieces"] == ["turn-left-90", "turn-left-90"]
    assert response["removedPieces"] == 0
    candidate_count = response["candidateCount"]
    assert isinstance(candidate_count, int)
    assert candidate_count <= MAX_GENERATOR_CANDIDATES
    compiled = response["compiled"]
    assert isinstance(compiled, dict)
    assert compile_track_payload(compiled["track"]) == compiled


def test_editor_assistance_can_rollback_up_to_six_bad_trailing_pieces() -> None:
    starter = PRESET_TRACKS[0].to_payload()
    pieces = starter["pieces"]
    assert isinstance(pieces, list)
    for trailing_count in range(1, 7):
        draft = {
            **starter,
            "pieces": [*pieces, *({"kind": "straight-short"} for _ in range(trailing_count))],
        }

        response = assist_track_closure_payload({"contractVersion": 1, "track": draft})

        assert response["valid"] is True
        assert response["removedPieces"] == trailing_count
        assert response["addedPieces"] == []
        candidate_count = response["candidateCount"]
        assert isinstance(candidate_count, int)
        assert candidate_count <= MAX_GENERATOR_CANDIDATES
        compiled = response["compiled"]
        assert isinstance(compiled, dict)
        assert compiled["track"] == starter


def test_library_atomically_round_trips_and_deletes_a_generated_track(tmp_path: Path) -> None:
    generated = _generate(seed=12, length="short", difficulty="easy")
    compiled = generated["compiled"]
    assert isinstance(compiled, dict)
    track = compiled["track"]
    assert isinstance(track, dict)

    saved = save_track_payload({"contractVersion": 1, "track": track}, tmp_path)
    listed = library_payload(tmp_path)

    assert saved["saved"] is True
    assert listed["tracks"] == [compiled]
    assert listed["isolated"] == []

    track_id = track["id"]
    assert isinstance(track_id, str)
    assert delete_track(track_id, tmp_path)["deleted"] is True
    assert library_payload(tmp_path)["tracks"] == []


def test_track_save_retries_a_transient_windows_sharing_violation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generated = _generate(seed=12, length="short", difficulty="easy")
    compiled = generated["compiled"]
    assert isinstance(compiled, dict)
    track = compiled["track"]
    assert isinstance(track, dict)
    real_replace = os.replace
    attempts = 0

    def transient_replace(source: str | Path, destination: str | Path) -> None:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise PermissionError("transient sharing violation")
        real_replace(source, destination)

    monkeypatch.setattr(os, "replace", transient_replace)

    saved = save_track_payload({"contractVersion": 1, "track": track}, tmp_path)

    assert saved["saved"] is True
    assert attempts == 3
    assert library_payload(tmp_path)["tracks"] == [compiled]


def test_track_library_retries_a_transient_windows_read_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generated = _generate(seed=12, length="short", difficulty="easy")
    compiled = generated["compiled"]
    assert isinstance(compiled, dict)
    track = compiled["track"]
    assert isinstance(track, dict)
    assert save_track_payload({"contractVersion": 1, "track": track}, tmp_path)["saved"]
    real_read_text = Path.read_text
    attempts = 0

    def transient_read_text(path: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal attempts
        if path.parent == tmp_path / "tracks":
            attempts += 1
            if attempts < 3:
                raise PermissionError("transient sharing violation")
        return real_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", transient_read_text)

    listed = library_payload(tmp_path)

    assert attempts == 3
    assert listed["tracks"] == [compiled]
    assert listed["isolated"] == []


def test_invalid_unknown_and_corrupt_json_fail_safely(tmp_path: Path) -> None:
    unknown = {
        "schemaVersion": 1,
        "id": "unknown",
        "name": "Unknown",
        "roadWidth": 10,
        "pieces": [{"kind": "start-finish"}, {"kind": "teleporter"}],
    }
    saved = save_track_payload({"contractVersion": 1, "track": unknown}, tmp_path)
    assert saved["saved"] is False
    errors = saved["errors"]
    assert isinstance(errors, list)
    assert errors == [
        {
            "code": "UNKNOWN_SEGMENT_KIND",
            "field": "pieces[1].kind",
            "message": "Track piece kind is not in the version 1 segment catalogue.",
        }
    ]

    tracks_dir = tmp_path / "tracks"
    tracks_dir.mkdir(parents=True, exist_ok=True)
    (tracks_dir / "broken.json").write_text("{ definitely not json", encoding="utf-8")
    listed = library_payload(tmp_path)
    assert listed["tracks"] == []
    assert listed["isolated"] == [
        {
            "record": "broken.json",
            "code": "CORRUPT_TRACK_RECORD",
            "message": "This local track could not be read and was isolated.",
        }
    ]


def test_misnamed_valid_track_record_is_isolated(tmp_path: Path) -> None:
    generated = _generate(seed=12, length="short", difficulty="easy")
    compiled = generated["compiled"]
    assert isinstance(compiled, dict)
    track = compiled["track"]
    assert isinstance(track, dict)
    tracks_dir = tmp_path / "tracks"
    tracks_dir.mkdir(parents=True)
    (tracks_dir / "misnamed.json").write_text(json.dumps(track), encoding="utf-8")

    listed = library_payload(tmp_path)

    assert listed["tracks"] == []
    assert listed["isolated"] == [
        {
            "record": "misnamed.json",
            "code": "CORRUPT_TRACK_RECORD",
            "message": "This local track could not be read and was isolated.",
        }
    ]


def test_shared_phase_three_track_document_uses_the_python_compiler() -> None:
    track: object = json.loads(
        (CONTRACTS_DIR / "phase3-track-document.json").read_text(encoding="utf-8")
    )
    compiled = compile_track_payload(track)
    assert compiled["track"] == track
