# Phase 7 Observer and Results Verification

Verified on `2026-07-29`.

## Automated gate

`npm run check` passed:

- Prettier and Ruff formatting checks.
- ESLint and Ruff lint.
- TypeScript and strict Python type checks.
- 22 TypeScript tests.
- 57 Python tests.
- Vite production build.

Focused Phase 7 coverage includes:

- Fixed GA and NEAT generation-batched observation sessions.
- Pause/resume equivalence against an uninterrupted seeded run.
- Stop after a completed generation.
- Replay motion, controls, controller parameters, and vehicle-setup
  reproducibility across two independent seeded runs.
- Complete terminal metadata and three-controller baseline comparison.
- Start, pause, observe, resume, and completion through the loopback HTTP
  service.
- Shared `contracts/phase7-observation.json` parsing in Python and TypeScript.
- Replay-marker placement on Python-compiled geometry.

`npm run smoke:m0` passed with the frontend and Python service on
`127.0.0.1`.

`git diff --check` passed.

## M7 acceptance evidence

- Configuration lock: after Start, Welcome, Track, Training Settings, and Review
  navigation controls were disabled. Existing onboarding tests also reject
  every setup mutation after Start.
- Pause/resume: a browser run using population `10`, two generations,
  `15`-second episodes, and seed `42` paused at `0 / 2`. No generation advanced
  while paused. Resume returned the same run to `running`. The Python
  equivalence test compares the complete paused/resumed and uninterrupted
  snapshots byte-for-byte.
- Replay: a completed browser run exposed 52 recorded champion frames. Advancing
  from frame 1 to frame 2 changed simulated time from `0.02 s` to `0.12 s` and
  the track marker to `translate(5.018 0) rotate(0.253)`. Python independently
  proves that repeated seeded runs reproduce every recorded frame, controller
  parameter, and fixed vehicle value.
- Run identity: the Results view displayed the full run id, algorithm, seed,
  track, requested/completed generations, champion metrics, and track SHA-256.
  The payload also records population size, episode duration, fixed time step,
  and simulation/evolution/observation contract versions.

## Observer and results browser audit

A real Fixed GA run with population `10`, one generation, `15`-second episodes,
and seed `42` completed through the browser:

- Live status changed from generation `0 / 1` to `1 / 1`.
- The selected champion panel displayed speed, lateral speed, continuous
  steering/throttle/brake, progress, and seven sensor distances.
- The Results view displayed best/median fitness history, champion, seeded
  random-network, and Pure Pursuit comparisons.
- Champion replay rendered the recorded car pose on the selected Python-derived
  Easy Oval geometry and exposed replay navigation.
- No browser console warning or error was recorded.
- Page assets were only `http://127.0.0.1:5173/@vite/client` and
  `http://127.0.0.1:5173/src/main.ts`; the static runtime URL scan found only
  intended loopback URLs.
- At a `390 x 844` viewport override, document `scrollWidth` and `clientWidth`
  were both `375`, so the page introduced no horizontal document overflow.

The run comparison is process-local by design. Durable atomic storage and
restart recovery are Phase 8 deliverables.
