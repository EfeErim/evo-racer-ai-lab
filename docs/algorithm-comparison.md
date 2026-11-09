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

The deterministic regression fixture runs both algorithms for one generation
with population `10` and a `15 s` episode on three seeds across all three
presets. All `18` cases complete and retain a canonical result SHA-256.

This deliberately small matrix is a regression and integration smoke test, not
a learning benchmark. Within it:

| Algorithm | Cases | Mean champion fitness | Median champion fitness | Zero-fitness champions |
| --------- | ----: | --------------------: | ----------------------: | ---------------------: |
| Fixed GA  |     9 |           95.29697295 |             81.88723885 |                      0 |
| NEAT      |     9 |           54.88429826 |             31.62040340 |                      0 |

Fixed GA has the higher champion fitness in `5 / 9` paired smoke cases; NEAT has
the higher value in `4 / 9`. The episodes contain 900 fixed simulation steps
and only one generation, so these numbers say only that the reviewed code paths
completed with the saved deterministic outputs. They are too small to support a
general claim of algorithm superiority or learning quality.

The stronger learning evidence is the
[learning benchmark](experiments/learning-benchmark.md). It compares each evolved run
with the same evaluation budget spent without selection, on all three presets across
five seeds. Under physics v2, evolution beat that control in `12 / 15` Fixed GA cases and
`13 / 15` NEAT cases. NEAT finished `9 / 15` laps and Fixed GA `5 / 15`, at `16` cars,
`10` generations, and `30 s`.

The [held-out matrix](experiments/physics-v2.md#held-out-matrix) uses seeds and a
generated track kept out of physics tuning, at Quick check and Balanced, with and without
evolved vehicle genes. Across its `48` runs per algorithm, Fixed GA beat its control in
`41` and finished `23` laps; NEAT beat its control in `43` and finished `32`. Three seeds
per cell is a small sample, so this does not establish a general ranking of the
algorithms.

## How to choose

- Choose **Fixed GA** when a stable network shape makes runs easier to inspect
  and compare.
- Choose **NEAT** when evolving feed-forward topology is part of the experiment.
- Use multiple seeds and report the full track/settings contract before making
  learning-performance claims.

The reviewed raw regression values are in
[`contracts/regression-matrix-v2.json`](../contracts/regression-matrix-v2.json).
