# Learning benchmark and Pure Pursuit reference

Recorded on `2026-11-05`. Physics, sensors, fitness, and evolution were not changed.
The saved results are in
[`contracts/learning-benchmark.json`](../../contracts/learning-benchmark.json).

## Pure Pursuit crashed on the cars it was compared with

Results compares the champion with Pure Pursuit on the champion's own vehicle setup.
That controller's speed targets were fixed for the default car. Evolved setups in these
runs had steering agility from `0.74` to `1.04`, against `1.35` on the default car, so
they could not turn as sharply at the same speed.

| Measurement                                              | Result                                                  |
| -------------------------------------------------------- | ------------------------------------------------------- |
| Default car, `120 s`, all presets                        | Finished `3 / 3`                                        |
| Real NEAT champions' setups, `30 s`, 3 presets × 4 seeds | Crashed in `6 / 12`: Technical `2 / 4`, Chicane `4 / 4` |
| Earliest crash in those runs                             | `280` steps, fitness `40.20`                            |
| `60` sampled setups, `120 s`, Chicane Challenge          | Finished `4 / 60`                                       |
| The same setups, `120 s`, Technical Circuit              | Finished `32 / 60`                                      |

Beating a reference that crashed after `5` seconds says little about learning, and
the Results screen could still report that as being ahead of it.

Earlier notes put the `2259.33` tie at `1444` steps between a champion and Pure Pursuit
down to coincidence. The seed comparison supports that: at other seeds and tracks the
two step counts differ, so the value is not copied between them.

## The correction

A single careful speed policy did not solve this. It finished far more of the same
sampled setups (`59 / 60` on Technical, `54 / 60` on Chicane), but a median lap took
over `4000` steps, which cannot finish inside a `30 s` limit of `1800` steps.

The reference is now the best of five drives on the champion's setup and time limit:
the original fixed-speed controller, and `SetupAwarePurePursuit` at caution levels
`1.5`, `1.0`, `0.6`, and `0.35`. All five use the same steering law, physics, and fitness.
Ties keep the earlier controller, so the choice is deterministic.

- `PurePursuitBaseline()` is unchanged, so the Phase 4 fixture and preview are too.
- The reference gets up to five attempts and the champion's replay gets one. This
  favors the reference, which is the safe direction for a bar to beat.
- `contracts/phase10-regression.json` was regenerated. Across its `18` cases, only
  `pursuitFitness`, `pursuitProgress`, and `resultSha256` changed, in `15` cases.
  Champion and random-network values are identical.
- Results saved before this change keep the reference values they were saved with.
- If the champion beat a reference that crashed, Results names that reference and says
  the win means little. A crashed reference that still scored higher is not discounted,
  because that would hide a loss. The table reads **Crashed**
  or **Ran out of time** rather than **Did not finish**.

## Benchmark design

`npm run test:learning` reruns `30` cases through the real `RunSession` and fails if any
value differs from the saved file: `3` presets × `2` algorithms × seeds `42`, `19`, `73`,
`211`, and `1009`.

- **Evolved run:** `16` cars × `10` generations × `30 s`.
- **Same-budget control:** `160` cars × `1` generation × `30 s`. It evaluates the same
  number of cars with no selection, crossover, or mutation. This is the main question:
  improvement over the first generation alone is nearly guaranteed by keeping the best.

## Results

Each cell counts cases out of `5`.

| Track             | Algorithm | Improved on generation 1 | Beat control | Beat Pure Pursuit | Laps: evolved | Laps: control | Laps: Pure Pursuit | Pure Pursuit crashed |
| ----------------- | --------- | -----------------------: | -----------: | ----------------: | ------------: | ------------: | -----------------: | -------------------: |
| Easy Oval         | Fixed GA  |                        5 |            4 |                 0 |             0 |             0 |                  4 |                    0 |
| Easy Oval         | NEAT      |                        5 |            5 |                 2 |             4 |             0 |                  5 |                    0 |
| Technical Circuit | Fixed GA  |                        5 |            4 |                 2 |             0 |             0 |                  0 |                    0 |
| Technical Circuit | NEAT      |                        5 |            4 |                 5 |             5 |             1 |                  2 |                    0 |
| Chicane Challenge | Fixed GA  |                        5 |            3 |                 0 |             0 |             0 |                  0 |                    0 |
| Chicane Challenge | NEAT      |                        5 |            4 |                 2 |             0 |             0 |                  0 |                    0 |

Median fitness:

| Track             | Algorithm | Evolved | Control | Pure Pursuit |
| ----------------- | --------- | ------: | ------: | -----------: |
| Easy Oval         | Fixed GA  |     656 |     504 |         2256 |
| Easy Oval         | NEAT      |    2259 |     442 |         2252 |
| Technical Circuit | Fixed GA  |     881 |     471 |         1161 |
| Technical Circuit | NEAT      |    2220 |     821 |          703 |
| Chicane Challenge | Fixed GA  |     252 |     229 |          464 |
| Chicane Challenge | NEAT      |     385 |     195 |          453 |

What this supports, within this budget:

- Evolution beat the same work without selection in `24 / 30` cases: Fixed GA `11 / 15`,
  NEAT `13 / 15`. This is the first saved evidence of that comparison for NEAT.
- NEAT finished `9 / 15` laps and Fixed GA `0 / 15`. The control finished `1 / 30`.
- Nothing finished Chicane Challenge in this budget, including Pure Pursuit.
- Pure Pursuit no longer crashed in any of the `30` cases.

## Limits

- Five seeds per cell is small. No significance test was run, and these counts do not
  establish a general ranking of the algorithms.
- One budget was tested, so this does not describe Balanced or Thorough. Fixed GA may
  need more generations than this budget allows.
- The `16 × 10 × 30 s` budget was chosen earlier on Easy Oval with seeds that include
  `42`, `19`, `73`, and `211`, so Easy Oval NEAT is not a held-out result.
- Fitness rewards progress and finishing, so a higher score is not a claim about lap
  quality or the fastest possible driver.
