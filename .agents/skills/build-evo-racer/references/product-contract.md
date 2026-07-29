# EvoRacer Product Contract

## Product boundary

- Deliver a Windows x64 application that runs completely on the user's computer.
- Package every runtime dependency; installation of Node.js or Python is forbidden.
- Permit loopback-only IPC on `127.0.0.1`; forbid every non-loopback runtime connection.
- Do not include CDN assets, telemetry, analytics, accounts, update checks, remote models, or downloads.
- Store tracks, settings, runs, checkpoints, and replays locally.

## User experience

- Use English product copy.
- Open on Welcome/Setup and never auto-start a race or training run.
- Use the flow `Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results`.
- Explain parameters in plain language, show safe validation, and keep advanced controls collapsed by default.
- Let the user pause, resume, stop, inspect telemetry, replay a champion, and compare results.
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

## Persistence and release

Use versioned local files under:

```text
%LOCALAPPDATA%\EvoRacerAILab\
  settings.json
  tracks\
  runs\<run-id>\
```

Use atomic writes and isolate corrupt records. Support track JSON import/export and resumable evolutionary checkpoints.

Build the frontend locally, bundle the Python core/launcher and all static assets
with PyInstaller `onedir`, and distribute `EvoRacer-Windows-x64.zip` plus
SHA-256 checksum.
