from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from evo_racer.track_generation import (
    LENGTH_TARGETS,
    MAX_GENERATOR_CANDIDATES,
    assist_track_closure_payload,
    generate_track_payload,
)
from evo_racer.track_library import delete_track, library_payload, save_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

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


def test_editor_assistance_closes_a_valid_python_compiled_prefix() -> None:
    easy_oval = PRESET_TRACKS[0].to_payload()
    pieces = easy_oval["pieces"]
    assert isinstance(pieces, list)
    partial = {**easy_oval, "id": "edited-oval", "name": "Edited oval", "pieces": pieces[:-2]}

    response = assist_track_closure_payload({"contractVersion": 1, "track": partial})

    assert response["valid"] is True
    assert response["addedPieces"] == ["turn-left-90", "turn-left-90"]
    candidate_count = response["candidateCount"]
    assert isinstance(candidate_count, int)
    assert candidate_count <= MAX_GENERATOR_CANDIDATES
    compiled = response["compiled"]
    assert isinstance(compiled, dict)
    assert compile_track_payload(compiled["track"]) == compiled


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


def test_shared_phase_three_track_document_uses_the_python_compiler() -> None:
    track: object = json.loads(
        (CONTRACTS_DIR / "phase3-track-document.json").read_text(encoding="utf-8")
    )
    compiled = compile_track_payload(track)
    assert compiled["track"] == track
