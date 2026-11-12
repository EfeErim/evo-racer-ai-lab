# Training plan measurement plan

Fixed on 2026-11-07 before running. It answers roadmap step 2: what does each training
plan the application offers actually achieve on each preset under physics v2?

## Stage A: the plans as shipped

- Plans: Quick check (`16 × 10 × 30 s`), Balanced (`24 × 20 × 30 s`), and Thorough
  (`48 × 40 × 60 s`), as defined in `src/onboarding.ts`.
- Each plan runs with both Fixed GA and NEAT, not only the algorithm it ships with.
- Presets: Easy Oval, Technical Circuit, Chicane Challenge.
- Seeds: `20011`, `22013`, `24019`. None was used in earlier experiments.
- Every evolved run is paired with a same-candidate control: one generation of
  `population × generations` random candidates with the same seed and episode limit.
- Recorded per run: outcome, lap seconds, champion fitness, control fitness, training
  steps, wall-clock seconds, and champion brake replays (as evolved, zeroed, constant
  mean), as in the champion brake study. Wall clock is measured with four runs in
  parallel, so it overstates what one user run takes on this machine.

A plan **works** on a preset with an algorithm when at least `2 / 3` evolved runs finish
a lap and at least `2 / 3` beat their control.

## Decisions this stage drives

1. Each preset needs at least one shipped plan that works with its shipped algorithm. If
   a plan works only with the other algorithm, the shipped algorithm changes.
2. If no plan works on a preset, Stage B tests a longer episode for that preset. Because
   `episodeSeconds` accepts `15` to `300`, this needs no contract change.
3. Each plan's description must state only what this measurement supports.

## Stage B: confirmation

Only if Stage A changes a shipped plan. The changed plan runs on fresh seeds `26021`,
`28027`, `30011` with the same rule. Stage A runs then count as development evidence.

With three seeds per cell these counts are descriptive. They are not a significance test.

## Result, 2026-11-07

Stage A ran all `54` paired cases with
`scripts/run-python.ps1 python/tools/training_plan_study.py a` in `96.1` minutes, four at a
time. Every case was saved in `contracts/training-plans-a/` (commit `919f3a3`) and the table is
`docs/experiments/data/training-plans-a-summary.json`. Each cell shows finished laps and wins over
the control, out of three seeds. **Bold** marks the algorithm each plan ships with.

| Plan     | Algorithm    | Easy Oval | Technical Circuit | Chicane Challenge | Median wall clock |
| -------- | ------------ | --------- | ----------------- | ----------------- | ----------------- |
| Quick    | Fixed GA     | 2, 3      | 1, 1              | 0, 3              | 0.5–0.6 min       |
| Quick    | **NEAT**     | 3, 2      | 3, 3              | 0, 3              | 0.4–0.5 min       |
| Balanced | **Fixed GA** | 3, 3      | 3, 3              | 0, 3              | 1.2–1.5 min       |
| Balanced | NEAT         | 3, 3      | 3, 3              | 1, 3              | 1.0–1.3 min       |
| Thorough | Fixed GA     | 3, 3      | 3, 3              | 2, 3              | 6.3–11.1 min      |
| Thorough | **NEAT**     | 3, 3      | 3, 3              | 3, 3              | 4.6–8.2 min       |

Against the decision rules:

1. Every preset has a shipped plan that works with its shipped algorithm. Easy Oval and
   Technical Circuit work with all three. Chicane Challenge works only with Thorough,
   with both algorithms. No shipped algorithm changes.
2. No preset needs a longer episode, so no episode length changes.
3. Because no shipped plan changed, Stage B did not run. The plan descriptions in
   `src/onboarding.ts` now state these outcomes: Quick check and Balanced usually
   complete Easy Oval and Technical Circuit but not Chicane Challenge, and Thorough is
   the plan for Chicane Challenge and by far the slowest. The earlier claim that
   Balanced gives "more time per attempt" was false and is gone.

What this does and does not show:

- Fixed GA is weak on Quick check: `1 / 3` on Technical Circuit. Quick check ships with
  NEAT, so the shipped plan is unaffected.
- With Thorough, the `1,920`-candidate random control also finishes Easy Oval and
  Technical Circuit in all `12` cases. Evolution still beats it each time, with laps of
  `17.8`–`19.8 s` against `21.6`–`40.8 s`. On those tracks Thorough measures lap speed,
  not whether a lap is possible.
- Longer budgets did not uncover varied braking. Of `39` evolved finishers, `4` failed
  with the brake held at its mean, and only `1` of the `17` Thorough finishers did. This
  confirms the [champion brake study](physics-v2.md#do-evolved-champions-actually-brake):
  within these budgets, evolution uses the brake as a constant speed limit.
- The application's default seed is `42`, not one of the measured seeds. "Usually"
  in the copy reflects this.
- Wall clock was measured with four runs in parallel, so a single run on this machine
  should be faster.
