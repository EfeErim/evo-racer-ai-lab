# Phase 6 NEAT Verification

Verified on `2026-07-29`.

## Delivered

- Exact `neat-python 2.0.0` runtime dependency and bundled explicit
  feed-forward configuration.
- `EvoRacerGenome` carrying the common five performance-budget logits plus
  full-domain front brake and drive bias genes.
- Version 1 runtime-neutral feed-forward DAG compiler and canonical Python
  controller.
- NEAT adapter over the unchanged shared physics, episode termination, and
  fitness path.
- Seeded multi-generation orchestration and deterministic generation-boundary
  checkpoint restore.
- Shared `contracts/phase6-neat.json` round-tripped by Python and structurally
  verified by TypeScript.

## Dependency decision

PyPI reported `neat-python 2.0.0` as the current stable release, compatible with
Python `>=3.8` and with no required runtime packages. The implementation was
checked against the upstream v2.0.0
[feed-forward config](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/examples/xor/config-feedforward),
[customizable genome](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/genome.py),
[generation reproduction](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/reproduction.py),
and
[checkpoint restore](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/checkpoint.py)
sources.

Both `pyproject.toml` and `requirements-dev.lock` pin exactly `2.0.0`.
`load_neat_config` also rejects a different loaded version so incompatible
checkpoint behavior cannot be used silently.

## Automated gate

`npm run check` passed:

- Prettier and Ruff formatting checks.
- ESLint and Ruff lint.
- TypeScript type-check and strict Python mypy.
- 19 TypeScript tests.
- 48 Python tests, including seven Phase 6 tests.
- Vite production build.

`npm run smoke:m0` passed with the frontend at `127.0.0.1:4173` and Python
health at `127.0.0.1:8765`.

`git diff --check` passed. The static runtime URL scan found only the existing
loopback frontend and service origins plus their local fetch calls. Building the
Python wheel with `pip wheel . --no-deps --no-build-isolation` confirmed that
`evo_racer/config/neat-feed-forward.ini` is bundled.

## M6 acceptance evidence

### Multi-generation run

`test_multi_generation_neat_run_uses_shared_episode_evaluator` completed three
generations of six candidates on Easy Oval. Every candidate ran through
`make_neat_episode_evaluator`, the shared `evaluate_candidate` function, Phase 4
fixed-step physics, and Phase 5 fitness.

The reports covered generations `0`, `1`, and `2`, each with six finite
candidate evaluations.

### Generation-boundary vehicle evolution

`test_vehicle_genes_cross_over_and_mutate_without_changing_parents` verifies
that every crossed vehicle gene comes from one of its two parents, bounded
mutation changes the offspring, and neither parent changes.

`test_vehicle_genes_stay_frozen_during_evaluation_and_change_between_generations`
records all eight vehicle genomes in two consecutive generations. Each value
remains equal before and after its evaluation, while the next-generation set
differs. `run_neat` also fails if a source genome's vehicle value changes during
the evaluator callback.

### Deterministic checkpoint resume

`test_checkpoint_restore_reproduces_uninterrupted_next_generations` used
population `8` and seed `411`.

1. One run completed generations `0`, `1`, and `2` without interruption.
2. A second seed-identical run evaluated generation `0` and saved
   `neat-checkpoint-1`.
3. Restoring that checkpoint evaluated generations `1` and `2`.

The first-leg generation `0` report equaled the uninterrupted report. Both
restored reports, including candidate IDs, fitness, progress, collisions, and
steps, equaled the uninterrupted generation `1` and `2` payloads.

### Runtime-neutral network

`test_pinned_feed_forward_config_and_runtime_compiler_match_neat_python`
compiles a seeded genome into the versioned DAG and compares its three raw
outputs with neat-python's feed-forward executor for the same ten inputs. The
outputs match numerically, and the serialized DAG round-trips exactly.

The TypeScript contract test checks only the versioned DAG and vehicle-gene
shape. Network compilation, activation, vehicle mapping, evolution, physics,
and fitness remain Python-only.
