# Live Training Observer Verification

Verified on `2026-07-29` on Windows 11 x64 with Node.js `24.13.0`,
npm `11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

## Corrected behavior

- Python evaluates at most one generation in a background worker.
- In-generation observation snapshots expose the active candidate index and
  Python-owned `x`, `y`, `heading`, controls, sensors, simulated time, and
  progress.
- The TypeScript UI polls snapshots without supplying a simulation step or
  delta and places the candidate marker on Python-compiled track geometry.
- Pause and stop requests remain generation-boundary operations.
- Persisted checkpoints omit transient live progress and remain compatible with
  older version 1 run documents that do not contain position fields.

## Focused evidence

- The selected Python observer, simulation, persistence, and service suites
  passed `38` tests.
- The selected TypeScript simulation and renderer suites passed `21` tests.
- A real production browser flow showed `Candidate 16 / 24` while generation
  `0` was evaluating. The same SVG marker changed from
  `translate(5 0) rotate(322.657)` to
  `translate(7.054 -0.036) rotate(34.139)` between observations.
- The browser console contained zero warnings or errors.

## Full gate

`npm run test:phase10` passed:

- Prettier, ESLint, TypeScript type-check, `27` Vitest tests, Ruff
  format/lint, strict mypy, and `70` pytest tests.
- Development loopback smoke on `127.0.0.1`.
- All `18` deterministic matrix cases with the existing regression fixture.
- Windows PyInstaller `onedir` and ZIP construction.
- Clean-runtime release acceptance, including live candidate position
  telemetry, generation-boundary persistence, restart/resume, replay, and
  loopback-only sockets.

The rebuilt local ZIP SHA-256 is
`af6f4ec2c06a9c896039d1c5a0e705e4fcf7b84d5dc1cb63087b6a70f26c1ceb`.
This working-tree correction is not part of the immutable published `v1.0.0`
tag or its existing public assets.
