"""Run lifecycle: the training worker of each run and its generation-boundary saves."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from threading import RLock, Thread, current_thread
from typing import Final, cast

from evo_racer.observer import (
    OBSERVATION_CONTRACT_VERSION,
    RunSession,
    RunSettings,
)
from evo_racer.onboarding import validate_setup
from evo_racer.run_library import (
    RunRecordError,
    delete_run,
    export_run_payload,
    read_run_document,
    run_library_payload,
    save_run_document,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

LOGGER: Final = logging.getLogger(__name__)


class RunManager:
    """Own active sessions, their training workers, and their generation-boundary files.

    Training advances only on a worker started by an explicit Start, Resume, or
    resume command. Each run has at most one worker; it advances and saves one
    generation at a time until the run pauses, stops, completes, is deleted, or
    the manager closes. Observing a run only reads it.

    Lock order is manager lock, then session lock. A session never takes the
    manager lock, and no thread is joined while the manager lock is held.
    """

    def __init__(self, data_root: Path | None = None) -> None:
        self._sessions: dict[str, RunSession] = {}
        self._workers: dict[str, Thread] = {}
        self._worker_errors: dict[str, str] = {}
        self._data_root = data_root
        self._lock = RLock()
        self._closed = False

    def start(self, payload: object) -> dict[str, object]:
        validation = validate_setup(payload)
        if not validation["valid"]:
            return {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "valid": False,
                "errors": validation["errors"],
            }
        assert isinstance(payload, dict)
        settings_value = payload["settings"]
        assert isinstance(settings_value, dict)
        assert settings_value["algorithm"] in {"fixed-ga", "neat"}
        run_id = f"run-{uuid.uuid4().hex}"
        session = RunSession(
            run_id=run_id,
            compiled_track=_resolve_compiled_track(payload),
            settings=RunSettings.from_payload(settings_value),
        )
        with self._lock:
            self._sessions[run_id] = session
        self._persist(session)
        self._ensure_worker(session)
        return self._response(session)

    def observe(self, payload: object) -> dict[str, object]:
        session = self._session_from_payload(payload)
        if isinstance(session, dict):
            return session
        assert isinstance(payload, dict)
        known_replay = payload.get("knownGenerationReplayCandidateId")
        if known_replay is not None and (not isinstance(known_replay, str) or not known_replay):
            return _run_error(
                "KNOWN_REPLAY_ID_INVALID",
                "knownGenerationReplayCandidateId",
                "Known generation replay candidate id must be a non-empty string.",
            )
        known_race = payload.get("knownGenerationRace")
        if known_race is not None and (
            not isinstance(known_race, int) or isinstance(known_race, bool) or known_race < 1
        ):
            return _run_error(
                "KNOWN_RACE_INVALID",
                "knownGenerationRace",
                "Known generation race must be a positive integer.",
            )
        with self._lock:
            worker_error = self._worker_errors.get(session.run_id)
            worker = self._workers.get(session.run_id)
        if worker_error is not None:
            return _run_error(
                "RUN_ADVANCE_FAILED",
                "runId",
                "The local core could not advance this generation.",
            )
        snapshot = session.snapshot(
            known_generation_replay_candidate_id=known_replay,
            known_generation_race=known_race,
        )
        if snapshot["result"] is not None and worker is not None and worker.is_alive():
            # The final generation's result is shown only once its save has finished.
            worker.join()
            with self._lock:
                worker_error = self._worker_errors.get(session.run_id)
            if worker_error is not None:
                return _run_error(
                    "RUN_ADVANCE_FAILED",
                    "runId",
                    "The local core could not persist this generation.",
                )
            snapshot = session.snapshot(
                known_generation_replay_candidate_id=known_replay,
                known_generation_race=known_race,
            )
        return self._response(session, snapshot=snapshot)

    def command(self, payload: object) -> dict[str, object]:
        session = self._session_from_payload(payload)
        if isinstance(session, dict):
            return session
        assert isinstance(payload, dict)
        command = payload.get("command")
        if command not in {"pause", "resume", "stop"}:
            return _run_error(
                "UNKNOWN_RUN_COMMAND",
                "command",
                "Run command must be pause, resume, or stop.",
            )
        session.command(cast(str, command))
        with self._lock:
            # A generation in progress applies a queued pause or stop and saves it itself.
            if self._sessions.get(session.run_id) is session and not session.is_advancing():
                self._persist(session)
        self._ensure_worker(session)
        return self._response(session)

    def resume(self, payload: object) -> dict[str, object]:
        """Explicitly restore one supported interrupted generation boundary."""
        run_id = _run_id_from_payload(payload)
        if isinstance(run_id, dict):
            return run_id
        with self._lock:
            session = self._sessions.get(run_id)
        if session is None:
            try:
                document = read_run_document(run_id, self._data_root)
                session = RunSession.from_run_document(document)
            except FileNotFoundError:
                return _run_error("RUN_NOT_FOUND", "runId", "The local run does not exist.")
            except (RunRecordError, ValueError):
                return _run_error(
                    "RUN_CHECKPOINT_INVALID",
                    "runId",
                    "The local run checkpoint could not be restored deterministically.",
                )
            with self._lock:
                self._sessions[run_id] = session
        if session.status not in {"running", "paused"}:
            return _run_error(
                "RUN_NOT_RESUMABLE",
                "runId",
                "Only an interrupted running or paused run can be resumed.",
            )
        session.command("resume")
        self._persist(session)
        self._ensure_worker(session)
        return self._response(session, include_setup=True)

    def library(self) -> dict[str, object]:
        """Return durable local run summaries and isolated corrupt records."""
        return run_library_payload(self._data_root)

    def export(self, run_id: str) -> dict[str, object]:
        """Return one validated run document for a local JSON download."""
        return export_run_payload(run_id, self._data_root)

    def delete(self, run_id: str) -> dict[str, object]:
        """Delete one durable run and discard any matching in-memory session."""
        with self._lock:
            self._sessions.pop(run_id, None)
            self._worker_errors.pop(run_id, None)
        try:
            return delete_run(run_id, self._data_root)
        except RunRecordError:
            return {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "deleted": False,
                "runId": run_id,
                "error": "RUN_ID_INVALID",
            }

    def _session_from_payload(
        self,
        payload: object,
    ) -> RunSession | dict[str, object]:
        if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
            return _run_error(
                "UNSUPPORTED_OBSERVATION_VERSION",
                "contractVersion",
                "Run command contractVersion must be 1.",
            )
        run_id = payload.get("runId")
        if not isinstance(run_id, str) or not run_id:
            return _run_error("RUN_ID_REQUIRED", "runId", "A runId is required.")
        with self._lock:
            session = self._sessions.get(run_id)
        if session is None:
            return _run_error("RUN_NOT_FOUND", "runId", "The local run does not exist.")
        return session

    def _persist(self, session: RunSession) -> None:
        save_run_document(session.to_run_document(), self._data_root)

    def close(self) -> None:
        """Start no further generation; a generation already running still saves."""
        with self._lock:
            self._closed = True

    def wait_until_idle(self, run_id: str, timeout: float) -> bool:
        """Wait up to ``timeout`` seconds for the run's worker to exit."""
        with self._lock:
            worker = self._workers.get(run_id)
        if worker is None:
            return True
        worker.join(timeout)
        return not worker.is_alive()

    def _ensure_worker(self, session: RunSession) -> None:
        """Start the run's worker unless one exists or the run cannot advance."""
        with self._lock:
            run_id = session.run_id
            if (
                self._closed
                or run_id in self._workers
                or run_id in self._worker_errors
                or self._sessions.get(run_id) is not session
                or not session.can_advance()
            ):
                return
            worker = Thread(
                target=self._train,
                args=(session,),
                name=f"evo-racer-training-{run_id}",
                daemon=True,
            )
            self._workers[run_id] = worker
            worker.start()

    def _train(self, session: RunSession) -> None:
        """Advance and save generations until the run can no longer advance."""
        run_id = session.run_id
        try:
            while True:
                # Deciding to exit and leaving the registry happen under one lock, so a
                # resume that arrives meanwhile either sees this worker or starts a new one.
                with self._lock:
                    if (
                        self._closed
                        or self._sessions.get(run_id) is not session
                        or not session.can_advance()
                    ):
                        if self._workers.get(run_id) is current_thread():
                            del self._workers[run_id]
                        return
                session.advance()
                with self._lock:
                    if self._sessions.get(run_id) is not session:
                        return
                    self._persist(session)
        except Exception as error:
            # Worker boundary: the client only receives a stable error code, so keep the cause.
            LOGGER.exception("Training worker failed for run %s", run_id)
            with self._lock:
                self._worker_errors[run_id] = type(error).__name__
        finally:
            with self._lock:
                if self._workers.get(run_id) is current_thread():
                    self._workers.pop(run_id, None)

    def _response(
        self,
        session: RunSession,
        *,
        include_setup: bool = False,
        snapshot: dict[str, object] | None = None,
    ) -> dict[str, object]:
        snapshot = session.snapshot() if snapshot is None else snapshot
        if snapshot["result"] is not None:
            library = self.library()
            stored_runs = cast(list[dict[str, object]], library["runs"])
            result = cast(dict[str, object], snapshot["result"])
            metadata = cast(dict[str, object], result["metadata"])
            snapshot["previousRuns"] = [
                {
                    "runId": run["runId"],
                    "algorithm": run["algorithm"],
                    "trackId": run["trackId"],
                    "seed": run["seed"],
                    "generationsCompleted": run["generation"],
                    "populationSize": run["populationSize"],
                    "episodeSeconds": run["episodeSeconds"],
                    "championFitness": run["championFitness"],
                    "championProgress": run["championProgress"],
                }
                for run in stored_runs
                if run["runId"] != session.run_id
                and run["trackSha256"] == metadata["trackSha256"]
                and run["simulationContractVersion"] == metadata["simulationContractVersion"]
                and run["populationSize"] == metadata["populationSize"]
                and run["totalGenerations"] == metadata["generationsRequested"]
                and run["generation"] == metadata["generationsCompleted"]
                and run["episodeSeconds"] == metadata["episodeSeconds"]
                and isinstance(run["championFitness"], float)
                and isinstance(run["championProgress"], float)
            ]
        response = {
            "contractVersion": OBSERVATION_CONTRACT_VERSION,
            "valid": True,
            "errors": [],
            "snapshot": snapshot,
        }
        if include_setup:
            response["setup"] = _setup_payload(session)
        return response


def _resolve_compiled_track(payload: dict[object, object]) -> dict[str, object]:
    track_value = payload.get("track")
    if track_value is not None:
        return compile_track_payload(track_value)
    preset_id = payload.get("trackPreset")
    preset = next(
        (candidate for candidate in PRESET_TRACKS if candidate.track_id == preset_id),
        None,
    )
    if preset is None:
        raise ValueError("Validated setup is missing its track.")
    return compile_track_payload(preset.to_payload())


def _setup_payload(session: RunSession) -> dict[str, object]:
    track = session.track
    track_id = cast(str, track["id"])
    preset_ids = {preset.track_id for preset in PRESET_TRACKS}
    return {
        "contractVersion": 1,
        "trackPreset": track_id,
        "track": None if track_id in preset_ids else track,
        "settings": session.settings.to_payload(),
    }


def _run_id_from_payload(payload: object) -> str | dict[str, object]:
    if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
        return _run_error(
            "UNSUPPORTED_OBSERVATION_VERSION",
            "contractVersion",
            "Run command contractVersion must be 1.",
        )
    run_id = payload.get("runId")
    if not isinstance(run_id, str) or not run_id:
        return _run_error("RUN_ID_REQUIRED", "runId", "A runId is required.")
    return run_id


def _run_error(code: str, field: str, message: str) -> dict[str, object]:
    return {
        "contractVersion": OBSERVATION_CONTRACT_VERSION,
        "valid": False,
        "errors": [{"code": code, "field": field, "message": message}],
    }
