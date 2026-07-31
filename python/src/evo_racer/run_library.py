"""Versioned atomic local persistence for evolutionary run checkpoints."""

from __future__ import annotations

import json
import math
import os
import tempfile
import time
from pathlib import Path
from typing import Final, cast

from evo_racer.track_library import default_data_root
from evo_racer.tracks import TRACK_SCHEMA_VERSION, TrackValidationError, compile_track_payload

RUN_LIBRARY_CONTRACT_VERSION: Final = 1
RUN_SCHEMA_VERSION: Final = 1
RUN_DOCUMENT_KIND: Final = "evo-racer-run"
RUN_FILE_NAME: Final = "run.json"
ATOMIC_REPLACE_ATTEMPTS: Final = 5
ATOMIC_REPLACE_RETRY_SECONDS: Final = 0.01


class RunRecordError(ValueError):
    """Raised when one local run document cannot satisfy the versioned schema."""


def checkpoint_sha256(snapshot: object) -> str:
    """Return the stable digest stored beside a resumable observation boundary."""
    import hashlib

    encoded = json.dumps(
        snapshot,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def save_run_document(document: object, data_root: Path | None = None) -> dict[str, object]:
    """Validate and atomically replace one run document."""
    validated = validate_run_document(document)
    run_id = cast(str, validated["runId"])
    run_dir = _run_directory(run_id, data_root)
    run_dir.mkdir(parents=True, exist_ok=True)
    destination = run_dir / RUN_FILE_NAME
    serialized = json.dumps(validated, allow_nan=False, indent=2, sort_keys=True) + "\n"

    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=run_dir,
            prefix=".run-",
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

    return validated


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


def read_run_document(run_id: str, data_root: Path | None = None) -> dict[str, object]:
    """Read and validate exactly one local run document."""
    destination = _run_directory(run_id, data_root) / RUN_FILE_NAME
    try:
        payload: object = json.loads(_read_text_with_retries(destination))
    except FileNotFoundError as error:
        raise FileNotFoundError(run_id) from error
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RunRecordError("The local run record is not readable JSON.") from error
    return validate_run_document(payload)


def _read_text_with_retries(record: Path) -> str:
    """Retry the brief Windows read gap around an atomic file replacement."""
    for attempt in range(ATOMIC_REPLACE_ATTEMPTS):
        try:
            return record.read_text(encoding="utf-8")
        except (FileNotFoundError, PermissionError):
            if attempt + 1 >= ATOMIC_REPLACE_ATTEMPTS:
                raise
            time.sleep(ATOMIC_REPLACE_RETRY_SECONDS * (attempt + 1))
    raise AssertionError("Run record read retry loop ended unexpectedly.")


def run_library_payload(data_root: Path | None = None) -> dict[str, object]:
    """List valid run summaries while isolating every unreadable record."""
    runs_dir = (data_root or default_data_root()) / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    runs: list[dict[str, object]] = []
    isolated: list[dict[str, str]] = []

    for run_dir in sorted(path for path in runs_dir.iterdir() if path.is_dir()):
        record = run_dir / RUN_FILE_NAME
        try:
            if not record.is_file():
                raise RunRecordError("The run directory has no run.json record.")
            payload: object = json.loads(_read_text_with_retries(record))
            document = validate_run_document(payload)
            runs.append(run_summary(document))
        except (
            OSError,
            UnicodeDecodeError,
            json.JSONDecodeError,
            RunRecordError,
            TrackValidationError,
        ):
            isolated.append(
                {
                    "record": run_dir.name,
                    "code": "CORRUPT_RUN_RECORD",
                    "message": "This local run could not be read and was isolated.",
                }
            )

    return {
        "contractVersion": RUN_LIBRARY_CONTRACT_VERSION,
        "runSchemaVersion": RUN_SCHEMA_VERSION,
        "trackSchemaVersion": TRACK_SCHEMA_VERSION,
        "runs": runs,
        "isolated": isolated,
    }


def export_run_payload(run_id: str, data_root: Path | None = None) -> dict[str, object]:
    """Return one validated, portable versioned run document."""
    try:
        document = read_run_document(run_id, data_root)
    except FileNotFoundError:
        return _failure("RUN_NOT_FOUND", "runId", "The local run does not exist.")
    except (RunRecordError, TrackValidationError):
        return _failure(
            "CORRUPT_RUN_RECORD",
            "runId",
            "The local run is corrupt and cannot be exported.",
        )
    return {
        "contractVersion": RUN_LIBRARY_CONTRACT_VERSION,
        "valid": True,
        "errors": [],
        "run": document,
    }


def delete_run(run_id: str, data_root: Path | None = None) -> dict[str, object]:
    """Delete one validated run directory without accepting path traversal."""
    run_dir = _run_directory(run_id, data_root)
    record = run_dir / RUN_FILE_NAME
    deleted = record.exists()
    record.unlink(missing_ok=True)
    for temporary in run_dir.glob(".run-*.tmp"):
        temporary.unlink(missing_ok=True)
    try:
        run_dir.rmdir()
    except OSError:
        pass
    return {
        "contractVersion": RUN_LIBRARY_CONTRACT_VERSION,
        "deleted": deleted,
        "runId": run_id,
    }


def validate_run_document(payload: object) -> dict[str, object]:
    """Fail closed unless a value satisfies the complete version 1 run envelope."""
    document = _object(payload, "Run document")
    if document.get("schemaVersion") != RUN_SCHEMA_VERSION:
        raise RunRecordError("Run schemaVersion must be 1.")
    if document.get("kind") != RUN_DOCUMENT_KIND:
        raise RunRecordError("Run document kind is unsupported.")
    run_id = _safe_run_id(document.get("runId"))
    if document.get("trackSchemaVersion") != TRACK_SCHEMA_VERSION:
        raise RunRecordError("Run trackSchemaVersion is unsupported.")

    track = _object(document.get("track"), "track")
    if track.get("schemaVersion") != TRACK_SCHEMA_VERSION:
        raise RunRecordError("Embedded track schemaVersion is unsupported.")
    compiled = compile_track_payload(track)
    canonical_track = _object(compiled.get("track"), "compiled track")

    settings = _settings(document.get("settings"))
    checkpoint = _object(document.get("checkpoint"), "checkpoint")
    generation = _integer(checkpoint.get("generation"), "checkpoint.generation", minimum=0)
    status = checkpoint.get("status")
    if status not in {"running", "paused", "stopped", "completed"}:
        raise RunRecordError("checkpoint.status is unsupported.")
    snapshot = _object(checkpoint.get("snapshot"), "checkpoint.snapshot")
    if checkpoint.get("sha256") != checkpoint_sha256(snapshot):
        raise RunRecordError("checkpoint.sha256 does not match the saved snapshot.")
    if snapshot.get("contractVersion") != 1 or snapshot.get("runId") != run_id:
        raise RunRecordError("Checkpoint snapshot identity is invalid.")
    if snapshot.get("status") != status:
        raise RunRecordError("Checkpoint status does not match its snapshot.")
    if snapshot.get("generation") != generation:
        raise RunRecordError("Checkpoint generation does not match its snapshot.")
    if snapshot.get("totalGenerations") != settings["generations"]:
        raise RunRecordError("Checkpoint totalGenerations does not match settings.")
    if generation > cast(int, settings["generations"]):
        raise RunRecordError("Checkpoint generation exceeds the requested generations.")
    if not isinstance(snapshot.get("fitnessHistory"), list):
        raise RunRecordError("Checkpoint fitnessHistory must be an array.")
    if not isinstance(snapshot.get("previousRuns"), list):
        raise RunRecordError("Checkpoint previousRuns must be an array.")
    generation_trails = snapshot.get("generationTrails")
    if generation_trails is not None:
        _validate_generation_trails(generation_trails, run_id, generation)
    result = snapshot.get("result")
    if status in {"running", "paused"} and result is not None:
        raise RunRecordError("Interrupted checkpoints cannot contain terminal results.")
    if status == "completed" and generation != settings["generations"]:
        raise RunRecordError("Completed checkpoints must include every requested generation.")
    if status in {"completed", "stopped"} and generation > 0 and not isinstance(result, dict):
        raise RunRecordError("Terminal checkpoints require a result after one generation.")

    return {
        "schemaVersion": RUN_SCHEMA_VERSION,
        "kind": RUN_DOCUMENT_KIND,
        "runId": run_id,
        "trackSchemaVersion": TRACK_SCHEMA_VERSION,
        "track": canonical_track,
        "settings": settings,
        "checkpoint": {
            "generation": generation,
            "status": status,
            "snapshot": snapshot,
            "sha256": cast(str, checkpoint["sha256"]),
        },
    }


def run_summary(document: dict[str, object]) -> dict[str, object]:
    """Project one validated run document into a small library row."""
    run_id = cast(str, document["runId"])
    track = cast(dict[str, object], document["track"])
    settings = cast(dict[str, object], document["settings"])
    checkpoint = cast(dict[str, object], document["checkpoint"])
    snapshot = cast(dict[str, object], checkpoint["snapshot"])
    result = snapshot.get("result")
    champion_fitness: float | None = None
    champion_progress: float | None = None
    track_sha256: str | None = None
    if isinstance(result, dict):
        metadata = result.get("metadata")
        if isinstance(metadata, dict) and isinstance(metadata.get("trackSha256"), str):
            track_sha256 = metadata["trackSha256"]
        champion = result.get("champion")
        if isinstance(champion, dict):
            fitness = champion.get("fitness")
            progress = champion.get("progress")
            if isinstance(fitness, (int, float)) and not isinstance(fitness, bool):
                champion_fitness = float(fitness)
            if isinstance(progress, (int, float)) and not isinstance(progress, bool):
                champion_progress = float(progress)
    return {
        "runId": run_id,
        "status": checkpoint["status"],
        "algorithm": settings["algorithm"],
        "trackId": track["id"],
        "trackName": track["name"],
        "trackSha256": track_sha256,
        "seed": settings["seed"],
        "populationSize": settings["populationSize"],
        "episodeSeconds": settings["episodeSeconds"],
        "generation": checkpoint["generation"],
        "totalGenerations": settings["generations"],
        "resumable": checkpoint["status"] in {"running", "paused"},
        "championFitness": champion_fitness,
        "championProgress": champion_progress,
    }


def _validate_generation_trails(value: object, run_id: str, generation: int) -> None:
    if not isinstance(value, list) or len(value) > 8:
        raise RunRecordError("Checkpoint generationTrails must contain at most eight paths.")
    for index, item in enumerate(value):
        trail = _object(item, f"generationTrails[{index}]")
        if trail.get("runId") != run_id:
            raise RunRecordError("Generation trail run identity is invalid.")
        if not isinstance(trail.get("candidateId"), str) or not trail["candidateId"]:
            raise RunRecordError("Generation trail candidate identity is invalid.")
        trail_generation = _integer(
            trail.get("generation"), f"generationTrails[{index}].generation", minimum=0
        )
        if trail_generation >= generation:
            raise RunRecordError("Generation trail exceeds the checkpoint generation.")
        points = trail.get("points")
        if not isinstance(points, list) or not points or len(points) > 64:
            raise RunRecordError("Generation trail points are invalid.")
        for point in points:
            if (
                not isinstance(point, list)
                or len(point) != 2
                or any(
                    not isinstance(coordinate, (int, float))
                    or isinstance(coordinate, bool)
                    or not math.isfinite(float(coordinate))
                    for coordinate in point
                )
            ):
                raise RunRecordError("Generation trail coordinates are invalid.")


def _settings(value: object) -> dict[str, object]:
    settings = _object(value, "settings")
    algorithm = settings.get("algorithm")
    if algorithm not in {"fixed-ga", "neat"}:
        raise RunRecordError("settings.algorithm is unsupported.")
    population_size = _integer(settings.get("populationSize"), "populationSize", minimum=4)
    generations = _integer(settings.get("generations"), "generations", minimum=1)
    episode_seconds = _number(settings.get("episodeSeconds"), "episodeSeconds", minimum=0.01)
    seed = _integer(settings.get("seed"), "seed", minimum=0)
    return {
        "algorithm": algorithm,
        "populationSize": population_size,
        "generations": generations,
        "episodeSeconds": episode_seconds,
        "seed": seed,
    }


def _run_directory(run_id: str, data_root: Path | None) -> Path:
    safe_id = _safe_run_id(run_id)
    return (data_root or default_data_root()) / "runs" / safe_id


def _safe_run_id(value: object) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 100
        or any(
            not (character.isascii() and (character.isalnum() or character in "._-"))
            for character in value
        )
    ):
        raise RunRecordError("runId contains unsupported characters.")
    return value


def _object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise RunRecordError(f"{label} must be an object.")
    return cast(dict[str, object], value)


def _integer(value: object, field: str, *, minimum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise RunRecordError(f"{field} must be an integer of at least {minimum}.")
    return value


def _number(value: object, field: str, *, minimum: float) -> float:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(value)
        or value < minimum
    ):
        raise RunRecordError(f"{field} must be a finite number of at least {minimum}.")
    return float(value)


def _failure(code: str, field: str, message: str) -> dict[str, object]:
    return {
        "contractVersion": RUN_LIBRARY_CONTRACT_VERSION,
        "valid": False,
        "errors": [{"code": code, "field": field, "message": message}],
    }
