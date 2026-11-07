# Physics v2 held-out experiment plan

Fixed on 2026-11-06 before running this matrix. Do not tune physics, controllers,
or evolutionary settings against these results. The original five seeds remain
development evidence, not held-out evidence.

- Evolution seeds: 31013, 51031, 71053.
- Tracks: all three presets and generator v5 seed 91009, short, technical.
- Budgets: Quick check (16 × 10 × 30 s) and Balanced (24 × 20 × 30 s).
- Algorithms: Fixed GA and NEAT, each paired with a single-generation random
  population of 160 or 480 candidates respectively, with the same seed.
- Vehicle conditions: ordinary co-evolution, and all five allocation logits fixed
  at zero with both bias genes fixed at 0.5 at every genome creation boundary.
  The fixed-vehicle experiment retains random draws but discards their vehicle
  values; this changes selection trajectories and is not an identical-network
  comparison across vehicle conditions.
- Record actual training episode count and physics steps, separately from replay
  and baseline evaluations. Equal candidate count does not imply equal steps.
- Save track JSON, settings, physics version, result metadata, champion genome,
  generation fitness, terminal outcomes and baseline results for each paired run.
- Report each track/budget/algorithm/vehicle cell separately: completion,
  collision, timeout counts, paired fitness differences, and lap seconds only
  for finishers. With three seeds, uncertainty is large. Enumerate all 27 paired
  bootstrap resamples of the mean difference and report the central 95% interval;
  it is descriptive, not reliable population coverage or a significance test.
- No claim of unseen-track transfer: each run trains on its evaluation track.
  The generated track is held out from physics tuning, not from training.

Method references checked on 2026-11-06:
[Agarwal et al.](https://arxiv.org/abs/2108.13264) motivates reporting uncertainty;
[SciPy bootstrap documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html)
describes paired resampling and the limitations of percentile intervals. The
experiment uses the standard library and introduces no dependency.
