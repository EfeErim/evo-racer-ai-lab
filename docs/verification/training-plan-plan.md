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
