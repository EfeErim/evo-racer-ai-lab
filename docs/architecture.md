# EvoRacer Architecture

## Runtime boundary

```text
TypeScript browser UI and renderer
        |  versioned JSON commands and observation snapshots, 127.0.0.1 only
Python application, simulation and evolution core
```

Python owns tracks, geometry, validation, physics, sensors, controllers, fitness,
baselines, Fixed GA, NEAT, persistence and the process lifecycle. TypeScript owns UI
state, rendering, charts and the IPC client, and never re-decides a domain rule: at the
boundary `src/contracts.ts` and `src/ipc.ts` check only the envelope (contract versions,
collections, validity against the error list), and Python does the nested validation.
Fixtures under `contracts/` are read by both test suites, so a contract change breaks
both sides.

The service is the standard-library HTTP server bound to `127.0.0.1`; its one runtime
dependency is `neat-python 2.0.0`. Training never starts by itself: Python validates the
setup (`POST /v1/setup/validate` never creates a run) and the user presses Start, after
which the settings are frozen.

## Tracks

`TrackV1` (schema version, identity, road width, ordered pieces) is the only stored
track form. Centerline, walls, checkpoints and spawn poses are always recompiled from the
pieces by `compile_track_payload`, for presets, edits, generated, imported and reloaded
tracks alike. The browser editor holds only the piece list and undo history.

Generator version 5 pairs two seeded half laps that differ in at least two pieces, ranks
candidates by SHA-256 and gives up after 200. Changing the generator changes which track a
seed produces, so the version is part of the output.

## Simulation and evolution

`simulation.py` is the single evaluator, at a fixed `1/60 s` step. Fixed GA
(`evolution.py`) and NEAT (`neat_evolution.py`) both score candidates through
`RunSession._evaluate_live`, so they share physics, sensors, termination and fitness.
Vehicle genes ride on the genome (for NEAT, a subclass of the library genome) and change
only while offspring are created. Tournament selection follows
[Miller and Goldberg](https://www.complex-systems.com/abstracts/v09_i03_a02/); the NEAT
config follows the
[neat-python v2.0.0 feed-forward example](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/examples/xor/config-feedforward);
Pure Pursuit follows
[Coulter's CMU report](https://publications.ri.cmu.edu/implementation-of-the-pure-pursuit-path-tracking-algorithm),
with local lookahead and speed tuning.

Saved results record `simulationContractVersion`. A run resumes or compares only against
runs recorded under the current physics revision.

## Run lifecycle and observation

`observer.py` holds a deterministic `RunSession` with no threads and no file writes.
`run_manager.py` gives each started or resumed run one worker that advances and saves a
generation at a time until the run pauses, stops, completes, is deleted or the app exits.
Observe only reads a snapshot, so how often the browser polls cannot change a result.
Pause and stop apply at the end of the current generation.

When a generation finishes, Python sends its top 12 cars' poses (one every three physics
steps) once, as a transient `generationRace`; the browser acknowledges the race it holds
and plays it on one long-lived canvas, interpolating between poses for display only. The
browser polls every 250 ms while visible and 1000 ms while hidden. A `RequestGate` per
request kind (`src/request-gate.ts`) drops a response when a newer request of that kind
has started or the user has left the page that asked.

## Persistence

Each run is one file, `%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`: the
embedded track, frozen settings and one checkpoint at a generation boundary with a
SHA-256 of its snapshot. Writes go to a temporary file, are `fsync`ed and replace the
record with `os.replace`. No Python or neat-python objects are stored; Resume replays the
completed generations from the seed and refuses the run if the result differs from the
checkpoint. The library validates each record on its own and isolates corrupt ones.

## Package

`evo_racer.launcher` serves the API and the built UI from one origin on
`127.0.0.1:8765` and opens the browser; a second launch opens the running instance. The
service answers only requests whose `Host` is this loopback port and whose `Origin`, if
any, is this origin; `npm run dev` reaches it through a Vite proxy. Warnings and
failures go to `%LOCALAPPDATA%\EvoRacerAILab\logs\evoracer.log` (1 MB, two backups). The
release is a PyInstaller `onedir` build kept at `release\EvoRacer` and zipped with a
checksum, the user guide, third-party notices and licenses.

## Verification

- `npm run check`: Prettier, ESLint, Ruff, mypy, Vitest, pytest and the production
  build. pytest includes `test_regression_matrix.py`, which reruns 18 small cases and
  requires the result hashes in `docs/experiments/data/regression-matrix-v2.json`.
- `npm run test:e2e`: Playwright flows, with an axe scan, against the built UI and the
  real Python service.
- CI runs both on Windows. `npm run test:learning`, `npm run build:release` and
  `npm run test:release` run locally.
