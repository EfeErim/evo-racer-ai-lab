# Phase 4 Physics, Sensors, and Baselines Verification

Verified on `2026-07-29`.

## Delivered

- Python-only deterministic `1/60 s` arcade physics with continuous steering,
  throttle, and brake.
- Speed-dependent steering, lateral slip, grip recovery, drag, and documented
  front/rear drive and brake handling multipliers.
- Swept vehicle-disc collision, centerline progress, seven road-edge sensors,
  and deterministic episode evaluation.
- Seeded fixed-weight random-network and Pure Pursuit baselines using the same
  evaluator.
- Version 1 loopback simulation preview and selected-car telemetry rendered by
  the observer UI.
- Shared `contracts/phase4-telemetry.json` parsed by both Python and TypeScript.

## Automated gate

`npm run check` passed:

- Prettier and Ruff formatting checks.
- ESLint and Ruff lint.
- TypeScript type-check and strict Python mypy.
- 17 TypeScript tests.
- 34 Python tests, including 13 Phase 4 physics/evaluator tests.
- Vite production build.

`npm run smoke:m0` passed with the frontend at `127.0.0.1:4173` and Python
health at `127.0.0.1:8765`.

`git diff --check` passed. A static runtime scan found only the intended
`127.0.0.1` service and development origins; no remote runtime URL was added.

## M4 acceptance evidence

- Fractional throttle and steering produced distinct measured state changes.
- With identical state and controls, `gripRecovery=2.0` retained more lateral
  speed than `gripRecovery=8.0`.
- Full front/rear drive and brake bias cases produced distinct heading and
  lateral-slip results while retaining the full `[0,1]` bias range.
- A deliberately mutating controller was rejected during evaluation.
  `VehicleSetup` is frozen and controller parameters are compared with their
  episode-start snapshot after every controller call.
- Swept collision stopped a high-speed perpendicular crossing at the last safe
  corridor point.
- Running identical episodes with telemetry sampling every 1 versus every 17
  steps produced the same termination, step count, progress, and final
  telemetry.
- The Pure Pursuit baseline completed every canonical preset without collision:

  | Preset | Steps | Simulated time | Progress | Collisions |
  | --- | ---: | ---: | ---: | ---: |
  | Easy Oval | 1322 | 22.033333 s | 1.0 | 0 |
  | Technical Circuit | 1557 | 25.950000 s | 1.0 | 0 |
  | Chicane Challenge | 2065 | 34.416667 s | 1.0 | 0 |

The Pure Pursuit lookahead design was checked against R. Craig Coulter's
[original CMU technical report](https://publications.ri.cmu.edu/implementation-of-the-pure-pursuit-path-tracking-algorithm).
No dependency was introduced.

## Browser audit

The local browser flow passed through Welcome, Easy Oval selection, Settings,
authoritative Review validation, explicit Start, and Training.

- Training remained unreachable before Start.
- After Start, setup routes and fields were disabled.
- The selected-car panel displayed speed, lateral speed, continuous steering,
  throttle, brake, progress, and seven sensor distances from the Python
  response.
- The panel stated that controls are observer telemetry and exposed no vehicle
  driving input.
- Desktop and `390 x 844` mobile layouts were visually inspected.
- The browser console contained zero warnings or errors.
