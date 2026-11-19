# Physics v2 experiments

Physics v2 lowered drag and added a corner speed limit. These studies measure whether
braking became useful, whether evolution still beats random search on held-out seeds and
a held-out track, whether evolved drivers brake for corners, and what each shipped
training plan achieves.

The [lap-weight plan](lap-weight-plan.md) was committed in `f4512c1` before its results
(`cf9129b`), and the [training plan](training-plan.md) in `55574fe` before `919f3a3`. The
[held-out plan](heldout-v2-plan.md) is dated before its run but was committed with its
results in `0be9225`, so git history does not prove it came first.

## Reproduce

The study scripts were removed in `ed57b56`; the summaries are in [`data/`](data/) (the
scripts wrote them to `contracts/`). Check out the commit, run `npm run setup`, then the
command. Runs take from minutes to about `100` minutes and were not rerun for this page.

| Summary                         | Commit    | Command                                                                              |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `braking-study-v2.json`         | `0be9225` | `.venv\Scripts\python python/tools/braking_study.py`                                 |
| `heldout-v2-summary.json`       | `0be9225` | `.venv\Scripts\python python/tools/heldout_benchmark.py`                             |
| `heldout-v2-brake-use.json`     | `0be9225` | `.venv\Scripts\python python/tools/champion_brake_study.py` (after the held-out run) |
| `brake-value-v2.json`           | `e74ebbc` | `.venv\Scripts\python python/tools/brake_value_study.py`                             |
| `lap-weight-dev-summary.json`   | `cf9129b` | `.venv\Scripts\python python/tools/lap_weight_study.py dev`                          |
| `training-plans-a-summary.json` | `919f3a3` | `.venv\Scripts\python python/tools/training_plan_study.py a`                         |

Old commits predate `npm run setup`; there, use `./scripts/setup.ps1`.
`data/regression-matrix-v2.json` is byte-identical to its `0be9225` version and
`python/tests/test_regression_matrix.py` still reproduces it, so the simulation these
studies ran on has not changed.

## Brake factorial experiment

[48 cells](data/braking-study-v2.json), each run twice with equal results. Default
vehicle and fixed-speed Pure Pursuit throughout; drag (0.018 / 0.004), corner cap
(off / on), brake output (zeroed / unchanged) and episode limit (120 / 30 s) vary.

At the 120-second limit, with **brakes disabled**:

| Track             | Old drag, no cap | Old drag, cap    | New drag, no cap | New drag, cap    |
| ----------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| Easy Oval         | finished 21.90 s | finished 21.90 s | finished 16.07 s | collision        |
| Technical Circuit | finished 25.88 s | finished 25.88 s | finished 20.20 s | finished 20.40 s |
| Chicane Challenge | finished 34.12 s | finished 34.12 s | collision        | collision        |

With **new drag and corner cap**:

| Track             | Brake | Outcome at 120 s | Progress | Finished lap | Mean entry-speed proxy |
| ----------------- | ----- | ---------------- | -------- | ------------ | ---------------------- |
| Easy Oval         | off   | collision        | 0.31     | —            | 19.26 m/s              |
| Easy Oval         | on    | finished         | 1        | 19.03 s      | 19.82 m/s              |
| Technical Circuit | off   | finished         | 1        | 20.40 s      | 17.65 m/s              |
| Technical Circuit | on    | finished         | 1        | 21.72 s      | 17.23 m/s              |
| Chicane Challenge | off   | collision        | 0.25     | —            | 18.86 m/s              |
| Chicane Challenge | on    | finished         | 1        | 30.02 s      | 16.16 m/s              |

The entry-speed proxy is the mean speed at each crossing of absolute steering `0.25`,
not a matched corner measurement. Chicane's braked lap (`30.0167 s`) times out under the
30-second limit. Braking is useful under some v2 conditions, not faster everywhere:
Technical Circuit is faster without brakes for this car and driver.

## Held-out matrix

Fixed before the run: seeds `31013`, `51031`, `71053`; the three presets plus generator
v5 seed `91009` (_Technical Short_); Quick check (`16 × 10 × 30 s`) and Balanced
(`24 × 20 × 30 s`); Fixed GA and NEAT, each paired with one random generation of the
same candidate count and seed; each run repeated with the vehicle genes fixed at a
balanced setup. [32 cells](data/heldout-v2-summary.json).

Outcomes are finished / collided / timed out over `3` seeds. **Difference** is evolved
minus control champion fitness, with the central 95% of the `27` paired resamples
(descriptive, not a significance test). Lap seconds are for finishers.

| Track             | Budget   | Algorithm | Vehicle | Evolved | Control | Difference (interval) | Evolved laps (s)    | Control laps (s)    |
| ----------------- | -------- | --------- | ------- | ------- | ------- | --------------------: | ------------------- | ------------------- |
| Easy Oval         | Quick    | Fixed GA  | Evolved | 2/0/1   | 0/2/1   |    1546 (774 to 2017) | 28.92, 25.38        | —                   |
| Easy Oval         | Quick    | Fixed GA  | Fixed   | 1/0/2   | 0/1/2   |     886 (-33 to 1850) | 27.68               | —                   |
| Easy Oval         | Quick    | NEAT      | Evolved | 2/0/1   | 1/1/1   |    386 (-262 to 1359) | 21.48, 21.73        | 27.65               |
| Easy Oval         | Quick    | NEAT      | Fixed   | 3/0/0   | 1/1/1   |     1035 (94 to 1676) | 20.00, 21.75, 23.05 | 29.45               |
| Easy Oval         | Balanced | Fixed GA  | Evolved | 3/0/0   | 0/2/1   |   1577 (1192 to 1881) | 20.38, 20.35, 21.98 | —                   |
| Easy Oval         | Balanced | Fixed GA  | Fixed   | 3/0/0   | 0/1/2   |   1583 (1174 to 1923) | 22.02, 20.38, 20.57 | —                   |
| Easy Oval         | Balanced | NEAT      | Evolved | 3/0/0   | 1/1/1   |      978 (14 to 1534) | 19.08, 20.25, 19.08 | 20.52               |
| Easy Oval         | Balanced | NEAT      | Fixed   | 3/0/0   | 2/0/1   |      500 (69 to 1339) | 20.43, 21.40, 20.18 | 29.45, 27.12        |
| Technical Circuit | Quick    | Fixed GA  | Evolved | 3/0/0   | 0/1/2   |   1467 (1205 to 1962) | 29.38, 27.53, 24.38 | —                   |
| Technical Circuit | Quick    | Fixed GA  | Fixed   | 2/1/0   | 0/0/3   |    961 (-459 to 2069) | 28.95, 25.18        | —                   |
| Technical Circuit | Quick    | NEAT      | Evolved | 3/0/0   | 2/0/1   |      498 (56 to 1355) | 21.93, 21.77, 20.57 | 27.33, 28.77        |
| Technical Circuit | Quick    | NEAT      | Fixed   | 3/0/0   | 0/0/3   |   1238 (1165 to 1337) | 21.57, 21.23, 21.47 | —                   |
| Technical Circuit | Balanced | Fixed GA  | Evolved | 3/0/0   | 0/0/3   |   1392 (1292 to 1576) | 20.73, 20.08, 21.97 | —                   |
| Technical Circuit | Balanced | Fixed GA  | Fixed   | 3/0/0   | 0/0/3   |   1369 (1177 to 1597) | 22.42, 23.05, 21.32 | —                   |
| Technical Circuit | Balanced | NEAT      | Evolved | 3/0/0   | 3/0/0   |        74 (58 to 102) | 20.93, 18.83, 18.57 | 26.75, 25.02, 28.77 |
| Technical Circuit | Balanced | NEAT      | Fixed   | 3/0/0   | 2/0/1   |      409 (39 to 1115) | 19.70, 19.87, 20.03 | 27.10, 23.77        |
| Chicane Challenge | Quick    | Fixed GA  | Evolved | 0/1/2   | 0/3/0   |          39 (1 to 66) | —                   | —                   |
| Chicane Challenge | Quick    | Fixed GA  | Fixed   | 0/1/2   | 0/2/1   |        26 (-42 to 69) | —                   | —                   |
| Chicane Challenge | Quick    | NEAT      | Evolved | 0/0/3   | 0/1/2   |     375 (-462 to 796) | —                   | —                   |
| Chicane Challenge | Quick    | NEAT      | Fixed   | 0/0/3   | 0/1/2   |        98 (11 to 223) | —                   | —                   |
| Chicane Challenge | Balanced | Fixed GA  | Evolved | 0/0/3   | 0/3/0   |       262 (73 to 637) | —                   | —                   |
| Chicane Challenge | Balanced | Fixed GA  | Fixed   | 0/1/2   | 0/3/0   |       234 (28 to 512) | —                   | —                   |
| Chicane Challenge | Balanced | NEAT      | Evolved | 1/0/2   | 0/2/1   |     859 (323 to 1388) | 27.82               | —                   |
| Chicane Challenge | Balanced | NEAT      | Fixed   | 0/1/2   | 0/2/1   |      424 (314 to 567) | —                   | —                   |
| Technical Short   | Quick    | Fixed GA  | Evolved | 0/0/3   | 0/0/3   |      -84 (-230 to 47) | —                   | —                   |
| Technical Short   | Quick    | Fixed GA  | Fixed   | 0/1/2   | 0/1/2   |      -11 (-80 to 123) | —                   | —                   |
| Technical Short   | Quick    | NEAT      | Evolved | 1/2/0   | 0/1/2   |    405 (-269 to 1684) | 27.70               | —                   |
| Technical Short   | Quick    | NEAT      | Fixed   | 1/1/1   | 0/1/2   |     841 (184 to 1653) | 25.32               | —                   |
| Technical Short   | Balanced | Fixed GA  | Evolved | 1/0/2   | 0/0/3   |     896 (257 to 1995) | 26.87               | —                   |
| Technical Short   | Balanced | Fixed GA  | Fixed   | 2/0/1   | 0/2/1   |    1309 (300 to 1868) | 25.17, 25.98        | —                   |
| Technical Short   | Balanced | NEAT      | Evolved | 3/0/0   | 1/1/1   |    1100 (-13 to 1714) | 25.53, 24.62, 22.30 | 24.23               |
| Technical Short   | Balanced | NEAT      | Fixed   | 3/0/0   | 0/1/2   |   1825 (1518 to 2004) | 24.25, 27.58, 25.02 | —                   |

Totals. Candidate counts match within a pair; training physics steps do not:

| Algorithm | Budget   | Vehicle | Beat control | Evolved laps | Control laps | Evolved steps | Control steps |
| --------- | -------- | ------- | -----------: | -----------: | -----------: | ------------: | ------------: |
| Fixed GA  | Quick    | Evolved |      10 / 12 |       5 / 12 |       0 / 12 |     2,597,336 |     2,826,400 |
| Fixed GA  | Quick    | Fixed   |       7 / 12 |       3 / 12 |       0 / 12 |     2,445,274 |     2,786,238 |
| Fixed GA  | Balanced | Evolved |      12 / 12 |       7 / 12 |       0 / 12 |     6,796,094 |     8,398,722 |
| Fixed GA  | Balanced | Fixed   |      12 / 12 |       8 / 12 |       0 / 12 |     7,008,745 |     8,417,479 |
| NEAT      | Quick    | Evolved |       8 / 12 |       6 / 12 |       3 / 12 |     1,938,170 |     2,572,656 |
| NEAT      | Quick    | Fixed   |      12 / 12 |       7 / 12 |       1 / 12 |     1,965,931 |     2,656,007 |
| NEAT      | Balanced | Evolved |      11 / 12 |      10 / 12 |       5 / 12 |     6,047,993 |     7,818,035 |
| NEAT      | Balanced | Fixed   |      12 / 12 |       9 / 12 |       4 / 12 |     6,215,968 |     7,959,070 |

- Selection beat the control in `84 / 96` pairs, with fewer training steps in every row.
  At Balanced, Fixed GA beat its control in all `24` pairs.
- Chicane Challenge: `1 / 24` evolved runs finished; no control or Pure Pursuit run did.
- Evolved and fixed vehicles finished `28 / 48` and `27 / 48` laps; mean champion-fitness
  differences per algorithm and budget group were `+315`, `-97`, `-51` and `+161`. The
  networks differ, so this does not isolate the vehicle genes.
- Pure Pursuit crashed in `16 / 24` runs on the generated track and finished `23 / 24` on
  Easy Oval. The champion outscored it in `63 / 96` runs (Fixed GA `4 / 24` Quick,
  `19 / 24` Balanced; NEAT `16 / 24`, `24 / 24`).

## Do evolved champions actually brake?

Exploratory, added after the matrix ran: [96 replayed champions](data/heldout-v2-brake-use.json).
Each champion was driven as evolved, with brake zeroed, and with brake held at its own
episode mean. All `96` as-evolved replays reproduced the saved outcome.

| Finishing champions (`55`)                              |  Result |
| ------------------------------------------------------- | ------: |
| Fail to finish with brakes removed                      | 36 / 55 |
| Of those `36`, finish with a constant mean brake        | 35 / 36 |
| Finish with a constant mean brake, all finishers        | 54 / 55 |
| Median lap change from constant brake, among those `54` |  0.00 s |
| Steps above brake `0.5`: median across finishers        |   0.0 % |
| Steps above brake `0.5`: highest of any finisher        |   2.6 % |
| Finish without brakes and are faster that way           | 18 / 19 |

Removing brakes loses every finisher on Easy Oval (`20 / 20`) and the generated track
(`11 / 11`). Only one finisher needed a varying brake: NEAT, Chicane Challenge, seed
`31013`, Balanced (brake-steering correlation `+0.63`). On Technical Circuit `19` of `23`
finishers keep the lap without brakes. The brake works mainly as a speed limiter.

## Why a constant brake is enough

Exploratory: [brake value study](data/brake-value-v2.json). All drivers use the Pure
Pursuit steering law. **Hold** keeps one target speed (swept `4` to `39.5 m/s`);
**Varied** slows for curvature with `SetupAwarePurePursuit` (`77` caution values);
**Varied, no brake** removes the brake output. Fastest finish within `60 s`, in seconds;
the grids are coarse, so the gaps are lower bounds.

| Car             | Track             |  Hold | Varied | Varied, no brake | Varied saves |
| --------------- | ----------------- | ----: | -----: | ---------------: | -----------: |
| Default         | Easy Oval         | 18.90 |  16.90 |            18.90 |       2.00 s |
| Default         | Technical Circuit | 19.55 |  18.48 |            19.30 |       1.07 s |
| Default         | Chicane Challenge | 33.13 |  28.73 |            34.30 |       4.40 s |
| Default         | Technical Short   | 23.02 |  20.22 |            26.07 |       2.80 s |
| Balanced genome | Easy Oval         | 22.52 |  21.43 |            22.52 |       1.09 s |
| Balanced genome | Technical Circuit | 27.97 |  25.93 |            24.40 |       2.04 s |
| Balanced genome | Chicane Challenge |     — |      — |                — |            — |
| Balanced genome | Technical Short   | 43.08 |  49.75 |            51.70 |      -6.67 s |

A one-second faster finish is worth `10` fitness points, so `1.1` to `4.4 s` of varied
braking is worth `11` to `44`, against `1000` to `1300` for a finish. A constant speed
already finishes three of the four tracks inside `30 s`; Chicane Challenge needs `33.1 s`
at constant speed and `28.7 s` with varied braking. The [lap-time weight](#lap-time-weight)
experiment showed the reward is not the cause.

## Lap-time weight

Fitness is `1200 × progress + 1000 × finished + W × (1 − steps / maxSteps) − 75 ×
collisions`, time term on a finish only, `W = 300`. Rule fixed beforehand: adopt the
smallest `W` that at least triples the finishers needing a varying brake (at least `4`),
loses at most `2` finishes and does not slow the median paired lap. Balanced budget, both
algorithms, seeds `6007`, `8009`, `9011`, the presets and generator v5 seed `52021`:
`72` runs, [summary](data/lap-weight-dev-summary.json).

| `W`  | Finished | Need brakes | Need varied brake | Median lap, paired finishes |
| ---- | -------: | ----------: | ----------------: | --------------------------: |
| 300  |  15 / 24 |           9 |                 2 |                     21.03 s |
| 1500 |  15 / 24 |           9 |                 2 |                     21.03 s |
| 3000 |  15 / 24 |           9 |                 2 |                     21.03 s |

No weight met the rule, so `W = 300` stays. All `24` combinations produced the same
champion under each weight: a finisher scores at least `2200` and a non-finisher at most
`1200`, and among finishers any positive `W` gives the same order.

## Training plans

Quick check (`16 × 10 × 30 s`), Balanced (`24 × 20 × 30 s`) and Thorough
(`48 × 40 × 60 s`), both algorithms, three presets, seeds `20011`, `22013`, `24019`, each
paired with a same-candidate random control:
[summary](data/training-plans-a-summary.json). Cells are finished laps, wins over the
control, out of three; **bold** is the algorithm each plan ships with. Wall clock was
measured four runs at a time.

| Plan     | Algorithm    | Easy Oval | Technical Circuit | Chicane Challenge | Median wall clock |
| -------- | ------------ | --------- | ----------------- | ----------------- | ----------------- |
| Quick    | Fixed GA     | 2, 3      | 1, 1              | 0, 3              | 0.5–0.6 min       |
| Quick    | **NEAT**     | 3, 2      | 3, 3              | 0, 3              | 0.4–0.5 min       |
| Balanced | **Fixed GA** | 3, 3      | 3, 3              | 0, 3              | 1.2–1.5 min       |
| Balanced | NEAT         | 3, 3      | 3, 3              | 1, 3              | 1.0–1.3 min       |
| Thorough | Fixed GA     | 3, 3      | 3, 3              | 2, 3              | 6.3–11.1 min      |
| Thorough | **NEAT**     | 3, 3      | 3, 3              | 3, 3              | 4.6–8.2 min       |

- Chicane Challenge is solved only by Thorough; the plan descriptions in
  `src/onboarding.ts` say so. The app's default seed, `42`, was not measured, hence
  "usually" in that copy.
- With Thorough the `1,920`-candidate control also finishes Easy Oval and Technical
  Circuit in all `12` cases; evolution still beats it each time (`17.8`–`19.8 s` laps
  against `21.6`–`40.8 s`).
- Of `39` evolved finishers, `4` failed with the brake held at its mean, `1` of them
  among the `17` Thorough finishers.
