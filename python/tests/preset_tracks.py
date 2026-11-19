"""Bundled preset geometry for tests."""

from __future__ import annotations

from evo_racer.simulation import TrackGeometry
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload


def preset_geometry(track_id: str) -> TrackGeometry:
    """Compile a bundled preset through the canonical public compiler."""
    track = next((candidate for candidate in PRESET_TRACKS if candidate.track_id == track_id), None)
    if track is None:
        raise ValueError(f"Unknown preset: {track_id}")
    return TrackGeometry.from_compiled(compile_track_payload(track.to_payload()))
