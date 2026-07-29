# EvoRacer Phase Gates

## Gate rule

Complete phases in order. A milestone closes only when its deliverables exist, focused and phase-level tests pass, evidence is recorded in `PROJECT_STATE.md`, and documentation matches behavior.

## Phase 0 - Foundation

Deliver:

- Current README and architecture decisions
- Git and ignore rules
- Minimal TypeScript browser shell and Python application-core package scaffolds
- Locked compatible dependencies
- Lint, format, type-check, and test entrypoints

M0 gate:

- Clean setup opens frontend and local Python process.
- At least one TypeScript and one Python test pass.
- Old human-driving and online-runtime claims are removed.

## Phase 1 - Offline shell and onboarding

Deliver:

- Welcome, Track, Settings, Review, Training, and Results routes
- Parameter help, presets, validation, and first-use onboarding
- Local-only assets and accessible UI foundation

M1 gate:

- No run starts automatically.
- Start remains disabled until configuration and track are valid.
- No vehicle-driving controls exist.
- Network audit shows zero non-loopback requests.

## Phase 2 - Track core and presets

Deliver:

- Versioned Python track schema, segment catalogue, compiler, and validator
- TypeScript renderer consuming Python-derived geometry
- Three bundled preset tracks

M2 gate:

- Presets compile as closed, connected, non-intersecting tracks.
- Invalid fixtures fail with stable error codes.
- Compilation is deterministic.

## Phase 3 - Editor, generator, and track library

Deliver:

- Sequential TypeScript editor UI with undo/redo/delete/reset and assisted
  closure
- Python seed/length/difficulty generator and final track validation
- Local track library and versioned JSON import/export

M3 gate:

- Preset, edited, generated, and imported tracks use one compiler/evaluator path.
- Same generator inputs reproduce identical JSON.
- Invalid or unknown JSON fails safely.

## Phase 4 - Physics, sensors, and baselines

Deliver:

- Python fixed-step arcade physics, lateral slip, biases, collision, sensors,
  progress, and episode evaluation
- Python random and Pure Pursuit baselines
- Selected-car telemetry

M4 gate:

- Fractional controls have measurable effects.
- Low grip increases sliding.
- Front/rear bias extremes produce distinct handling.
- Vehicle and network parameters remain fixed throughout each episode.
- Pure Pursuit finishes every preset.
- Render frame rate does not change physics results.

## Phase 5 - Fixed GA

Deliver:

- Python feed-forward network, population lifecycle, selection, elitism,
  crossover, mutation
- Vehicle performance budget and bias gene evolution
- Exploit-resistant fitness and generation reports

M5 gate:

- A fixed seed reproduces the initial population and result sequence.
- Elite candidates remain unchanged.
- A controlled training fixture improves median fitness.
- Champion beats a random network using identical vehicle genes.

## Phase 6 - NEAT

Deliver:

- Feed-forward neat-python configuration
- Custom genome carrying common vehicle genes
- Network compiler and checkpoint resume
- Shared evaluator with Fixed GA

M6 gate:

- Multi-generation NEAT run completes.
- Vehicle genes cross over and mutate only at generation boundaries.
- Checkpoint restore reproduces the next generation.
- Algorithm selection does not change physics or fitness code paths.

## Phase 7 - Observer experience and results

Deliver:

- Live generation/fitness/telemetry display
- Pause/resume/stop
- Charts, champion replay, baseline and run comparison
- Versioned observation snapshots from the Python core; UI cadence remains
  simulation-independent

M7 gate:

- Runtime configuration cannot be edited after Start.
- Pause/resume does not alter outcomes.
- Replay reproduces controls, motion, and fixed vehicle genes.
- Result metadata fully identifies the run.

## Phase 8 - Persistence and recovery

Deliver:

- Python-owned atomic local run files
- Track/run schema versions
- Resume, corrupt-record isolation, delete, and export

M8 gate:

- Restart preserves valid tracks and runs.
- Supported interrupted runs resume deterministically.
- One corrupt record cannot block the library.

## Phase 9 - Windows offline package

Deliver:

- Production static frontend, Python local core/launcher, graceful shutdown
- PyInstaller `onedir` bundle, release ZIP, checksum, notices

M9 gate:

- Runs on clean Windows x64 without Node or Python.
- Works with outbound networking disabled.
- Makes zero non-loopback requests.
- Opens, trains, replays, saves, and restores offline.

## Phase 10 - Hardening and portfolio release

Deliver:

- Full automated suite, deterministic regression fixtures, performance report
- Architecture and user documentation
- Demo media and evidence-backed algorithm comparison

M10 gate:

- Every earlier gate passes again.
- Three seeds across three presets complete Fixed GA and NEAT smoke runs.
- Release ZIP passes clean-machine acceptance.
- Public claims match saved evidence.

## Phase 11 - Public binary publication

Deliver:

- One coherent stable version across the JavaScript and Python package metadata
- Checked-in release notes and durable README download links
- Annotated source tag on the pushed release commit
- Published GitHub Release with the Windows ZIP and separate SHA-256 file
- Automated public-release verification

M11 gate:

- The complete Phase 10 gate passes immediately before publication.
- The annotated tag resolves to the pushed release commit.
- The GitHub Release is published as a full, latest release rather than a draft
  or prerelease.
- The ZIP and checksum assets are publicly downloadable.
- A fresh download of both assets reproduces the published SHA-256 value.
- Release notes and download copy preserve the saved product and evidence
  boundaries.
