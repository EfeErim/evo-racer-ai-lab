from __future__ import annotations

import json
import math
from dataclasses import replace
from pathlib import Path

import pytest

from evo_racer.evolution import (
    NETWORK_PARAMETER_COUNT,
    CandidateEvaluation,
    FeedForwardController,
    FeedForwardNetwork,
    FixedCandidate,
    FixedGA,
    FixedGAConfig,
    FixedGenome,
    ScoredCandidate,
    VehicleGenome,
    episode_fitness,
    evaluate_random_network_with_vehicle,
    make_episode_evaluator,
    run_fixed_ga,
)
from evo_racer.simulation import RandomNetworkBaseline, evaluate_episode, preset_geometry

CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "phase5-fixed-ga.json"


def _landscape_evaluator(candidate: FixedCandidate) -> CandidateEvaluation:
    selected_parameters = candidate.genome.network.parameters[:12]
    distance = sum((value - 0.35) ** 2 for value in selected_parameters)
    vehicle_distance = sum(
        (value + 0.2) ** 2 for value in candidate.genome.vehicle.performance_logits
    )
    fitness = 1000.0 - distance - vehicle_distance
    return CandidateEvaluation(
        fitness=fitness,
        progress_fraction=max(0.0, min(1.0, fitness / 1000.0)),
        finished=False,
        collision_count=0,
        steps=1,
    )


def test_feed_forward_network_round_trips_and_has_bounded_controls() -> None:
    network = FeedForwardNetwork(tuple(0.01 * index for index in range(NETWORK_PARAMETER_COUNT)))
    restored = FeedForwardNetwork.from_payload(network.to_payload())
    controller = FeedForwardController(restored, "fixture")
    geometry = preset_geometry("easy-oval")
    baseline = evaluate_episode(
        geometry,
        RandomNetworkBaseline(3),
        max_seconds=0.5,
    )
    telemetry = baseline.telemetry[0]
    observation = geometry.project((telemetry.state.x, telemetry.state.y))
    controls = network.activate(
        (
            telemetry.state.forward_speed / 40.0,
            telemetry.state.lateral_speed / 10.0,
            0.0,
            *(distance / 36.0 for distance in telemetry.sensor_distances),
        )
    )

    assert restored == network
    assert controller.parameters == network.parameters
    assert -1.0 <= controls.steering <= 1.0
    assert 0.0 <= controls.throttle <= 1.0
    assert 0.0 <= controls.brake <= 1.0
    assert math.isfinite(observation.path_distance)


def test_vehicle_genome_enforces_budget_and_full_bias_domain() -> None:
    rear = VehicleGenome((5.0, -5.0, -5.0, -5.0, -5.0), 0.0, 0.0)
    front = VehicleGenome((-5.0, 5.0, -5.0, -5.0, -5.0), 1.0, 1.0)

    assert sum(rear.allocations) == pytest.approx(1.0)
    assert sum(front.allocations) == pytest.approx(1.0)
    assert rear.to_setup().max_speed > front.to_setup().max_speed
    assert rear.to_setup().front_brake_bias == 0.0
    assert rear.to_setup().front_drive_bias == 0.0
    assert front.to_setup().front_brake_bias == 1.0
    assert front.to_setup().front_drive_bias == 1.0


def test_fixed_seed_reproduces_population_and_result_sequence() -> None:
    config = FixedGAConfig(population_size=10, elite_count=2)
    first = FixedGA(config, seed=20260729)
    second = FixedGA(config, seed=20260729)

    assert first.population == second.population

    first_run = run_fixed_ga(config, 20260729, 5, _landscape_evaluator)
    second_run = run_fixed_ga(config, 20260729, 5, _landscape_evaluator)

    assert first_run.to_payload() == second_run.to_payload()


def test_elites_remain_byte_for_byte_unchanged() -> None:
    config = FixedGAConfig(population_size=8, elite_count=2, mutation_rate=1.0)
    ga = FixedGA(config, seed=17)
    report = ga.evaluate(_landscape_evaluator)
    ranked = sorted(
        report.results,
        key=lambda scored: (-scored.evaluation.fitness, scored.candidate.candidate_id),
    )
    elite_genomes = tuple(scored.candidate.genome for scored in ranked[:2])

    ga.advance(report)

    assert tuple(candidate.genome for candidate in ga.population[:2]) == elite_genomes


def test_fitness_does_not_reward_survival_speed_or_collision() -> None:
    baseline = evaluate_episode(
        preset_geometry("easy-oval"),
        RandomNetworkBaseline(0),
        max_seconds=0.5,
    )
    short_idle = replace(
        baseline,
        finished=False,
        steps=1,
        progress_fraction=0.0,
        collision_count=0,
    )
    long_idle = replace(
        baseline,
        finished=False,
        steps=600,
        progress_fraction=0.0,
        collision_count=0,
    )
    collision = replace(long_idle, collision_count=1)
    finished = replace(
        baseline,
        finished=True,
        steps=300,
        progress_fraction=1.0,
        collision_count=0,
    )

    assert episode_fitness(short_idle, 600).fitness == 0.0
    assert episode_fitness(long_idle, 600).fitness == 0.0
    assert episode_fitness(collision, 600).fitness < 0.0
    assert episode_fitness(finished, 600).fitness > 2200.0


def test_controlled_training_improves_median_and_beats_random_same_vehicle() -> None:
    geometry = preset_geometry("easy-oval")
    max_seconds = 6.0
    result = run_fixed_ga(
        FixedGAConfig(
            population_size=12,
            elite_count=2,
            tournament_size=3,
            mutation_rate=0.16,
            network_mutation_scale=0.45,
        ),
        seed=91,
        generations=7,
        evaluator=make_episode_evaluator(geometry, max_seconds=max_seconds),
    )
    champion = result.champion
    random_result = evaluate_random_network_with_vehicle(
        geometry,
        champion.candidate.genome.vehicle,
        seed=0,
        max_seconds=max_seconds,
    )

    assert result.reports[-1].median_fitness > result.reports[0].median_fitness
    assert champion.evaluation.fitness > random_result.fitness
    assert champion.evaluation.progress_fraction > random_result.progress_fraction


def test_shared_fixed_ga_fixture_round_trips_in_python() -> None:
    fixture: object = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert isinstance(fixture, dict)
    network = FeedForwardNetwork.from_payload(fixture["network"])
    vehicle_payload = fixture["vehicleGenes"]
    assert isinstance(vehicle_payload, dict)
    logits = vehicle_payload["performanceLogits"]
    assert isinstance(logits, list)
    genome = FixedGenome(
        network=network,
        vehicle=VehicleGenome(
            performance_logits=tuple(float(value) for value in logits),
            front_brake_bias=float(vehicle_payload["frontBrakeBias"]),
            front_drive_bias=float(vehicle_payload["frontDriveBias"]),
        ),
    )
    candidate = FixedCandidate("fixture-candidate", 0, genome)
    scored = ScoredCandidate(
        candidate,
        CandidateEvaluation(
            fitness=10.0,
            progress_fraction=0.01,
            finished=False,
            collision_count=0,
            steps=60,
        ),
    )

    assert genome.to_payload() == fixture
    assert scored.candidate.controller.parameters == network.parameters
