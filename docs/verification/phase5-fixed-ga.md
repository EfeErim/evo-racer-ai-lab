# Phase 5 Fixed GA Verification

Verified on `2026-07-29`.

## Delivered

- Python-only version 1 `10 -> 6 -> 3` feed-forward network execution.
- Immutable controller and vehicle genomes with a five-gene softmax performance
  budget and full-domain front brake/drive bias genes.
- Seeded population initialization, tournament selection, exact elitism,
  uniform crossover, bounded Gaussian mutation, and stable generation reports.
- Fitness based on net forward progress, verified lap completion, completion
  efficiency, and collision penalties.
- Shared `contracts/phase5-fixed-ga.json` parsed by Python and structurally
  verified by TypeScript without duplicating evolution rules.

## Automated gate

`npm run check` passed:

- Prettier and Ruff formatting checks.
- ESLint and Ruff lint.
- TypeScript type-check and strict Python mypy.
- 18 TypeScript tests.
- 41 Python tests, including seven Phase 5 tests.
- Vite production build.

`npm run smoke:m0` passed with the frontend at `127.0.0.1:4173` and Python
health at `127.0.0.1:8765`.

The static runtime URL scan found only the existing loopback frontend/service
origins and fetch calls. The external links in `docs/architecture.md` are
development documentation references, not runtime resources.

## M5 acceptance evidence

### Fixed seed reproducibility

`test_fixed_seed_reproduces_population_and_result_sequence` creates two
independent populations and two five-generation runs with seed `20260729`.
Their immutable initial populations and complete versioned run payloads are
equal.

The implementation owns one isolated `random.Random` instance per run and
evaluates candidates in stable ID order. This design was checked against Python
3.13's [official reproducibility guidance](https://docs.python.org/3.13/library/random.html#notes-on-reproducibility).

### Exact elitism

`test_elites_remain_byte_for_byte_unchanged` evaluates an eight-candidate
population, sets mutation probability to `1.0`, advances the population, and
compares the first two next-generation genomes with the two ranked source
elites. Both network and vehicle genes remain exactly equal.

Tournament parent selection follows the selection-pressure model studied by
[Miller and Goldberg](https://www.complex-systems.com/abstracts/v09_i03_a02/).
No dependency was introduced.

### Controlled training improvement

The controlled Easy Oval fixture used:

```text
seed=91
population=12
elite_count=2
tournament_size=3
generations=7
episode_limit=6.0 s
mutation_rate=0.16
network_mutation_scale=0.45
```

The saved deterministic fitness sequence was:

| Generation | Median fitness | Best fitness |
| ---------: | -------------: | -----------: |
|          0 |       0.000000 |    40.529953 |
|          1 |       0.000000 |    40.529953 |
|          2 |      10.105501 |    44.782891 |
|          3 |      38.314834 |    90.892314 |
|          4 |      21.967138 |   131.536800 |
|          5 |      71.428162 |   133.549074 |
|          6 |      99.599264 |   173.985972 |

The final median is greater than the initial median. The champion
`g0006-c0002` reached progress `0.144988` and fitness `173.985972`. A
deterministic random network with seed `0`, evaluated through the same Phase 4
physics and the champion's exact vehicle genes, reached progress `0.000000` and
fitness `0.000336`.

### Exploit resistance

The scorer rewards no raw speed or survival time. Test fixtures with zero net
progress score `0.0` whether they last one step or 600 steps. A collision lowers
that score, while the efficiency bonus is inaccessible unless the canonical
evaluator reports a completed lap.

Phase 4 already computes signed net forward progress, subtracts backward motion,
terminates on swept corridor collision, and rejects controller-parameter
mutation during an episode. Fixed GA calls that evaluator unchanged.
