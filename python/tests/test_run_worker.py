"""Training advances on Python's own worker after Start or Resume, never because of observe."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, cast

import pytest

import evo_racer.run_manager as run_manager_module
from evo_racer.observer import RunSession
from evo_racer.run_library import read_run_document, save_run_document
from evo_racer.run_manager import RunManager

WAIT_SECONDS = 120.0


def _setup(algorithm: str = "fixed-ga", generations: int = 3, seed: int = 31) -> dict[str, Any]:
    return {
        "contractVersion": 1,
        "trackPreset": "easy-oval",
        "track": None,
        "settings": {
            "algorithm": algorithm,
            "populationSize": 10,
            "generations": generations,
            "episodeSeconds": 15,
            "seed": seed,
        },
    }


def _start(manager: RunManager, **kwargs: Any) -> str:
    response = manager.start(_setup(**kwargs))
    assert response["valid"] is True
    return cast(str, cast(dict[str, Any], response["snapshot"])["runId"])


def _snapshot(manager: RunManager, run_id: str) -> dict[str, Any]:
    response = manager.observe({"contractVersion": 1, "runId": run_id})
    assert response["valid"] is True, response
    return cast(dict[str, Any], response["snapshot"])


def _durable(snapshot: dict[str, Any]) -> dict[str, Any]:
    """The deterministic outcome of a run, without its id or transient live fields."""
    result = dict(snapshot["result"] or {})
    metadata = dict(result.get("metadata", {}))
    metadata.pop("runId", None)
    result["metadata"] = metadata
    replay = dict(result.get("replay", {}))
    return {
        "status": snapshot["status"],
        "generation": snapshot["generation"],
        "fitnessHistory": snapshot["fitnessHistory"],
        "generationReport": snapshot["generationReport"],
        "champion": result.get("champion"),
        "baselines": result.get("baselineComparisons"),
        "replay": replay,
        "metadata": metadata,
    }


def test_a_started_run_completes_without_any_observe(tmp_path: Path) -> None:
    for algorithm in ("fixed-ga", "neat"):
        manager = RunManager(tmp_path / algorithm)
        run_id = _start(manager, algorithm=algorithm)

        assert manager.wait_until_idle(run_id, WAIT_SECONDS)

        document = read_run_document(run_id, tmp_path / algorithm)
        checkpoint = cast(dict[str, Any], document["checkpoint"])
        assert checkpoint["status"] == "completed"
        assert checkpoint["generation"] == 3
        assert cast(dict[str, Any], checkpoint["snapshot"])["result"] is not None
        manager.close()


def test_observe_never_creates_a_worker(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manager = RunManager(tmp_path)
    run_id = _start(manager, generations=2)
    manager.command({"contractVersion": 1, "runId": run_id, "command": "pause"})
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)
    paused = _snapshot(manager, run_id)
    assert paused["status"] == "paused"

    def no_worker(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("observe must not start a generation worker")

    monkeypatch.setattr(run_manager_module, "Thread", no_worker)
    for _ in range(5):
        assert _snapshot(manager, run_id)["generation"] == paused["generation"]
    manager.close()


def test_polling_frequency_does_not_change_the_outcome(tmp_path: Path) -> None:
    outcomes = []
    for name, polls in (("none", 0), ("sparse", 2), ("busy", 200)):
        manager = RunManager(tmp_path / name)
        run_id = _start(manager)
        for _ in range(polls):
            _snapshot(manager, run_id)
        assert manager.wait_until_idle(run_id, WAIT_SECONDS)
        outcomes.append(_durable(_snapshot(manager, run_id)))
        manager.close()
    assert outcomes[0]["status"] == "completed"
    assert outcomes[0] == outcomes[1] == outcomes[2]


def test_pause_and_resume_match_an_uninterrupted_run(tmp_path: Path) -> None:
    straight = RunManager(tmp_path / "straight")
    straight_id = _start(straight)
    assert straight.wait_until_idle(straight_id, WAIT_SECONDS)
    expected = _durable(_snapshot(straight, straight_id))

    manager = RunManager(tmp_path / "paused")
    run_id = _start(manager)
    manager.command({"contractVersion": 1, "runId": run_id, "command": "pause"})
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)
    paused = _snapshot(manager, run_id)
    assert paused["status"] == "paused"
    assert 1 <= paused["generation"] < 3
    # Repeated resumes start at most one worker.
    for _ in range(3):
        manager.command({"contractVersion": 1, "runId": run_id, "command": "resume"})
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    assert _durable(_snapshot(manager, run_id)) == expected
    straight.close()
    manager.close()


def test_one_worker_per_run_even_with_repeated_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    release = threading.Event()
    advances: list[str] = []
    original_advance = RunSession.advance

    def gated_advance(session: RunSession) -> None:
        advances.append(threading.current_thread().name)
        assert release.wait(WAIT_SECONDS)
        original_advance(session)

    monkeypatch.setattr(RunSession, "advance", gated_advance)
    manager = RunManager(tmp_path)
    run_id = _start(manager, generations=2)
    for _ in range(5):
        manager.command({"contractVersion": 1, "runId": run_id, "command": "resume"})
        manager.resume({"contractVersion": 1, "runId": run_id})
    release.set()
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    assert len(advances) == 2
    assert len(set(advances)) == 1
    assert _snapshot(manager, run_id)["status"] == "completed"
    manager.close()


def test_stop_ends_at_the_generation_boundary(tmp_path: Path) -> None:
    manager = RunManager(tmp_path)
    run_id = _start(manager, generations=5)
    manager.command({"contractVersion": 1, "runId": run_id, "command": "stop"})
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    snapshot = _snapshot(manager, run_id)
    assert snapshot["status"] == "stopped"
    assert 1 <= snapshot["generation"] < 5
    assert snapshot["result"] is not None
    checkpoint = cast(dict[str, Any], read_run_document(run_id, tmp_path)["checkpoint"])
    assert checkpoint["status"] == "stopped"
    assert checkpoint["generation"] == snapshot["generation"]
    manager.close()


def test_a_deleted_run_is_never_written_again(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    entered = threading.Event()
    release = threading.Event()
    original_advance = RunSession.advance

    def gated_advance(session: RunSession) -> None:
        entered.set()
        assert release.wait(WAIT_SECONDS)
        original_advance(session)

    monkeypatch.setattr(RunSession, "advance", gated_advance)
    manager = RunManager(tmp_path)
    run_id = _start(manager, generations=2)
    assert entered.wait(WAIT_SECONDS)

    assert manager.delete(run_id)["deleted"] is True
    release.set()
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    with pytest.raises(FileNotFoundError):
        read_run_document(run_id, tmp_path)
    manager.close()


def test_closing_the_manager_starts_no_further_generation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    entered = threading.Event()
    release = threading.Event()
    calls: list[int] = []
    original_advance = RunSession.advance

    def gated_advance(session: RunSession) -> None:
        calls.append(len(session.reports))
        entered.set()
        assert release.wait(WAIT_SECONDS)
        original_advance(session)

    monkeypatch.setattr(RunSession, "advance", gated_advance)
    manager = RunManager(tmp_path)
    run_id = _start(manager, generations=4)
    assert entered.wait(WAIT_SECONDS)

    manager.close()
    release.set()
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    assert calls == [0]
    checkpoint = cast(dict[str, Any], read_run_document(run_id, tmp_path)["checkpoint"])
    assert checkpoint["generation"] == 1
    assert checkpoint["status"] == "running"


def test_a_failed_save_is_reported_not_shown_as_completed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager = RunManager(tmp_path)
    original_save = save_run_document
    saves: list[int] = []

    def failing_after_start(document: object, data_root: Path | None = None) -> object:
        saves.append(1)
        if len(saves) > 1:
            raise OSError("disk full")
        return original_save(document, data_root)

    monkeypatch.setattr(run_manager_module, "save_run_document", failing_after_start)
    run_id = _start(manager, generations=1)
    assert manager.wait_until_idle(run_id, WAIT_SECONDS)

    response = manager.observe({"contractVersion": 1, "runId": run_id})
    assert response["valid"] is False
    errors = cast(list[dict[str, Any]], response["errors"])
    assert errors[0]["code"] == "RUN_ADVANCE_FAILED"
    manager.close()


def test_startup_listing_and_opening_a_saved_run_do_not_train(tmp_path: Path) -> None:
    first = RunManager(tmp_path)
    run_id = _start(first, generations=4)
    first.command({"contractVersion": 1, "runId": run_id, "command": "pause"})
    assert first.wait_until_idle(run_id, WAIT_SECONDS)
    first.close()
    saved = cast(dict[str, Any], read_run_document(run_id, tmp_path)["checkpoint"])

    restarted = RunManager(tmp_path)
    assert run_id in {run["runId"] for run in cast(list[Any], restarted.library()["runs"])}
    restarted.export(run_id)

    assert restarted._workers == {}
    assert read_run_document(run_id, tmp_path)["checkpoint"] == saved
    # Only the explicit Resume continues it, and then it finishes on its own.
    assert restarted.resume({"contractVersion": 1, "runId": run_id})["valid"] is True
    assert restarted.wait_until_idle(run_id, WAIT_SECONDS)
    final = cast(dict[str, Any], read_run_document(run_id, tmp_path)["checkpoint"])
    assert final["status"] == "completed"
    assert final["generation"] == 4
    restarted.close()
