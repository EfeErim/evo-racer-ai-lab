# EvoRacer Architecture Decisions

## Status

These decisions define the foundation, onboarding shell, track core, Phase 3
track-authoring boundary, Phase 4 simulation evaluator, Phase 5 Fixed GA,
Phase 6 feed-forward NEAT, and Phase 7 observer/results flow. Product-level
constraints remain authoritative in the repository product contract.

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

## Phase 5 Fixed GA boundary

`python/src/evo_racer/evolution.py` owns the complete Fixed GA lifecycle. Its
runtime-neutral version 1 network representation fixes 10 normalized observation
inputs, one six-node `tanh` hidden layer, and three continuous control outputs.
The canonical Python controller executes this representation through the
unchanged Phase 4 `evaluate_episode` path.

Every immutable `FixedGenome` combines the network with five vehicle performance
logits and two bias genes. A numerically stable softmax makes the five
allocations sum to `1.0`, and the resulting setup follows the exact ranges in
the product contract. Both bias genes retain the full `[0,1]` domain.

Each run owns one seeded `random.Random` instance and evaluates candidates in a
stable order. Tournament selection, uniform crossover, and bounded Gaussian
mutation create only the next generation. Ranked elites occupy the first next-
generation slots with their exact immutable genomes; no episode can mutate a
controller or vehicle setup. The isolated-generator choice follows Python
3.13's [reproducibility guidance](https://docs.python.org/3.13/library/random.html#notes-on-reproducibility),
while tournament selection follows the convergence model studied by
[Miller and Goldberg](https://www.complex-systems.com/abstracts/v09_i03_a02/).

Fitness uses net forward progress already produced by the Phase 4 evaluator.
Speed, survival time, and repeated local motion receive no reward. A completion
and efficiency bonus is available only after a full lap, and collisions are
penalized. Versioned generation reports preserve per-candidate audit fields and
summary statistics without moving scoring logic into TypeScript.

## Phase 6 NEAT boundary

`python/src/evo_racer/neat_evolution.py` is the only neat-python integration
boundary. The project pins `neat-python 2.0.0`, requires its explicit
feed-forward configuration, and fails closed if another dependency version is
loaded. The bundled INI declares 10 inputs, three outputs, no recurrent
connections, exact mutation/speciation settings, and no fitness-based early
termination for bounded runs.

`EvoRacerGenome` subclasses the library genome and carries the same immutable
`VehicleGenome` value used by Fixed GA. New population members initialize all
seven vehicle genes. Reproduction crosses those values with their parents and
applies bounded mutation only from the genome hooks that neat-python calls while
creating offspring. Elites retain their original objects. The evaluator checks
that the source genome's vehicle value is unchanged across each candidate
episode.

The NEAT compiler converts enabled feed-forward topology into a version 1 DAG
of ordered nodes and weighted links. Only `identity` output nodes, `tanh` hidden
nodes, and `sum` aggregation are accepted. `NEATController` consumes that
runtime-neutral value and the same normalized observation features as Fixed GA.
Both algorithms then call `evaluate_candidate`, which owns the single Phase 4
physics and Phase 5 fitness path.

Checkpointing uses the pinned library's generation-boundary `Checkpointer`.
Version 2.0 stores the population, species, innovation tracker, generation, and
Python random state for the next generation to evaluate. Restore supplies the
current explicit config and continues from that saved state. Durable application
run persistence, checkpoint discovery, and corrupt-record isolation use the
Phase 8 run-file boundary below.

## Phase 7 observer and results boundary

`python/src/evo_racer/observer.py` owns run identity, frozen configuration,
algorithm state, generation advancement, observation snapshots, terminal
metadata, baseline evaluation, replay recording, and generation-boundary
persistence.

The browser sends explicit version 1 start, observe, pause, resume, and stop
commands. One observe command advances exactly one complete generation through
the existing Fixed GA or NEAT lifecycle. Pause and resume change only whether a
later batch may start. They do not alter the seeded generator, fixed `1/60 s`
physics steps, controller ordering, or result sequence. Rendering never
supplies a simulation delta or step count.

Every observation snapshot contains run status, generation counters, the latest
Python generation report, fitness history, and selected-car telemetry. Terminal
results add metadata that identifies the run id, algorithm, seed, canonical
track hash, population, requested and completed generations, episode duration,
fixed time step, and all participating contract versions.

Python re-evaluates the immutable best candidate to record replay frames at a
fixed six-step sampling interval. Each frame carries position, heading, motion,
controls, and progress; the replay also carries the unchanged controller
parameters and vehicle setup. The seeded random network and Pure Pursuit
baselines run on the same track, episode limit, physics, fitness, and champion
vehicle setup.

TypeScript parses and renders these values only. It owns the live status view,
pause/resume/stop buttons, SVG fitness chart, comparison tables, and replay
frame navigation. The replay marker is placed on geometry already returned by
the Python track compiler; no browser physics, scoring, or track construction
is introduced.

## Phase 8 persistence and recovery boundary

Python owns `RunV1`, stored as
`%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`. The envelope contains
`schemaVersion: 1`, an embedded canonical TrackV1 document and explicit track
schema version, the frozen algorithm settings, and one observation checkpoint.
The checkpoint records only a complete generation boundary and includes a
SHA-256 of its canonical JSON snapshot.

Every Start, Observe, Pause, Resume, Stop, and terminal transition writes a
temporary UTF-8 JSON file in the destination run directory, flushes and
`fsync`s it, closes it, then uses `os.replace` to atomically replace `run.json`.
This follows the Python 3.13 standard-library contracts for
[`NamedTemporaryFile`](https://docs.python.org/3.13/library/tempfile.html#tempfile.NamedTemporaryFile),
[`os.fsync`](https://docs.python.org/3.13/library/os.html#os.fsync), and
[`os.replace`](https://docs.python.org/3.13/library/os.html#os.replace).
Serialization uses one complete JSON value with sorted keys and rejects
non-finite numbers, consistent with the
[`json` module](https://docs.python.org/3.13/library/json.html).

Service startup does not resume training. The run library validates each record
independently and reports corrupt directories separately. An explicit Resume
request reconstructs Fixed GA or NEAT from the saved TrackV1, settings, seed,
and completed generation count. Python replays those complete deterministic
batches, compares the reconstructed checkpoint while ignoring only the
interruption status, and fails closed on drift before marking the run active.
This replay-based version 1 format avoids serializing live Python or
neat-python objects and keeps the file portable and inspectable.

The loopback API exposes list, explicit resume, JSON export, and exact-record
delete operations. TypeScript renders those Python values and initiates user
actions; it does not validate tracks, reconstruct evolution state, or decide
whether a checkpoint is resumable.

## Python foundation

Python targets exactly the 3.13 release line. The package uses a `src` layout
under `python/src/evo_racer` and owns the application, simulation, and evolution
core. Phase 6 introduces the exact runtime dependency `neat-python 2.0.0`; its
[PyPI metadata](https://pypi.org/project/neat-python/2.0.0/) declares Python
`>=3.8` and no runtime dependencies. Its bundled feed-forward config follows the
[official v2.0.0 example](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/examples/xor/config-feedforward),
and the custom genome and resume design follow the tagged
[genome](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/genome.py),
[reproduction](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/reproduction.py),
and
[checkpoint](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/neat/checkpoint.py)
implementations.

## Dependencies and reproducibility

- Direct JavaScript development dependencies are exact versions and the full
  graph is locked by `package-lock.json`.
- Python runtime and development dependencies are exact versions in
  `requirements-dev.lock`; neat-python adds no transitive runtime package.
- `scripts/setup.ps1` creates the Python virtual environment, installs the locked
  Python toolchain, installs the local package, and uses `npm ci`.
- TypeScript remains within the typescript-eslint supported range; it must not be
  upgraded independently.

## Phase 9 Windows offline package

The production entrypoint is `evo_racer.launcher`. It creates the same
`ThreadingHTTPServer` used by development, always binds the socket to
`127.0.0.1`, serves both versioned JSON contracts and immutable Vite assets on
port `8765`, then opens that loopback URL in the user's default browser. Static
paths are resolved under one fixed bundle root, path traversal is rejected, and
responses include a restrictive same-origin content security policy.

The browser's Exit action calls a same-origin shutdown endpoint. The handler
sends its final JSON response before a separate thread calls
`server.shutdown()`, allowing `serve_forever()` to return and
`server.server_close()` to release the loopback socket. Process signals use the
same asynchronous shutdown path.

PyInstaller `6.21.0` creates a Windows `onedir` bundle from
`packaging/EvoRacer.spec`. This follows the official
[onedir usage contract](https://pyinstaller.org/en/stable/usage.html) and keeps
the built frontend and NEAT configuration as bundled data located relative to
the frozen entrypoint, following PyInstaller's
[runtime data-file guidance](https://pyinstaller.org/en/stable/runtime-information.html).
The release script adds user-facing notices and complete Python/PyInstaller
license texts, archives the full `EvoRacer` directory as
`EvoRacer-Windows-x64.zip`, and writes its SHA-256 checksum separately.

Release acceptance extracts the ZIP into a fresh directory, gives the packaged
process only the Windows system directory on `PATH`, removes Python environment
variables, and supplies unreachable outbound proxy endpoints while exempting
loopback. It starts, saves, shuts down, restarts, restores, completes, and
replays one run. A process connection audit rejects non-loopback sockets and
rejects any child Node.js or Python process.

User-owned data remains under `%LOCALAPPDATA%\EvoRacerAILab` and uses the
versioned, atomic files defined in Phase 8.
