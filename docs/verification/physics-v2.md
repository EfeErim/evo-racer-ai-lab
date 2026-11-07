# Physics v2 verification

Work started on 2026-11-06 from `dd65b400a6a60c826ce122ada420bffa00cdc10f`.
Results below describe an uncommitted working tree, not a published release.

## Persistence

The run envelope remains version 1. New checkpoint snapshots carry
`simulationContractVersion: 2`; old snapshots infer the revision from terminal
metadata, or default to v1 when interrupted. Unknown revisions and conflicting
checkpoint/result revisions are rejected. Python decides resumability and
comparison eligibility. Track digest, requested/completed budget and physics
revision must all match for earlier-run comparisons.

Completed v1 records retain their recorded replay, results and export. Interrupted
v1 records remain exportable but cannot resume under v2. Their library row explains
the incompatibility before offering any resume action and directs the user to the
existing new-experiment action on Welcome. No legacy file is migrated or deleted.

Evidence so far:

- `scripts/run-python.ps1 -m pytest python/tests/test_run_library.py -q
--basetemp=.runtime_tmp/pytest-persistence-v2d`: **20 passed**.
- `npm run test -- --reporter=dot`: **141 passed** with `TEMP` and `TMP` redirected
  to `.runtime_tmp` because the sandbox temporary directory denied file renames.
- `contracts/physics-v1-completed-run.json` was produced using the simulation
  source from `git show HEAD:python/src/evo_racer/simulation.py` at the commit above,
  seed 819, four Fixed GA candidates, one generation and a 0.2-second episode.
  It is a historical-physics fixture, not a relabelled v2 result.

## Brake factorial experiment

Command: `scripts/run-python.ps1 python/tools/braking_study.py`.
Raw evidence: [48 cells](../../contracts/braking-study-v2.json).
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

Design: [held-out plan](heldout-v2-plan.md), fixed before the matrix ran. Command:
`scripts/run-python.ps1 python/tools/heldout_benchmark.py`. Raw evidence:
[96 paired runs](../../contracts/heldout-v2/) and their
[32-cell summary](../../contracts/heldout-v2-summary.json). Nothing was tuned against
these results. Each paired difference in the summary was recomputed from the raw files
and matched.

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
of the plan's reported cells. Command: `scripts/run-python.ps1
python/tools/champion_brake_study.py`. Raw evidence:
[96 replayed champions](../../contracts/heldout-v2-brake-use.json).

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

## Outstanding verification

The user confirmed that neither a clean Windows environment nor first-time test
participants are currently available. Those two required checks remain open;
local package automation cannot substitute for either.
