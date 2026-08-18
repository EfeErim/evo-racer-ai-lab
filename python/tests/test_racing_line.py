from __future__ import annotations

import pytest

from evo_racer.racing_line import compare_with_reference, minimum_curvature_reference
from evo_racer.simulation import TrackGeometry
from evo_racer.tracks import PRESET_TRACKS, TrackV1, compile_track


@pytest.mark.parametrize("track", PRESET_TRACKS, ids=lambda track: track.track_id)
def test_minimum_curvature_reference_is_deterministic_closed_and_inside_corridor(
    track: TrackV1,
) -> None:
    compiled = compile_track(track)
    geometry = TrackGeometry.from_compiled(compiled)

    first = minimum_curvature_reference(geometry.centerline, geometry.road_width)
    second = minimum_curvature_reference(geometry.centerline, geometry.road_width)

    assert first == second
    assert 3 <= len(first) <= 64
    assert first[0] == first[-1]
    assert first != geometry.centerline
    assert all(
        geometry.project(point).distance <= geometry.road_width / 2.0 - 1.7 for point in first
    )


def test_reference_comparison_matches_an_identical_finished_path() -> None:
    compiled = compile_track(PRESET_TRACKS[0])
    geometry = TrackGeometry.from_compiled(compiled)
    reference = minimum_curvature_reference(geometry.centerline, geometry.road_width)

    comparison = compare_with_reference(
        reference,
        reference,
        road_width=geometry.road_width,
        champion_finished=True,
    )

    assert comparison["matched"] is True
    assert comparison["championFinished"] is True
    assert comparison["meanDeviationMeters"] == 0.0
    assert comparison["p95DeviationMeters"] == 0.0


def test_reference_comparison_never_accepts_an_unfinished_path() -> None:
    compiled = compile_track(PRESET_TRACKS[0])
    geometry = TrackGeometry.from_compiled(compiled)
    reference = minimum_curvature_reference(geometry.centerline, geometry.road_width)

    comparison = compare_with_reference(
        reference,
        reference[:8],
        road_width=geometry.road_width,
        champion_finished=False,
    )

    assert comparison["matched"] is False
    assert comparison["championFinished"] is False
