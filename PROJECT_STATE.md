# EvoRacer AI Lab Project State

## Current position

- Current phase: `Phase 11 - Public binary publication`
- Status: `complete`
- Active milestone: `None - all planned milestones complete`
- Last verified: `2026-07-31`

## Unreleased correction after v1.0.0

- Live training now renders the currently evaluated Python candidate moving on
  Python-compiled track geometry from versioned `x`, `y`, and `heading`
  telemetry.
- Generation evaluation runs in a background worker so browser polling can
  observe candidate identity, position, controls, sensors, simulated time, and
  progress without driving the fixed simulation step.
- After the first generation, Training continuously presents the latest Python
  generation champion at `2x` simulated speed. `requestAnimationFrame` fills
  visual frames between recorded Python timestamps without predicting or
  advancing simulation state.
- Training and Results now keep an **Evolution trail** of up to seven prior
  Python generation-champion paths. Each stored path is sampled to at most 64
  recorded points, older paths fade behind the current replay, and new/restored
  runs cannot inherit presentation history.
- Transient `generationReplay` frames remain outside persisted run documents,
  and Windows checkpoint replacement now retries only bounded transient sharing
  violations while preserving atomic `os.replace` persistence.
- Reused Python centerline and boundary segment geometry reduced the verified
  18-case deterministic matrix from `81.457872 s` / `4.039459 s` median to
  `26.195954 s` while matching every reviewed result.
- Quick start is now the initial preset at `10 x 8 x 15 s`; Balanced is
  `24 x 20 x 30 s`, Thorough is `48 x 40 x 60 s`, and Settings/Review expose
  the maximum candidate-episode workload before Start.
- Welcome now offers a validated `Easy Oval + Quick start` path directly to
  Review. Saved runs, custom-track tools, and exact training controls are
  collapsed by default while the full customization flow remains available.
- Browser observation polling is now capped at `4 Hz` instead of `10 Hz`, a
  `60%` reduction in scheduled full-interface refreshes. Python simulation and
  timestamp-based `requestAnimationFrame` motion remain independent of polling.
- Hidden tabs reduce observation delivery to `1 Hz` and refresh immediately on
  return. The Python worker continues at full speed and only one browser request
  may be in flight.
- The browser acknowledges its current generation-replay candidate, allowing
  Python to omit an unchanged 151-frame replay without rebuilding it. The
  measured response fell from `30,314` to `632` bytes (`97.915%`), and 200
  snapshot-build-plus-serialization iterations fell from `0.233250 s` to
  `0.003173 s` (`98.64%`). Same-run caching and cross-run isolation are covered
  in both runtimes.
- Active observation responses omit repeated setup data and avoid scanning the
  complete run library until a terminal result. In a 12-run local library, 20
  response builds fell from `0.3904666000 s` to `0.0000233000 s`, and each
  response fell from `1667` to `343` bytes.
- Sensor rays now reject impossible boundary intersections through precomputed
  segment bounds. Three alternating identical Fixed GA generation measurements
  reduced the median from `1.351269 s` to `0.645795 s` while every terminal
  snapshot remained equal.
- Centerline projection now compares squared distances in the segment loop, and
  sensor sweeps reuse one finite nearby-segment filter across all seven rays.
  Five same-command Fixed GA measurements reduced the median from `0.648346 s`
  to `0.609922 s`, another measured `5.9%` reduction.
- Champion replay timestamp lookup now uses binary search. A 4,096-frame,
  60,000-lookup presentation microbenchmark fell from `147.164 ms` to
  `14.872 ms` (`9.9x`) without changing authoritative Python frames.
- Physics steps now retain the swept safe point's centerline projection for
  progress instead of calculating the same post-step projection twice. A
  profiled generation reduced projection calls from `19,083` to `9,548`, and
  seven same-command measurements reduced the median from `0.716530 s` to
  `0.569015 s` (`20.6%`) with equal result projections.
- Terminal status is exposed only after its atomic checkpoint is durable, and
  run reads tolerate the bounded Windows sharing gap around replacement. The
  restart-complete-export-delete service regression passed 10 consecutive runs.
- Training distinguishes the live candidate, a background candidate while a
  champion replay is shown, and the completed generation champion. The
  simplified setup and these states passed desktop and `390 x 844` browser
  inspection with no warning/error log and no page-level horizontal overflow.
- Training now exposes honest generation/candidate evaluation progress, labels
  Pause and Stop as generation-boundary actions, and visibly acknowledges
  queued commands. The narrow-screen step rail keeps the active route centered
  across observation renders without showing a native scrollbar.
- Completed and stopped runs now surface **Open results** directly below run
  status and omit redundant terminal controls. The action stayed fully visible
  in desktop and `390 x 844` mobile viewports and opened the complete Results
  route with no browser warning/error log.
- The full Phase 10 gate passed with `46` Vitest tests, `87` pytest tests, all
  `18` deterministic matrix cases, and clean-runtime Windows acceptance that
  requires both live candidate position telemetry and a multi-frame Python
  generation replay.
- The latest deterministic matrix completed in `10.651053 s`. The rebuilt local
  ZIP is verified, but this correction is not part of the immutable published
  `v1.0.0` tag or its public assets. Its SHA-256 is
  `a064939f1097cc135880efd7e52f1df87bc784440b1d9f7bd7eb12791a40e8f3`.
- Detailed evidence is saved in
  `docs/verification/live-training-observer.md` and
  `docs/verification/training-performance.md`, with the smooth-presentation
  correction in `docs/verification/smooth-training-replay.md` and the simplified
  setup audit in `docs/verification/setup-experience.md`.

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
- Browser observation and presentation cadence never supplies physics steps or
  a simulation delta.
- The observer and Results UI render Python generation reports, selected-car
  telemetry, fitness history, baseline comparisons, and Python-recorded champion
  replay on Python-compiled track geometry. Smooth motion interpolates only
  between timestamped Python frames.
- Python owns version 1 atomic run documents with embedded TrackV1 identity,
  frozen settings, observation checkpoints, and canonical SHA-256 integrity.
- Service restart never starts training. Explicit resume reconstructs Fixed GA
  or NEAT at a complete generation boundary and fails closed on deterministic
  checkpoint drift.
- The local run library lists valid records while isolating corrupt records and
  supports exact-record resume, export, and delete over loopback contracts.
- The production launcher serves built frontend assets and versioned Python
  contracts from one `127.0.0.1:8765` origin and supports explicit graceful
  shutdown.
- PyInstaller `onedir` bundles the Python core, neat-python configuration, and
  Vite assets without requiring installed Node.js or Python at runtime.
- The release workflow creates `EvoRacer-Windows-x64.zip`, a separate SHA-256
  checksum, README, third-party notices, and complete Python/PyInstaller
  licenses.
- Python owns the Phase 10 deterministic regression matrix through the same
  preset compiler, run session, Fixed GA, NEAT, evaluator, result, and replay
  paths used by the application.
- The reviewed Phase 10 fixture covers three seeds, all three presets, and both
  algorithms at valid minimum product settings.
- The repository and packaged release contain architecture, user, algorithm
  comparison, demo, and evidence documents with explicit public-claim limits.
- Version `1.0.0` is published from annotated tag `v1.0.0` as the latest full
  GitHub Release with the verified Windows ZIP and separate SHA-256 asset.
- The Phase 11 verifier checks coherent JavaScript/Python package versions,
  annotated-tag identity, public release state, asset names and sizes, and a
  fresh-download SHA-256 match.

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

### M9 - Windows Offline Package

Status: `complete`

Delivered:

- [x] Production static frontend and Python loopback core under one launcher.
- [x] Browser-open behavior and explicit graceful shutdown.
- [x] PyInstaller `onedir` bundle with all runtime dependencies and local assets.
- [x] `EvoRacer-Windows-x64.zip` and matching SHA-256 checksum.
- [x] README, third-party notices, Python license, and PyInstaller license.
- [x] Clean-runtime, offline-boundary, persistence, restore, replay, and browser
      acceptance.

Verification evidence recorded on `2026-07-29`:

- `npm run check` passed Prettier, ESLint, TypeScript type-check, 25 Vitest
  tests, Ruff format/lint, strict mypy, 67 pytest tests, and the Vite production
  build.
- `npm run smoke:m0` passed with the development frontend and Python service on
  loopback.
- `npm run build:release` completed with PyInstaller `6.21.0` on Windows 11 x64
  and created the release ZIP, checksum, and notices.
- Final `release\EvoRacer-Windows-x64.zip` SHA-256:
  `ab1a3126385c2c536169bb50124df436b4043ad4ab3afc74b6d4b518179b6149`.
- `npm run test:release` launched the extracted app with a system-only `PATH`,
  no Python environment, and unreachable outbound proxies. It saved generation
  `1 / 2`, shut down, restored run
  `run-22089c3857804993b70dd2d0fccbeb9c`, completed `2 / 2`, and returned replay
  frames.
- The packaged process opened only loopback sockets and spawned no Node.js or
  Python child process.
- Production browser interaction covered Welcome, selection, validation,
  explicit Start, a Fixed GA generation, telemetry, Stop, Results, a 139-frame
  replay, saved-run listing, and the Exit action.
- Browser console warnings/errors and non-local resource references were both
  zero. At `390 x 844`, document `scrollWidth` equaled `clientWidth` (`375`).
- The Exit action returned its shutdown view and terminated `EvoRacer.exe`.
- Detailed evidence is saved in
  `docs/verification/phase9-windows-offline-package.md`.
- `git diff --check` passed.

### M10 - Hardening and Portfolio Release

Status: `complete`

Delivered:

- [x] One complete automated Phase 10 gate covering all earlier automated and
      release gates.
- [x] Deterministic regression fixture for three seeds, three presets, Fixed GA,
      and NEAT.
- [x] Measured smoke performance report with machine/environment metadata.
- [x] Current architecture, packaged user guide, evidence-backed algorithm
      comparison, and local SVG demo media.
- [x] Public README and claims aligned to saved deterministic, learning, and
      release evidence.

Verification evidence recorded on `2026-07-29`:

- `npm run test:phase10` passed the complete composed gate.
- `npm run check` inside that gate passed Prettier, ESLint, TypeScript
  type-check, `26` Vitest tests, Ruff format/lint, strict mypy, `68` pytest
  tests, and the Vite production build.
- `npm run smoke:m0` passed with the frontend and Python service on
  `127.0.0.1`.
- `evo_racer.hardening` exactly regenerated `18 / 18` reviewed cases using
  population `10`, one generation, a `15 s` episode, seeds `19`, `73`, and
  `211`, all three presets, and both algorithms.
- The measured matrix completed in `77.613886 s` with a median case time of
  `3.863451 s`. Its regression SHA-256 was
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- The final `release\EvoRacer-Windows-x64.zip` was `9,540,521` bytes with
  SHA-256
  `536a54f74d4c03b97e665be5456356ebf8ffc6fa5b7b365084e1b909330c307f`.
- Clean-runtime acceptance extracted the package, found the packaged
  `USER-GUIDE.md`, saved and restarted run
  `run-ede5749304bb45c38bc5acb276273591`, restored it deterministically,
  completed training, and returned replay frames.
- The packaged process used loopback only and spawned no Node.js or Python
  child process.
- Browser interaction covered Welcome, Easy Oval, valid review, explicit Start,
  three complete Fixed GA generations, Stop, Results, baseline comparison, and
  a `451`-frame replay. Browser warning/error logs were empty and document
  `scrollWidth` equaled `clientWidth` (`1265`).
- Detailed methods, timings, comparison limits, and public claim boundaries are
  saved in `docs/verification/phase10-hardening.md`.
- `git diff --check` passed.

### M11 - Public Binary Publication

Status: `complete`

Delivered:

- [x] Coherent `1.0.0` JavaScript and Python package metadata.
- [x] Checked-in `v1.0.0` release notes and durable README download links.
- [x] Annotated source tag `v1.0.0` on the pushed release commit.
- [x] Latest full GitHub Release with the Windows ZIP and SHA-256 asset.
- [x] Automated public metadata, tag, asset, and fresh-download verification.

Verification evidence recorded on `2026-07-29`:

- The Phase 10 pre-publication sequence passed formatting, lint, TypeScript and
  Python type checks, `26` Vitest tests, `68` pytest tests, the development
  loopback smoke, all `18` deterministic matrix cases, the Windows build, and
  clean-runtime acceptance.
- The isolated matrix completed in `81.457872 s`, with a median case time of
  `4.039459 s` and regression SHA-256
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- `npm run test:release` accepted the exact publication ZIP from the normal
  repository path, restored and completed run
  `run-f8848e74fb054ce0b9774f7e9b2d49c1`, used loopback only, and spawned no
  external Node.js or Python process.
- Release commit `0c566579532f56d92a08790cff5ef44b674bc4c9` was pushed to
  `main`. Annotated tag `v1.0.0` resolves to that exact commit locally and on
  GitHub.
- [GitHub Release `v1.0.0`](https://github.com/EfeErim/evo-racer-ai-lab/releases/tag/v1.0.0)
  is published as the latest full release. Its ZIP is `9,398,174` bytes and its
  checksum asset is `92` bytes.
- `npm run test:phase11` downloaded both public assets and reproduced ZIP
  SHA-256
  `2462e678368f3e142d801d8c29c327602484d5e24c0bd3441efb0a317f1cf732`.
- `git diff --cached --check` passed for the Phase 11 release commit.

## Blockers

- None.

## Next action

All eleven planned phases are complete. Future work should begin under a new
version and phase definition while preserving the immutable `v1.0.0` tag,
published assets, saved evidence, and product claim boundary.

## State update rule

When work changes this file:

1. Record only verified facts.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
