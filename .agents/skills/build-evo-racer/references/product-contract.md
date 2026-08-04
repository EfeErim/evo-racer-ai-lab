# EvoRacer Product Contract

## Product boundary

- Deliver a Windows x64 application that runs completely on the user's computer.
- Package every runtime dependency; installation of Node.js or Python is forbidden.
- Permit loopback-only IPC on `127.0.0.1`; forbid every non-loopback runtime connection.
- Do not include CDN assets, telemetry, analytics, accounts, update checks, remote models, or downloads.
- Store tracks, settings, runs, checkpoints, and replays locally.
- Provide `EvoRacer.exe` at the root of the application folder as the primary
  and sufficient user entry point. Local release builds must keep the complete
  runnable `release\EvoRacer` folder outside the distribution ZIP.

## User experience

- Use English product copy.
- Open on Welcome/Setup and never auto-start a race or training run.
- Offer a recommended `Easy Oval + Quick start` path from Welcome directly to
  Review, plus the full
  `Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results`
  customization flow.
- Explain parameters in plain language, show safe validation, and keep the saved
  run library, custom-track tools, and exact training controls collapsed by
  default.
- Let the user pause, resume, stop, inspect telemetry, replay a champion, and compare results.
- Show completed-generation and active-candidate progress during training. Make
  generation-boundary control behavior and queued pause/stop commands explicit.
- When a run becomes terminal, surface its Results action with the completion
  status instead of requiring a page-length scroll through telemetry.
- While training, render the currently evaluated Python candidate moving on the
  Python-compiled track from versioned position and heading telemetry.
- After the first completed generation, continuously render the latest Python
  generation-champion replay. Browser interpolation may fill presentation frames
  only; it must not predict, advance, or otherwise alter the Python simulation.
- Provide no vehicle-driving controls. Pointer and keyboard interaction are UI-only.
- Freeze run configuration after Start. Visualization-only controls may not alter simulation outcomes.

## Tracks

Support three sources through one canonical `TrackV1` contract:

1. Presets: Easy Oval, Technical Circuit, Chicane Challenge.
2. Modular editor.
3. Deterministic seed generator.

Use these segment families:

- Start/finish
- Short and long straight
- 45-degree left/right
- 90-degree left/right
- Hairpin left/right
- Chicane left/right

Persist only canonical piece data. Derive centerline, boundaries, checkpoints,
spawn pose, and sensor geometry through one Python compiler.

Validate one start/finish, connectivity, loop closure, self-intersection, minimum corridor width, spawn safety, and checkpoint order for every track source and import.

Generator controls:

- Seed
- Length: Short 12, Medium 18, Long 24 target segments
- Difficulty: Easy, Technical, Hard

Use seeded constrained search/backtracking with at most 200 candidates. The same seed, settings, and generator version must produce the same track.

## Arcade physics

Keep the state minimal:

```text
x, y, heading
forwardSpeed
lateralSpeed
steering
```

Run physics at a fixed `1/60 s` step. Model throttle, braking, speed-dependent steering, lateral velocity, grip recovery, drag, and swept boundary collision. Do not add Pacejka tires, per-wheel simulation, suspension, gearing, temperature, damage, weight transfer, or vehicle-to-vehicle collision.

Controller outputs remain continuous:

```text
steering [-1,1]
throttle [0,1]
brake    [0,1]
```

Apply brake and drive force distribution:

```text
frontBrake = totalBrake * frontBrakeBias
rearBrake  = totalBrake * (1 - frontBrakeBias)
frontDrive = totalDrive * frontDriveBias
rearDrive  = totalDrive * (1 - frontDriveBias)
```

Represent front-heavy throttle/braking as understeer and rear-heavy throttle/braking as increased lateral slip using small, documented handling multipliers. Keep this an arcade approximation.

## Evolution contract

Every candidate owns a controller genome plus these vehicle genes:

```text
speedAllocation
accelerationAllocation
brakeAllocation
steeringAllocation
gripAllocation
frontBrakeBias
frontDriveBias
```

Normalize the first five allocation logits with softmax so the performance budget sums to `1.0`. Map them as:

```text
maxSpeed        = 22 + 18 * speedAllocation
acceleration    =  4 +  8 * accelerationAllocation
brakeStrength   =  7 + 11 * brakeAllocation
steeringAgility = 0.7 + 1.1 * steeringAllocation
gripRecovery    =  2 +  6 * gripAllocation
```

Keep both bias genes continuous across their full `[0,1]` domain.

During an episode:

- Freeze the controller genome, network topology/weights, and all vehicle genes.
- Change only steering, throttle, and brake outputs.
- Create changed setup values only through selection, crossover, and mutation for the next generation.
- Preserve elite candidates exactly.

Offer Fixed GA and feed-forward NEAT as selectable algorithms. Use Python for
population evolution, controller execution, and episode evaluation. Compile
networks into a versioned runtime-neutral representation consumed by the
canonical Python evaluator.

Use identical physics, sensors, episode termination, and fitness for both algorithms. Use random-network and Pure Pursuit baselines with the champion's vehicle parameters when comparing controllers.

## Runtime responsibility boundary

Keep product and simulation rules in Python unless they inherently require the
browser:

- Python owns tracks, generated geometry, validation, seeded generation,
  physics, sensors, controller execution, evaluation, fitness, baselines,
  evolution, persistence, and the local service.
- TypeScript owns browser UI state, interaction, rendering, charts, and the
  versioned IPC client.
- TypeScript may perform presentation-only checks for immediate feedback, but
  Python remains the final authority and the UI must display its stable error
  codes.
- Exchange batched commands and observation snapshots over versioned JSON on
  `127.0.0.1`. Rendering frequency may not drive or alter the fixed simulation
  step.
- Run generation evaluation independently of browser polling. Publish
  in-generation candidate identity, position, heading, controls, sensors, and
  progress without letting UI cadence select or advance a physics step.
- The browser may acknowledge the generation-replay candidate it already holds.
  Python may omit only that unchanged transient replay from a later observation;
  the browser must retain it only for the same run and replace it when Python
  publishes a different candidate. A missing acknowledged replay is a transport
  delta, not an instruction to erase the visible replay.
- Retain sampled paths from the seven prior
  Python generation-champion replays and draw them behind the current replay.
  Fade older paths, label the overlay as presentation history, bound every path
  to 64 recorded points, persist at most eight paths in the atomic run document,
  and restore only paths matching that run. Do not infer motion or let the trail
  affect simulation or evolution.
- Poll observations at `250 ms` while the document is visible and at `1000 ms`
  while it is hidden, with an immediate observation when visibility returns.
  Visibility may change presentation traffic only; it may not pause, accelerate,
  select, or otherwise alter Python evaluation.

## Persistence and release

Use versioned local files under:

```text
%LOCALAPPDATA%\EvoRacerAILab\
  settings.json
  tracks\
  runs\<run-id>\
```

Use atomic writes and isolate corrupt records. Support track JSON import/export and resumable evolutionary checkpoints.

Build the frontend locally and distribute a PyInstaller `onedir` Windows x64
application with local static assets and `EvoRacer.exe` at the application
folder root. Keep the runnable folder at `release\EvoRacer`; produce
`EvoRacer-Windows-x64.zip` and its checksum only as parallel distribution
artifacts. The EXE and its adjacent bundled runtime must require no installed
Python, Node.js, command script, network download, or non-loopback connection.
