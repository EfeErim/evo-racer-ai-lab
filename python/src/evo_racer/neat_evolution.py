"""Feed-forward NEAT orchestration with EvoRacer vehicle genes."""

from __future__ import annotations

import math
import random
import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any, Final, cast

import neat  # type: ignore[import-untyped]
from neat.graphs import feed_forward_layers  # type: ignore[import-untyped]

from evo_racer.evolution import (
    EVOLUTION_CONTRACT_VERSION,
    NETWORK_INPUT_COUNT,
    NETWORK_OUTPUT_COUNT,
    CandidateEvaluation,
    VehicleGenome,
    controller_features,
    evaluate_candidate,
)
from evo_racer.simulation import Controls, Observation, TrackGeometry, VehicleSetup

NEAT_DEPENDENCY_VERSION: Final = "2.0.0"
NEAT_CONFIG_RESOURCE: Final = "config/neat-feed-forward.ini"
VEHICLE_MUTATION_RATE: Final = 0.2
PERFORMANCE_MUTATION_POWER: Final = 0.25
BIAS_MUTATION_POWER: Final = 0.1
VEHICLE_DISTANCE_COEFFICIENT: Final = 0.5


class EvoRacerGenome(neat.DefaultGenome):  # type: ignore[misc]
    """Default feed-forward NEAT genome extended with common vehicle genes."""

    vehicle_genome: VehicleGenome

    def __init__(self, key: int) -> None:
        super().__init__(key)
        self.vehicle_genome = VehicleGenome((0.0,) * 5, 0.5, 0.5)

    def configure_new(self, config: object) -> None:
        """Initialize topology and vehicle genes for a new population member."""
        super().configure_new(config)
        typed_config = cast(Any, config)
        for output_key in typed_config.output_keys:
            self.nodes[output_key].activation = "identity"
        self.vehicle_genome = VehicleGenome(
            performance_logits=tuple(_clamp(random.gauss(0.0, 1.0), -5.0, 5.0) for _ in range(5)),
            front_brake_bias=random.random(),
            front_drive_bias=random.random(),
        )

    def configure_crossover(
        self,
        first: object,
        second: object,
        config: object,
    ) -> None:
        """Cross controller and vehicle genes while creating an offspring."""
        if not isinstance(first, EvoRacerGenome) or not isinstance(second, EvoRacerGenome):
            raise TypeError("EvoRacerGenome crossover requires two EvoRacerGenome parents.")
        super().configure_crossover(first, second, config)
        self.vehicle_genome = VehicleGenome(
            performance_logits=tuple(
                first_value if random.random() < 0.5 else second_value
                for first_value, second_value in zip(
                    first.vehicle_genome.performance_logits,
                    second.vehicle_genome.performance_logits,
                    strict=True,
                )
            ),
            front_brake_bias=(
                first.vehicle_genome.front_brake_bias
                if random.random() < 0.5
                else second.vehicle_genome.front_brake_bias
            ),
            front_drive_bias=(
                first.vehicle_genome.front_drive_bias
                if random.random() < 0.5
                else second.vehicle_genome.front_drive_bias
            ),
        )

    def mutate(self, config: object) -> None:
        """Mutate topology and vehicle genes only during offspring creation."""
        super().mutate(config)
        vehicle = self.vehicle_genome
        self.vehicle_genome = VehicleGenome(
            performance_logits=tuple(
                _mutate_value(value, PERFORMANCE_MUTATION_POWER, -5.0, 5.0)
                for value in vehicle.performance_logits
            ),
            front_brake_bias=_mutate_value(
                vehicle.front_brake_bias,
                BIAS_MUTATION_POWER,
                0.0,
                1.0,
            ),
            front_drive_bias=_mutate_value(
                vehicle.front_drive_bias,
                BIAS_MUTATION_POWER,
                0.0,
                1.0,
            ),
        )

    def distance(self, other: object, config: object) -> float:
        """Include common vehicle genes in NEAT compatibility distance."""
        if not isinstance(other, EvoRacerGenome):
            raise TypeError("EvoRacerGenome distance requires another EvoRacerGenome.")
        topology_distance = float(super().distance(other, config))
        own_values = (
            *self.vehicle_genome.performance_logits,
            self.vehicle_genome.front_brake_bias,
            self.vehicle_genome.front_drive_bias,
        )
        other_values = (
            *other.vehicle_genome.performance_logits,
            other.vehicle_genome.front_brake_bias,
            other.vehicle_genome.front_drive_bias,
        )
        vehicle_distance = statistics.fmean(
            abs(own - peer) for own, peer in zip(own_values, other_values, strict=True)
        )
        return topology_distance + VEHICLE_DISTANCE_COEFFICIENT * vehicle_distance


@dataclass(frozen=True, slots=True)
class RuntimeLink:
    source: int
    weight: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.weight):
            raise ValueError("Runtime link weight must be finite.")

    def to_payload(self) -> dict[str, object]:
        return {"source": self.source, "weight": self.weight}


@dataclass(frozen=True, slots=True)
class RuntimeNode:
    key: int
    activation: str
    aggregation: str
    bias: float
    response: float
    links: tuple[RuntimeLink, ...]

    def __post_init__(self) -> None:
        if self.activation not in {"identity", "tanh"}:
            raise ValueError(f"Unsupported runtime activation: {self.activation}.")
        if self.aggregation != "sum":
            raise ValueError(f"Unsupported runtime aggregation: {self.aggregation}.")
        if not math.isfinite(self.bias) or not math.isfinite(self.response):
            raise ValueError("Runtime node values must be finite.")

    def to_payload(self) -> dict[str, object]:
        return {
            "key": self.key,
            "activation": self.activation,
            "aggregation": self.aggregation,
            "bias": self.bias,
            "response": self.response,
            "links": [link.to_payload() for link in self.links],
        }


@dataclass(frozen=True, slots=True)
class CompiledNEATNetwork:
    """Versioned runtime-neutral feed-forward DAG."""

    input_keys: tuple[int, ...]
    output_keys: tuple[int, ...]
    nodes: tuple[RuntimeNode, ...]

    def __post_init__(self) -> None:
        if len(self.input_keys) != NETWORK_INPUT_COUNT:
            raise ValueError(f"NEAT network requires {NETWORK_INPUT_COUNT} inputs.")
        if len(self.output_keys) != NETWORK_OUTPUT_COUNT:
            raise ValueError(f"NEAT network requires {NETWORK_OUTPUT_COUNT} outputs.")
        if len(set(self.input_keys)) != len(self.input_keys):
            raise ValueError("NEAT input keys must be unique.")
        if len(set(self.output_keys)) != len(self.output_keys):
            raise ValueError("NEAT output keys must be unique.")
        if set(self.input_keys).intersection(self.output_keys):
            raise ValueError("NEAT input and output keys must be disjoint.")
        available = set(self.input_keys)
        for node in self.nodes:
            if node.key in available:
                raise ValueError("Runtime node keys must be unique and non-input.")
            if any(link.source not in available for link in node.links):
                raise ValueError("Runtime nodes must be stored in feed-forward order.")
            available.add(node.key)
        if any(output not in available for output in self.output_keys):
            raise ValueError("Every runtime output must be reachable.")

    @property
    def parameters(self) -> tuple[float, ...]:
        """Stable topology-and-parameter snapshot used by the episode freeze check."""
        values: list[float] = []
        for node in self.nodes:
            values.extend((float(node.key), node.bias, node.response))
            for link in node.links:
                values.extend((float(link.source), link.weight))
        return tuple(values)

    def activate(self, features: Sequence[float]) -> tuple[float, ...]:
        if len(features) != len(self.input_keys):
            raise ValueError(f"NEAT network requires {len(self.input_keys)} input features.")
        if any(not math.isfinite(feature) for feature in features):
            raise ValueError("NEAT network features must be finite.")
        values = dict(zip(self.input_keys, features, strict=True))
        for node in self.nodes:
            total = sum(values[link.source] * link.weight for link in node.links)
            raw = node.bias + node.response * total
            values[node.key] = raw if node.activation == "identity" else math.tanh(raw)
        return tuple(values[key] for key in self.output_keys)

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "kind": "feed-forward-dag",
            "inputKeys": list(self.input_keys),
            "outputKeys": list(self.output_keys),
            "outputTransforms": ["tanh", "sigmoid", "sigmoid"],
            "nodes": [node.to_payload() for node in self.nodes],
        }

    @classmethod
    def from_payload(cls, payload: object) -> CompiledNEATNetwork:
        if not isinstance(payload, dict) or payload.get("contractVersion") != 1:
            raise ValueError("NEAT network contractVersion must be 1.")
        if payload.get("kind") != "feed-forward-dag":
            raise ValueError("NEAT network kind must be feed-forward-dag.")
        if payload.get("outputTransforms") != ["tanh", "sigmoid", "sigmoid"]:
            raise ValueError("NEAT output transforms are unsupported.")
        input_keys = _integer_array(payload.get("inputKeys"), "inputKeys")
        output_keys = _integer_array(payload.get("outputKeys"), "outputKeys")
        node_payloads = payload.get("nodes")
        if not isinstance(node_payloads, list):
            raise ValueError("NEAT network nodes must be an array.")
        nodes: list[RuntimeNode] = []
        for node_payload in node_payloads:
            if not isinstance(node_payload, dict):
                raise ValueError("NEAT runtime node must be an object.")
            link_payloads = node_payload.get("links")
            if not isinstance(link_payloads, list):
                raise ValueError("NEAT runtime links must be an array.")
            links: list[RuntimeLink] = []
            for link_payload in link_payloads:
                if not isinstance(link_payload, dict):
                    raise ValueError("NEAT runtime link must be an object.")
                links.append(
                    RuntimeLink(
                        source=_integer(link_payload.get("source"), "link source"),
                        weight=_finite_number(link_payload.get("weight"), "link weight"),
                    )
                )
            nodes.append(
                RuntimeNode(
                    key=_integer(node_payload.get("key"), "node key"),
                    activation=_string(node_payload.get("activation"), "node activation"),
                    aggregation=_string(node_payload.get("aggregation"), "node aggregation"),
                    bias=_finite_number(node_payload.get("bias"), "node bias"),
                    response=_finite_number(node_payload.get("response"), "node response"),
                    links=tuple(links),
                )
            )
        return cls(input_keys=input_keys, output_keys=output_keys, nodes=tuple(nodes))


class NEATController:
    """Canonical controller executing only the runtime-neutral network."""

    def __init__(self, network: CompiledNEATNetwork, candidate_id: str) -> None:
        self._network = network
        self._name = f"neat:{candidate_id}"

    @property
    def name(self) -> str:
        return self._name

    @property
    def parameters(self) -> tuple[float, ...]:
        return self._network.parameters

    def control(self, observation: Observation, geometry: TrackGeometry) -> Controls:
        del geometry
        outputs = self._network.activate(controller_features(observation))
        return Controls(
            steering=math.tanh(outputs[0]),
            throttle=_sigmoid(outputs[1]),
            brake=_sigmoid(outputs[2]),
        )


@dataclass(frozen=True, slots=True)
class NEATCandidate:
    candidate_id: str
    generation: int
    network: CompiledNEATNetwork
    vehicle: VehicleGenome

    @property
    def controller(self) -> NEATController:
        return NEATController(self.network, self.candidate_id)

    @property
    def setup(self) -> VehicleSetup:
        return self.vehicle.to_setup()

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "neat",
            "network": self.network.to_payload(),
            "vehicleGenes": self.vehicle.to_payload(),
        }


@dataclass(frozen=True, slots=True)
class NEATScoredCandidate:
    candidate: NEATCandidate
    evaluation: CandidateEvaluation


@dataclass(frozen=True, slots=True)
class NEATGenerationReport:
    generation: int
    champion_id: str
    best_fitness: float
    median_fitness: float
    results: tuple[NEATScoredCandidate, ...]

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "neat",
            "generation": self.generation,
            "championId": self.champion_id,
            "bestFitness": _rounded(self.best_fitness),
            "medianFitness": _rounded(self.median_fitness),
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
class NEATRunResult:
    seed: int
    reports: tuple[NEATGenerationReport, ...]
    champion: NEATScoredCandidate

    def to_payload(self) -> dict[str, object]:
        return {
            "contractVersion": EVOLUTION_CONTRACT_VERSION,
            "algorithm": "neat",
            "seed": self.seed,
            "reports": [report.to_payload() for report in self.reports],
            "champion": {
                "candidateId": self.champion.candidate.candidate_id,
                "fitness": _rounded(self.champion.evaluation.fitness),
                "genome": self.champion.candidate.to_payload(),
            },
        }


NEATFitnessEvaluator = Callable[[NEATCandidate], CandidateEvaluation]


def make_neat_episode_evaluator(
    geometry: TrackGeometry,
    *,
    max_seconds: float,
) -> NEATFitnessEvaluator:
    """Create the NEAT adapter over the shared Phase 4 physics and Phase 5 fitness."""
    if not math.isfinite(max_seconds) or max_seconds <= 0.0:
        raise ValueError("max_seconds must be finite and positive.")

    def evaluator(candidate: NEATCandidate) -> CandidateEvaluation:
        return evaluate_candidate(
            geometry,
            candidate.controller,
            candidate.setup,
            max_seconds=max_seconds,
            selected_car_id=candidate.candidate_id,
        )

    return evaluator


def load_neat_config(population_size: int = 24) -> Any:
    """Load the bundled, explicit feed-forward neat-python configuration."""
    if population_size < 4:
        raise ValueError("NEAT population_size must be at least 4.")
    if neat.__version__ != NEAT_DEPENDENCY_VERSION:
        raise RuntimeError(
            f"EvoRacer requires neat-python {NEAT_DEPENDENCY_VERSION}, found {neat.__version__}."
        )
    config_resource = resources.files("evo_racer").joinpath(NEAT_CONFIG_RESOURCE)
    with resources.as_file(config_resource) as config_path:
        config = neat.Config(
            EvoRacerGenome,
            neat.DefaultReproduction,
            neat.DefaultSpeciesSet,
            neat.DefaultStagnation,
            str(config_path),
        )
    config.pop_size = population_size
    if not config.genome_config.feed_forward:
        raise RuntimeError("EvoRacer supports feed-forward NEAT only.")
    return config


def compile_neat_network(genome: EvoRacerGenome, config: object) -> CompiledNEATNetwork:
    """Compile a neat-python genome into the runtime-neutral DAG contract."""
    typed_config = cast(Any, config)
    genome_config = typed_config.genome_config
    connection_keys = [
        connection.key for connection in genome.connections.values() if connection.enabled
    ]
    layers, required = feed_forward_layers(
        genome_config.input_keys,
        genome_config.output_keys,
        connection_keys,
    )
    required_with_inputs = required.union(set(genome_config.input_keys))
    nodes: list[RuntimeNode] = []
    for layer in layers:
        for node_key in sorted(layer):
            node_gene = genome.nodes[node_key]
            links = tuple(
                RuntimeLink(
                    source=input_key, weight=genome.connections[(input_key, node_key)].weight
                )
                for input_key, output_key in sorted(connection_keys)
                if output_key == node_key and input_key in required_with_inputs
            )
            nodes.append(
                RuntimeNode(
                    key=node_key,
                    activation=node_gene.activation,
                    aggregation=node_gene.aggregation,
                    bias=node_gene.bias,
                    response=node_gene.response,
                    links=links,
                )
            )
    return CompiledNEATNetwork(
        input_keys=tuple(genome_config.input_keys),
        output_keys=tuple(genome_config.output_keys),
        nodes=tuple(nodes),
    )


def create_neat_population(
    *,
    population_size: int,
    seed: int,
) -> tuple[Any, Any]:
    """Create a deterministic population and return it with its configuration."""
    config = load_neat_config(population_size)
    return neat.Population(config, seed=seed), config


def restore_neat_population(
    checkpoint_path: Path,
    *,
    population_size: int,
) -> tuple[Any, Any]:
    """Restore a deterministic population using the pinned current configuration."""
    if not checkpoint_path.is_file():
        raise FileNotFoundError(checkpoint_path)
    config = load_neat_config(population_size)
    population = neat.Checkpointer.restore_checkpoint(str(checkpoint_path), new_config=config)
    return population, config


def run_neat(
    *,
    population_size: int,
    seed: int,
    generations: int,
    evaluator: NEATFitnessEvaluator,
    checkpoint_prefix: Path | None = None,
    restore_checkpoint: Path | None = None,
) -> NEATRunResult:
    """Run or resume a bounded deterministic feed-forward NEAT experiment."""
    if generations <= 0:
        raise ValueError("generations must be positive.")
    if restore_checkpoint is None:
        population, config = create_neat_population(population_size=population_size, seed=seed)
    else:
        population, config = restore_neat_population(
            restore_checkpoint,
            population_size=population_size,
        )
    if checkpoint_prefix is not None:
        checkpoint_prefix.parent.mkdir(parents=True, exist_ok=True)
        population.add_reporter(
            neat.Checkpointer(
                generation_interval=1,
                time_interval_seconds=None,
                filename_prefix=str(checkpoint_prefix),
            )
        )

    reports: list[NEATGenerationReport] = []
    best: NEATScoredCandidate | None = None

    def evaluate_genomes(genomes: list[tuple[int, object]], active_config: object) -> None:
        nonlocal best
        generation = int(population.generation)
        scored: list[NEATScoredCandidate] = []
        for genome_key, raw_genome in sorted(genomes):
            if not isinstance(raw_genome, EvoRacerGenome):
                raise TypeError("NEAT population contains an unsupported genome.")
            candidate = NEATCandidate(
                candidate_id=_neat_candidate_id(generation, genome_key),
                generation=generation,
                network=compile_neat_network(raw_genome, active_config),
                vehicle=raw_genome.vehicle_genome,
            )
            before_vehicle = raw_genome.vehicle_genome
            evaluation = evaluator(candidate)
            if raw_genome.vehicle_genome != before_vehicle:
                raise RuntimeError("Vehicle genes changed during active evaluation.")
            raw_genome.fitness = evaluation.fitness
            scored.append(NEATScoredCandidate(candidate, evaluation))
        ranked = sorted(
            scored,
            key=lambda item: (-item.evaluation.fitness, item.candidate.candidate_id),
        )
        if not ranked:
            raise RuntimeError("NEAT evaluated an empty population.")
        values = [item.evaluation.fitness for item in scored]
        report = NEATGenerationReport(
            generation=generation,
            champion_id=ranked[0].candidate.candidate_id,
            best_fitness=ranked[0].evaluation.fitness,
            median_fitness=statistics.median(values),
            results=tuple(scored),
        )
        reports.append(report)
        if (
            best is None
            or ranked[0].evaluation.fitness > best.evaluation.fitness
            or (
                ranked[0].evaluation.fitness == best.evaluation.fitness
                and ranked[0].candidate.candidate_id < best.candidate.candidate_id
            )
        ):
            best = ranked[0]

    population.run(evaluate_genomes, generations)
    if best is None:
        raise RuntimeError("NEAT produced no evaluated candidate.")
    return NEATRunResult(seed=seed, reports=tuple(reports), champion=best)


def _mutate_value(value: float, power: float, minimum: float, maximum: float) -> float:
    if random.random() >= VEHICLE_MUTATION_RATE:
        return value
    return _clamp(value + random.gauss(0.0, power), minimum, maximum)


def _neat_candidate_id(generation: int, genome_key: int) -> str:
    return f"neat-g{generation:04d}-k{genome_key:06d}"


def _integer_array(value: object, field: str) -> tuple[int, ...]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be an array.")
    return tuple(_integer(item, field) for item in value)


def _integer(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field} must be an integer.")
    return value


def _finite_number(value: object, field: str) -> float:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(float(value))
    ):
        raise ValueError(f"{field} must be a finite number.")
    return float(value)


def _string(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    return value


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
