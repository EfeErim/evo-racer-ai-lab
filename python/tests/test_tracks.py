from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from evo_racer.tracks import (
    PRESET_TRACKS,
    SEGMENT_CATALOGUE,
    TrackPieceV1,
    TrackV1,
    TrackValidationError,
    compile_track,
    compile_track_payload,
    validate_track_payload,
)

CONTRACTS_DIR = Path(__file__).parents[2] / "contracts"


def test_segment_catalogue_contains_every_locked_phase_two_family() -> None:
    assert SEGMENT_CATALOGUE == (
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
    )


def test_all_presets_compile_as_closed_connected_non_intersecting_tracks() -> None:
    for preset in PRESET_TRACKS:
        compiled = compile_track(preset)
        geometry = compiled["geometry"]
        assert isinstance(geometry, dict)
        centerline = geometry["centerline"]
        left_boundary = geometry["leftBoundary"]
        right_boundary = geometry["rightBoundary"]
        assert isinstance(centerline, list)
        assert isinstance(left_boundary, list)
        assert isinstance(right_boundary, list)
        assert centerline[0] == centerline[-1]
        assert left_boundary[0] == left_boundary[-1]
        assert right_boundary[0] == right_boundary[-1]
        assert len(centerline) == len(left_boundary) == len(right_boundary)


def test_compilation_is_deterministic_and_does_not_persist_geometry() -> None:
    for preset in PRESET_TRACKS:
        first = compile_track(preset)
        second = compile_track(preset)
        assert json.dumps(first, sort_keys=True, separators=(",", ":")) == json.dumps(
            second, sort_keys=True, separators=(",", ":")
        )
        assert set(preset.to_payload()) == {"schemaVersion", "id", "name", "roadWidth", "pieces"}


def test_invalid_fixtures_return_stable_error_codes() -> None:
    fixtures: list[dict[str, Any]] = json.loads(
        (CONTRACTS_DIR / "phase2-invalid-tracks.json").read_text(encoding="utf-8")
    )

    for fixture in fixtures:
        response = validate_track_payload(fixture["track"])
        errors = response["errors"]
        assert isinstance(errors, list)
        assert [error["code"] for error in errors] == fixture["expectedCodes"]


def test_shared_geometry_fixture_matches_python_compiler() -> None:
    fixture: dict[str, Any] = json.loads(
        (CONTRACTS_DIR / "phase2-easy-oval-geometry.json").read_text(encoding="utf-8")
    )

    assert compile_track_payload(fixture["track"]) == fixture["compiled"]


def test_unclosed_track_fails_closed() -> None:
    with pytest.raises(TrackValidationError) as error:
        compile_track_payload(
            {
                "schemaVersion": 1,
                "id": "open",
                "name": "Open",
                "roadWidth": 10,
                "pieces": [
                    {"kind": "start-finish"},
                    {"kind": "straight-short"},
                    {"kind": "turn-left-90"},
                ],
            }
        )

    assert [issue.code for issue in error.value.issues] == ["LOOP_NOT_CLOSED"]


def test_direct_compiler_input_cannot_bypass_canonical_validation() -> None:
    invalid = TrackV1(
        schema_version=1,
        track_id="duplicate-start",
        name="Duplicate start",
        road_width=10,
        pieces=(
            TrackPieceV1("start-finish"),
            TrackPieceV1("hairpin-left"),
            TrackPieceV1("start-finish"),
            TrackPieceV1("hairpin-left"),
        ),
    )

    with pytest.raises(TrackValidationError) as error:
        compile_track(invalid)

    assert [issue.code for issue in error.value.issues] == ["START_FINISH_COUNT"]
