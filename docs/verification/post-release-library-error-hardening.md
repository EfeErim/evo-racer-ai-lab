# Post-release library and IPC error hardening

Date: `2026-08-04`

Scope: Track Builder commands, track/run library actions, and versioned local
IPC response validation on top of the locally verified, unpublished `v1.1.1`
correction.

## Corrected findings

- Compile, assist, generate, save, and library requests shared generic track
  labels. HTTP failures now name the operation that actually failed, while
  connection failures retain their original error as the JavaScript `cause`.
- Python returns HTTP 200 with `deleted: false` when the requested local record
  no longer exists. Track and run deletion previously ignored that field; Track
  Builder could therefore report a successful deletion that never happened.
  Deletion now requires contract version 1, the exact requested identity, and
  `deleted: true`.
- Run export discarded Python's stable error message. A corrupt export now
  surfaces `The local run is corrupt and cannot be exported.` instead of a
  generic fallback.
- Track save, compile, and library payloads were trusted as TypeScript casts.
  Malformed, non-finite, identity-mismatched, or invalid-JSON responses now fail
  closed before reaching rendering state.
- One failed Resume, Export, or Delete replaced the complete valid Saved runs
  library with `unavailable`. Run actions now lock as one owned request, expose
  pending/success/error notices, and preserve the valid library after an
  operation-level failure. A restored custom track must compile successfully
  before the run can enter Training.

## Reproduction and browser verification

Before the correction, all four initial IPC regressions failed:

- generation 503 used `Local track command` instead of `Track generation`;
- `deleted: false` resolved successfully for both track and run deletion;
- corrupt run export lost the Python error; and
- an empty track-save response resolved as a successful typed value.

Chromium also reproduced the generic generation failure. The final real-browser
flow injects that 503, verifies the exact operation message, retries generation
successfully, saves the generated track, and injects `deleted: false` without
allowing a false success notice. A second injected corrupt-run export verifies
the `Exporting…` lock, exact Python error, retained Saved runs table, and
re-enabled actions.

## Final verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `65` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `10.853611 s`; median case time was `0.600820 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-7965f02ccf134d69a3fa169be19ca326`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,189,174` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,428,928` bytes with SHA-256
  `f156716cdd13df42eca95377e86c12205a2421343cab58ef8c7c9bab98c79f21`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
