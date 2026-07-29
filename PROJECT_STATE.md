# EvoRacer AI Lab Project State

## Current position

- Current phase: `Phase 5 - Fixed GA`
- Status: `in_progress`
- Active milestone: `M5 - Fixed GA`
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

## Blockers

- None.

## Next action

Implement Phase 5 only: Python feed-forward network execution, deterministic
Fixed GA population lifecycle, selection, elitism, crossover, mutation, vehicle
performance-budget genes, exploit-resistant fitness, and generation reports.
Use the Phase 4 physics, sensors, baselines, and evaluator unchanged.

## State update rule

When work changes this file:

1. Record only verified facts.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
