# Deep second audit

Date: `2026-08-04`

Scope: a second file-by-file review of the Python simulation, evolution,
persistence, track, service, and packaging paths; the TypeScript IPC, parsing,
state, Track Builder, observer, replay, and result paths; and their focused
tests and release gates.

## Corrected findings

- A run record containing non-finite JSON numbers could raise a raw serializer
  error and block the complete run library. Checkpoint hashing now converts
  non-JSON-safe values into `RunRecordError`, so only that record is isolated.
- Runtime-neutral NEAT payloads now reject duplicate input keys, duplicate
  output keys, and input/output key overlap before activation.
- Track validation now treats non-adjacent endpoint contact and collinear
  overlap as centerline self-intersection. This prevents ambiguous projection
  and progress on a loop that previously passed the strict-crossing-only test.
- `Controls` rejects `NaN` and both infinities instead of silently clamping them
  into apparently valid steering, throttle, or brake values.
- Setup validation responses are tied to the exact reviewed draft. Editing the
  setup while validation is in flight cannot unlock Start with a stale result.
- Closure-assist responses are tied to the exact editor request. Newer edits
  invalidate older responses, and all editor mutation controls are disabled
  while a Python command is pending.
- Observation and run-command responses verify that their run is still active
  after the asynchronous request. A late response cannot resurrect or replace
  a newer session.
- Saved-run deletion now asks for confirmation, matching the existing track
  deletion safeguard.
- Direct-EXE acceptance now terminates the exact starter/runtime PID when an
  assertion fails, preventing an orphan process from poisoning later gates.

## Browser verification

The production UI was served by the local Python launcher and exercised through
Welcome, Track Builder, generator v2, custom-track selection, Review, explicit
Start, live Fixed GA training, champion replay, seven prior evolution trails,
`8 / 8` completion, and Results. No run existed before Start. The test-only run
and its dedicated data root were removed after shutdown.

## Final verification

- `npm audit --audit-level=low`: zero vulnerabilities.
- `npm run test:phase10`: passed.
  - `57` Vitest tests.
  - `105` pytest tests.
  - Development loopback smoke.
  - `2` real Chromium flows.
  - `18` deterministic matrix cases in `11.483036 s` with regression SHA-256
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` Windows `onedir` build.
  - Direct outside-ZIP EXE start, extracted-EXE start, checkpoint restart and
    completion, loopback-only socket audit, and no external Node.js or Python
    child process.
  - `git diff --check`.
- Final ZIP: `9,425,319` bytes, SHA-256
  `3cf9a9e4e7898d97e32311f6d2a1af9dac8cd89240b62f8559e2df1dac5b9ddd`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created during this audit.
