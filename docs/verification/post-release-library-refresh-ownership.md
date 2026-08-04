# Post-release library refresh ownership

Date: `2026-08-04`

Scope: concurrent Track and Saved runs library refresh ownership on top of the
locally verified, unpublished `v1.1.1` correction.

## Corrected findings

Both library refresh functions accepted every response in arrival order rather
than request order.

- An initial Track library request could begin before Track Builder opened,
  finish after a later successful save refresh, and replace the complete current
  `trackWorkspace` with the object captured before its `await`. The reproduced
  failure closed Track Builder and discarded the visible current workspace.
- An initial Saved runs request could capture an empty list, finish after the
  terminal-run refresh, and replace the newer list. Returning from Results then
  showed no saved run and no **Open results** action.
- A late rejected request could similarly replace a newer successful library or
  notice with an unavailable/error state.

## Correction

- Track and Saved runs refreshes now own independent monotonically increasing
  request versions.
- A response or failure changes browser state only when its request version is
  still the latest for that library.
- Track library data is first awaited into a local value and only then merged
  into the current `trackWorkspace`. The refresh therefore cannot resurrect
  pre-request disclosure, editor, generator, selection, or pending state.
- Python remains the source of every library value; this ownership logic affects
  only which versioned local response the browser is allowed to present.

## Reproduction and regression coverage

The real Chromium suite captures the initial Python library response and holds
it while a newer authoritative refresh completes:

1. Track Builder saves a generated track and receives the fresh library.
2. The older empty Track response is released afterward.
3. Track Builder must remain open with its current state and the saved track's
   Delete action visible.
4. A run reaches a durable terminal checkpoint and receives the fresh Saved
   runs library.
5. The older empty startup response is released afterward.
6. Welcome must still expose the terminal record and **Open results**.

Before request ownership was added, both Chromium flows failed: the Track
Builder locator disappeared because the builder closed, and the terminal
**Open results** locator disappeared because the list became empty.

## Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `70` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "track builder|recommended offline"`:
  passed both forced out-of-order response flows after the correction.
- `npm run test:e2e`: passed all `4` real Chromium flows.

## Final Phase 10 verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `70` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed with forced out-of-order Track and Saved
    runs responses.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `12.802650 s`; median case time was `0.707905 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-679b0a75af4847d982cdc478a97d0246`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains both ordered-library refresh notes.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,194,231` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,430,368` bytes with SHA-256
  `644d71f785bbe9fdbf0c9b896a4ff3c39b673ee327f8000f205bb9dda71a4352`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
