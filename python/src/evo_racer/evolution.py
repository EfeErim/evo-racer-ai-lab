"""Deterministic fixed-topology genetic algorithm for EvoRacer."""

from __future__ import annotations

import math
import random
import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Final

from evo_racer.simulation import (
    SENSOR_ANGLES,
    SENSOR_RANGE,
    Controller,
    Controls,
    EpisodeResult,
    Observation,
    RandomNetworkBaseline,
    TrackGeometry,
    VehicleSetup,
    evaluate_episode,
)

EVOLUTION_CONTRACT_VERSION: Final = 1
NETWORK_INPUT_COUNT: Final = 3 + len(SENSOR_ANGLES)
NETWORK_HIDDEN_COUNT: Final = 6
NETWORK_OUTPUT_COUNT: Final = 3
NETWORK_PARAMETER_COUNT: Final = (
    NETWORK_INPUT_COUNT * NETWORK_HIDDEN_COUNT
    + NETWORK_HIDDEN_COUNT
    + NETWORK_HIDDEN_COUNT * NETWORK_OUTPUT_COUNT
    + NETWORK_OUTPUT_COUNT
)
PERFORMANCE_GENE_COUNT: Final = 5
MAX_NETWORK_WEIGHT: Final = 5.0
MAX_PERFORMANCE_LOGIT: Final = 5.0


@dataclass(frozen=True, slots=True)
class FeedForwardNetwork:
    """Versioned, runtime-neutral fixed-topology network parameters."""

    parameters: tuple[float, ...]

    def __post_init__(self) -> None:
        if len(self.parameters) != NETWORK_PARAMETER_COUNT:
            raise ValueError(
                f"Fixed network requires exactly {NETWORK_PARAMETER_COUNT} parameters."
            )
        if any(not math.isfinite(value) for value in self.parameters):
            raise ValueError("Network parameters must be finite.")

    def activate(self, features: Sequence[float]) -> Controls:
        """Execute the fixed 10-6-3 feed-forward topology."""
        if len(features) != NETWORK_INPUT_COUNT:
            raise ValueError(f"Network requires exactly {NETWORK_INPUT_COUNT} input features.")
        if any(not math.isfinite(feature) for feature in features):
            raise ValueError("Network features must be finite.")

        hidden_weight_count = NETWORK_INPUT_COUNT * NETWORK_HIDDEN_COUNT
        hidden_weights = self.parameters[:hidden_weight_count]
        hidden_biases = self.parameters[
            hidden_weight_count : hidden_weight_count + NETWORK_HIDDEN_COUNT
        ]
        output_offset = hidden_weight_count + NETWORK_HIDDEN_COUNT
        output_weight_count = NETWORK_HIDDEN_COUNT * NETWORK_OUTPUT_COUNT
        output_weights = self.parameters[output_offset : output_offset + output_weight_count]
        output_biases = self.parameters[output_offset + output_weight_count :]

        hidden: list[float] = []
        for hidden_index in range(NETWORK_HIDDEN_COUNT):
            weight_offset = hidden_index * NETWORK_INPUT_COUNT
            total = hidden_biases[hidden_index]
            total += sum(
                feature * hidden_weights[weight_offset + input_index]
                for input_index, feature in enumerate(features)
            )
            hidden.append(math.tanh(total))

        outputs: list[float] = []
        for output_index in range(NETWORK_OUTPUT_COUNT):
            weight_offset = output_index * NETWORK_HIDDEN_COUNT
            total = output_biases[output_index]
            total += sum(
                value * output_weights[weight_offset + hidden_index]
                for hidden_index, value in enumerate(hidden)
            )
            outputs.append(total)

        return Controls(
            steering=math.tanh(outputs[0]),
            throttle=_sigmoid(outputs[1]),
            brake=_sigmoid(outputs[2]),
        )

    def to_payload(self) -> dict[str, object]:
        """Serialize the network without Python-specific implementation details."""
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "topology": {
                "inputCount": NETWORK_INPUT_COUNT,
                "hiddenCount": NETWORK_HIDDEN_COUNT,
                "outputCount": NETWORK_OUTPUT_COUNT,
            },
            "activations": {
                "hidden": "tanh",
                "steering": "tanh",
                "throttle": "sigmoid",
                "brake": "sigmoid",
            },
            "parameters": list(self.parameters),
        }

    @classmethod
    def from_payload(cls, payload: object) -> FeedForwardNetwork:
        """Parse the versioned network representation fail-closed."""
        if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
            raise ValueError("Network contractVersion must be 1.")
        expected_topology = {
            "inputCount": NETWORK_INPUT_COUNT,
            "hiddenCount": NETWORK_HIDDEN_COUNT,
            "outputCount": NETWORK_OUTPUT_COUNT,
        }
        expected_activations = {
            "hidden": "tanh",
            "steering": "tanh",
            "throttle": "sigmoid",
            "brake": "sigmoid",
        }
        if payload.get("topology") != expected_topology:
            raise ValueError("Network topology is not the supported fixed topology.")
        if payload.get("activations") != expected_activations:
            raise ValueError("Network activations are not supported.")
        values = payload.get("parameters")
        if not isinstance(values, list):
            raise ValueError("Network parameters must be an array.")
        return cls(tuple(_finite_number(value, "network parameter") for value in values))


class FeedForwardController:
    """Canonical Python controller backed by a frozen feed-forward network."""

    def __init__(self, network: FeedForwardNetwork, candidate_id: str = "fixed-ga") -> None:
        self._network = network
        self._name = f"fixed-ga:{candidate_id}"

    @property
    def name(self) -> str:
        return self._name

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._network.parameters

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        del geometry
        return self._network.activate(controller_features(observation))


@dataclass(frozen=True, slots=True)
class VehicleGenome:
    """Performance-budget logits and full-domain front/rear bias genes."""

    performance_logits: tuple[float, ...]
    front_brake_bias: float
    front_drive_bias: float

    def __post_init__(self) -> None:
        if len(self.performance_logits) != PERFORMANCE_GENE_COUNT:
            raise ValueError("Vehicle genome requires five performance logits.")
        if any(not math.isfinite(value) for value in self.performance_logits):
            raise ValueError("Performance logits must be finite.")
        if not 0.0 <= self.front_brake_bias <= 1.0:
            raise ValueError("front_brake_bias must stay in [0,1].")
        if not 0.0 <= self.front_drive_bias <= 1.0:
            raise ValueError("front_drive_bias must stay in [0,1].")

    @property
    def allocations(self) -> tuple[float, ...]:
        """Return a numerically stable softmax performance budget."""
        maximum = max(self.performance_logits)
        exponents = tuple(math.exp(value - maximum) for value in self.performance_logits)
        total = sum(exponents)
        return tuple(value / total for value in exponents)

    def to_setup(self) -> VehicleSetup:
        """Map the normalized budget exactly to the product-contract ranges."""
        speed, acceleration, brake, steering, grip = self.allocations
        return VehicleSetup(
            max_speed=22.0 + 18.0 * speed,
            acceleration=4.0 + 8.0 * acceleration,
            brake_strength=7.0 + 11.0 * brake,
            steering_agility=0.7 + 1.1 * steering,
            grip_recovery=2.0 + 6.0 * grip,
            front_brake_bias=self.front_brake_bias,
            front_drive_bias=self.front_drive_bias,
        )

    def to_payload(self) -> dict[str, object]:
        return {
            "performanceLogits": list(self.performance_logits),
            "frontBrakeBias": self.front_brake_bias,
            "frontDriveBias": self.front_drive_bias,
        }


@dataclass(frozen=True, slots=True)
class FixedGenome:
    """One fixed-topology controller genome and its vehicle genes."""

    network: FeedForwardNetwork
    vehicle: VehicleGenome

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "fixed-ga",
            "network": self.network.to_payload(),
            "vehicleGenes": self.vehicle.to_payload(),
        }


@dataclass(frozen=True, slots=True)
class FixedCandidate:
    """Immutable population member."""

    candidate_id: str
    generation: int
    genome: FixedGenome

    def __post_init__(self) -> None:
        if not self.candidate_id:
            raise ValueError("candidate_id must be non-empty.")
        if self.generation < 0:
            raise ValueError("generation must be non-negative.")

    @property
    def controller(self) -> FeedForwardController:
        return FeedForwardController(self.genome.network, self.candidate_id)

    @property
    def setup(self) -> VehicleSetup:
        return self.genome.vehicle.to_setup()


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    """Exploit-resistant fitness result and its audit fields."""

    fitness: float
    progress_fraction: float
    finished: bool
    collision_count: int
    steps: int

    def __post_init__(self) -> None:
        if not math.isfinite(self.fitness):
            raise ValueError("fitness must be finite.")
        if not 0.0 <= self.progress_fraction <= 1.0:
            raise ValueError("progress_fraction must stay in [0,1].")
        if self.collision_count < 0 or self.steps < 0:
            raise ValueError("Evaluation counts must be non-negative.")


@dataclass(frozen=True, slots=True)
class ScoredCandidate:
    candidate: FixedCandidate
    evaluation: CandidateEvaluation


@dataclass(frozen=True, slots=True)
class GenerationReport:
    """Stable, serializable report for one fully evaluated generation."""

    generation: int
    champion_id: str
    best_fitness: float
    median_fitness: float
    mean_fitness: float
    worst_fitness: float
    finished_count: int
    results: tuple[ScoredCandidate, ...]

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "fixed-ga",
            "generation": self.generation,
            "championId": self.champion_id,
            "bestFitness": _rounded(self.best_fitness),
            "medianFitness": _rounded(self.median_fitness),
            "meanFitness": _rounded(self.mean_fitness),
            "worstFitness": _rounded(self.worst_fitness),
            "finishedCount": self.finished_count,
            "results": [
                {
                    "candidateId": scored.candidate.candidate_id,
                    "fitness": _rounded(scored.evaluation.fitness),
                    "progress": _rounded(scored.evaluation.progress_fraction),
                    "finished": scored.evaluation.finished,
                    "collisionCount": scored.evaluation.collision_count,
                    "steps": scored.evaluation.steps,
                }
                for scored in self.results
            ],
        }


@dataclass(frozen=True, slots=True)
class FixedGAConfig:
    """Validated selection and variation settings."""

    population_size: int = 24
    elite_count: int = 2
    tournament_size: int = 3
    crossover_rate: float = 0.85
    mutation_rate: float = 0.12
    network_mutation_scale: float = 0.35
    performance_mutation_scale: float = 0.2
    bias_mutation_scale: float = 0.08

    def __post_init__(self) -> None:
        if self.population_size < 4:
            raise ValueError("population_size must be at least 4.")
        if not 1 <= self.elite_count < self.population_size:
            raise ValueError("elite_count must be positive and smaller than the population.")
        if not 2 <= self.tournament_size <= self.population_size:
            raise ValueError("tournament_size must be from 2 through population_size.")
        if not 0.0 <= self.crossover_rate <= 1.0:
            raise ValueError("crossover_rate must stay in [0,1].")
        if not 0.0 <= self.mutation_rate <= 1.0:
            raise ValueError("mutation_rate must stay in [0,1].")
        scales = (
            self.network_mutation_scale,
            self.performance_mutation_scale,
            self.bias_mutation_scale,
        )
        if any(not math.isfinite(scale) or scale < 0.0 for scale in scales):
            raise ValueError("Mutation scales must be finite and non-negative.")


FitnessEvaluator = Callable[[FixedCandidate], CandidateEvaluation]


@dataclass(frozen=True, slots=True)
class FixedGARunResult:
    """Completed deterministic run with the best candidate seen."""

    seed: int
    reports: tuple[GenerationReport, ...]
    champion: ScoredCandidate

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "fixed-ga",
            "seed": self.seed,
            "reports": [report.to_payload() for report in self.reports],
            "champion": {
                "candidateId": self.champion.candidate.candidate_id,
                "fitness": _rounded(self.champion.evaluation.fitness),
                "genome": self.champion.candidate.genome.to_payload(),
            },
        }


class FixedGA:
    """Stateful deterministic population lifecycle using an isolated PRNG."""

    def __init__(self, config: FixedGAConfig, seed: int) -> None:
        self.config = config
        self.seed = seed
        self._random = random.Random(seed)
        self.generation = 0
        self.population = tuple(
            FixedCandidate(
                candidate_id=_candidate_id(0, index),
                generation=0,
                genome=_random_genome(self._random),
            )
            for index in range(config.population_size)
        )

    def evaluate(self, evaluator: FitnessEvaluator) -> GenerationReport:
        """Evaluate the current population in stable candidate order."""
        scored = tuple(
            ScoredCandidate(candidate=candidate, evaluation=evaluator(candidate))
            for candidate in self.population
        )
        ranked = _ranked(scored)
        values = [candidate.evaluation.fitness for candidate in scored]
        return GenerationReport(
            generation=self.generation,
            champion_id=ranked[0].candidate.candidate_id,
            best_fitness=ranked[0].evaluation.fitness,
            median_fitness=statistics.median(values),
            mean_fitness=statistics.fmean(values),
            worst_fitness=ranked[-1].evaluation.fitness,
            finished_count=sum(candidate.evaluation.finished for candidate in scored),
            results=scored,
        )

    def advance(self, report: GenerationReport) -> None:
        """Create the next generation; elites are copied without variation."""
        if report.generation != self.generation:
            raise ValueError("Generation report does not match the active population.")
        by_id = {candidate.candidate_id: candidate for candidate in self.population}
        if set(by_id) != {scored.candidate.candidate_id for scored in report.results} or any(
            by_id.get(scored.candidate.candidate_id) != scored.candidate
            for scored in report.results
        ):
            raise ValueError("Generation report does not cover the active population.")

        ranked = _ranked(report.results)
        next_generation = self.generation + 1
        genomes: list[FixedGenome] = [
            scored.candidate.genome for scored in ranked[: self.config.elite_count]
        ]
        while len(genomes) < self.config.population_size:
            first = self._select_parent(ranked).candidate.genome
            if self._random.random() < self.config.crossover_rate:
                second = self._select_parent(ranked).candidate.genome
                child = _crossover(first, second, self._random)
            else:
                child = first
            genomes.append(_mutate(child, self.config, self._random))

        self.generation = next_generation
        self.population = tuple(
            FixedCandidate(
                candidate_id=_candidate_id(next_generation, index),
                generation=next_generation,
                genome=genome,
            )
            for index, genome in enumerate(genomes)
        )

    def _select_parent(self, ranked: Sequence[ScoredCandidate]) -> ScoredCandidate:
        competitors = [
            ranked[self._random.randrange(len(ranked))] for _ in range(self.config.tournament_size)
        ]
        return _ranked(competitors)[0]


def run_fixed_ga(
    config: FixedGAConfig,
    seed: int,
    generations: int,
    evaluator: FitnessEvaluator,
) -> FixedGARunResult:
    """Run a bounded number of complete generations."""
    if generations <= 0:
        raise ValueError("generations must be positive.")
    ga = FixedGA(config, seed)
    reports: list[GenerationReport] = []
    best: ScoredCandidate | None = None
    for generation_index in range(generations):
        report = ga.evaluate(evaluator)
        reports.append(report)
        champion = _ranked(report.results)[0]
        if best is None or _ranked((champion, best))[0] is champion:
            best = champion
        if generation_index + 1 < generations:
            ga.advance(report)
    if best is None:
        raise RuntimeError("Fixed GA produced no evaluated candidate.")
    return FixedGARunResult(seed=seed, reports=tuple(reports), champion=best)


def episode_fitness(result: EpisodeResult, max_steps: int) -> CandidateEvaluation:
    """Reward only net forward progress plus verified lap completion.

    Raw speed, survival time, and repeated local motion earn nothing. This avoids
    rewarding stationary throttle, wall riding, or oscillation around one point.
    Completion efficiency is available only after a full canonical lap.
    """
    if max_steps <= 0:
        raise ValueError("max_steps must be positive.")
    progress = _clamp(result.progress_fraction, 0.0, 1.0)
    progress_score = 1200.0 * progress
    finish_bonus = 1000.0 if result.finished else 0.0
    efficiency_bonus = (
        300.0 * _clamp(1.0 - result.steps / max_steps, 0.0, 1.0) if result.finished else 0.0
    )
    collision_penalty = 75.0 * result.collision_count
    return CandidateEvaluation(
        fitness=progress_score + finish_bonus + efficiency_bonus - collision_penalty,
        progress_fraction=progress,
        finished=result.finished,
        collision_count=result.collision_count,
        steps=result.steps,
    )


def make_episode_evaluator(
    geometry: TrackGeometry,
    *,
    max_seconds: float,
) -> FitnessEvaluator:
    """Create the production Fixed GA evaluator over Phase 4 physics."""
    if not math.isfinite(max_seconds) or max_seconds <= 0.0:
        raise ValueError("max_seconds must be finite and positive.")

    def evaluator(candidate: FixedCandidate) -> CandidateEvaluation:
        return evaluate_candidate(
            geometry,
            candidate.controller,
            candidate.setup,
            max_seconds=max_seconds,
            selected_car_id=candidate.candidate_id,
        )

    return evaluator


def evaluate_candidate(
    geometry: TrackGeometry,
    controller: Controller,
    setup: VehicleSetup,
    *,
    max_seconds: float,
    selected_car_id: str,
) -> CandidateEvaluation:
    """Evaluate any algorithm candidate through the canonical physics and fitness path."""
    if not math.isfinite(max_seconds) or max_seconds <= 0.0:
        raise ValueError("max_seconds must be finite and positive.")
    result = evaluate_episode(
        geometry,
        controller,
        setup,
        max_seconds=max_seconds,
        selected_car_id=selected_car_id,
    )
    return episode_fitness(result, round(max_seconds * 60.0))


def controller_features(observation: Observation) -> tuple[float, ...]:
    """Normalize the shared Phase 4 observation for every learned controller."""
    return (
        _clamp(observation.state.forward_speed / 40.0, 0.0, 1.0),
        _clamp(observation.state.lateral_speed / 10.0, -1.0, 1.0),
        _clamp(observation.heading_error / math.pi, -1.0, 1.0),
        *(_clamp(distance / SENSOR_RANGE, 0.0, 1.0) for distance in observation.sensor_distances),
    )


def evaluate_random_network_with_vehicle(
    geometry: TrackGeometry,
    vehicle: VehicleGenome,
    *,
    seed: int,
    max_seconds: float,
) -> CandidateEvaluation:
    """Evaluate the random-network baseline with identical vehicle genes."""
    return evaluate_candidate(
        geometry,
        RandomNetworkBaseline(seed),
        vehicle.to_setup(),
        max_seconds=max_seconds,
        selected_car_id=f"random-network-{seed}",
    )


def _random_genome(generator: random.Random) -> FixedGenome:
    return FixedGenome(
        network=FeedForwardNetwork(
            tuple(generator.uniform(-1.0, 1.0) for _ in range(NETWORK_PARAMETER_COUNT))
        ),
        vehicle=VehicleGenome(
            performance_logits=tuple(
                generator.uniform(-1.0, 1.0) for _ in range(PERFORMANCE_GENE_COUNT)
            ),
            front_brake_bias=generator.random(),
            front_drive_bias=generator.random(),
        ),
    )


def _crossover(
    first: FixedGenome,
    second: FixedGenome,
    generator: random.Random,
) -> FixedGenome:
    return FixedGenome(
        network=FeedForwardNetwork(
            tuple(
                first_value if generator.random() < 0.5 else second_value
                for first_value, second_value in zip(
                    first.network.parameters,
                    second.network.parameters,
                    strict=True,
                )
            )
        ),
        vehicle=VehicleGenome(
            performance_logits=tuple(
                first_value if generator.random() < 0.5 else second_value
                for first_value, second_value in zip(
                    first.vehicle.performance_logits,
                    second.vehicle.performance_logits,
                    strict=True,
                )
            ),
            front_brake_bias=(
                first.vehicle.front_brake_bias
                if generator.random() < 0.5
                else second.vehicle.front_brake_bias
            ),
            front_drive_bias=(
                first.vehicle.front_drive_bias
                if generator.random() < 0.5
                else second.vehicle.front_drive_bias
            ),
        ),
    )


def _mutate(
    genome: FixedGenome,
    config: FixedGAConfig,
    generator: random.Random,
) -> FixedGenome:
    network = tuple(
        _clamp(
            value + generator.gauss(0.0, config.network_mutation_scale),
            -MAX_NETWORK_WEIGHT,
            MAX_NETWORK_WEIGHT,
        )
        if generator.random() < config.mutation_rate
        else value
        for value in genome.network.parameters
    )
    logits = tuple(
        _clamp(
            value + generator.gauss(0.0, config.performance_mutation_scale),
            -MAX_PERFORMANCE_LOGIT,
            MAX_PERFORMANCE_LOGIT,
        )
        if generator.random() < config.mutation_rate
        else value
        for value in genome.vehicle.performance_logits
    )

    def mutate_bias(value: float) -> float:
        if generator.random() >= config.mutation_rate:
            return value
        return _clamp(value + generator.gauss(0.0, config.bias_mutation_scale), 0.0, 1.0)

    return FixedGenome(
        network=FeedForwardNetwork(network),
        vehicle=VehicleGenome(
            performance_logits=logits,
            front_brake_bias=mutate_bias(genome.vehicle.front_brake_bias),
            front_drive_bias=mutate_bias(genome.vehicle.front_drive_bias),
        ),
    )


def _ranked(scored: Sequence[ScoredCandidate]) -> list[ScoredCandidate]:
    return sorted(
        scored,
        key=lambda item: (-item.evaluation.fitness, item.candidate.candidate_id),
    )


def _candidate_id(generation: int, index: int) -> str:
    return f"g{generation:04d}-c{index:04d}"


def _finite_number(value: object, field: str) -> float:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(float(value))
    ):
        raise ValueError(f"{field} must be a finite number.")
    return float(value)


def _sigmoid(value: float) -> float:
    if value >= 0.0:
        return 1.0 / (1.0 + math.exp(-value))
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _rounded(value: float) -> float:
    rounded = round(value, 6)
    return 0.0 if rounded == 0.0 else rounded
