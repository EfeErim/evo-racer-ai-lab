"""Deterministic run control, observation, replay, and Phase 8 recovery."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from threading import RLock, Thread, current_thread
from typing import Any, Final, Literal, cast

from evo_racer.evolution import (
    EVOLUTION_CONTRACT_VERSION,
    CandidateEvaluation,
    FixedCandidate,
    FixedGA,
    FixedGAConfig,
    GenerationReport,
    ScoredCandidate,
    episode_fitness,
)
from evo_racer.neat_evolution import (
    EvoRacerGenome,
    NEATCandidate,
    NEATGenerationReport,
    NEATScoredCandidate,
    compile_neat_network,
    create_neat_population,
)
from evo_racer.onboarding import validate_setup
from evo_racer.run_library import (
    RUN_DOCUMENT_KIND,
    RUN_SCHEMA_VERSION,
    RunRecordError,
    checkpoint_sha256,
    delete_run,
    export_run_payload,
    read_run_document,
    run_library_payload,
    save_run_document,
    validate_run_document,
)
from evo_racer.simulation import (
    FIXED_TIME_STEP,
    SIMULATION_CONTRACT_VERSION,
    EpisodeResult,
    PurePursuitBaseline,
    RandomNetworkBaseline,
    TelemetrySnapshot,
    TrackGeometry,
    evaluate_episode,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

OBSERVATION_CONTRACT_VERSION: Final = 1
REPLAY_INTERVAL_STEPS: Final = 6
GENERATION_TRAIL_LIMIT: Final = 8
GENERATION_TRAIL_POINT_LIMIT: Final = 64
type RunStatus = Literal["running", "paused", "stopped", "completed"]
type GenerationReportValue = GenerationReport | NEATGenerationReport
type ScoredCandidateValue = ScoredCandidate | NEATScoredCandidate


@dataclass(frozen=True, slots=True)
class RunSettings:
    """Frozen authoritative settings for one run."""

    algorithm: Literal["fixed-ga", "neat"]
    population_size: int
    generations: int
    episode_seconds: float
    seed: int


class RunSession:
    """Advance one deterministic generation per explicit batch command."""

    def __init__(
        self,
        *,
        run_id: str,
        compiled_track: dict[str, object],
        settings: RunSettings,
    ) -> None:
        self.run_id = run_id
        self.compiled_track = compiled_track
        self.geometry = TrackGeometry.from_compiled(compiled_track)
        self.settings = settings
        self.status: RunStatus = "running"
        self.reports: list[GenerationReportValue] = []
        self.current_episode: EpisodeResult | None = None
        self.result: dict[str, object] | None = None
        self._generation_trails: list[dict[str, object]] = []
        self._best: ScoredCandidateValue | None = None
        self._lock = RLock()
        self._advancing = False
        self._active_candidate_id: str | None = None
        self._active_candidate_index: int | None = None
        self._live_telemetry: TelemetrySnapshot | None = None
        self._pending_command: Literal["pause", "stop"] | None = None
        self._fixed_ga: FixedGA | None = None
        self._neat_population: Any | None = None
        self._neat_config: Any | None = None
        if settings.algorithm == "fixed-ga":
            self._fixed_ga = FixedGA(
                FixedGAConfig(
                    population_size=settings.population_size,
                    elite_count=min(2, settings.population_size - 1),
                    tournament_size=min(3, settings.population_size),
                ),
                settings.seed,
            )
        else:
            self._neat_population, self._neat_config = create_neat_population(
                population_size=settings.population_size,
                seed=settings.seed,
            )

    def advance(self) -> None:
        """Run one complete generation without using UI or wall-clock cadence."""
        with self._lock:
            if self.status != "running" or self._advancing:
                return
            if len(self.reports) >= self.settings.generations:
                self._finalize("completed")
                return
            self._advancing = True
            self._active_candidate_id = None
            self._active_candidate_index = None
            self._live_telemetry = None
        try:
            report: GenerationReportValue
            if self.settings.algorithm == "fixed-ga":
                fixed_report, episodes = self._advance_fixed_ga()
                report = fixed_report
            else:
                neat_report, episodes = self._advance_neat()
                report = neat_report
        except Exception:
            with self._lock:
                self._clear_live_progress()
            raise
        with self._lock:
            self.reports.append(report)
            champion = _ranked(report.results)[0]
            self.current_episode = episodes[champion.candidate.candidate_id]
            self._generation_trails.append(
                {
                    "runId": self.run_id,
                    "candidateId": champion.candidate.candidate_id,
                    "generation": report.generation,
                    "points": _sample_generation_trail(self.current_episode.telemetry),
                }
            )
            self._generation_trails = self._generation_trails[-GENERATION_TRAIL_LIMIT:]
            if self._best is None or _candidate_sort_key(champion) < _candidate_sort_key(
                self._best
            ):
                self._best = champion
            pending_command = self._pending_command
            self._pending_command = None
            self._clear_live_progress()
            if len(self.reports) >= self.settings.generations:
                self._finalize("completed")
            elif pending_command is not None:
                self._apply_command(pending_command)

    def command(self, command: str) -> None:
        """Apply pause, resume, or stop only at deterministic batch boundaries."""
        with self._lock:
            if (
                command in {"pause", "stop"}
                and self.status == "running"
                and (self._advancing or not self.reports)
            ):
                self._pending_command = cast(Literal["pause", "stop"], command)
                return
            self._apply_command(command)

    def can_advance(self) -> bool:
        """Return whether a background generation may be started."""
        with self._lock:
            return (
                self.status == "running"
                and not self._advancing
                and len(self.reports) < self.settings.generations
            )

    def is_advancing(self) -> bool:
        """Return whether Python is currently evaluating one generation."""
        with self._lock:
            return self._advancing

    def snapshot(
        self,
        *,
        include_live: bool = True,
        known_generation_replay_candidate_id: str | None = None,
    ) -> dict[str, object]:
        """Return the current versioned observer value."""
        with self._lock:
            latest = self.reports[-1] if self.reports else None
            live_telemetry = self._live_telemetry if include_live else None
            selected = (
                live_telemetry.to_payload()
                if live_telemetry is not None
                else self.current_episode.telemetry[-1].to_payload()
                if self.current_episode is not None
                else None
            )
            active_candidate = (
                {
                    "candidateId": self._active_candidate_id,
                    "index": self._active_candidate_index,
                    "total": self.settings.population_size,
                }
                if include_live
                and self._advancing
                and self._active_candidate_id is not None
                and self._active_candidate_index is not None
                else None
            )
            response: dict[str, object] = {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "runId": self.run_id,
                "status": self.status,
                "generation": len(self.reports),
                "totalGenerations": self.settings.generations,
                "generationInProgress": include_live and self._advancing,
                "activeCandidate": active_candidate,
                "pendingCommand": self._pending_command if include_live else None,
                "generationReport": latest.to_payload() if latest is not None else None,
                "fitnessHistory": [
                    {
                        "generation": report.generation,
                        "bestFitness": _rounded(report.best_fitness),
                        "medianFitness": _rounded(report.median_fitness),
                    }
                    for report in self.reports
                ],
                "selectedCar": selected,
                "result": self.result,
                "generationTrails": [
                    {
                        **trail,
                        "points": [
                            list(point) for point in cast(list[list[float]], trail["points"])
                        ],
                    }
                    for trail in self._generation_trails
                ],
                "previousRuns": [],
            }
            if include_live:
                replay_candidate_id = (
                    self.current_episode.telemetry[0].selected_car_id
                    if self.current_episode is not None
                    else None
                )
                if replay_candidate_id is None:
                    response["generationReplay"] = None
                elif replay_candidate_id != known_generation_replay_candidate_id:
                    assert self.current_episode is not None
                    response["generationReplay"] = {
                        "candidateId": replay_candidate_id,
                        "frames": [
                            _replay_frame(frame) for frame in self.current_episode.telemetry
                        ],
                    }
            return response

    def to_run_document(self) -> dict[str, object]:
        """Serialize the current generation boundary into the version 1 run schema."""
        snapshot = self.snapshot(include_live=False)
        track = cast(dict[str, object], self.compiled_track["track"])
        return {
            "schemaVersion": RUN_SCHEMA_VERSION,
            "kind": RUN_DOCUMENT_KIND,
            "runId": self.run_id,
            "trackSchemaVersion": track["schemaVersion"],
            "track": track,
            "settings": _settings_payload(self.settings),
            "checkpoint": {
                "generation": len(self.reports),
                "status": self.status,
                "snapshot": snapshot,
                "sha256": checkpoint_sha256(snapshot),
            },
        }

    @classmethod
    def from_run_document(cls, payload: object) -> RunSession:
        """Rebuild a saved generation boundary and fail on deterministic drift."""
        document = validate_run_document(payload)
        settings_value = cast(dict[str, object], document["settings"])
        checkpoint = cast(dict[str, object], document["checkpoint"])
        expected_snapshot = cast(dict[str, object], checkpoint["snapshot"])
        status = cast(RunStatus, checkpoint["status"])
        session = cls(
            run_id=cast(str, document["runId"]),
            compiled_track=compile_track_payload(document["track"]),
            settings=RunSettings(
                algorithm=cast(Literal["fixed-ga", "neat"], settings_value["algorithm"]),
                population_size=cast(int, settings_value["populationSize"]),
                generations=cast(int, settings_value["generations"]),
                episode_seconds=float(cast(float, settings_value["episodeSeconds"])),
                seed=cast(int, settings_value["seed"]),
            ),
        )
        generation = cast(int, checkpoint["generation"])
        for _ in range(generation):
            session.advance()
        if status == "stopped":
            session.command("stop")
        elif status in {"running", "paused"}:
            session.command("pause")
        actual_projection = _resume_projection(session.snapshot())
        expected_projection = _resume_projection(expected_snapshot)
        if "generationTrails" not in expected_projection:
            actual_projection.pop("generationTrails", None)
        if actual_projection != expected_projection:
            raise RunRecordError(
                "Saved checkpoint does not reproduce from its track, settings, and seed."
            )
        return session

    def _apply_command(self, command: str) -> None:
        """Apply one control command while the session lock is held."""
        if command == "pause" and self.status == "running":
            self.status = "paused"
        elif command == "resume" and self.status == "paused":
            self.status = "running"
        elif command == "stop" and self.status in {"running", "paused"}:
            if self.reports:
                self._finalize("stopped")
            else:
                self.status = "stopped"

    def _clear_live_progress(self) -> None:
        """Clear transient in-generation state while the session lock is held."""
        self._advancing = False
        self._active_candidate_id = None
        self._active_candidate_index = None
        self._live_telemetry = None

    def _begin_live_candidate(self, candidate_id: str, index: int) -> None:
        with self._lock:
            self._active_candidate_id = candidate_id
            self._active_candidate_index = index
            self._live_telemetry = None

    def _publish_live_telemetry(self, snapshot: TelemetrySnapshot) -> None:
        with self._lock:
            self._live_telemetry = snapshot

    def _advance_fixed_ga(
        self,
    ) -> tuple[GenerationReport, dict[str, EpisodeResult]]:
        ga = self._fixed_ga
        if ga is None:
            raise RuntimeError("Fixed GA session is not initialized.")
        episodes: dict[str, EpisodeResult] = {}
        candidate_index = 0

        def evaluator(candidate: FixedCandidate) -> CandidateEvaluation:
            nonlocal candidate_index
            candidate_index += 1
            self._begin_live_candidate(candidate.candidate_id, candidate_index)
            episode = evaluate_episode(
                self.geometry,
                candidate.controller,
                candidate.setup,
                max_seconds=self.settings.episode_seconds,
                selected_car_id=candidate.candidate_id,
                telemetry_callback=self._publish_live_telemetry,
            )
            episodes[candidate.candidate_id] = episode
            return episode_fitness(
                episode,
                round(self.settings.episode_seconds / FIXED_TIME_STEP),
            )

        report = ga.evaluate(evaluator)
        if len(self.reports) + 1 < self.settings.generations:
            ga.advance(report)
        return report, episodes

    def _advance_neat(
        self,
    ) -> tuple[NEATGenerationReport, dict[str, EpisodeResult]]:
        population = self._neat_population
        config = self._neat_config
        if population is None or config is None:
            raise RuntimeError("NEAT session is not initialized.")
        episodes: dict[str, EpisodeResult] = {}
        produced: list[NEATGenerationReport] = []

        def evaluate_genomes(
            genomes: list[tuple[int, object]],
            active_config: object,
        ) -> None:
            generation = int(population.generation)
            scored: list[NEATScoredCandidate] = []
            for candidate_index, (genome_key, raw_value) in enumerate(
                sorted(genomes),
                start=1,
            ):
                if not isinstance(raw_value, EvoRacerGenome):
                    raise TypeError("NEAT population contains an unsupported genome.")
                candidate = NEATCandidate(
                    candidate_id=f"neat-g{generation:04d}-k{genome_key:06d}",
                    generation=generation,
                    network=compile_neat_network(raw_value, active_config),
                    vehicle=raw_value.vehicle_genome,
                )
                self._begin_live_candidate(candidate.candidate_id, candidate_index)
                before_vehicle = raw_value.vehicle_genome
                episode = evaluate_episode(
                    self.geometry,
                    candidate.controller,
                    candidate.setup,
                    max_seconds=self.settings.episode_seconds,
                    selected_car_id=candidate.candidate_id,
                    telemetry_callback=self._publish_live_telemetry,
                )
                if raw_value.vehicle_genome != before_vehicle:
                    raise RuntimeError("Vehicle genes changed during active evaluation.")
                evaluation = episode_fitness(
                    episode,
                    round(self.settings.episode_seconds / FIXED_TIME_STEP),
                )
                raw_value.fitness = evaluation.fitness
                episodes[candidate.candidate_id] = episode
                scored.append(NEATScoredCandidate(candidate, evaluation))
            ranked = _ranked(tuple(scored))
            values = [item.evaluation.fitness for item in scored]
            produced.append(
                NEATGenerationReport(
                    generation=generation,
                    champion_id=ranked[0].candidate.candidate_id,
                    best_fitness=ranked[0].evaluation.fitness,
                    median_fitness=statistics.median(values),
                    results=tuple(scored),
                )
            )

        population.run(evaluate_genomes, 1)
        if len(produced) != 1:
            raise RuntimeError("NEAT did not produce exactly one generation report.")
        return produced[0], episodes

    def _finalize(self, status: Literal["stopped", "completed"]) -> None:
        if self.result is not None:
            self.status = status
            return
        champion = self._best
        if champion is None:
            self.status = status
            return
        candidate = champion.candidate
        replay_episode = evaluate_episode(
            self.geometry,
            candidate.controller,
            candidate.setup,
            max_seconds=self.settings.episode_seconds,
            selected_car_id=candidate.candidate_id,
            telemetry_interval_steps=REPLAY_INTERVAL_STEPS,
        )
        random_episode = evaluate_episode(
            self.geometry,
            RandomNetworkBaseline(self.settings.seed),
            candidate.setup,
            max_seconds=self.settings.episode_seconds,
            selected_car_id="random-network-baseline",
        )
        pursuit_episode = evaluate_episode(
            self.geometry,
            PurePursuitBaseline(),
            candidate.setup,
            max_seconds=self.settings.episode_seconds,
            selected_car_id="pure-pursuit-baseline",
        )
        track = cast(dict[str, object], self.compiled_track["track"])
        track_json = json.dumps(track, separators=(",", ":"), sort_keys=True)
        genome = (
            candidate.genome.to_payload()
            if isinstance(candidate, FixedCandidate)
            else candidate.to_payload()
        )
        self.status = status
        max_steps = round(self.settings.episode_seconds / FIXED_TIME_STEP)
        self.result = {
            "metadata": {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "runId": self.run_id,
                "status": status,
                "algorithm": self.settings.algorithm,
                "seed": self.settings.seed,
                "trackId": str(track["id"]),
                "trackName": str(track["name"]),
                "trackSha256": hashlib.sha256(track_json.encode("utf-8")).hexdigest(),
                "populationSize": self.settings.population_size,
                "generationsRequested": self.settings.generations,
                "generationsCompleted": len(self.reports),
                "episodeSeconds": self.settings.episode_seconds,
                "fixedTimeStep": FIXED_TIME_STEP,
                "simulationContractVersion": SIMULATION_CONTRACT_VERSION,
                "evolutionContractVersion": EVOLUTION_CONTRACT_VERSION,
                "observationContractVersion": OBSERVATION_CONTRACT_VERSION,
            },
            "fitnessHistory": [
                {
                    "generation": report.generation,
                    "bestFitness": _rounded(report.best_fitness),
                    "medianFitness": _rounded(report.median_fitness),
                }
                for report in self.reports
            ],
            "champion": {
                "candidateId": candidate.candidate_id,
                "fitness": _rounded(champion.evaluation.fitness),
                "progress": _rounded(champion.evaluation.progress_fraction),
                "genome": genome,
                "vehicleSetup": candidate.setup.to_payload(),
            },
            "baselineComparisons": [
                _comparison_payload("Champion", replay_episode, max_steps),
                _comparison_payload("Seeded random network", random_episode, max_steps),
                _comparison_payload("Pure Pursuit", pursuit_episode, max_steps),
            ],
            "replay": {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "candidateId": candidate.candidate_id,
                "sampleEverySteps": REPLAY_INTERVAL_STEPS,
                "vehicleSetup": candidate.setup.to_payload(),
                "controllerParameters": [
                    _rounded(value) for value in replay_episode.controller_parameters
                ],
                "termination": replay_episode.termination,
                "frames": [_replay_frame(snapshot) for snapshot in replay_episode.telemetry],
            },
        }


class RunManager:
    """Own active sessions and their atomic Phase 8 generation-boundary files."""

    def __init__(self, data_root: Path | None = None) -> None:
        self._sessions: dict[str, RunSession] = {}
        self._workers: dict[str, Thread] = {}
        self._worker_errors: dict[str, str] = {}
        self._data_root = data_root
        self._lock = RLock()

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
        algorithm = settings_value["algorithm"]
        assert algorithm in {"fixed-ga", "neat"}
        compiled = _resolve_compiled_track(payload)
        run_id = f"run-{uuid.uuid4().hex}"
        session = RunSession(
            run_id=run_id,
            compiled_track=compiled,
            settings=RunSettings(
                algorithm=cast(Literal["fixed-ga", "neat"], algorithm),
                population_size=cast(int, settings_value["populationSize"]),
                generations=cast(int, settings_value["generations"]),
                episode_seconds=float(cast(int, settings_value["episodeSeconds"])),
                seed=cast(int, settings_value["seed"]),
            ),
        )
        with self._lock:
            self._sessions[run_id] = session
        self._persist(session)
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
        with self._lock:
            worker_error = self._worker_errors.get(session.run_id)
            worker = self._workers.get(session.run_id)
            if (
                worker_error is None
                and (worker is None or not worker.is_alive())
                and session.can_advance()
            ):
                worker = Thread(
                    target=self._advance_and_persist,
                    args=(session,),
                    name=f"evo-racer-generation-{session.run_id}",
                    daemon=True,
                )
                self._workers[session.run_id] = worker
                worker.start()
        if worker_error is not None:
            return _run_error(
                "RUN_ADVANCE_FAILED",
                "runId",
                "The local core could not advance this generation.",
            )
        snapshot = session.snapshot(known_generation_replay_candidate_id=known_replay)
        if snapshot["result"] is not None and worker is not None and worker.is_alive():
            worker.join()
            with self._lock:
                worker_error = self._worker_errors.get(session.run_id)
            if worker_error is not None:
                return _run_error(
                    "RUN_ADVANCE_FAILED",
                    "runId",
                    "The local core could not persist this generation.",
                )
            snapshot = session.snapshot(known_generation_replay_candidate_id=known_replay)
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
        if not session.is_advancing():
            self._persist(session)
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
                session = RunSession.from_run_document(read_run_document(run_id, self._data_root))
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

    def _advance_and_persist(self, session: RunSession) -> None:
        try:
            session.advance()
            with self._lock:
                if self._sessions.get(session.run_id) is not session:
                    return
                self._persist(session)
        except Exception as error:
            with self._lock:
                self._worker_errors[session.run_id] = type(error).__name__
        finally:
            with self._lock:
                if self._workers.get(session.run_id) is current_thread():
                    self._workers.pop(session.run_id, None)

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


def parse_observation_snapshot(payload: object) -> dict[str, object]:
    """Validate the shared observation fixture without adding browser-domain rules."""
    if not isinstance(payload, dict):
        raise ValueError("Observation snapshot must be an object.")
    if payload.get("contractVersion") != OBSERVATION_CONTRACT_VERSION:
        raise ValueError("Observation snapshot must use contractVersion 1.")
    if not isinstance(payload.get("runId"), str) or not payload["runId"]:
        raise ValueError("Observation snapshot requires a runId.")
    status = payload.get("status")
    if status not in {"running", "paused", "stopped", "completed"}:
        raise ValueError("Observation snapshot has an invalid status.")
    generation = payload.get("generation")
    total = payload.get("totalGenerations")
    if (
        not isinstance(generation, int)
        or isinstance(generation, bool)
        or not isinstance(total, int)
        or isinstance(total, bool)
        or generation < 0
        or total < 1
        or generation > total
    ):
        raise ValueError("Observation snapshot has invalid generation counters.")
    result = payload.get("result")
    terminal = status in {"stopped", "completed"}
    if not terminal and result is not None:
        raise ValueError("Non-terminal observation snapshots cannot contain a result.")
    if terminal and generation > 0 and result is None:
        raise ValueError(
            "Terminal observation snapshots require a result after one generation."
        )
    if status == "completed" and generation != total:
        raise ValueError(
            "Completed observation snapshots must include every requested generation."
        )
    if result is not None and not isinstance(result, dict):
        raise ValueError("Observation snapshot result must be an object or null.")
    if isinstance(result, dict):
        metadata = result.get("metadata")
        champion = result.get("champion")
        replay = result.get("replay")
        if (
            not isinstance(metadata, dict)
            or metadata.get("runId") != payload["runId"]
            or metadata.get("status") != status
            or metadata.get("generationsCompleted") != generation
            or metadata.get("generationsRequested") != total
        ):
            raise ValueError(
                "Run result identity does not match its observation snapshot."
            )
        if (
            not isinstance(champion, dict)
            or not isinstance(replay, dict)
            or replay.get("candidateId") != champion.get("candidateId")
        ):
            raise ValueError("Run replay does not match the result champion.")
    history = payload.get("fitnessHistory")
    if not isinstance(history, list):
        raise ValueError("Observation snapshot requires fitnessHistory.")
    if len(history) != generation:
        raise ValueError("Observation snapshot generation history is inconsistent.")
    for index, point in enumerate(history):
        if (
            not isinstance(point, dict)
            or point.get("generation") != index
            or any(
                not isinstance(point.get(field), (int, float))
                or isinstance(point.get(field), bool)
                or not math.isfinite(float(cast(float, point[field])))
                for field in ("bestFitness", "medianFitness")
            )
        ):
            raise ValueError("Observation snapshot generation history is inconsistent.")
    report = payload.get("generationReport")
    if (generation == 0):
        if report is not None:
            raise ValueError("Observation snapshot generation history is inconsistent.")
    elif not isinstance(report, dict) or report.get("generation") != generation - 1:
        raise ValueError("Observation snapshot generation history is inconsistent.")
    if isinstance(result, dict) and result.get("fitnessHistory") != history:
        raise ValueError("Run result fitness history does not match its observation.")
    return payload


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


def _ranked(
    candidates: tuple[ScoredCandidate, ...] | tuple[NEATScoredCandidate, ...],
) -> list[ScoredCandidateValue]:
    return sorted(candidates, key=_candidate_sort_key)


def _candidate_sort_key(candidate: ScoredCandidateValue) -> tuple[float, str]:
    return (-candidate.evaluation.fitness, candidate.candidate.candidate_id)


def _comparison_payload(
    label: str,
    episode: EpisodeResult,
    max_steps: int,
) -> dict[str, object]:
    evaluation = episode_fitness(episode, max_steps)
    return {
        "label": label,
        "controller": episode.controller,
        "fitness": _rounded(evaluation.fitness),
        "progress": _rounded(episode.progress_fraction),
        "finished": episode.finished,
        "collisionCount": episode.collision_count,
        "steps": episode.steps,
    }


def _replay_frame(snapshot: Any) -> dict[str, object]:
    return {
        "simulatedSeconds": _rounded(snapshot.simulated_seconds),
        "x": _rounded(snapshot.state.x),
        "y": _rounded(snapshot.state.y),
        "heading": _rounded(snapshot.state.heading),
        "speed": _rounded(snapshot.state.forward_speed),
        "lateralSpeed": _rounded(snapshot.state.lateral_speed),
        "steering": _rounded(snapshot.controls.steering),
        "throttle": _rounded(snapshot.controls.throttle),
        "brake": _rounded(snapshot.controls.brake),
        "progress": _rounded(snapshot.progress_fraction),
    }


def _settings_payload(settings: RunSettings) -> dict[str, object]:
    return {
        "algorithm": settings.algorithm,
        "populationSize": settings.population_size,
        "generations": settings.generations,
        "episodeSeconds": settings.episode_seconds,
        "seed": settings.seed,
    }


def _setup_payload(session: RunSession) -> dict[str, object]:
    track = cast(dict[str, object], session.compiled_track["track"])
    track_id = cast(str, track["id"])
    preset_ids = {preset.track_id for preset in PRESET_TRACKS}
    return {
        "contractVersion": 1,
        "trackPreset": track_id,
        "track": None if track_id in preset_ids else track,
        "settings": _settings_payload(session.settings),
    }


def _resume_projection(snapshot: dict[str, object]) -> dict[str, object]:
    transient = {
        "status",
        "previousRuns",
        "generationInProgress",
        "activeCandidate",
        "pendingCommand",
        "generationReplay",
    }
    projection = {key: value for key, value in snapshot.items() if key not in transient}
    selected = projection.get("selectedCar")
    if isinstance(selected, dict):
        projection["selectedCar"] = {
            key: value for key, value in selected.items() if key not in {"x", "y", "heading"}
        }
    return projection


def _sample_generation_trail(telemetry: Sequence[TelemetrySnapshot]) -> list[list[float]]:
    """Keep a bounded deterministic position summary for later presentation."""
    if len(telemetry) <= GENERATION_TRAIL_POINT_LIMIT:
        selected = telemetry
    else:
        last_index = len(telemetry) - 1
        selected = [
            telemetry[round(index * last_index / (GENERATION_TRAIL_POINT_LIMIT - 1))]
            for index in range(GENERATION_TRAIL_POINT_LIMIT)
        ]
    return [[_rounded(frame.state.x), _rounded(frame.state.y)] for frame in selected]


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


def _rounded(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("Observation values must be finite.")
    return round(value, 8)
