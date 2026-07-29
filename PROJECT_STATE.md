# EvoRacer AI Lab Project State

## Current position

- Current phase: `Phase 9 - Windows offline package`
- Status: `in_progress`
- Active milestone: `M9 - Windows offline package`
- Last verified: `2026-07-29`

## Verified repository facts

- Git is initialized on branch `main`.
- The current README defines the Windows x64, offline, observer-only product and
  explicitly excludes human vehicle controls and non-loopback runtime services.
- The browser shell is TypeScript; the authoritative application, simulation,
  evaluation, evolution, and persistence core is planned in Python.
- TypeScript is restricted to browser UI state, interaction, rendering, charts,
  and the versioned IPC client.
- The Phase 0 Python service binds to `127.0.0.1` and has no third-party runtime
  dependency.
- The Phase 1 browser shell provides Welcome, Track, Training Settings, Review,
  Training, and Results routes without a UI framework or remote runtime asset.
- Python owns setup validation through the versioned
  `POST /v1/setup/validate` loopback contract. TypeScript performs only
  presentation checks before requesting that authoritative response.
- A shared valid setup fixture is verified by both TypeScript and Python tests.
- JavaScript dependencies are exact in `package.json` and transitively locked in
  `package-lock.json`. Python development dependencies are exact in
  `requirements-dev.lock`.
- Python owns the versioned `TrackV1` schema, complete segment catalogue,
  deterministic geometry compiler, and stable-code validator.
- Canonical tracks persist only ordered piece data; centerline, boundaries,
  checkpoints, and spawn pose are derived.
- The Track screen renders only geometry returned by the versioned
  `GET /v1/tracks/presets` loopback contract.
- The Phase 3 editor stores only ordered canonical pieces and delegates
  compilation and assisted closure to Python.
- Python owns deterministic bounded generation, TrackV1 validation, atomic
  local track persistence, and corrupt-record isolation.
- Preset, edited, generated, imported, and reloaded tracks converge on the
  Phase 2 compiler path.
- Python owns deterministic fixed-step arcade physics, swept collision, sensors,
  progress, episode evaluation, and both baseline controllers.
- The selected-car observer panel consumes version 1 Python telemetry and
  contains no TypeScript simulation rules.
- Python owns the deterministic Fixed GA population lifecycle and versioned
  feed-forward network execution.
- Fixed GA genomes keep network parameters, softmax-normalized vehicle
  performance-budget logits, and full-domain brake/drive bias genes immutable
  throughout each episode.
- Fixed GA fitness and generation reports consume the unchanged Phase 4
  evaluator; TypeScript verifies only the shared contract shape.
- Python owns the feed-forward neat-python integration, custom vehicle genes,
  runtime-neutral DAG compiler, and deterministic checkpoint resume.
- Fixed GA and NEAT share observation normalization, Phase 4 episode evaluation,
  and Phase 5 fitness without algorithm-specific physics or scoring paths.
- NEAT controller topology, weights, and vehicle genes can change only while
  creating the next generation; evaluation receives frozen compiled values.
- Python owns version 1 run sessions, generation-batched advancement,
  pause/resume/stop state, observation snapshots, terminal metadata, baseline
  comparison, and replay recording.
- Browser cadence changes only when another complete Python generation is
  requested; it never supplies physics steps or a simulation delta.
- The observer and Results UI render Python generation reports, selected-car
  telemetry, fitness history, baseline comparisons, and champion replay on
  Python-compiled track geometry.
- Python owns version 1 atomic run documents with embedded TrackV1 identity,
  frozen settings, observation checkpoints, and canonical SHA-256 integrity.
- Service restart never starts training. Explicit resume reconstructs Fixed GA
  or NEAT at a complete generation boundary and fails closed on deterministic
  checkpoint drift.
- The local run library lists valid records while isolating corrupt records and
  supports exact-record resume, export, and delete over loopback contracts.

## Completed milestones

### M0 - Reproducible Skeleton

Status: `complete`

Delivered:

- [x] Current README and Python-first architecture decisions.
- [x] Git repository, `.gitignore`, and `.gitattributes`.
- [x] Minimal TypeScript browser shell and Python application-core package.
- [x] Exact compatible JavaScript and Python dependency sets.
- [x] Format, lint, type-check, test, build, development, and smoke entrypoints.
- [x] One Python test and two TypeScript tests.
- [x] Loopback-only frontend and Python process startup.

Verification evidence recorded on `2026-07-29`:

- Toolchain: Node.js `v24.13.0`, npm `11.9.0`, Python `3.13.5`.
- `npm run check` passed Prettier, ESLint, TypeScript type-check, two Vitest
  tests, Ruff format/lint, strict mypy, one pytest test, and the Vite production
  build.
- `npm run smoke:m0` passed with the frontend at
  `http://127.0.0.1:4173` and Python health at
  `http://127.0.0.1:8765/health`.
- A clean copy at `.runtime_tmp/m0-clean-setup`, created without `.venv`,
  `node_modules`, `dist`, `.git`, or prior runtime files, passed these commands
  in order:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
  npm run check
  npm run smoke:m0
  ```

- Clean setup installed the exact locks, reported zero npm audit
  vulnerabilities, passed the same tests and build, and opened both loopback
  processes. The temporary validation copy was removed after verification.

### M1 - Offline Shell and Onboarding

Status: `complete`

Delivered:

- [x] Welcome, Track, Training Settings, Review, Training, and Results routes.
- [x] First-use guidance, three track choices, three training presets, visible
      parameter help, bounded inputs, and collapsed advanced settings.
- [x] Responsive, keyboard-focusable semantic UI with one main landmark, status
      announcements, field labels, and reduced-motion handling.
- [x] Python-owned versioned setup validation plus a fixture verified from both
      runtimes.
- [x] Explicit Start-only transition to Training and frozen setup state after
      Start.
- [x] Local-only CSS visuals and zero vehicle-driving controls.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, eight Vitest
  tests, Ruff format/lint, strict mypy, four pytest tests, and the Vite
  production build.
- `npm run smoke:m0` passed with the frontend at
  `http://127.0.0.1:4173` and Python health at
  `http://127.0.0.1:8765/health`.
- The complete browser flow passed through Results. Start was unavailable before
  authoritative validation, Training opened only after the explicit Start
  click, and the four setup routes were disabled after Start.
- Browser inspection found zero vehicle-driving inputs and zero console warnings
  or errors.
- The runtime resource inventory contained only `127.0.0.1:4173` frontend
  resources and `127.0.0.1:8765/v1/setup/validate`; the non-loopback request
  list was empty.
- The Settings screen was visually inspected at `390 x 844` and retained a
  readable single-column layout.
- Detailed interaction and resource evidence is saved in
  `docs/verification/phase1-browser-audit.md`.
- `git diff --check` passed. The static URL scan found only loopback runtime/test
  URLs and the intentional `https://example.com` negative test input.

### M2 - Track Core and Presets

Status: `complete`

Delivered:

- [x] Versioned Python `TrackV1` schema and complete segment catalogue.
- [x] Sequential Python compiler deriving centerline, boundaries, checkpoints,
      and spawn pose from canonical pieces.
- [x] Python validator for schema, start/finish count, supported pieces,
      corridor width, closure, and self-intersection with stable error codes.
- [x] Easy Oval, Technical Circuit, and Chicane Challenge bundled as canonical
      presets using one compiler path.
- [x] Versioned loopback preset-geometry endpoint and a TypeScript SVG renderer
      that consumes Python-derived geometry.
- [x] Shared valid geometry and invalid-track fixtures verified across both
      runtimes.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 11 Vitest
  tests, Ruff format/lint, strict mypy, 12 pytest tests, and the Vite production
  build.
- All three presets compiled as closed, connected, non-self-intersecting tracks.
  Repeated compilation produced byte-identical sorted JSON.
- Invalid version, segment, start/finish, corridor, open-loop, and
  self-intersection fixtures returned their saved stable error codes.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- Browser inspection found three preset cards, three Python-derived SVGs, three
  road paths, three start lines, no unavailable placeholders, and no console
  warnings or errors. Selecting Chicane Challenge enabled Continue.
- The static runtime URL scan found only intended loopback URLs.
- Detailed evidence is saved in
  `docs/verification/phase2-track-core.md`.
- `git diff --check` passed.

### M3 - Editor, Generator, and Track Library

Status: `complete`

Delivered:

- [x] Sequential TypeScript editor with add, delete, undo, redo, reset, and
      Python-assisted closure.
- [x] Versioned Python seed/length/difficulty generator with deterministic
      bounded search and final TrackV1 validation.
- [x] Python-owned atomic local track library with corrupt-record isolation and
      delete support.
- [x] Versioned TrackV1 JSON import/export with Python validation before
      selection or persistence.
- [x] Shared Phase 3 contract fixture verified by TypeScript and Python.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 15 Vitest
  tests, Ruff format/lint, strict mypy, 20 pytest tests, and the Vite production
  build.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- Same generator inputs produced byte-identical sorted JSON. All nine
  length/difficulty combinations produced the required 12, 18, or 24 pieces
  and recompiled through the public Phase 2 compiler.
- Generator and assisted closure stayed within the 200-candidate bound.
- Unknown segment JSON failed with `UNKNOWN_SEGMENT_KIND`; malformed saved JSON
  was isolated as `CORRUPT_TRACK_RECORD`.
- Browser interaction covered edit/delete/closure, Long-Hard generation, atomic
  save/list/delete, shared-fixture import, custom-track Review validation, and
  responsive layout. The console contained zero warnings or errors.
- The static runtime URL scan found no non-loopback URL.
- Detailed evidence is saved in
  `docs/verification/phase3-track-authoring.md`.
- `git diff --check` passed.

### M4 - Physics, Sensors, and Baselines

Status: `complete`

Delivered:

- [x] Python-only fixed `1/60 s` arcade physics with continuous controls.
- [x] Lateral slip, grip recovery, and full-domain front/rear drive and brake
      bias handling.
- [x] Swept boundary collision, seven road-edge sensors, progress, and
      deterministic episode evaluation.
- [x] Seeded random-network and Pure Pursuit baselines through one evaluator.
- [x] Versioned selected-car telemetry rendered by the observer UI.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 17 Vitest
  tests, Ruff format/lint, strict mypy, 34 pytest tests, and the Vite production
  build.
- Fractional control, low-grip sliding, front/rear bias, swept collision,
  episode parameter freeze, and seeded random-baseline tests passed.
- Dense 1-step and sparse 17-step telemetry sampling produced identical physics
  termination, step count, progress, and final telemetry.
- Pure Pursuit completed Easy Oval in 1322 steps, Technical Circuit in 1557,
  and Chicane Challenge in 2065, with `progress=1.0` and zero collision for all
  three presets.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- Browser interaction covered explicit Start, locked setup, selected-car
  telemetry, seven sensors, and the `390 x 844` layout. The console contained
  zero warnings or errors.
- The static runtime URL scan found only intended loopback URLs.
- Shared `contracts/phase4-telemetry.json` was verified from both runtimes.
- Detailed evidence is saved in
  `docs/verification/phase4-physics.md`.
- `git diff --check` passed.

### M5 - Fixed GA

Status: `complete`

Delivered:

- [x] Python version 1 `10 -> 6 -> 3` feed-forward network execution.
- [x] Deterministic population initialization, tournament selection, exact
      elitism, uniform crossover, and bounded mutation.
- [x] Five-gene softmax vehicle performance budget and full-domain front
      brake/drive bias evolution.
- [x] Exploit-resistant fitness and versioned per-candidate generation reports.
- [x] Shared fixed-genome contract fixture verified from Python and TypeScript.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 18 Vitest
  tests, Ruff format/lint, strict mypy, 41 pytest tests, and the Vite production
  build.
- Two independent seed `20260729` lifecycles produced equal immutable initial
  populations and equal complete five-generation result payloads.
- With mutation probability `1.0`, both ranked elites entered the next
  generation with byte-for-byte equal network and vehicle genomes.
- The controlled Easy Oval fixture improved median fitness from `0.000000` to
  `99.599264` over seven generations.
- Champion `g0006-c0002` reached fitness `173.985972` and progress `0.144988`.
  The seeded random network evaluated with the champion's exact vehicle genes
  reached fitness `0.000336` and progress `0.000000`.
- Zero-progress fixtures received no speed or survival reward; collision
  reduced fitness, and completion efficiency remained locked behind a verified
  lap.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- The static runtime URL scan found only intended loopback runtime URLs; the two
  external links added under `docs/` are development references only.
- Shared `contracts/phase5-fixed-ga.json` was verified from both runtimes.
- Detailed evidence is saved in
  `docs/verification/phase5-fixed-ga.md`.
- `git diff --check` passed.

### M6 - NEAT

Status: `complete`

Delivered:

- [x] Exact `neat-python 2.0.0` dependency and bundled explicit feed-forward
      configuration.
- [x] Custom genome carrying the common five performance-budget logits and
      full-domain front brake/drive bias genes.
- [x] Versioned runtime-neutral feed-forward DAG compiler and Python controller.
- [x] NEAT adapter over the shared Fixed GA evaluator path.
- [x] Seeded multi-generation orchestration and deterministic checkpoint resume.
- [x] Shared NEAT contract fixture verified from Python and TypeScript.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 19 Vitest
  tests, Ruff format/lint, strict mypy, 48 pytest tests, and the Vite production
  build.
- A three-generation, six-candidate NEAT run completed on Easy Oval through the
  shared Phase 4 physics and Phase 5 fitness path.
- Runtime-neutral compiled outputs matched neat-python's feed-forward executor
  for the same seeded genome and inputs.
- Vehicle crossover inherited only parent values, bounded offspring mutation
  changed no parent, and all vehicle genes stayed equal before and after every
  active evaluation.
- With population `8` and seed `411`, restoring `neat-checkpoint-1` reproduced
  the uninterrupted generation `1` and `2` reports exactly.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- The static runtime URL scan found only intended loopback URLs and local fetch
  calls. The built Python wheel contained the bundled NEAT configuration.
- Shared `contracts/phase6-neat.json` was verified from both runtimes.
- Detailed evidence is saved in `docs/verification/phase6-neat.md`.
- `git diff --check` passed.

### M7 - Observer Experience and Results

Status: `complete`

Delivered:

- [x] Version 1 Python run sessions and generation-batched observation
      snapshots shared by Fixed GA and NEAT.
- [x] Live generation, best/median fitness, and selected-car telemetry display.
- [x] Pause, resume, and stop controls at deterministic generation boundaries.
- [x] SVG fitness history, champion/baseline comparison, and in-process prior
      run comparison.
- [x] Python-recorded champion replay with motion, controls, controller
      parameters, and fixed vehicle setup rendered on compiled track geometry.
- [x] Complete terminal metadata identifying run, track hash, configuration,
      fixed time step, and contract versions.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 22 Vitest
  tests, Ruff format/lint, strict mypy, 57 pytest tests, and the Vite production
  build.
- Both Fixed GA and NEAT completed two-generation batch sessions through the
  same observer contract.
- Paused/resumed seeded Fixed GA and NEAT sessions produced byte-identical
  complete snapshots to their uninterrupted sessions. No generation advanced
  while paused.
- Two independent seeded runs reproduced every champion replay frame,
  controller parameter, and fixed vehicle setup.
- The loopback HTTP test covered start, pause, paused observation, resume, and
  terminal result metadata.
- `npm run smoke:m0` passed with both processes on `127.0.0.1`.
- Browser interaction covered configuration lock, pause at `0 / 2`, resume,
  live generation/fitness/telemetry, three-controller comparison, and replay
  frame navigation on Easy Oval. The console contained zero warnings or errors.
- At a `390 x 844` viewport override, document `scrollWidth` equaled
  `clientWidth` (`375`), with no horizontal document overflow.
- The browser asset inventory and static URL scan found only intended loopback
  URLs.
- Shared `contracts/phase7-observation.json` was verified from both runtimes.
- Detailed evidence is saved in
  `docs/verification/phase7-observer-results.md`.
- `git diff --check` passed.

### M8 - Persistence and Recovery

Status: `complete`

Delivered:

- [x] Python-owned version 1 run documents under
      `%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`.
- [x] Atomic Start, generation-boundary, pause/resume/stop, and terminal writes.
- [x] Explicit run and embedded track schema versions plus checkpoint SHA-256.
- [x] Restart-safe run listing and explicit deterministic Fixed GA/NEAT resume.
- [x] Corrupt-record isolation, exact-record delete, and versioned JSON export.
- [x] Saved-run Welcome UI and shared Python/TypeScript RunV1 fixture.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 25 Vitest
  tests, Ruff format/lint, strict mypy, 64 pytest tests, and the Vite production
  build.
- `npm run smoke:m0` passed with the frontend at
  `http://127.0.0.1:4173` and Python health at
  `http://127.0.0.1:8765/health`.
- Fixed GA and NEAT interrupted after generation `1 / 2`, restored through a
  new manager, and matched their uninterrupted final fitness history,
  generation report, selected-car telemetry, result, baselines, and replay.
- Restart preserved a valid TrackV1 and RunV1 while an adjacent malformed run
  was reported as `CORRUPT_RUN_RECORD` without blocking either library.
- Loopback integration covered list, explicit resume, completion, export, and
  delete through a new service instance.
- Browser interaction resumed a saved run from `1 / 2` to `2 / 2`, rendered
  Results and replay, and produced zero console warnings or errors. At
  `390 x 844`, document `scrollWidth` equaled `clientWidth` (`375`).
- The static runtime URL scan found only intended `127.0.0.1` URLs.
- Shared `contracts/phase8-run-document.json` was validated by Python and parsed
  by TypeScript.
- Detailed evidence is saved in
  `docs/verification/phase8-persistence-recovery.md`.
- `git diff --check` passed.

## Blockers

- None.

## Next action

Implement Phase 9 only: production static frontend, Python local core/launcher,
graceful shutdown, PyInstaller `onedir`, release ZIP, checksum, and notices.

## State update rule

When work changes this file:

1. Record only verified facts.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
