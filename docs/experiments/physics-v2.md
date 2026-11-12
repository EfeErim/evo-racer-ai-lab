# Physics v2 experiments

Physics v2 lowered drag and added a corner speed limit. These experiments ask what that
changed: whether braking became useful, whether evolution still beats random search on
held-out seeds and tracks, whether evolved drivers actually brake for corners, and what
each shipped training plan achieves.

The lap-time weight and training plan designs were committed before their results
([lap-weight plan](lap-weight-plan.md) in `f4512c1`, results in `cf9129b`;
[training plan](training-plan.md) in `55574fe`, results in `919f3a3`). The
[held-out plan](heldout-v2-plan.md) is dated before its run but was committed together
with its results in `0be9225`, so git history does not prove it came first.

## Reproduce

The study scripts and per-run files were removed from the current tree in `ed57b56` to
keep the repository small. Only the summary JSON files remain, now in [`data/`](data/); the scripts wrote them to `contracts/` at the time. Each
summary is reproduced by checking out the commit that recorded it and running its script
from the repository root after `./scripts/setup.ps1`:

| Summary                         | Commit    | Command                                                                              |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `braking-study-v2.json`         | `0be9225` | `.venv\Scripts\python python/tools/braking_study.py`                                 |
| `heldout-v2-summary.json`       | `0be9225` | `.venv\Scripts\python python/tools/heldout_benchmark.py`                             |
| `heldout-v2-brake-use.json`     | `0be9225` | `.venv\Scripts\python python/tools/champion_brake_study.py` (after the held-out run) |
| `brake-value-v2.json`           | `e74ebbc` | `.venv\Scripts\python python/tools/brake_value_study.py`                             |
| `lap-weight-dev-summary.json`   | `cf9129b` | `.venv\Scripts\python python/tools/lap_weight_study.py dev`                          |
| `training-plans-a-summary.json` | `919f3a3` | `.venv\Scripts\python python/tools/training_plan_study.py a`                         |

The regression fixture `docs/experiments/data/regression-matrix-v2.json` is byte-identical to its
`0be9225` version and `python/tests/test_regression_matrix.py` still reproduces it at
the current commit, so the simulation these studies ran on has not changed. The runs take from minutes to about `100` minutes on a desktop
CPU and were not rerun for this page.

## Brake factorial experiment

Recorded cells: [48 cells](data/braking-study-v2.json).
Every cell was executed twice and complete episode objects compared equal.
The experiment uses the same default vehicle, spawn and fixed-speed Pure Pursuit
parameters in every cell. It varies drag (0.018 / 0.004), corner cap (off / on),
brake output (zeroed / unchanged), and episode limit (120 / 30 seconds) on three
presets. It does not tune the driver between conditions. Patches are confined to
the experiment process; the shipped simulation has no experimental switches.

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

The entry-speed proxy records each crossing of absolute steering 0.25 at full
60 Hz sampling. It is not a geometrically matched corner measurement: failed and
completed runs visit different numbers of corners. Individual entry speeds and
exact unrounded progress are saved in the raw cells. In particular the higher
Easy Oval mean with brakes does not contradict the observed completion benefit.

Chicane's brake-enabled v2 run finishes in 30.0167 s with the 120-second allowance,
but times out at 30 seconds. The two limits are separate experiment cells. A
near-one progress fraction is not counted as completion. The unbraked car collides
under both limits.

These results support braking as useful under some v2 conditions, not universally
faster: Technical Circuit is faster without brakes for this vehicle and driver.
Lower drag alone already makes braking useful on Chicane; the corner cap adds a
braking benefit on Easy Oval. The cap has no measurable effect on the old-drag
driver's recorded lap times in these cells. This is one deterministic reference,
not evidence of evolved brake use or general algorithm superiority.

## Held-out matrix

The design was fixed before the matrix ran: evolution seeds `31013`, `51031` and
`71053`; the three presets plus generator v5 seed `91009` (short, technical); Quick check
(`16 × 10 × 30 s`) and Balanced (`24 × 20 × 30 s`); Fixed GA and NEAT, each paired with a
single random generation of the same candidate count and seed. Each run was repeated
with the vehicle genes fixed at a balanced setup. Summary:
[32 cells](data/heldout-v2-summary.json).

Outcome columns read finished / collided / timed out, counted over `3` seeds.
**Difference** is evolved minus same-candidate control champion fitness; the interval is
the central 95% of all `27` paired resamples. It is descriptive, not a significance test.
Lap seconds are for finishers only. _Technical Short_ is generator v5 seed `91009`.

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

Totals by budget and algorithm. Candidate counts are equal within a pair, but training
physics steps are not, so steps are listed:

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

What this supports, within these seeds, tracks, and budgets:

- Selection beat the same number of unselected candidates in `84 / 96` pairs, while
  spending fewer training steps in every row above. Fixed GA's weak spot is Quick check;
  at Balanced it beat its control in all `24` pairs.
- Fixed GA now finishes laps: `23 / 48`, against `0 / 15` under physics v1 at Quick
  check. That older figure is development evidence on other seeds, so this is a
  direction, not a measured effect of the physics change alone.
- Chicane Challenge remains largely unsolved inside `30 s`: `1 / 24` evolved runs
  finished, and no control or Pure Pursuit run did.
- Evolving the vehicle shows no clear benefit over a fixed balanced vehicle: `28 / 48`
  against `27 / 48` laps, with mean champion-fitness differences of `+315`, `-97`, `-51`,
  and `+161` across the four algorithm and budget groups. These are not identical
  networks, so this is not a controlled measure of vehicle genes.
- Pure Pursuit is a weak bar on the generated track, where it crashed in `16 / 24` runs
  and finished `1 / 24`. On Easy Oval it finished `23 / 24`. Overall the champion scored
  higher in `63 / 96` runs: Fixed GA `4 / 24` at Quick check and `19 / 24` at Balanced,
  NEAT `16 / 24` and `24 / 24`.

Each run trains on the track it is evaluated on, so nothing here is evidence of transfer
to unseen tracks. Three seeds per cell leave wide uncertainty, and the `27`-resample
intervals cannot support population claims.

## Do evolved champions actually brake?

This analysis is exploratory. It was added after the held-out matrix ran and is not one
of its planned cells. Recorded results:
[96 replayed champions](data/heldout-v2-brake-use.json).

Each saved champion was rebuilt from its genome and driven three ways with its steering
and throttle policy unchanged: as evolved, with brake output zeroed, and with brake held
at the mean of its own as-evolved episode. All `96` as-evolved replays reproduced the
saved step count, finish flag, and termination, without rerunning training.

| Finishing champions (`55`)                              |  Result |
| ------------------------------------------------------- | ------: |
| Fail to finish with brakes removed                      | 36 / 55 |
| Of those `36`, finish with a constant mean brake        | 35 / 36 |
| Finish with a constant mean brake, all finishers        | 54 / 55 |
| Median lap change from constant brake, among those `54` |  0.00 s |
| Steps above brake `0.5`: median across finishers        |   0.0 % |
| Steps above brake `0.5`: highest of any finisher        |   2.6 % |
| Finish without brakes and are faster that way           | 18 / 19 |

- **Brakes matter to survival in v2.** Removing them loses every finishing champion on
  Easy Oval (`20 / 20`) and the generated track (`11 / 11`), and never turned a
  non-finisher into a finisher.
- **Corner-by-corner braking mostly did not evolve.** Almost every champion holds a light
  constant brake, which caps its speed. The varying signal was needed in only one
  finishing run: NEAT on Chicane Challenge, seed `31013`, Balanced, whose brake follows
  steering (correlation `+0.63`) and which crashes under a constant brake.
- **Technical Circuit does not need brakes.** `19` of its `23` finishers keep the lap
  without them, `18` of those faster, consistent with the Pure Pursuit result above.

So physics v2 makes the brake output worthwhile, but mainly as a speed limiter. It does
not yet produce the brake-for-the-corner driving that the reference demonstrates. The
cause is not established here. Because the driver is altered after selection, this
measures dependence on the brake output, not what evolution would find without one.
Changing physics, fitness, or settings in response must use new seeds and tracks, since
this matrix is now development evidence.

## Why a constant brake is enough

Also exploratory. Recorded results: [brake value study](data/brake-value-v2.json).
It asks how much
lap time varying the brake can buy at all, separately from what evolution finds.

Every driver uses the same Pure Pursuit steering law. **Hold** reaches one target speed
and keeps it, swept from `4` to `39.5 m/s`. **Varied** slows for upcoming curvature
using `SetupAwarePurePursuit`, swept over `77` caution values. **Varied, no brake** is
the same with brake output removed. The table shows the fastest finish of each sweep
within `60 s`. The grids are coarse, so the gaps are lower bounds.

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

- **Lap time is worth little in fitness.** A finish that arrives one second sooner gains
  `10` points, so the default car's `1.1` to `4.4 s` from varied braking is worth `11` to
  `44`. A lap finish is worth `1000` to `1300`, and each collision costs `75` plus the
  lost progress. Selection mostly rewards finishing safely, and a constant speed already
  does that inside `30 s` on three of the four tracks.
- **Chicane Challenge is the exception.** The best constant speed needs `33.1 s`, over
  the `30 s` limit, while varied braking finishes in `28.7 s`. This matches the one
  held-out champion whose finish depended on a varying brake.
- **A weaker car gains less.** With the balanced genome that the fixed-vehicle runs
  use, the best varied lap on Technical Circuit was slower than the same policy without
  brakes, and on the generated track a constant speed was fastest.

These results first suggested that the reward keeps evolved drivers at a constant brake.
The [lap-time weight experiment](#lap-time-weight) refuted that.
Raising the lap-time weight five- or tenfold left every champion unchanged, because
selection already ranks any two finishers by lap time. Varied braking is worth up to
`4.4 s` a lap, but evolution does not find it within these budgets.

## Lap-time weight

Fitness is `1200 × progress + 1000 × finished + W × (1 − steps / maxSteps) − 75 ×
collisions`, with the time term paid only on a finish and `W = 300`. The question was
whether a larger `W` makes evolved drivers brake for corners. The decision rule was
fixed beforehand: adopt the smallest `W` that at least triples the finishers that need a
varying brake (and has at least `4`), loses at most `2` finishes, and does not slow the
median paired lap.

Balanced budget, Fixed GA and NEAT, seeds `6007`, `8009`, `9011`, the three presets and
generator v5 seed `52021`: `72` runs. Summary:
[lap-weight-dev-summary.json](data/lap-weight-dev-summary.json).

| `W`  | Finished | Need brakes | Need varied brake | Median lap, paired finishes |
| ---- | -------: | ----------: | ----------------: | --------------------------: |
| 300  |  15 / 24 |           9 |                 2 |                     21.03 s |
| 1500 |  15 / 24 |           9 |                 2 |                     21.03 s |
| 3000 |  15 / 24 |           9 |                 2 |                     21.03 s |

No weight met the rule, so `W = 300` stays. In all `24` combinations the three weights
produced the same champion with the same lap; only its fitness value changed. A finisher
always scores at least `2200` and a non-finisher at most `1200`, and among finishers
fitness falls with lap time whatever `W` is, so any positive `W` gives the same order.
Fixed GA selects only by order, and NEAT produced the same champions too. A constant brake
is not the result of lap time being underpaid; varied braking is simply not found within
these budgets.

## Training plans

What does each shipped plan achieve under physics v2? Quick check (`16 × 10 × 30 s`),
Balanced (`24 × 20 × 30 s`) and Thorough (`48 × 40 × 60 s`), each with both algorithms,
on the three presets with seeds `20011`, `22013`, `24019`, each paired with a
same-candidate random control. A plan **works** on a preset when at least `2 / 3` evolved
runs finish a lap and at least `2 / 3` beat their control. Summary:
[training-plans-a-summary.json](data/training-plans-a-summary.json).

Each cell shows finished laps and wins over the control, out of three seeds. **Bold**
marks the algorithm each plan ships with. Wall clock was measured four runs at a time.

| Plan     | Algorithm    | Easy Oval | Technical Circuit | Chicane Challenge | Median wall clock |
| -------- | ------------ | --------- | ----------------- | ----------------- | ----------------- |
| Quick    | Fixed GA     | 2, 3      | 1, 1              | 0, 3              | 0.5–0.6 min       |
| Quick    | **NEAT**     | 3, 2      | 3, 3              | 0, 3              | 0.4–0.5 min       |
| Balanced | **Fixed GA** | 3, 3      | 3, 3              | 0, 3              | 1.2–1.5 min       |
| Balanced | NEAT         | 3, 3      | 3, 3              | 1, 3              | 1.0–1.3 min       |
| Thorough | Fixed GA     | 3, 3      | 3, 3              | 2, 3              | 6.3–11.1 min      |
| Thorough | **NEAT**     | 3, 3      | 3, 3              | 3, 3              | 4.6–8.2 min       |

- Every preset has a shipped plan that works with its shipped algorithm. Chicane
  Challenge works only with Thorough. The plan descriptions in `src/onboarding.ts` state
  exactly this.
- With Thorough, the `1,920`-candidate random control also finishes Easy Oval and
  Technical Circuit in all `12` cases. Evolution still beats it each time, with laps of
  `17.8`–`19.8 s` against `21.6`–`40.8 s`.
- Longer budgets did not uncover varied braking: of `39` evolved finishers, `4` failed
  with the brake held at its mean, and only `1` of the `17` Thorough finishers did.
- The application's default seed is `42`, not one of the measured seeds, which is why
  the copy says "usually".
