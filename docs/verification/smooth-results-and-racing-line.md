# Smooth Results replay and racing-line comparison

Date: `2026-08-10`

## User job

After a run stops or completes, understand whether evolution improved, whether
the champion completed the lap, and whether its recorded route resembles a
credible ideal racing-line reference. Watch that result as continuous motion
instead of stepping through discrete frames.

## Baseline problem

Results opened on frame 1 and exposed only **Previous**, **Next**, and
**Restart**. The page led with run metadata, a fitness chart, and controller
tables, so the answer to "did it work?" had to be assembled from several
surfaces. No independent racing-line reference or explicit route-match result
existed.

## Research boundary

- [Kapania, Subosits, and Gerdes](https://arxiv.org/abs/1902.00606) separate
  longitudinal speed-profile generation from curvature-constrained path
  optimization and explicitly do not claim global convergence.
- [Xue, Yue, and Dolan](https://arxiv.org/abs/2309.09186) show that
  minimum-curvature optimization is a useful early-stage trajectory reference
  when sophisticated vehicle and track dynamics are unavailable.
- The [TUM trajectory-planning helpers](https://github.com/TUMFTM/trajectory_planning_helpers)
  likewise distinguish minimum-curvature, shortest-path, velocity-profile, and
  minimum-time components.

EvoRacer therefore labels its line as an **ideal racing line · geometric
reference** and **minimum curvature**. It does not call the line a globally
minimum-time trajectory.

## Python-owned reference

`python/src/evo_racer/racing_line.py`:

- resamples the closed Python centerline to at most 63 unique points;
- constrains every candidate point to a fixed lateral offset inside the road
  with vehicle-center clearance;
- uses a deterministic ten-pass coordinate search over a discrete squared-
  curvature objective;
- emits a closed reference capped at 64 points;
- measures bidirectional champion/reference deviation; and
- reports mean and 95th-percentile distance plus road-width-relative
  tolerances.

A match requires a completed champion lap and both deviation limits. The
reference and verdict are recorded in the terminal Python result. TypeScript
validates and renders the contract but does not optimize a route or score the
champion.

## Results correction

- Results leads with one verdict and four plain-language outcomes: Learning,
  Lap outcome, Ideal-line match, and Training.
- The recorded champion remains a solid green path. The minimum-curvature
  reference is a dashed cyan path. Earlier-generation trails are omitted from
  Results to keep this two-line comparison legible; they remain available in
  Training.
- Results automatically plays timestamped Python replay data at `1x` using
  presentation-only `requestAnimationFrame` interpolation.
- Reduced motion holds the final Python frame while retaining both complete
  paths.
- Previous comparable runs and technical identity move into disclosures below
  the primary verdict, path comparison, fitness chart, and baselines.

## Evidence

- Focused Python: `36 passed` across racing-line, observer, and run-library
  tests.
- Focused TypeScript: all `14` Vitest files and `109` tests passed.
- Full source gate: `npm run check` passed formatting, lint, TypeScript
  type-check, all `109` Vitest tests, strict mypy across `27` Python source
  files, all `145` pytest tests, and the production Vite build.
- Focused real Chromium journey:
  `scripts/test-e2e.ps1 -Port 8877 -Grep "recommended offline run reaches results"`
  passed. Normal-motion marker transforms changed across consecutive `80 ms`
  samples, both SVG paths were visible, and the reference identified
  `minimum-curvature-v1`.
- Full real Chromium gate: `scripts/test-e2e.ps1 -Port 8877` passed all `15`
  journeys in `28.9 s`.
- In-app browser, Windows reduced motion: the final marker was held and both
  paths remained visible.
- In-app browser at `390 x 844`: document width stayed `375 / 375`; verdict,
  stage, and legend overflow were zero; verdict body text rendered at `14 px`,
  labels at `12 px`, and the route legend at `12.8 px`.
- `npm run build:release` rebuilt the outside-ZIP executable at
  `release\EvoRacer\EvoRacer.exe`, the parallel ZIP, and its checksum. The ZIP
  SHA-256 is
  `b7f422637d10b4567bd8da5bde92d00153503696c2bddcdd5aa1c1691a9a230d`.
- `npm run test:release` passed direct-EXE startup, isolated training,
  generation-boundary pause, restart/resume, terminal replay, the packaged
  `minimum-curvature-v1` result contract, loopback-only networking, and the
  no-external-Node/Python boundary.
- The packaged frontend assets and current production assets matched by name,
  length, and SHA-256. Real Chromium opened the restored packaged Results page
  with one champion path and one minimum-curvature reference path, an explicit
  not-matched verdict, zero document overflow, no external resource, and no
  warning or error log.

Full source and journey gates are recorded in `PROJECT_STATE.md` after their
successful completion. The local Windows package is verified but remains
unsigned and unpublished.
