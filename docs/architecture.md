# EvoRacer Architecture Decisions

## Status

These decisions define the Phase 0 foundation. Product-level constraints remain
authoritative in the repository product contract.

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

The Phase 0 shell uses Vite, TypeScript, HTML, and CSS without a UI framework.
TypeScript stays deliberately thin: it renders local data, captures UI-only
input, and calls the Python core. This keeps the initial dependency surface
small while preserving typed browser modules and production bundling.
Rendering, charting, and routing libraries are deferred until the phase that
proves they are needed.

Vite development and preview hosts are explicitly loopback-only. The release
build will be static local assets served by the packaged launcher.

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
