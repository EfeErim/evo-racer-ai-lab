# Training presentation evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Live Training Observer Verification

Original note: `live-training-observer.md`.

Verified on `2026-07-29` on Windows 11 x64 with Node.js `24.13.0`,
npm `11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

### Corrected behavior

- Python evaluates at most one generation in a background worker.
- In-generation observation snapshots expose the active candidate index and
  Python-owned `x`, `y`, `heading`, controls, sensors, simulated time, and
  progress.
- The TypeScript UI polls snapshots without supplying a simulation step or
  delta and places the candidate marker on Python-compiled track geometry.
- Pause and stop requests remain generation-boundary operations.
- Persisted checkpoints omit transient live progress and remain compatible with
  older version 1 run documents that do not contain position fields.

### Focused evidence

- The selected Python observer, simulation, persistence, and service suites
  passed `38` tests.
- The selected TypeScript simulation and renderer suites passed `21` tests.
- A real production browser flow showed `Candidate 16 / 24` while generation
  `0` was evaluating. The same SVG marker changed from
  `translate(5 0) rotate(322.657)` to
  `translate(7.054 -0.036) rotate(34.139)` between observations.
- The browser console contained zero warnings or errors.

### Full gate

`npm run test:phase10` passed:

- Prettier, ESLint, TypeScript type-check, `27` Vitest tests, Ruff
  format/lint, strict mypy, and `70` pytest tests.
- Development loopback smoke on `127.0.0.1`.
- All `18` deterministic matrix cases with the existing regression fixture.
- Windows PyInstaller `onedir` and ZIP construction.
- Clean-runtime release acceptance, including live candidate position
  telemetry, generation-boundary persistence, restart/resume, replay, and
  loopback-only sockets.

The rebuilt local ZIP SHA-256 is
`af6f4ec2c06a9c896039d1c5a0e705e4fcf7b84d5dc1cb63087b6a70f26c1ceb`.
This working-tree correction is not part of the immutable published `v1.0.0`
tag or its existing public assets.

## Smooth Training Replay Verification

Original note: `smooth-training-replay.md`.

Verified on `2026-07-31` on Windows 11 x64 with Node.js `24.13.0`, npm
`11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

### Corrected behavior

- Python exposes the completed generation champion's recorded telemetry as a
  transient, versioned `generationReplay` observation field.
- The browser continuously presents those authoritative frames at `2x`
  simulated speed using `requestAnimationFrame` after the first generation.
- Position and the shortest heading arc are interpolated only between adjacent
  Python timestamps. The browser does not predict state, supply a physics step,
  or slow the background training worker to rendering speed.
- The transient replay is omitted from run documents, preserving deterministic
  checkpoint and restart projections.
- Atomic run-document replacement retries bounded Windows sharing violations so
  simultaneous local reads cannot intermittently fail generation advancement.

### Browser evidence

A real local browser flow completed an `8` generation Fixed GA run. The
Training panel reported `Smooth Python champion replay`, `Champion replay · 2x`,
and `151 Python frames` for the final champion.

- During an active run, `24` marker samples taken about `16 ms` apart contained
  `23` distinct SVG transforms.
- During the completed champion loop, all `18` samples contained distinct
  transforms.
- The browser console contained zero warnings or errors.

These samples verify presentation continuity; they are not a claim about display
refresh rate on every target computer.

### Replay lookup optimization

Timestamp lookup now uses binary search instead of scanning the replay from the
first frame on every animation frame. A local presentation-only microbenchmark
with 4,096 ordered frames and 60,000 lookups measured `147.164 ms` for the
former linear lookup and `14.872 ms` for the binary lookup (`9.9x`). This is a
lookup benchmark, not an end-user frame-rate guarantee. Unit coverage verifies
long replays, adjacent-frame interpolation, heading wrap, and duplicate
timestamps.

### Prior-generation evolution trail on 2026-07-31

The browser now retains a bounded presentation history from newly received
Python generation-champion replays. Each path is sampled to at most 64 recorded
points; the current replay plus seven prior paths is the maximum retained. Only
the prior paths are rendered, from `0.16` opacity for the oldest to `0.62` for
the newest, behind the animated current champion.

A real eight-generation Quick start run reached seven prior champion paths,
kept them visible on the terminal Results replay, and produced zero browser
warning/error logs. At `390 x 844`, document `scrollWidth` equaled `clientWidth`
(`375`) and the trail summary remained within the content width. Focused tests
cover replay deduplication, delta retention, 64-point sampling, eight-path
storage, seven-path rendering, cross-run isolation, endpoint preservation, and
the SVG opacity order.

### Automated and packaged evidence

`npm run test:phase10` passed:

- Prettier, ESLint, TypeScript type-check, `46` Vitest tests, Ruff format/lint,
  strict mypy, and `87` pytest tests.
- Unit coverage for timestamp interpolation, heading wrap, replay looping,
  optional contract parsing, transient persistence boundaries, and bounded
  Windows atomic-replace retry.
- Development loopback smoke and all `18` deterministic matrix cases.
- Windows PyInstaller `onedir` and ZIP construction.
- Clean-runtime packaged acceptance requiring live position telemetry and a
  multi-frame Python generation replay, followed by pause, restart/resume,
  completion, replay verification, and loopback-only sockets.

The rebuilt local ZIP SHA-256 is
`a064939f1097cc135880efd7e52f1df87bc784440b1d9f7bd7eb12791a40e8f3`.
This working-tree correction is not part of the immutable published `v1.0.0`
tag or its existing public assets.

## Training performance correction

Original note: `training-performance.md`.

Verified on `2026-07-29` on Windows 11 x64 with Python `3.13.5`.

### Cause

The former Balanced default requested 48 candidates, 30 generations, and 90
simulated seconds per episode. Its maximum budget was 1,440 candidate episodes,
or 7,776,000 fixed `1/60 s` simulation steps. Road-edge sensor rays and
centerline projections also rebuilt invariant segment values inside the hot
step loop.

### Correction

- Centerline and boundary segment values are derived once per compiled track
  and reused by projection and sensor queries.
- The episode evaluator reuses the post-step centerline projection as the next
  step's observation projection.
- Quick start is the initial preset at `10 x 8 x 15 s`.
- Balanced is `24 x 20 x 30 s`; Thorough is `48 x 40 x 60 s`.
- Settings and Review show the maximum candidate-episode budget before Start.

Saved runs remain immutable and retain the settings with which they were
created.

### Evidence

The reviewed 18-case Phase 10 matrix remained byte-for-byte deterministic:

```text
Verified 18 deterministic cases.
regressionSha256:
88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64
```

The same machine and matrix measured:

| Measurement |      Before |       After |
| ----------- | ----------: | ----------: |
| Total       | 81.457872 s | 26.195954 s |
| Median case |  4.039459 s |  1.318960 s |

A focused profiled Fixed GA generation at 10 candidates and 15 simulated
seconds fell from `9.345320 s` to `2.938516 s` under identical profiler
instrumentation. The Phase 10 report is generated locally at
`.runtime_tmp/phase10/performance-speed-fix.json`; `.runtime_tmp` is intentionally
ignored because it contains machine-local evidence.

The complete Phase 10 gate then passed with 27 Vitest tests, 70 pytest tests,
all 18 deterministic cases, a rebuilt Windows ZIP, and clean-runtime packaged
acceptance across an explicit generation-boundary pause, process restart, and
resume. The verified local archive SHA-256 is
`8d73110a593941dbccd92dd0b3c22be651fb56ff2ee7defd81fce536b8366059`.

### Follow-up correction on 2026-07-31

Active observation responses no longer scan and validate the complete saved-run
library or repeat the unchanged setup payload. Saved-run summaries are loaded
only for a terminal result, while explicit resume still returns the setup needed
by the browser. On the local library with 12 runs, 20 active response builds
fell from `0.3904666000 s` and `1667` bytes per response to `0.0000233000 s`
and `343` bytes per response.

Road-edge sensors now reject boundary segments whose precomputed bounds cannot
overlap the finite sensor ray. The original intersection calculation is still
used for every possible hit. A three-track by three-heading regression compares
the optimized result with the former unfiltered calculation at `1e-12`
absolute tolerance.

For a Fixed GA generation with 10 candidates, 15 simulated seconds, Easy Oval,
and seed 42, three alternating measurements produced these medians:

| Sensor path     | Median generation time |
| --------------- | ---------------------: |
| Unfiltered      |             1.351269 s |
| Bounds-filtered |             0.645795 s |

Every optimized and unfiltered terminal snapshot was equal. The final 18-case
deterministic matrix completed in `14.480483 s` and still matched regression
SHA-256 `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.

The run manager also prevents a terminal response from becoming visible before
its atomic checkpoint is durable, and run reads retry the bounded Windows
sharing gap around `os.replace`. The restart, completion, export, and delete
service regression passed 10 consecutive repetitions after this correction.
The complete Phase 10 gate passed with 31 Vitest tests, 83 pytest tests, the
deterministic matrix, Windows packaging, and clean-runtime restart/resume
acceptance. The local unreleased ZIP SHA-256 is
`dfbf0c1f8b6306aba09eabe21fd39d959303cecec846945818f6408d7bfd358c`.

### Further hot-path reduction on 2026-07-31

Centerline projection now compares squared distances inside the segment loop
and computes one square root only for the selected projection. Sensor sweeps
also reject boundary segments outside the sensor origin's finite search square
once before evaluating the seven individual rays.

Five same-command Fixed GA generation measurements immediately before and after
this change used 10 candidates, 15 simulated seconds, Easy Oval, and seed 42:

| Measurement       | Before (s) | After (s) |
| ----------------- | ---------: | --------: |
| Median generation |   0.648346 |  0.609922 |

The measured median was `5.9%` lower. All five post-change fitness-history,
generation-report, and champion projections were equal. The deterministic
matrix remains the release-level proof that the optimized path preserves the
saved product results.

The complete Phase 10 gate passed after these changes with `37` Vitest tests,
`83` pytest tests, all `18` deterministic cases in `14.125051 s`, a rebuilt
Windows package, and clean-runtime acceptance. The latest local ZIP SHA-256 is
`b67baa539ab82c6baa3ee8bccdc35bdd4e990cd5e33d979d3b287a0134c25ae4`.

### Projection reuse iteration on 2026-07-31

Profiling showed that the swept collision check projected each returned safe
position, then the episode evaluator projected that same position again for
progress. The physics step now returns the sweep's exact projection and the
evaluator reuses it as the next authoritative projection.

In one profiled 10-candidate Fixed GA generation, calls to `project` fell from
`19,083` to `9,548`. Seven same-command measurements immediately before and
after used Easy Oval, seed 42, and 15 simulated seconds per candidate:

| Measurement       | Before (s) | After (s) |
| ----------------- | ---------: | --------: |
| Median generation |   0.716530 |  0.569015 |

The median was `20.6%` lower. All seven post-change fitness histories,
generation reports, and champion projections were equal. The focused physics
test also proves one candidate projection is retained by the step, while the
full deterministic matrix remains the release-level equality gate.

The complete Phase 10 gate passed after projection reuse with `39` Vitest tests,
`84` pytest tests, all `18` deterministic cases in `11.616566 s`, and
clean-runtime Windows acceptance. The rebuilt local ZIP SHA-256 is
`ec4dbfe7457e6c1039612fdf4f4bc801cab8ed349e11ce83ce16cd3dc6196606`.

### Replay transport iteration on 2026-07-31

Observation polling previously rebuilt and returned every frame of the current
generation-champion replay at each `250 ms` refresh. The browser now acknowledges
the replay candidate it has already parsed. Python omits that replay until the
champion changes, and the client retains the acknowledged replay only while run
identity remains equal. Hidden documents also reduce polling from `4 Hz` to
`1 Hz`, then refresh immediately on return.

The measurement used the same 151-frame champion replay seen in the reviewed
Quick start browser run. Its full JSON observation was `30,314` bytes; the
acknowledged delta was `632` bytes, a `97.915%` reduction. Across 200 snapshot
build-and-JSON-serialization iterations, the full path took `0.233250 s` and the
acknowledged path took `0.003173 s`, a `98.64%` reduction. These are local
transport microbenchmarks, not simulation-throughput claims.

Focused coverage verifies Python omission without rebuilding frames, manager
request validation and delta delivery, TypeScript same-run merge behavior,
cross-run cache isolation, the optional IPC hint, `250 ms`/`1000 ms` cadence,
and immediate visible-state scheduling. A real eight-generation browser run
kept showing the smooth replay through completion and recorded no warning or
error log.

The complete Phase 10 gate passed after this iteration with `43` Vitest tests,
`87` pytest tests, all `18` deterministic cases in `10.506833 s`, and
clean-runtime Windows acceptance. The regression SHA-256 remained
`88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
The rebuilt local ZIP is `9,765,073` bytes with SHA-256
`f1e60a7d6ee3c41e1fe9dbc6a5fbf7f87ea9e1d70263463a2531432c0fe55a3b`.

## Racing path presentation correction

Original note: `racing-path-presentation.md`.

Date: `2026-08-10`

### Baseline problem

The Training and Results track renderer deliberately removed the currently
displayed champion from the visible trajectory set. It drew only up to seven
earlier generation champions as similarly prominent dashed lines. With reduced
motion active, the car also stayed on the replay's first frame. A completed run
therefore showed old paths and a car at the start line, but not the complete
route belonging to the champion named above the track.

The reproduced completed run `run-4e6dce86aeb445e093ff8abe72f572ab`
displayed candidate `g0007-c0002`, while the SVG contained only candidates from
generations zero through six. The marker was `translate(5.001 0)` even though
the final authoritative replay frame was at `(74.2, 40.058)`.

### Research decision

- [Minimum-curvature trajectory planning](https://arxiv.org/abs/2309.09186)
  and [sequential minimum-time racing trajectory generation](https://arxiv.org/abs/1902.00606)
  treat an ideal racing line as an optimization problem with track and vehicle
  constraints. Adding such a planner would change EvoRacer's learning problem;
  it is not a presentation fix.
- The [TUM trajectory planning implementation](https://github.com/TUMFTM/global_racetrajectory_optimization)
  likewise separates reference-line optimization from vehicle control. The
  corrected UI therefore labels and displays the controller's actual recorded
  trajectory, not a fabricated ideal line.
- Research on [uncertain trajectory visualization](https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.100/1-hci/hci-paper/2023/IMWUT_2023_Uncertainty_Trajectory_final.pdf)
  identifies clutter when multiple trajectory marks compete. The current path
  is now visually primary; historical paths use lower width and opacity.
- The [W3C SVG stroke specification](https://www.w3.org/TR/svg-strokes/)
  defines stroke width, opacity, caps, joins, and dashes as presentation
  controls. EvoRacer uses those controls without altering any Python position.

### Change

- The current replay is deterministically sampled to at most 64 points for
  display, matching the existing bounded trail contract.
- Its candidate id is attached to one solid green `current-generation-path`.
- Earlier paths remain visible, but their opacity now ranges from `0.08` to
  `0.28`, their stroke is thinner, and road centerline/boundaries render above
  them.
- Actual off-road motion remains visible. No clipping, projection, spline, or
  browser-authored racing line is introduced.
- Reduced motion selects the final recorded replay frame as the static marker.
- The same current-path treatment is used in Training and Results, including
  restored saved runs.
- The E2E harness accepts an optional loopback-only `EVORACER_E2E_PORT` while
  retaining `8765` as its default. This lets source acceptance run without
  terminating an already-open packaged EvoRacer instance; the production
  origin remains `http://127.0.0.1:8765` unless the Vite test build explicitly
  supplies its local override. `scripts/test-e2e.ps1` also accepts `-Port` and
  `-Grep` for an isolated focused run.

### Evidence

- `npm run check`: passed Prettier, ESLint, TypeScript type-check, `107` Vitest
  tests, PowerShell parsing, Ruff format/lint, strict mypy across `25` files,
  `140` pytest tests, and the production Vite build. The first sandboxed attempt
  was blocked by the owner-only `.pytest_cache` ACL; the identical gate passed
  outside that sandbox boundary.
- Browser, completed run at the default desktop viewport: the current SVG path
  id and displayed champion both resolved to `g0007-c0002`; seven prior paths
  rendered at opacities `0.08` through `0.28`; document and stage overflow were
  both zero.
- Browser, reduced motion: the current path ended at `(74.2, 40.058)` and the
  static marker used the same coordinates and recorded heading.
- Browser, `390 x 844`: document width remained `375 / 375`, the race stage and
  legend had zero horizontal overflow, and legend text rendered at `12.8 px`.
- `scripts/test-e2e.ps1 -Port 8876`: all `14` real Chromium flows passed in
  `3.2m`, including the new reduced-motion Training assertion that the displayed
  candidate id matches the solid path and that the marker uses the path's final
  recorded point. After every worker completed, the isolated service accepted
  its versioned shutdown acknowledgement and the runner exited `0`.

The change does not claim that the champion found an optimal racing line or
that automated checks prove the visualization is subjectively ideal.

## Smooth Results replay and racing-line comparison

Original note: `smooth-results-and-racing-line.md`.

Date: `2026-08-10`

### User job

After a run stops or completes, understand whether evolution improved, whether
the champion completed the lap, and whether its recorded route resembles a
credible ideal racing-line reference. Watch that result as continuous motion
instead of stepping through discrete frames.

### Baseline problem

Results opened on frame 1 and exposed only **Previous**, **Next**, and
**Restart**. The page led with run metadata, a fitness chart, and controller
tables, so the answer to "did it work?" had to be assembled from several
surfaces. No independent racing-line reference or explicit route-match result
existed.

### Research boundary

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

### Python-owned reference

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

### Results correction

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

### Evidence

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

Full source and journey gates are recorded in `docs/releases/v1.1.1.md` after their
successful completion. The local Windows package is verified but remains
unsigned and unpublished.
