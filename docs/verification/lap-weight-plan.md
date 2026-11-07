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
