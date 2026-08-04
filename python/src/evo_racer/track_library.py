"""Versioned atomic local persistence for canonical tracks."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Final

from evo_racer.tracks import TrackValidationError, compile_track_payload

LIBRARY_CONTRACT_VERSION: Final = 1
ATOMIC_REPLACE_ATTEMPTS: Final = 5
ATOMIC_REPLACE_RETRY_SECONDS: Final = 0.01


class TrackRecordError(ValueError):
    """Raised when a local track record violates library identity rules."""


def default_data_root() -> Path:
    """Resolve the product's local user-data root."""
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "EvoRacerAILab"
    return Path.home() / "AppData" / "Local" / "EvoRacerAILab"


def save_track_payload(payload: object, data_root: Path | None = None) -> dict[str, object]:
    """Validate, compile, and atomically save one canonical track."""
    if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
        return _failure(
            "UNSUPPORTED_LIBRARY_VERSION",
            "contractVersion",
            "Library contractVersion must be 1.",
        )
    try:
        compiled = compile_track_payload(payload.get("track"))
    except TrackValidationError as error:
        return {
            "contractVersion": LIBRARY_CONTRACT_VERSION,
            "saved": False,
            "errors": [issue.to_payload() for issue in error.issues],
        }

    track = compiled["track"]
    assert isinstance(track, dict)
    track_id = track["id"]
    assert isinstance(track_id, str)
    tracks_dir = (data_root or default_data_root()) / "tracks"
    tracks_dir.mkdir(parents=True, exist_ok=True)
    destination = tracks_dir / f"{_record_key(track_id)}.json"
    serialized = json.dumps(track, indent=2, sort_keys=True) + "\n"

    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=tracks_dir,
            prefix=".track-",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(serialized)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        _replace_transiently_locked_file(Path(temporary_name), destination)
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)

    return {
        "contractVersion": LIBRARY_CONTRACT_VERSION,
        "saved": True,
        "errors": [],
        "compiled": compiled,
    }


def library_payload(data_root: Path | None = None) -> dict[str, object]:
    """Return valid compiled records while isolating corrupt local files."""
    tracks_dir = (data_root or default_data_root()) / "tracks"
    tracks_dir.mkdir(parents=True, exist_ok=True)
    tracks: list[dict[str, object]] = []
    isolated: list[dict[str, str]] = []

    for record in sorted(tracks_dir.glob("*.json")):
        try:
            payload: object = json.loads(_read_text_with_retries(record))
            compiled = compile_track_payload(payload)
            track = compiled["track"]
            assert isinstance(track, dict)
            track_id = track["id"]
            assert isinstance(track_id, str)
            if record.name != f"{_record_key(track_id)}.json":
                raise TrackRecordError("Track record name does not match its track id.")
            tracks.append(compiled)
        except (
            OSError,
            UnicodeDecodeError,
            json.JSONDecodeError,
            TrackRecordError,
            TrackValidationError,
        ):
            isolated.append(
                {
                    "record": record.name,
                    "code": "CORRUPT_TRACK_RECORD",
                    "message": "This local track could not be read and was isolated.",
                }
            )

    return {
        "contractVersion": LIBRARY_CONTRACT_VERSION,
        "tracks": tracks,
        "isolated": isolated,
    }


def _replace_transiently_locked_file(source: Path, destination: Path) -> None:
    """Retry a bounded Windows sharing violation without weakening atomic replace."""
    for attempt in range(ATOMIC_REPLACE_ATTEMPTS):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if attempt + 1 >= ATOMIC_REPLACE_ATTEMPTS:
                raise
            time.sleep(ATOMIC_REPLACE_RETRY_SECONDS * (attempt + 1))


def _read_text_with_retries(record: Path) -> str:
    """Retry a bounded transient read lock before declaring a track corrupt."""
    for attempt in range(ATOMIC_REPLACE_ATTEMPTS):
        try:
            return record.read_text(encoding="utf-8")
        except (FileNotFoundError, PermissionError):
            if attempt + 1 >= ATOMIC_REPLACE_ATTEMPTS:
                raise
            time.sleep(ATOMIC_REPLACE_RETRY_SECONDS * (attempt + 1))
    raise AssertionError("Track record read retry loop ended unexpectedly.")


def delete_track(track_id: str, data_root: Path | None = None) -> dict[str, object]:
    """Delete exactly one hashed library record."""
    tracks_dir = (data_root or default_data_root()) / "tracks"
    destination = tracks_dir / f"{_record_key(track_id)}.json"
    deleted = destination.exists()
    destination.unlink(missing_ok=True)
    return {
        "contractVersion": LIBRARY_CONTRACT_VERSION,
        "deleted": deleted,
        "trackId": track_id,
    }


def _record_key(track_id: str) -> str:
    return hashlib.sha256(track_id.encode("utf-8")).hexdigest()


def _failure(code: str, field: str, message: str) -> dict[str, object]:
    return {
        "contractVersion": LIBRARY_CONTRACT_VERSION,
        "saved": False,
        "errors": [{"code": code, "field": field, "message": message}],
    }
