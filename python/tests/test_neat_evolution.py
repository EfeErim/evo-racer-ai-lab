from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any

import neat  # type: ignore[import-untyped]
import pytest

from evo_racer.evolution import CandidateEvaluation, VehicleGenome, episode_fitness
from evo_racer.neat_evolution import (
    CompiledNEATNetwork,
    EvoRacerGenome,
    NEATCandidate,
    NEATEvaluator,
    NEATGenerationReport,
    NEATRandomStream,
    compile_neat_network,
    create_neat_population,
    load_neat_config,
    score_neat_generation,
)
from evo_racer.simulation import (
    Controller,
    TrackGeometry,
    VehicleSetup,
    episode_step_limit,
    evaluate_episode,
    preset_geometry,
)

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "neat.json"


def _drive(
    geometry: TrackGeometry, controller: Controller, setup: VehicleSetup, max_seconds: float
) -> CandidateEvaluation:
    """Score one drive the way RunSession does: physics episode, then fitness."""
    episode = evaluate_episode(
        geometry, controller, setup, max_seconds=max_seconds, selected_car_id="test-car"
    )
    return episode_fitness(episode, episode_step_limit(max_seconds))


def _synthetic_evaluator(candidate: NEATCandidate) -> CandidateEvaluation:
    outputs = candidate.network.activate((0.1,) * 10)
    fitness = 100.0 + sum(outputs) + sum(candidate.vehicle.performance_logits)
    return CandidateEvaluation(
        fitness=fitness,
        progress_fraction=max(0.0, min(1.0, fitness / 200.0)),
        finished=False,
        collision_count=0,
        steps=1,
    )


def _run(
    population_size: int, seed: int, generations: int, evaluator: NEATEvaluator
) -> list[NEATGenerationReport]:
    reports: list[NEATGenerationReport] = []
    stream = NEATRandomStream(seed)
    with stream.active():
        population, _ = create_neat_population(population_size=population_size, seed=seed)

        def evaluate_genomes(genomes: list[tuple[int, object]], config: object) -> None:
            reports.append(
                score_neat_generation(int(population.generation), genomes, config, evaluator)
            )

        population.run(evaluate_genomes, generations)
    return reports


def test_pinned_feed_forward_config_and_runtime_compiler_match_neat_python() -> None:
    population, config = create_neat_population(population_size=4, seed=20260729)
    raw_genome = next(iter(population.population.values()))
    assert isinstance(raw_genome, EvoRacerGenome)
    compiled = compile_neat_network(raw_genome, config)
    library_network = neat.nn.FeedForwardNetwork.create(raw_genome, config)
    features = tuple(index / 20.0 for index in range(10))

    assert neat.__version__ == "2.0.0"
    assert config.genome_config.feed_forward is True
    assert config.genome_config.num_inputs == 10
    assert config.genome_config.num_outputs == 3
    assert all(node.activation in {"identity", "tanh"} for node in compiled.nodes)
    assert compiled.activate(features) == pytest.approx(library_network.activate(features))
    assert CompiledNEATNetwork.from_payload(compiled.to_payload()) == compiled


def test_runtime_network_rejects_ambiguous_input_and_output_keys() -> None:
    def payload() -> dict[str, object]:
        return {
            "contractVersion": 1,
            "kind": "feed-forward-dag",
            "inputKeys": list(range(-10, 0)),
            "outputKeys": [0, 1, 2],
            "outputTransforms": ["tanh", "sigmoid", "sigmoid"],
            "nodes": [
                {
                    "key": output_key,
                    "activation": "identity",
                    "aggregation": "sum",
                    "bias": 0.0,
                    "response": 1.0,
                    "links": [{"source": -1, "weight": 1.0}],
                }
                for output_key in range(3)
            ],
        }

    duplicate_inputs = payload()
    duplicate_inputs["inputKeys"] = [-10, -10, *range(-8, 0)]
    with pytest.raises(ValueError, match="input keys must be unique"):
        CompiledNEATNetwork.from_payload(duplicate_inputs)

    duplicate_outputs = payload()
    duplicate_outputs["outputKeys"] = [0, 0, 2]
    with pytest.raises(ValueError, match="output keys must be unique"):
        CompiledNEATNetwork.from_payload(duplicate_outputs)

    overlapping_keys = payload()
    overlapping_keys["outputKeys"] = [-1, 1, 2]
    with pytest.raises(ValueError, match="input and output keys must be disjoint"):
        CompiledNEATNetwork.from_payload(overlapping_keys)


def test_multi_generation_neat_run_uses_shared_episode_evaluator() -> None:
    geometry = preset_geometry("easy-oval")
    reports = _run(
        6,
        73,
        3,
        lambda candidate: _drive(geometry, candidate.controller, candidate.setup, 0.5),
    )

    assert [report.generation for report in reports] == [0, 1, 2]
    assert all(len(report.results) == 6 for report in reports)
    assert reports[-1].results[0].candidate.controller.name.startswith("neat:")
    assert all(math.isfinite(report.best_fitness) for report in reports)


def test_vehicle_genes_stay_frozen_during_evaluation_and_change_between_generations() -> None:
    observed: dict[int, list[VehicleGenome]] = {}

    def evaluator(candidate: NEATCandidate) -> CandidateEvaluation:
        before = candidate.vehicle
        observed.setdefault(candidate.generation, []).append(before)
        evaluation = _synthetic_evaluator(candidate)
        assert candidate.vehicle == before
        return evaluation

    reports = _run(8, 19, 2, evaluator)

    assert len(reports) == 2
    assert len(observed[0]) == 8
    assert len(observed[1]) == 8
    assert set(observed[0]) != set(observed[1])


def test_vehicle_genes_cross_over_and_mutate_without_changing_parents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    population, config = create_neat_population(population_size=4, seed=31)
    first, second = list(population.population.values())[:2]
    assert isinstance(first, EvoRacerGenome)
    assert isinstance(second, EvoRacerGenome)
    first.vehicle_genome = VehicleGenome((-1.0,) * 5, 0.0, 0.0)
    second.vehicle_genome = VehicleGenome((1.0,) * 5, 1.0, 1.0)
    first.fitness = 2.0
    second.fitness = 1.0
    parent_snapshots = (first.vehicle_genome, second.vehicle_genome)
    child = EvoRacerGenome(999)

    random.seed(5)
    child.configure_crossover(first, second, config.genome_config)
    crossed = child.vehicle_genome

    assert all(value in {-1.0, 1.0} for value in crossed.performance_logits)
    assert crossed.front_brake_bias in {0.0, 1.0}
    assert crossed.front_drive_bias in {0.0, 1.0}

    monkeypatch.setattr(random, "random", lambda: 0.0)
    monkeypatch.setattr(random, "gauss", lambda mean, power: mean + power)
    child.mutate(config.genome_config)

    assert child.vehicle_genome != crossed
    assert (first.vehicle_genome, second.vehicle_genome) == parent_snapshots


def test_same_seed_reproduces_every_generation() -> None:
    first = _run(8, 411, 3, _synthetic_evaluator)
    second = _run(8, 411, 3, _synthetic_evaluator)

    assert [report.to_payload() for report in first] == [report.to_payload() for report in second]


def test_shared_neat_fixture_round_trips_in_python() -> None:
    fixture: Any = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    network = CompiledNEATNetwork.from_payload(fixture["network"])
    vehicle_payload = fixture["vehicleGenes"]
    vehicle = VehicleGenome(
        performance_logits=tuple(float(value) for value in vehicle_payload["performanceLogits"]),
        front_brake_bias=float(vehicle_payload["frontBrakeBias"]),
        front_drive_bias=float(vehicle_payload["frontDriveBias"]),
    )
    candidate = NEATCandidate("fixture", 0, network, vehicle)

    assert candidate.to_payload() == fixture
    assert network.activate((0.2,) * 10) == pytest.approx((0.2, -0.25, 0.45))


def test_neat_config_rejects_too_small_population() -> None:
    with pytest.raises(ValueError, match="at least 4"):
        load_neat_config(3)
