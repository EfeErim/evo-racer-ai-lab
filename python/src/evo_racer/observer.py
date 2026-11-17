"""Deterministic run sessions: advancing generations, observation snapshots, results,
and rebuilding a session from its saved checkpoint. Threads and files live in run_manager."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
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
    NEATCandidate,
    NEATGenerationReport,
    NEATRandomStream,
    NEATScoredCandidate,
    create_neat_population,
    score_neat_generation,
)
from evo_racer.race_insight import (
    TARGET_LAP_METHOD,
    lap_record_payload,
    lap_seconds,
    leader_network_payload,
    target_lap_seconds,
)
from evo_racer.racing_line import compare_with_reference, minimum_curvature_reference
from evo_racer.run_library import (
    RUN_DOCUMENT_KIND,
    RUN_SCHEMA_VERSION,
    RunRecordError,
    checkpoint_sha256,
    validate_run_document,
)
from evo_racer.simulation import (
    FIXED_TIME_STEP,
    SIMULATION_CONTRACT_VERSION,
    Controller,
    EpisodeResult,
    PurePursuitBaseline,
    RandomNetworkBaseline,
    SetupAwarePurePursuit,
    TelemetrySnapshot,
    TrackGeometry,
    VehicleSetup,
    episode_step_limit,
    evaluate_episode,
)
from evo_racer.tracks import compile_track_payload

OBSERVATION_CONTRACT_VERSION: Final = 1
REPLAY_INTERVAL_STEPS: Final = 6
RACE_TRACE_INTERVAL_STEPS: Final = 3
GENERATION_RACE_CAR_LIMIT: Final = 12
GENERATION_TRAIL_LIMIT: Final = 8
GENERATION_TRAIL_POINT_LIMIT: Final = 64
PURE_PURSUIT_CAUTION_LEVELS: Final = (1.5, 1.0, 0.6, 0.35)
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

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> RunSettings:
        """Read the ``settings`` object of a validated setup or run document."""
        return cls(
            algorithm=cast(Literal["fixed-ga", "neat"], payload["algorithm"]),
            population_size=cast(int, payload["populationSize"]),
            generations=cast(int, payload["generations"]),
            episode_seconds=float(cast(float, payload["episodeSeconds"])),
            seed=cast(int, payload["seed"]),
        )

    def to_payload(self) -> dict[str, object]:
        return {
            "algorithm": self.algorithm,
            "populationSize": self.population_size,
            "generations": self.generations,
            "episodeSeconds": self.episode_seconds,
            "seed": self.seed,
        }


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
        self.track = cast(dict[str, object], compiled_track["track"])
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
        self._generation_race: dict[str, object] | None = None
        self._reference_line: tuple[tuple[float, float], ...] | None = None
        self._pending_command: Literal["pause", "stop"] | None = None
        self._fixed_ga: FixedGA | None = None
        self._neat_population: Any | None = None
        self._neat_config: Any | None = None
        self._neat_random = NEATRandomStream(settings.seed)
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
            with self._neat_random.active():
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
            self._clear_live_progress()
            self._advancing = True
        try:
            report, episodes = (
                self._advance_fixed_ga()
                if self.settings.algorithm == "fixed-ga"
                else self._advance_neat()
            )
        except Exception:
            with self._lock:
                self._clear_live_progress()
            raise
        ranked_results = _ranked(report.results)
        race = self._race_with_insight(report, ranked_results, episodes)
        with self._lock:
            self.reports.append(report)
            champion = ranked_results[0]
            self.current_episode = episodes[champion.candidate.candidate_id]
            self._generation_race = race
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

    def _race_with_insight(
        self,
        report: GenerationReportValue,
        ranked: Sequence[ScoredCandidateValue],
        episodes: dict[str, EpisodeResult],
    ) -> dict[str, object]:
        """Build the presentation-only race, its leader's neurons and lap times.

        Runs outside the lock: only this generation's own objects are read, and
        ``self.reports`` changes nowhere else while a generation is advancing.
        """
        race = _generation_race_payload(
            len(self.reports) + 1, ranked, episodes, self.settings.population_size
        )
        leader = ranked[0]
        race["leaderNetwork"] = leader_network_payload(
            self.geometry,
            leader.candidate,
            episodes[leader.candidate.candidate_id],
            max_seconds=self.settings.episode_seconds,
            trace_interval_steps=RACE_TRACE_INTERVAL_STEPS,
        )
        laps = lap_record_payload(
            [(previous.generation, previous.results) for previous in (*self.reports, report)]
        )
        race["lap"] = {
            **laps,
            "targetSeconds": target_lap_seconds(
                self.geometry, leader.candidate.setup, self._racing_line()
            ),
            "targetMethod": TARGET_LAP_METHOD,
        }
        return race

    def _racing_line(self) -> tuple[tuple[float, float], ...]:
        if self._reference_line is None:
            self._reference_line = minimum_curvature_reference(
                self.geometry.centerline, self.geometry.road_width
            )
        return self._reference_line

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
        known_generation_race: int | None = None,
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
                "fitnessHistory": _fitness_history(self.reports),
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
                race = self._generation_race
                if race is not None and race["generation"] != known_generation_race:
                    response["generationRace"] = race
            return response

    def to_run_document(self) -> dict[str, object]:
        """Serialize the current generation boundary into the version 1 run schema."""
        snapshot = self.snapshot(include_live=False)
        snapshot["simulationContractVersion"] = SIMULATION_CONTRACT_VERSION
        return {
            "schemaVersion": RUN_SCHEMA_VERSION,
            "kind": RUN_DOCUMENT_KIND,
            "runId": self.run_id,
            "trackSchemaVersion": self.track["schemaVersion"],
            "track": self.track,
            "settings": self.settings.to_payload(),
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
        checkpoint = cast(dict[str, object], document["checkpoint"])
        expected_snapshot = cast(dict[str, object], checkpoint["snapshot"])
        status = cast(RunStatus, checkpoint["status"])
        session = cls(
            run_id=cast(str, document["runId"]),
            compiled_track=compile_track_payload(document["track"]),
            settings=RunSettings.from_payload(cast(dict[str, object], document["settings"])),
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
        expected_projection.pop("simulationContractVersion", None)
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
        report = ga.evaluate(lambda candidate: self._evaluate_live(candidate, episodes))
        if len(self.reports) + 1 < self.settings.generations:
            ga.advance(report)
        return report, episodes

    def _evaluate_live(
        self,
        candidate: FixedCandidate | NEATCandidate,
        episodes: dict[str, EpisodeResult],
    ) -> CandidateEvaluation:
        """Drive one candidate with live telemetry and keep its episode for the race view."""
        self._begin_live_candidate(candidate.candidate_id, len(episodes) + 1)
        episode = evaluate_episode(
            self.geometry,
            candidate.controller,
            candidate.setup,
            max_seconds=self.settings.episode_seconds,
            selected_car_id=candidate.candidate_id,
            telemetry_callback=self._publish_live_telemetry,
            trace_interval_steps=RACE_TRACE_INTERVAL_STEPS,
        )
        episodes[candidate.candidate_id] = episode
        return episode_fitness(episode, episode_step_limit(self.settings.episode_seconds))

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
            produced.append(
                score_neat_generation(
                    int(population.generation),
                    genomes,
                    active_config,
                    lambda candidate: self._evaluate_live(candidate, episodes),
                )
            )

        with self._neat_random.active():
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
        pursuit_episode = best_pure_pursuit_episode(
            self.geometry,
            candidate.setup,
            max_seconds=self.settings.episode_seconds,
        )
        track = self.track
        track_json = json.dumps(track, separators=(",", ":"), sort_keys=True)
        genome = (
            candidate.genome.to_payload()
            if isinstance(candidate, FixedCandidate)
            else candidate.to_payload()
        )
        self.status = status
        max_steps = episode_step_limit(self.settings.episode_seconds)
        racing_line_comparison = compare_with_reference(
            self._racing_line(),
            tuple((frame.state.x, frame.state.y) for frame in replay_episode.telemetry),
            road_width=self.geometry.road_width,
            champion_finished=replay_episode.finished,
        )
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
            "fitnessHistory": _fitness_history(self.reports),
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
            "racingLineComparison": racing_line_comparison,
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


def _ranked(
    candidates: tuple[ScoredCandidate, ...] | tuple[NEATScoredCandidate, ...],
) -> list[ScoredCandidateValue]:
    return sorted(candidates, key=_candidate_sort_key)


def _candidate_sort_key(candidate: ScoredCandidateValue) -> tuple[float, str]:
    return (-candidate.evaluation.fitness, candidate.candidate.candidate_id)


def best_pure_pursuit_episode(
    geometry: TrackGeometry,
    setup: VehicleSetup,
    *,
    max_seconds: float,
) -> EpisodeResult:
    """Return the highest-scoring Pure Pursuit drive for this car and time limit.

    The fixed-speed tracker is fast but can crash on an evolved setup, and a careful
    one can miss a short time limit, so neither alone is a fair reference. Ties keep
    the earlier controller, which makes the choice deterministic.
    """
    max_steps = episode_step_limit(max_seconds)
    controllers: tuple[Controller, ...] = (
        PurePursuitBaseline(),
        *(SetupAwarePurePursuit(setup, caution) for caution in PURE_PURSUIT_CAUTION_LEVELS),
    )
    best: EpisodeResult | None = None
    best_fitness = -math.inf
    for controller in controllers:
        episode = evaluate_episode(
            geometry,
            controller,
            setup,
            max_seconds=max_seconds,
            selected_car_id="pure-pursuit-baseline",
        )
        fitness = episode_fitness(episode, max_steps).fitness
        if fitness > best_fitness:
            best, best_fitness = episode, fitness
    assert best is not None
    return best


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


def _fitness_history(reports: Sequence[GenerationReportValue]) -> list[dict[str, object]]:
    return [
        {
            "generation": report.generation,
            "bestFitness": _rounded(report.best_fitness),
            "medianFitness": _rounded(report.median_fitness),
        }
        for report in reports
    ]


def _resume_projection(snapshot: dict[str, object]) -> dict[str, object]:
    transient = {
        "status",
        "previousRuns",
        "generationInProgress",
        "activeCandidate",
        "pendingCommand",
        "generationReplay",
        "generationRace",
    }
    projection = {key: value for key, value in snapshot.items() if key not in transient}
    result = projection.get("result")
    if isinstance(result, dict):
        projection["result"] = {
            key: value for key, value in result.items() if key != "racingLineComparison"
        }
    selected = projection.get("selectedCar")
    if isinstance(selected, dict):
        projection["selectedCar"] = {
            key: value for key, value in selected.items() if key not in {"x", "y", "heading"}
        }
    return projection


def _generation_race_payload(
    generation: int,
    ranked: Sequence[ScoredCandidateValue],
    episodes: dict[str, EpisodeResult],
    population_size: int,
) -> dict[str, object]:
    """Presentation-only race of the best cars of one finished generation.

    Evolution never reads it and it is never persisted. Poses are flattened as
    ``[t, x, y, heading, speed, ...]`` to keep the loopback payload small.
    """
    cars: list[dict[str, object]] = []
    for rank, scored in enumerate(ranked[:GENERATION_RACE_CAR_LIMIT], start=1):
        episode = episodes[scored.candidate.candidate_id]
        poses: list[float] = []
        for seconds, x, y, heading, speed in episode.trace:
            poses.extend(
                (round(seconds, 3), round(x, 3), round(y, 3), round(heading, 4), round(speed, 2))
            )
        cars.append(
            {
                "candidateId": scored.candidate.candidate_id,
                "rank": rank,
                "fitness": _rounded(scored.evaluation.fitness),
                "termination": episode.termination,
                "progress": _rounded(episode.progress_fraction),
                "lapSeconds": lap_seconds(episode.steps, episode.finished),
                "poses": poses,
            }
        )
    return {
        "generation": generation,
        "populationSize": population_size,
        "cars": cars,
    }


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


def _rounded(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("Observation values must be finite.")
    return round(value, 8)
