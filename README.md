# EvoRacer AI Lab

[![CI](https://github.com/EfeErim/evo-racer-ai-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/EfeErim/evo-racer-ai-lab/actions/workflows/ci.yml)

A Windows desktop app for watching neuroevolution learn to drive. You pick or build a
track, choose a fixed-topology genetic algorithm (Fixed GA) or NEAT, press Start, and
watch each generation of cars race. You never drive. Everything runs offline; the only
network traffic is between the browser UI and a Python process on `127.0.0.1`.

Does it actually learn, or does keeping the best random car just look like learning? On
the saved benchmark, evolution beat a control that spends the same number of car
evaluations with no selection in `25 / 30` runs (3 tracks × 2 algorithms × 5 seeds),
and its champions finished `14 / 30` laps against `2 / 30` for the control. On seeds and
a track held out from physics tuning it beat the control in `84 / 96` pairs.

![Results screen after a Quick check run on Easy Oval](docs/media/results.png)

## Quickstart

Requires Windows, Python 3.13 (the `py` launcher), Node.js 24 and npm 11.

```powershell
./scripts/setup.ps1        # .venv from requirements-dev.lock, npm ci
npm run dev                # Python service on :8765, UI on http://127.0.0.1:5173
npm run check              # format, lint, types, 121 Vitest + 166 pytest tests, build
npm run test:learning      # rerun the 30-case benchmark and fail on any difference
```

On a clean clone and a 12-thread desktop CPU, `setup.ps1` took 45 s, `npm run check`
2 min 17 s, `npm run test:e2e` (31 Chromium flows) 1 min 43 s, and `npm run
test:learning` 3 min with one process per core.
[docs/demo.md](docs/demo.md) has the captured output.

`npm run build:release` produces a self-contained `release\EvoRacer\EvoRacer.exe` with
Python bundled; `npm run test:release` runs it with no Node.js or Python on `PATH`. The
latest published binary,
[v1.1.0](https://github.com/EfeErim/evo-racer-ai-lab/releases/tag/v1.1.0), predates the
Set up, Race and Results screens shown here. Builds are not code-signed.

## Results

All numbers come from saved JSON in `contracts/`. Each run trains and is scored on the
same track. A run is `16` cars × `10` generations × `30 s` episodes unless noted.

| Comparison                                             | Fixed GA  | NEAT      | Source                                                                        |
| ------------------------------------------------------ | --------- | --------- | ----------------------------------------------------------------------------- |
| Beat the same-budget control, development seeds        | `12 / 15` | `13 / 15` | `npm run test:learning`, `contracts/learning-benchmark-v2.json`               |
| Champion finished a lap, development seeds             | `5 / 15`  | `9 / 15`  | same                                                                          |
| Beat the same-budget control, held-out seeds and track | `41 / 48` | `43 / 48` | [physics v2: held-out matrix](docs/experiments/physics-v2.md#held-out-matrix) |
| Champion finished a lap, held-out seeds and track      | `23 / 48` | `32 / 48` | same                                                                          |
| Control finished a lap, held-out seeds and track       | `0 / 48`  | `13 / 48` | same                                                                          |

The control is `160` random cars in one generation for the benchmark: the same number of
evaluations, with no selection, crossover or mutation. Beating generation 1 alone is
nearly guaranteed by elitism, so it is not used as evidence. The held-out matrix adds a
second budget (`24 × 20`) and runs with the vehicle genes frozen, three seeds per cell.

What the numbers do not show:

- Transfer. Nothing is tested on a track it did not train on.
- That one algorithm is better in general. Three to five seeds per cell is too few.
- Corner braking. Evolved champions mostly hold a light constant brake that caps their
  speed; only `1` of `55` held-out finishers needed a brake that varies by corner
  ([analysis](docs/experiments/physics-v2.md#do-evolved-champions-actually-brake)).
- Chicane Challenge is mostly unsolved in `30 s`: `1 / 24` held-out evolved runs
  finished. The Thorough plan (`48 × 40 × 60 s`) finishes it.

The held-out matrix and other physics v2 studies were run with scripts that are no
longer in the tree; [their page](docs/experiments/physics-v2.md#reproduce) gives the
commit and command for each.

## How it works

```text
Browser UI (TypeScript, Vite, no framework)  ──JSON over 127.0.0.1──▶  Python core
  views, track editor, canvas rendering                                  tracks, physics, GA, NEAT,
                                                                          fitness, persistence
```

- A track is an ordered list of pieces (straights, 45° and 90° turns, hairpins,
  chicanes). Python compiles it into a centerline, walls and checkpoints and rejects
  tracks that do not close or that cross themselves.
- Physics runs at a fixed 60 Hz. Each car sees 7 ray sensors plus speed, sideways slip
  and heading error, and outputs continuous steering, throttle and brake.
- A genome is a network (a fixed `10 → 6 → 3` net for Fixed GA, an evolved feed-forward
  graph for NEAT via `neat-python 2.0.0`) plus seven vehicle genes: a power budget split
  five ways and front/rear brake and drive bias. Nothing changes during an episode.
- Fitness is `1200 × progress + 1000 if finished + 300 × unused share of the time limit
if finished − 75 per collision`.
- The UI polls a snapshot every 250 ms and replays the top 12 cars of each finished
  generation from poses Python recorded during training.

More in [architecture](docs/architecture.md).

## Design decisions

**Python owns every domain rule; TypeScript only renders.** Running physics in the
browser would remove the IPC layer, but then Fixed GA, NEAT (which needs `neat-python`)
and the UI would need two physics implementations that agree to the last bit. Instead the
two sides share versioned JSON fixtures in `contracts/` that both test suites read. For
the observation and telemetry messages, Python tests assert the fixture is exactly what
Python sends.

**Resume replays from the seed instead of pickling the population.** `neat-python` can
checkpoint a population with `pickle`, which ties saved runs to library internals and
cannot be checked. A saved run here holds no live Python objects: it keeps the track,
the settings, the seed and a SHA-256 of the checkpoint snapshot. Resume replays every
generation and refuses the run if the hash differs, so each resume is also a determinism check. The cost is that resuming
generation 30 re-runs 30 generations.

**Fitness pays for progress and finishing, nothing else.** Rewarding speed or survival
time invites cars that sit still at full throttle or scrape along a wall. With progress
capped at `1200` and a finish worth at least `2200`, any finisher outranks any
non-finisher, and among finishers the time bonus orders by lap time. Raising the time
weight 5 or 10 times changed no champion in any of `24` track, algorithm and seed
combinations
([lap-time weight](docs/experiments/physics-v2.md#lap-time-weight)).

**Learning is judged against the same budget without selection.** Comparing the last
generation with the first only shows that elitism keeps the best car. The benchmark
spends the same number of evaluations on random cars, and the reference driver (Pure
Pursuit) gets five tries at different caution levels on the champion's own car, which
favours the reference.

**Arcade physics with hand-tuned constants.** There is no tyre or suspension model.
Grip, understeer and slip are a handful of named coefficients in
`python/src/evo_racer/simulation.py`. A richer model would make runs slower and the
learned behaviour harder to explain on screen.

## Limitations

- Windows x64 only; `release\EvoRacer\EvoRacer.exe` is not signed.
- The production UI talks to a fixed port, `8765`.
- Results depend on seed, track and budget. The tables above are counts over three to
  five seeds, not population estimates.
- Evolution has not found corner-by-corner braking within the tested budgets, although a
  hand-written driver gains up to `4.4 s` a lap from it.
- The packaged build was checked with no Python or Node.js on `PATH`, not yet on a clean
  machine with networking disabled.

## Project layout

```text
python/src/evo_racer/  tracks, simulation, Fixed GA, NEAT, run session, local service
python/tools/          learning benchmark and regression matrix
python/tests/          pytest
src/                   TypeScript UI: views, controllers, canvas rendering, IPC client
tests/, e2e/           Vitest and Playwright (with an axe accessibility scan)
contracts/             JSON fixtures and saved results shared by both test suites
docs/                  architecture, user guide, experiments
packaging/             PyInstaller spec and third-party notices
```

## License

[MIT](LICENSE). Bundled runtime components keep their own licenses; see
[third-party notices](packaging/THIRD-PARTY-NOTICES.txt).
