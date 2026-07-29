from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any

import neat  # type: ignore[import-untyped]
import pytest

from evo_racer.evolution import CandidateEvaluation, VehicleGenome
from evo_racer.neat_evolution import (
    NEAT_DEPENDENCY_VERSION,
    CompiledNEATNetwork,
    EvoRacerGenome,
    NEATCandidate,
    compile_neat_network,
    create_neat_population,
    load_neat_config,
    make_neat_episode_evaluator,
    run_neat,
)
from evo_racer.simulation import preset_geometry

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase6-neat.json"


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


def test_pinned_feed_forward_config_and_runtime_compiler_match_neat_python() -> None:
    population, config = create_neat_population(population_size=4, seed=20260729)
    raw_genome = next(iter(population.population.values()))
    assert isinstance(raw_genome, EvoRacerGenome)
    compiled = compile_neat_network(raw_genome, config)
    library_network = neat.nn.FeedForwardNetwork.create(raw_genome, config)
    features = tuple(index / 20.0 for index in range(10))

    assert neat.__version__ == NEAT_DEPENDENCY_VERSION
    assert config.genome_config.feed_forward is True
    assert config.genome_config.num_inputs == 10
    assert config.genome_config.num_outputs == 3
    assert all(node.activation in {"identity", "tanh"} for node in compiled.nodes)
    assert compiled.activate(features) == pytest.approx(library_network.activate(features))
    assert CompiledNEATNetwork.from_payload(compiled.to_payload()) == compiled


def test_multi_generation_neat_run_uses_shared_episode_evaluator() -> None:
    result = run_neat(
        population_size=6,
        seed=73,
        generations=3,
        evaluator=make_neat_episode_evaluator(
            preset_geometry("easy-oval"),
            max_seconds=0.5,
        ),
    )

    assert [report.generation for report in result.reports] == [0, 1, 2]
    assert all(len(report.results) == 6 for report in result.reports)
    assert result.champion.candidate.controller.name.startswith("neat:")
    assert math.isfinite(result.champion.evaluation.fitness)


def test_vehicle_genes_stay_frozen_during_evaluation_and_change_between_generations() -> None:
    observed: dict[int, list[VehicleGenome]] = {}

    def evaluator(candidate: NEATCandidate) -> CandidateEvaluation:
        before = candidate.vehicle
        observed.setdefault(candidate.generation, []).append(before)
        evaluation = _synthetic_evaluator(candidate)
        assert candidate.vehicle == before
        return evaluation

    result = run_neat(
        population_size=8,
        seed=19,
        generations=2,
        evaluator=evaluator,
    )

    assert len(result.reports) == 2
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


def test_checkpoint_restore_reproduces_uninterrupted_next_generations(tmp_path: Path) -> None:
    uninterrupted = run_neat(
        population_size=8,
        seed=411,
        generations=3,
        evaluator=_synthetic_evaluator,
    )
    checkpoint_prefix = tmp_path / "neat-checkpoint-"
    first_leg = run_neat(
        population_size=8,
        seed=411,
        generations=1,
        evaluator=_synthetic_evaluator,
        checkpoint_prefix=checkpoint_prefix,
    )
    checkpoint = tmp_path / "neat-checkpoint-1"

    resumed = run_neat(
        population_size=8,
        seed=411,
        generations=2,
        evaluator=_synthetic_evaluator,
        restore_checkpoint=checkpoint,
    )

    assert checkpoint.is_file()
    assert first_leg.reports[0].to_payload() == uninterrupted.reports[0].to_payload()
    assert [report.to_payload() for report in resumed.reports] == [
        report.to_payload() for report in uninterrupted.reports[1:]
    ]


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
