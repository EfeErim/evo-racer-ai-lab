# EvoRacer Architecture

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

No component binds to a LAN or public interface or calls a non-loopback resource. The
Python service uses the standard-library HTTP server, hard-codes `127.0.0.1`, and has
one runtime dependency, `neat-python 2.0.0`.

## Responsibility split

- **Python** owns track schemas and compilation, generated geometry, validation, seeded
  generation, physics, sensors, controllers, episode termination, fitness, baselines,
  Fixed GA and NEAT, checkpointing, persistence, replay data, and process lifecycle.
- **TypeScript** owns UI state, interaction, rendering, charts, accessibility, and the
  versioned IPC client. It checks the shape of each response and displays Python's
  results and error codes; it never re-decides a domain rule.
- Messages carry explicit contract versions. Fixtures under `contracts/` are parsed by
  both test suites.
- `src/contracts.ts` holds the TypeScript contract types and their runtime parsers. The
  parsers are written by hand instead of with a schema library: the client stays free of
  runtime dependencies, and Vitest runs them against the same `contracts/*.json`
  fixtures that pytest checks are exactly what Python sends.
- Rendering cadence is independent of Python's fixed simulation step.

One canonical language for the computational parts keeps Fixed GA and NEAT on the same
evaluator, with no second physics implementation in the browser.

## Frontend

Vite, TypeScript, HTML and CSS, with no UI framework. Pages are Home, Set up (track,
training plan and Start on one page), the Track Builder, Race and Results. Renders patch
the existing DOM in place (`src/dom-patch.ts`) and actions are delegated from the root,
so a 250 ms observation never recreates the canvas, moves focus, or interrupts a
pointer press.

Training never starts by itself: Python must validate the setup
(`POST /v1/setup/validate`, which never creates a run) and the user must press Start.
After Start the configuration is frozen.

## Tracks

`TrackV1` is the only stored track representation: schema version, identity, road
width, and an ordered list of catalogue pieces (start/finish, straights, 45° and 90°
turns, hairpins, chicanes). Centerlines, boundaries, checkpoints and spawn poses are
never stored; the Python compiler derives them from the pieces. Validation requires one
start/finish, supported pieces, corridor-width bounds, position and heading closure,
and a non-self-intersecting centerline.

Presets, edited, generated, imported and reloaded tracks all go through
`compile_track_payload`. The browser editor owns only the piece list and undo history;
validation, open-draft previews and assisted closure are Python commands. Assisted
closure searches a bounded append-only suffix, then may roll back up to six trailing
pieces.

Generator version 5 samples seeded half laps, pairs two compatible halves that differ
in at least two pieces into an asymmetric circuit, ranks candidates by SHA-256, and
gives up after 200. Length selects 12, 18 or 24 pieces. Easy uses flowing corners only,
Technical requires chicanes, and Hard requires chicanes and hairpins. Every candidate
must pass the same compiler.

Saved tracks are written atomically under the local `tracks` directory and reloaded
through the compiler; an unreadable record is isolated instead of blocking the library.

## Simulation

`python/src/evo_racer/simulation.py` is the single fixed-step evaluator, at exactly
`1/60 s`. The model is arcade-style: throttle, braking, quadratic drag,
speed-dependent steering, a speed-dependent turn-rate limit, lateral slip and grip
recovery. Front- or rear-heavy drive and brake bias shift between understeer and slip;
both bias genes keep their full `[0,1]` range. Vehicle setup is frozen, and the
evaluator checks controller parameters at every step.

Collision sweeps the vehicle disc between steps against the centerline corridor.
Progress projects onto the closed centerline. Seven ray sensors intersect the
compiler's boundaries.

The seeded random-network and Pure Pursuit baselines use the same controller protocol
and evaluator. Pure Pursuit follows R. Craig Coulter's
[CMU technical report](https://publications.ri.cmu.edu/implementation-of-the-pure-pursuit-path-tracking-algorithm);
its lookahead and corner-speed policy are local tuning.

Saved results record the physics revision (`simulationContractVersion`). A run only
resumes or compares against runs recorded under the current revision.

## Evolution

**Fixed GA** (`evolution.py`): a fixed `10 → 6 → 3` network (`tanh` hidden layer,
continuous outputs) plus seven vehicle genes: five performance logits turned into
allocations by a stable softmax, and two bias genes. Each run owns one seeded
`random.Random`, evaluates candidates in a stable order, and creates the next generation
by elitism, tournament selection
([Miller and Goldberg](https://www.complex-systems.com/abstracts/v09_i03_a02/)), uniform
crossover and bounded Gaussian mutation.

**NEAT** (`neat_evolution.py`) is the only neat-python integration. The bundled INI
declares a feed-forward network with 10 inputs and 3 outputs, following the
[official v2.0.0 example](https://github.com/CodeReclaimers/neat-python/blob/v2.0.0/examples/xor/config-feedforward).
`EvoRacerGenome` subclasses the library genome and carries the same vehicle genes,
crossed and mutated only in the hooks neat-python calls while creating offspring.
Enabled topology is compiled into an ordered DAG that `NEATController` runs on the same
observation features. `score_neat_generation` is the one place fitness is written back
to neat-python genomes. Saved runs never hold neat-python objects; a resumed run is
replayed from its seed (see [persistence](#persistence-and-recovery)).

Both algorithms score candidates through `RunSession._evaluate_live`: one
`evaluate_episode` call, then `episode_fitness`. Genome,
network and vehicle values never change during an episode. Fitness rewards net forward
progress; a completion and lap-time bonus applies only after a full lap, and collisions
are penalized.

## Observation and results

`observer.py` owns run identity, frozen settings, algorithm state, generation
advancement, snapshots, baselines, replays and persistence. The browser sends versioned
start, observe, pause, resume and stop commands. Pause and resume only decide whether a
later generation may start; they never change the seeded sequence.

A full episode evaluates in roughly 50–130 ms, far faster than real time, so Race shows
the most recently finished generation. The evaluator records a presentation-only pose
every three physics steps. When a generation finishes, Python sends its top 12 cars as
a transient `generationRace`; the browser acknowledges what it holds, so each race
crosses loopback once. The browser plays races at `1x`, `2x` or `4x` on one long-lived
`<canvas>`, joining poses with cubic Hermite curves. Interpolation is visual only and
nothing predicted is sent back.

Python also keeps the last eight champion paths (at most 64 points each) in the
checkpoint. Observation polls every 250 ms while visible and 1000 ms while hidden, one
request at a time; training runs at full speed either way.

Results replays the champion and compares it with the random-network and Pure Pursuit
baselines on the same track, budget and vehicle setup. `racing_line.py` builds a
minimum-curvature reference line from the centerline and reports how far the champion's
path deviates from it. It is a geometric reference, not a lap-time optimum.

## Persistence and recovery

Each run is one file, `%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`: the
embedded `TrackV1`, frozen settings, and one checkpoint at a complete generation
boundary with a SHA-256 of its snapshot. Every transition writes a temporary file,
`fsync`s it and replaces `run.json` with `os.replace`. JSON uses sorted keys and rejects
non-finite numbers.

Startup never resumes training. The library validates each record independently and
isolates corrupt ones. An explicit Resume rebuilds the run from its track, settings and
seed, replays the completed generations deterministically, and fails if the result
differs from the checkpoint. Nothing stores live Python or neat-python objects, so the
file stays portable and inspectable.

## Windows offline package

The entry point is `evo_racer.launcher`. It binds the same server to `127.0.0.1:8765`,
serves the API and the built Vite assets from one fixed root (path traversal is
rejected, responses carry a same-origin content security policy), and opens the default
browser. A second launch opens the running instance. Exit calls a shutdown endpoint
that responds before the server stops and releases its socket.

The release is a PyInstaller `onedir` build: `EvoRacer.exe` plus its runtime directory,
kept at `release\EvoRacer` and zipped with a separate checksum. It includes the user
guide, third-party notices and the Python, neat-python and PyInstaller licenses.

`npm run test:release` extracts the ZIP, runs it with only the Windows system directory
on `PATH`, no Python variables and unreachable proxies, and then starts, saves, shuts
down, restarts, resumes and completes a run. It fails on any non-loopback socket or any
child Node.js or Python process.

## Dependencies

- JavaScript development dependencies are exact versions, locked by
  `package-lock.json`.
- Python dependencies are exact versions in `requirements-dev.lock`. `scripts/setup.ps1`
  creates `.venv`, installs that lock and the local package, and runs `npm ci`.
- TypeScript stays within the range typescript-eslint supports.

## Verification

`python/tools/regression_matrix.py` runs 18 small cases (three seeds, three presets, both
algorithms) through the public `RunSession` and pins their result hashes in
`contracts/regression-matrix-v2.json`. `python/tests/test_regression_matrix.py` reruns
them and requires exact equality; the TypeScript suite checks the same file's shape.
