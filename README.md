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
- Training starts a Python-owned evolutionary run only after Start and consumes
  versioned generation and selected-car observation snapshots. Browser cadence
  changes only when snapshots are requested; it never supplies physics steps.

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

## Physics, sensors, and baselines

Phase 4 adds the deterministic Python evaluator shared by future algorithms:

- Arcade physics advances only at `1/60 s` and models continuous control,
  speed-dependent steering, lateral slip and grip recovery, drag, and documented
  front/rear drive and brake bias effects.
- Swept collision checks and seven road-edge rays consume geometry derived by
  the existing Python track compiler. Progress is measured along the same closed
  centerline.
- Episode setup and controller parameters are fixed; only steering, throttle,
  and brake outputs change during an episode.
- Seeded random-network and Pure Pursuit baselines use the same physics,
  sensors, progress, termination, and telemetry path.
- The browser consumes version 1 selected-car telemetry from
  `POST /v1/simulation/preview`; it does not reproduce simulation rules.

The shared Phase 4 telemetry fixture under `contracts/` is checked from both
runtimes.

## Fixed-topology genetic algorithm

Phase 5 adds the first Python-owned training algorithm without changing the
Phase 4 evaluator:

- A versioned `10 -> 6 -> 3` feed-forward network maps normalized telemetry to
  continuous steering, throttle, and brake controls.
- Each immutable genome contains the network parameters, five softmax-normalized
  vehicle performance-budget logits, and full-domain front brake/drive bias
  genes.
- An isolated seeded random generator drives deterministic initialization,
  tournament selection, uniform crossover, bounded Gaussian mutation, and exact
  elitism.
- Fitness rewards only net forward lap progress and verified completion
  efficiency. Raw speed, survival time, and repeated local motion earn nothing;
  collisions are penalized.
- Versioned generation reports retain every candidate's fitness, progress,
  completion, collision, and step results.

The shared Phase 5 fixed-genome fixture under `contracts/` is checked from both
Python and TypeScript. The browser test checks only the versioned presentation
shape; Python remains the sole network, vehicle-budget, fitness, and evolution
authority.

## Feed-forward NEAT

Phase 6 adds feed-forward NEAT through the pinned local `neat-python 2.0.0`
runtime dependency:

- `EvoRacerGenome` extends the library genome with the same five vehicle
  performance-budget logits and two full-domain bias genes used by Fixed GA.
- Controller topology, weights, and vehicle genes cross over or mutate only
  while NEAT creates the next generation. Evaluation receives frozen compiled
  networks and immutable vehicle values.
- Python compiles each evolved topology into a version 1 runtime-neutral
  feed-forward DAG. The canonical controller executes that representation
  without exposing neat-python objects to the evaluator or browser.
- Fixed GA and NEAT share observation normalization, Phase 4 physics, episode
  termination, and the Phase 5 fitness function.
- Seeded runs can save and restore neat-python checkpoints. Restoring a saved
  generation reproduces the same next-generation result sequence.

The shared Phase 6 NEAT fixture under `contracts/` is round-tripped by Python
and structurally checked by TypeScript. Checkpoint persistence and run-library
UX remain later-phase work.

## Observer experience and results

Phase 7 connects both algorithms to one Python-owned, generation-batched run
session:

- Start freezes the validated track and training settings. Each observation
  command advances one complete generation through the existing fixed-step
  evaluator, independent of browser render cadence.
- Pause and resume operate only between deterministic generation batches. Stop
  produces a terminal result after at least one completed generation.
- Training displays the live generation, best and median fitness, selected-car
  controls, progress, speed, and seven road-edge sensors.
- Results include complete versioned run metadata, fitness history, champion
  and identical-setup baseline comparisons, and a recorded champion replay.
- Replay frames contain Python-recorded position, heading, controls, progress,
  controller parameters, and the fixed vehicle setup. TypeScript only places
  those frames on Python-compiled track geometry.
- Completed runs can be compared from the durable local run library.

The shared Phase 7 observation fixture under `contracts/` is parsed by both
Python and TypeScript.

## Persistence and recovery

Phase 8 saves every run at a complete generation boundary under
`%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`:

- Python owns the version 1 run envelope, embedded TrackV1 document, frozen
  settings, observation checkpoint, and SHA-256 integrity value.
- Start, observe, pause, resume, stop, and completion replace `run.json`
  atomically only after a complete deterministic batch.
- The Welcome screen lists saved runs after a restart. Training never resumes
  automatically; the user must press Resume.
- Resume rebuilds the algorithm from the saved track, settings, seed, and
  completed generation count, then compares the reproduced checkpoint before
  allowing another generation.
- Corrupt or changed records are isolated without hiding valid tracks or runs.
  Valid runs can be exported as versioned JSON or deleted individually.

The shared Phase 8 run document under `contracts/` is validated by Python and
parsed structurally by TypeScript.

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
