from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import pytest

from evo_racer.observer import RunManager, RunSession, RunSettings
from evo_racer.run_library import (
    delete_run,
    export_run_payload,
    read_run_document,
    run_library_payload,
    save_run_document,
    validate_run_document,
)
from evo_racer.track_library import library_payload, save_track_payload
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase8-run-document.json"


def _session(
    *,
    algorithm: str = "fixed-ga",
    generations: int = 2,
    run_id: str = "run-phase8-test",
) -> RunSession:
    return RunSession(
        run_id=run_id,
        compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
        settings=RunSettings(
            algorithm=algorithm,  # type: ignore[arg-type]
            population_size=4,
            generations=generations,
            episode_seconds=0.2,
            seed=819,
        ),
    )


@pytest.mark.parametrize("algorithm", ["fixed-ga", "neat"])
def test_interrupted_generation_boundary_resumes_deterministically(
    tmp_path: Path,
    algorithm: str,
) -> None:
    interrupted = _session(algorithm=algorithm)
    interrupted.advance()
    save_run_document(interrupted.to_run_document(), tmp_path)

    uninterrupted = _session(algorithm=algorithm)
    uninterrupted.advance()
    uninterrupted.advance()
    expected = uninterrupted.snapshot()

    restarted = RunManager(tmp_path)
    resumed = restarted.resume({"contractVersion": 1, "runId": interrupted.run_id})
    assert resumed["valid"] is True
    resumed_snapshot = resumed["snapshot"]
    assert isinstance(resumed_snapshot, dict)
    assert resumed_snapshot["status"] == "running"
    assert resumed_snapshot["generation"] == 1
    assert len(resumed_snapshot["generationTrails"]) == 1

    deadline = time.monotonic() + 5
    while True:
        completed = restarted.observe({"contractVersion": 1, "runId": interrupted.run_id})
        actual = completed["snapshot"]
        assert isinstance(actual, dict)
        if actual["status"] == "completed":
            break
        if time.monotonic() >= deadline:
            pytest.fail("Restored background generation did not complete.")
        time.sleep(0.005)
    assert actual["status"] == "completed"
    assert actual["fitnessHistory"] == expected["fitnessHistory"]
    assert actual["generationReport"] == expected["generationReport"]
    assert actual["selectedCar"] == expected["selectedCar"]
    assert actual["result"] == expected["result"]
    assert actual["generationTrails"] == expected["generationTrails"]


def test_generation_trails_are_bounded_and_persisted(tmp_path: Path) -> None:
    session = _session(generations=2, run_id="run-trails")
    session.advance()
    session.command("pause")
    saved = save_run_document(session.to_run_document(), tmp_path)
    checkpoint = saved["checkpoint"]
    assert isinstance(checkpoint, dict)
    snapshot = checkpoint["snapshot"]
    assert isinstance(snapshot, dict)
    trails = snapshot["generationTrails"]
    assert isinstance(trails, list)
    assert len(trails) == 1
    assert trails[0]["runId"] == "run-trails"
    assert 1 < len(trails[0]["points"]) <= 64

    restored = RunManager(tmp_path).resume({"contractVersion": 1, "runId": "run-trails"})
    restored_snapshot = restored["snapshot"]
    assert isinstance(restored_snapshot, dict)
    assert restored_snapshot["generationTrails"] == trails


def test_terminal_run_comparison_requires_identical_track_and_budget(tmp_path: Path) -> None:
    def completed(run_id: str, *, seed: int, episode_seconds: float = 0.2) -> RunSession:
        session = RunSession(
            run_id=run_id,
            compiled_track=compile_track_payload(PRESET_TRACKS[0].to_payload()),
            settings=RunSettings(
                algorithm="fixed-ga",
                population_size=4,
                generations=1,
                episode_seconds=episode_seconds,
                seed=seed,
            ),
        )
        session.advance()
        save_run_document(session.to_run_document(), tmp_path)
        return session

    comparable = completed("run-comparable", seed=100)
    completed("run-other-budget", seed=101, episode_seconds=0.3)
    current = completed("run-current", seed=102)
    manager = RunManager(tmp_path)

    response = manager._response(current)
    snapshot = response["snapshot"]
    assert isinstance(snapshot, dict)
    previous = snapshot["previousRuns"]
    assert isinstance(previous, list)
    assert [item["runId"] for item in previous] == [comparable.run_id]
    assert previous[0]["populationSize"] == 4
    assert previous[0]["episodeSeconds"] == 0.2


def test_restart_preserves_tracks_and_runs_while_corrupt_run_is_isolated(
    tmp_path: Path,
) -> None:
    track = PRESET_TRACKS[0].to_payload()
    assert save_track_payload({"contractVersion": 1, "track": track}, tmp_path)["saved"]

    session = _session(generations=1)
    session.advance()
    save_run_document(session.to_run_document(), tmp_path)
    broken = tmp_path / "runs" / "broken-run"
    broken.mkdir(parents=True)
    (broken / "run.json").write_text("{not valid json", encoding="utf-8")

    restarted = RunManager(tmp_path)
    tracks = library_payload(tmp_path)
    runs = restarted.library()

    saved_tracks = tracks["tracks"]
    saved_runs = runs["runs"]
    assert isinstance(saved_tracks, list)
    assert isinstance(saved_runs, list)
    assert len(saved_tracks) == 1
    assert len(saved_runs) == 1
    assert runs["isolated"] == [
        {
            "record": "broken-run",
            "code": "CORRUPT_RUN_RECORD",
            "message": "This local run could not be read and was isolated.",
        }
    ]


def test_atomic_run_export_and_delete_use_the_same_versioned_document(
    tmp_path: Path,
) -> None:
    session = _session()
    saved = save_run_document(session.to_run_document(), tmp_path)
    record = tmp_path / "runs" / session.run_id / "run.json"

    assert record.is_file()
    assert list(record.parent.glob(".run-*.tmp")) == []
    assert json.loads(record.read_text(encoding="utf-8")) == saved

    exported = export_run_payload(session.run_id, tmp_path)
    assert exported["valid"] is True
    assert exported["run"] == saved
    assert delete_run(session.run_id, tmp_path)["deleted"] is True
    assert run_library_payload(tmp_path)["runs"] == []


def test_atomic_save_retries_a_transient_windows_sharing_violation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _session(run_id="run-retry")
    document = session.to_run_document()
    real_replace = os.replace
    attempts = 0

    def transient_replace(source: str | Path, destination: str | Path) -> None:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise PermissionError("transient sharing violation")
        real_replace(source, destination)

    monkeypatch.setattr(os, "replace", transient_replace)

    assert save_run_document(document, tmp_path) == document
    assert attempts == 3
    assert read_run_document("run-retry", tmp_path) == document


def test_run_export_retries_a_transient_windows_read_gap(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = _session(run_id="run-read-retry")
    document = session.to_run_document()
    save_run_document(document, tmp_path)
    record = tmp_path / "runs" / session.run_id / "run.json"
    real_read_text = Path.read_text
    attempts = 0

    def transient_read_text(path: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal attempts
        if path == record:
            attempts += 1
            if attempts < 3:
                raise PermissionError("transient sharing violation")
        return real_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", transient_read_text)

    exported = export_run_payload(session.run_id, tmp_path)
    assert exported["valid"] is True
    assert exported["run"] == document
    assert attempts == 3


def test_tampered_checkpoint_digest_isolated_without_blocking_valid_run(
    tmp_path: Path,
) -> None:
    valid = _session(run_id="run-valid")
    save_run_document(valid.to_run_document(), tmp_path)

    tampered = _session(run_id="run-tampered").to_run_document()
    checkpoint = tampered["checkpoint"]
    assert isinstance(checkpoint, dict)
    checkpoint["sha256"] = "0" * 64
    record = tmp_path / "runs" / "run-tampered"
    record.mkdir(parents=True)
    (record / "run.json").write_text(json.dumps(tampered), encoding="utf-8")

    library = run_library_payload(tmp_path)
    runs = library["runs"]
    assert isinstance(runs, list)
    assert [run["runId"] for run in runs if isinstance(run, dict)] == ["run-valid"]
    assert library["isolated"] == [
        {
            "record": "run-tampered",
            "code": "CORRUPT_RUN_RECORD",
            "message": "This local run could not be read and was isolated.",
        }
    ]


def test_shared_phase8_run_document_validates_in_python() -> None:
    fixture: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert validate_run_document(fixture) == fixture
