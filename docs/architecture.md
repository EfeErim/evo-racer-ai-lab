# EvoRacer Architecture Decisions

## Status

These decisions define the foundation, Phase 1 onboarding shell, and Phase 2
track core.
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
