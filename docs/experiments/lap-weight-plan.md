# Lap-time weight experiment plan

Fixed on 2026-11-07 before running. The question is whether paying more for lap time
makes evolved drivers brake for corners instead of holding a constant brake, without
costing lap completions. See [why a constant brake is enough](physics-v2.md#why-a-constant-brake-is-enough).

Fitness today is `1200 × progress + 1000 × finished + W × (1 − steps / maxSteps) − 75 ×
collisions`, with the time term paid only on a finish and `W = 300`. Only `W` changes.
Physics, sensors, evolution settings and every other fitness term stay as they are. The
experiment patches fitness inside its own process; the application is unchanged until a
decision is made.

## Stage 1: development

- Weights: `W = 300` (current), `1500`, and `3000`, worth `10`, `50`, and `100` points
  per lap second at a `30 s` limit.
- Seeds: `6007`, `8009`, `9011`. Tracks: the three presets and generator v5 seed
  `52021`, short, technical. None was used in earlier experiments.
- Budget: Balanced (`24 × 20 × 30 s`), Fixed GA and NEAT, ordinary vehicle co-evolution.
- For each champion: outcome, lap seconds, and three replays as in the champion brake
  study: as evolved, brake zeroed, and brake held at its own mean.
- A finisher is **brake-modulation dependent** when it finishes as evolved but not with
  its constant mean brake.

Adopt the smallest `W` that, against `W = 300` on the same `24` runs:

1. at least triples brake-modulation-dependent finishers, and has at least `4`;
2. loses at most `2` finishes; and
3. does not raise the median lap time of runs that finish under both weights.

If no weight meets all three, keep `W = 300` and record the result.

## Stage 2: confirmation

Only if Stage 1 selects a weight. Compare it with `W = 300` on fresh seeds `12011`,
`14013`, `16019` and generator v5 seed `61031` in place of `52021`, with everything else
as in Stage 1. The same three criteria must hold. Stage 1 runs then count as development
evidence only.

With three seeds per cell these counts are descriptive. They are not a significance test.

## Result, 2026-11-07

Stage 1 ran all `72` runs in `16.5 min`. Raw per-run files are in commit `cf9129b` under
`contracts/lap-weight-dev/`; the
[summary](../../contracts/lap-weight-dev-summary.json) is kept here.

| `W`  | Finished | Need brakes | Need varied brake | Median lap, paired finishes |
| ---- | -------: | ----------: | ----------------: | --------------------------: |
| 300  |  15 / 24 |           9 |                 2 |                     21.03 s |
| 1500 |  15 / 24 |           9 |                 2 |                     21.03 s |
| 3000 |  15 / 24 |           9 |                 2 |                     21.03 s |

No weight meets criterion 1, so `W = 300` stays and Stage 2 did not run.

The weight had no effect at all: in all `24` track, algorithm and seed combinations, the
three weights produced the same champion with the same lap. Only the champion's fitness
value changed. The patch was active; the same champion scored `2290.8`, `2654.2` and
`3108.3` under the three weights.

The cause is how candidates are ranked, which this plan should have checked first. A
finisher always scores at least `2200` and a non-finisher at most `1200`, and among
finishers fitness falls with lap time whatever `W` is. So any positive `W` gives the same
order. Fixed GA selects only by order, through elitism and tournaments, so it cannot
respond to `W`. NEAT uses the values for species offspring shares, but here produced the
same champions too.

This also corrects the
[earlier explanation](physics-v2.md#why-a-constant-brake-is-enough): selection already
prefers the faster of any two finishers, at every weight. A constant brake is not the
result of lap time being underpaid. Varied braking is simply not found within these
budgets.
