# Fixed GA and NEAT: Evidence-backed Comparison

## Shared evaluation boundary

Fixed GA and feed-forward NEAT differ in how they create the next population.
They do not receive different tracks, physics, sensors, termination rules, or
fitness functions.

| Property             | Fixed GA                                           | Feed-forward NEAT                           |
| -------------------- | -------------------------------------------------- | ------------------------------------------- |
| Controller structure | Fixed `10 -> 6 -> 3` network                       | Evolved feed-forward DAG                    |
| Network evolution    | Weights and biases                                 | Topology, weights, and biases               |
| Vehicle genes        | Five budget logits plus two full-domain bias genes | The same seven vehicle genes                |
| Active episode       | Controller and vehicle values frozen               | Controller and vehicle values frozen        |
| Evaluation           | Canonical Python evaluator                         | The same canonical Python evaluator         |
| Resume evidence      | Seeded population lifecycle                        | Deterministic neat-python checkpoint replay |

## Saved evidence

The deterministic Phase 10 fixture runs both algorithms for one generation
with population `10` and a `15 s` episode on three seeds across all three
presets. All `18` cases complete and retain a canonical result SHA-256.

This deliberately small matrix is a regression and integration smoke test, not
a learning benchmark. Within it:

| Algorithm | Cases | Mean champion fitness | Median champion fitness | Zero-fitness champions |
| --------- | ----: | --------------------: | ----------------------: | ---------------------: |
| Fixed GA  |     9 |          103.83024287 |            109.49896879 |                      0 |
| NEAT      |     9 |           52.92941111 |             31.09698435 |                      0 |

Fixed GA has the higher champion fitness in `6 / 9` paired smoke cases; NEAT has
the higher value in `3 / 9`. The episodes contain 900 fixed simulation steps
and only one generation, so these numbers say only that the reviewed code paths
completed with the saved deterministic outputs. They are too small to support a
general claim of algorithm superiority or learning quality.

The stronger learning evidence is the
[learning benchmark](verification/learning-benchmark.md). It compares each evolved run
with the same evaluation budget spent without selection, on all three presets across
five seeds. Evolution beat that control in `11 / 15` Fixed GA cases and `13 / 15` NEAT
cases. NEAT finished `9 / 15` laps and Fixed GA `0 / 15`, at `16` cars, `10`
generations, and `30 s`. That is one budget and a small sample, so it does not establish
a general ranking of the algorithms.

## How to choose

- Choose **Fixed GA** when a stable network shape makes runs easier to inspect
  and compare.
- Choose **NEAT** when evolving feed-forward topology is part of the experiment.
- Use multiple seeds and report the full track/settings contract before making
  learning-performance claims.

The reviewed raw regression values are in
[`contracts/phase10-regression.json`](../contracts/phase10-regression.json).
Phase-level methods and limitations are recorded in
[`docs/verification/phase10-hardening.md`](verification/phase10-hardening.md).
