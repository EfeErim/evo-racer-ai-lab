# EvoRacer AI Lab

EvoRacer AI Lab is an offline Windows application for observing neuroevolution
learn to race on user-built tracks. The user designs or selects a track,
configures an experiment, reviews the settings, and explicitly starts training.
The user never drives a vehicle.

## Product boundary

- Runs entirely on the user's Windows x64 computer.
- Makes no runtime calls to remote APIs, CDNs, telemetry, analytics, update
  services, model downloads, or remote assets.
- Uses only `127.0.0.1` for local frontend-to-Python communication.
- Stores settings, tracks, runs, checkpoints, and replays under
  `%LOCALAPPDATA%\EvoRacerAILab`.
- Ships as a self-contained ZIP in the release phase; users will not need Node.js
  or Python.
- Never starts training automatically. Start remains a deliberate user action
  after track and settings validation.

## Planned experience

The locked user flow is:

```text
Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results
```

The application will support:

- Three bundled preset tracks, a modular track editor, and a deterministic seeded
  track generator.
- Fixed-step arcade vehicle physics with continuous steering, throttle, and brake
  controller outputs.
- Fixed-topology genetic algorithm and feed-forward NEAT training.
- Live observation, pause/resume/stop, telemetry, champion replay, and run
  comparison.
- Versioned, local-only tracks, runs, checkpoints, and exports.

The application intentionally excludes human vehicle controls, multiplayer,
accounts, 3D graphics, simulation-grade vehicle dynamics, and non-loopback
runtime networking.

## Phase 0 development setup

Development requires:

- Node.js `24.x` (the repository records `24.13.0` in `.nvmrc`)
- npm `11.9.0`
- Python `3.13`
- PowerShell on Windows

From the repository root:

```powershell
./scripts/setup.ps1
npm run dev
```

`npm run dev` starts the Python service on `127.0.0.1:8765`, starts the Vite
frontend on `127.0.0.1:5173`, and opens the local frontend. Press `Ctrl+C` to stop
both processes.

Run all foundation checks:

```powershell
npm run check
npm run smoke:m0
```

The smoke command starts both local processes, verifies their loopback endpoints,
and shuts them down.

## Repository layout

```text
src/                         Minimal TypeScript browser UI and IPC client
tests/                       TypeScript tests
python/src/evo_racer/        Authoritative Python application/simulation core
python/tests/                Python tests
scripts/                     Windows setup, development, and gate scripts
docs/architecture.md         Locked architecture decisions
```

Python is authoritative for tracks, simulation, sensors, controller execution,
episode evaluation, fitness, baselines, evolution, persistence, and the local
service. TypeScript is intentionally limited to browser UI state, interaction,
rendering, charts, and the IPC client. The runtimes exchange versioned JSON
contracts; domain rules are not duplicated in TypeScript.

## Current status

Phase and gate evidence are tracked in [`PROJECT_STATE.md`](PROJECT_STATE.md).
The durable product rules are in
[`product-contract.md`](.agents/skills/build-evo-racer/references/product-contract.md).
