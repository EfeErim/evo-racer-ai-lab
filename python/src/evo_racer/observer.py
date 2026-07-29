"""Deterministic run control, observation, replay, and Phase 8 recovery."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
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
    TrackGeometry,
    evaluate_episode,
)
from evo_racer.tracks import PRESET_TRACKS, compile_track_payload

OBSERVATION_CONTRACT_VERSION: Final = 1
REPLAY_INTERVAL_STEPS: Final = 6
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
        self._best: ScoredCandidateValue | None = None
        self._lock = RLock()
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
            if self.status != "running":
                return
            if len(self.reports) >= self.settings.generations:
                self._finalize("completed")
                return
            report: GenerationReportValue
            if self.settings.algorithm == "fixed-ga":
                fixed_report, episodes = self._advance_fixed_ga()
                report = fixed_report
            else:
                neat_report, episodes = self._advance_neat()
                report = neat_report
            self.reports.append(report)
            champion = _ranked(report.results)[0]
            self.current_episode = episodes[champion.candidate.candidate_id]
            if self._best is None or _candidate_sort_key(champion) < _candidate_sort_key(
                self._best
            ):
                self._best = champion
            if len(self.reports) >= self.settings.generations:
                self._finalize("completed")

    def command(self, command: str) -> None:
        """Apply pause, resume, or stop only at deterministic batch boundaries."""
        with self._lock:
            if command == "pause" and self.status == "running":
                self.status = "paused"
            elif command == "resume" and self.status == "paused":
                self.status = "running"
            elif command == "stop" and self.status in {"running", "paused"}:
                if self.reports:
                    self._finalize("stopped")
                else:
                    self.status = "stopped"

    def snapshot(self) -> dict[str, object]:
        """Return the current versioned observer value."""
        with self._lock:
            latest = self.reports[-1] if self.reports else None
            selected = (
                self.current_episode.telemetry[-1].to_payload()
                if self.current_episode is not None
                else None
            )
            return {
                "contractVersion": OBSERVATION_CONTRACT_VERSION,
                "runId": self.run_id,
                "status": self.status,
                "generation": len(self.reports),
                "totalGenerations": self.settings.generations,
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
                "previousRuns": [],
            }

    def to_run_document(self) -> dict[str, object]:
        """Serialize the current generation boundary into the version 1 run schema."""
        snapshot = self.snapshot()
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
        if _resume_projection(session.snapshot()) != _resume_projection(expected_snapshot):
            raise RunRecordError(
                "Saved checkpoint does not reproduce from its track, settings, and seed."
            )
        return session

    def _advance_fixed_ga(
        self,
    ) -> tuple[GenerationReport, dict[str, EpisodeResult]]:
        ga = self._fixed_ga
        if ga is None:
            raise RuntimeError("Fixed GA session is not initialized.")
        episodes: dict[str, EpisodeResult] = {}

        def evaluator(candidate: FixedCandidate) -> CandidateEvaluation:
            episode = evaluate_episode(
                self.geometry,
                candidate.controller,
                candidate.setup,
                max_seconds=self.settings.episode_seconds,
                selected_car_id=candidate.candidate_id,
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
            for genome_key, raw_value in sorted(genomes):
                if not isinstance(raw_value, EvoRacerGenome):
                    raise TypeError("NEAT population contains an unsupported genome.")
                candidate = NEATCandidate(
                    candidate_id=f"neat-g{generation:04d}-k{genome_key:06d}",
                    generation=generation,
                    network=compile_neat_network(raw_value, active_config),
                    vehicle=raw_value.vehicle_genome,
                )
                before_vehicle = raw_value.vehicle_genome
                episode = evaluate_episode(
                    self.geometry,
                    candidate.controller,
                    candidate.setup,
                    max_seconds=self.settings.episode_seconds,
                    selected_car_id=candidate.candidate_id,
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
        session.advance()
        self._persist(session)
        return self._response(session)

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
        return self._response(session)

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

    def _response(self, session: RunSession) -> dict[str, object]:
        snapshot = session.snapshot()
        library = self.library()
        stored_runs = cast(list[dict[str, object]], library["runs"])
        previous = [
            {
                "runId": run["runId"],
                "algorithm": run["algorithm"],
                "trackId": run["trackId"],
                "seed": run["seed"],
                "generationsCompleted": run["generation"],
                "championFitness": run["championFitness"],
                "championProgress": run["championProgress"],
            }
            for run in stored_runs
            if run["runId"] != session.run_id
            and isinstance(run["championFitness"], float)
            and isinstance(run["championProgress"], float)
        ]
        snapshot["previousRuns"] = previous
        return {
            "contractVersion": OBSERVATION_CONTRACT_VERSION,
            "valid": True,
            "errors": [],
            "snapshot": snapshot,
            "setup": _setup_payload(session),
        }


def parse_observation_snapshot(payload: object) -> dict[str, object]:
    """Validate the shared observation fixture without adding browser-domain rules."""
    if not isinstance(payload, dict):
        raise ValueError("Observation snapshot must be an object.")
    if payload.get("contractVersion") != OBSERVATION_CONTRACT_VERSION:
        raise ValueError("Observation snapshot must use contractVersion 1.")
    if not isinstance(payload.get("runId"), str) or not payload["runId"]:
        raise ValueError("Observation snapshot requires a runId.")
    if payload.get("status") not in {"running", "paused", "stopped", "completed"}:
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
    history = payload.get("fitnessHistory")
    if not isinstance(history, list):
        raise ValueError("Observation snapshot requires fitnessHistory.")
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
    return {key: value for key, value in snapshot.items() if key not in {"status", "previousRuns"}}


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
