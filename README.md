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

## Development setup

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

## Offline onboarding shell

Phase 1 provides the complete local shell flow:

```text
Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results
```

- Welcome explains the offline, observer-only workflow and requires an explicit
  setup action.
- Track and training presets provide a safe first-use path.
- Settings include visible parameter help, bounded inputs, and advanced controls
  collapsed by default.
- Review calls the Python-owned versioned validation contract over
  `127.0.0.1`. Start remains locked until the response is valid.
- Start is the only action that enters Training. It freezes the reviewed
  configuration, and the shell exposes no vehicle-driving controls.
- Training and Results are honest shell states; simulation, evolution, and
  result analysis connect in their later phases.

## Track core and bundled presets

Phase 2 provides a Python-owned `TrackV1` schema and deterministic compiler:

- Canonical files contain only ordered catalogue pieces and track metadata.
- Python derives the centerline, road boundaries, checkpoints, and spawn pose,
  then validates closure and self-intersection with stable error codes.
- Easy Oval, Technical Circuit, and Chicane Challenge use the same compiler
  path that later editor, generator, and import features will use.
- The Track screen requests versioned compiled geometry from the loopback core.
  TypeScript only renders that Python output as local SVG.

The shared Phase 2 fixtures under `contracts/` are verified from both Python and
TypeScript.

## Editor, generator, and local track library

Phase 3 extends the same `TrackV1` path without moving domain rules into the
browser:

- The sequential TypeScript editor changes only ordered canonical pieces and
  provides delete, undo, redo, reset, and Python-assisted closure actions.
- The Python generator accepts seed, Short/Medium/Long length, and
  Easy/Technical/Hard difficulty. Its versioned bounded search evaluates at
  most 200 candidates and returns deterministic canonical JSON.
- Edited, generated, imported, and saved tracks all pass through the Phase 2
  Python validator and compiler before the UI can select them.
- Version 1 track JSON can be imported and exported locally. Saved tracks use
  atomic files under `%LOCALAPPDATA%\EvoRacerAILab\tracks`; unreadable records
  are isolated from the valid library.

The shared Phase 3 TrackV1 document under `contracts/` is checked from both
runtimes.

## Repository layout

```text
contracts/                   Shared versioned TypeScript/Python fixtures
src/                         TypeScript browser UI state, views, and IPC client
tests/                       TypeScript tests
python/src/evo_racer/        Authoritative Python application/simulation core
python/tests/                Python tests
scripts/                     Windows setup, development, and gate scripts
docs/architecture.md         Locked architecture decisions
docs/verification/           Saved milestone verification evidence
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
