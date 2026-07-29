# EvoRacer Architecture Decisions

## Status

These decisions define the foundation, onboarding shell, track core, Phase 3
track-authoring boundary, and Phase 4 simulation evaluator.
Product-level constraints remain authoritative in the repository product
contract.

## Runtime boundary

EvoRacer is a local Windows x64 application with two runtime components:

```text
TypeScript browser UI and renderer
        |
        | batched commands and observation snapshots
        | versioned JSON over 127.0.0.1 only
        |
Python application, simulation, and evolution core
```

No component may bind to a LAN/public interface or call a non-loopback runtime
resource. The Phase 0 Python service uses the standard library HTTP server and
hard-codes `127.0.0.1`; it has no runtime third-party dependency.

## Responsibility split

- Python owns canonical track schemas and compilation, generated geometry,
  validation, seeded generation, physics, sensors, controller execution,
  episode termination, fitness evaluation, baselines, Fixed GA and NEAT
  orchestration, checkpointing, persistence, replay data, and process lifecycle.
- TypeScript owns browser UI state, interaction, presentation-only validation,
  rendering, charts, accessibility, and the versioned IPC client.
- Python is the final authority for every product or simulation decision.
  TypeScript must not reimplement those rules; it displays Python results and
  stable error codes.
- Cross-runtime messages use explicit contract versions and fixtures verified by
  both runtimes.
- The UI sends commands in batches and consumes observation snapshots.
  Rendering cadence is independent from Python's fixed simulation step.

This Python-first split maximizes one canonical language for the computational
and data-heavy parts of the product while retaining only the code that must run
in a browser in TypeScript. It also keeps Fixed GA and NEAT on the same evaluator
without a second physics implementation.

## Frontend foundation

The shell uses Vite, TypeScript, HTML, and CSS without a UI framework.
TypeScript stays deliberately thin: it renders local data, captures UI-only
input, and calls the Python core. This keeps the initial dependency surface
small while preserving typed browser modules and production bundling.
Rendering, charting, and routing libraries are deferred until the phase that
proves they are needed.

Vite development and preview hosts are explicitly loopback-only. The release
build will be static local assets served by the packaged launcher.

## Phase 1 onboarding boundary

The TypeScript shell owns route state, presentation-only range feedback,
accessible interaction, and rendering for Welcome, Track, Training Settings,
Review, Training, and Results. It cannot enter Training until a versioned
validation response from Python is valid and the user explicitly presses Start.
After Start, setup transitions and field mutations are rejected so the reviewed
configuration remains frozen.

Python owns the `contractVersion: 1` setup validator and the supported preset,
algorithm, and numeric-range rules. The browser submits the setup to
`POST /v1/setup/validate` on `127.0.0.1`; this endpoint validates only and never
creates or starts a run. The shared valid fixture under `contracts/` is consumed
by both TypeScript and Python tests.

## Phase 2 track boundary

`TrackV1` is the only canonical track representation. It stores schema version,
identity, road width, and ordered catalogue pieces; it does not persist
centerlines, boundaries, checkpoints, or spawn data. The Python track compiler
derives all of that geometry deterministically from the piece sequence.

The version 1 catalogue contains start/finish, short and long straights,
left/right 45-degree and 90-degree turns, left/right hairpins, and left/right
chicanes. Sequential compilation makes piece joins exact. The Python validator
then enforces one start/finish, supported pieces, corridor-width bounds, loop
position and heading closure, and a non-self-intersecting centerline. A fixed
start/finish length guarantees the derived spawn pose remains inside its
corridor, while checkpoints preserve canonical piece order.

Easy Oval, Technical Circuit, and Chicane Challenge are bundled as canonical
`TrackV1` values and pass through the same compiler used for future edited,
generated, and imported tracks. The loopback-only
`GET /v1/tracks/presets` contract returns their versioned compiled geometry.
TypeScript validates the response shape and draws the supplied centerline,
boundaries, and start line as SVG; it contains no track construction or
validation rules.

## Phase 3 track-authoring boundary

The browser editor owns only interaction history and the ordered `TrackV1`
piece list. Add, delete, undo, redo, reset, naming, and road-width controls are
presentation state. Validation and assisted closure are versioned commands to
the Python core; the browser never derives closure or geometry.

The version 1 Python generator uses deterministic SHA-256 candidate ranking and
a bounded constrained search of at most 200 candidates. Length selects exactly
12, 18, or 24 canonical pieces. Difficulty selects documented corridor widths.
Every candidate is accepted only by the existing Phase 2 compiler.

Track import first parses the JSON document shape in the browser, then requires
Python validation before selection. Export writes only canonical `TrackV1`
data. Python saves validated records atomically under the local `tracks`
directory using hashed filenames, reloads each record through the compiler, and
isolates unreadable or invalid records so one corrupt file cannot block the
library.

The loopback service exposes versioned compile, closure-assist, generation, and
library commands. Preset, edited, generated, imported, and reloaded tracks
therefore converge on `compile_track_payload`; no TypeScript track-domain path
exists.

## Phase 4 simulation boundary

`python/src/evo_racer/simulation.py` owns the complete fixed-step evaluator.
`VehicleState` stays limited to position, heading, forward and lateral speed,
and steering. `Controls` are continuous and clamped only to the documented
steering, throttle, and brake ranges. The evaluator rejects any time step other
than `1/60 s`.

The handling model is intentionally arcade-style. It applies throttle, braking,
quadratic drag, speed-dependent steering, lateral-force accumulation, and
grip-based recovery. Front-heavy drive/braking applies small understeer
multipliers; rear-heavy drive/braking increases lateral slip. The two bias
values retain their full `[0,1]` domain. Vehicle setup is a frozen value object,
and the evaluator snapshots and checks controller parameters at every step.

Collision sweeps the vehicle disc between the previous and candidate positions
against the centerline corridor. Progress projects the vehicle onto the closed
centerline, and seven sensors intersect rays with the left/right boundaries
already derived by the canonical track compiler. No duplicate track geometry is
persisted or constructed in TypeScript.

The seeded random-network and Pure Pursuit baselines implement the same
controller protocol and run through the same evaluator. Pure Pursuit follows
the lookahead-point approach documented in R. Craig Coulter's
[CMU technical report](https://publications.ri.cmu.edu/implementation-of-the-pure-pursuit-path-tracking-algorithm);
its speed-scaled lookahead and corner-speed policy are local arcade tuning, not
a simulation-grade vehicle model.

`POST /v1/simulation/preview` runs a bounded baseline preview after the explicit
Start action and returns version 1 selected-car telemetry. TypeScript validates
and renders that snapshot only. Telemetry sampling frequency is an observer
concern and cannot alter fixed physics results.

## Python foundation

Python targets exactly the 3.13 release line. The package uses a `src` layout
under `python/src/evo_racer`. It is the future home of the application and
simulation core as well as evolution. Phase 0 uses only the Python standard
library at runtime; pytest, Ruff, mypy, and setuptools are pinned
development/build tools. Future `neat-python` introduction belongs to the NEAT
phase and requires a fresh compatibility review.

## Dependencies and reproducibility

- Direct JavaScript development dependencies are exact versions and the full
  graph is locked by `package-lock.json`.
- Python development tools and their transitive dependencies are exact versions
  in `requirements-dev.lock`.
- `scripts/setup.ps1` creates the Python virtual environment, installs the locked
  Python toolchain, installs the local package, and uses `npm ci`.
- TypeScript remains within the typescript-eslint supported range; it must not be
  upgraded independently.

## Local data and release direction

User-owned data will live under `%LOCALAPPDATA%\EvoRacerAILab` and use versioned,
atomic files. The release phase will package the built frontend and Python
runtime with PyInstaller `onedir`, then produce a self-contained Windows x64 ZIP.
No release claim is made until the clean-machine and network-disabled gates pass.
