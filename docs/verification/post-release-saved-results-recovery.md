# Post-release saved-results recovery

Date: `2026-08-04`

Scope: terminal Saved runs access and terminal observation consistency on top
of the locally verified, unpublished `v1.1.1` correction.

## Corrected findings

- Welcome displayed a disabled **Resume** button for every completed or stopped
  record. After an application restart, the user could export or delete a
  terminal run but could not reopen its Results, comparisons, or replay.
- The browser parser validated individual result fields but did not require the
  result metadata run identity, terminal status, and generation counts to match
  the containing observation snapshot. It also accepted terminal results on a
  running snapshot and a generation-bearing terminal snapshot without a
  result. Those contradictions could produce a misleading or locked UI.

## Correction

- Running and paused records retain **Resume**. Terminal records with a saved
  champion now expose **Open results**; zero-generation stopped records expose
  a truthful disabled **No results** action.
- Open results reads the atomically saved Python-validated RunV1, rejects a
  non-terminal or result-less document, recompiles its canonical TrackV1
  through Python, restores its bounded generation trail, and enters Results
  without running an evolution step.
- Run-document loading labels an opening failure as **Saved results**, distinct
  from a JSON export failure, while preserving the valid library on error.
- Observation parsing now fails closed unless snapshot and result agree on run
  identity, terminal status, completed/requested generation counts, and
  champion replay identity. Non-terminal snapshots cannot carry a result;
  completed snapshots must contain every requested generation.

## Regression coverage

- Onboarding state coverage verifies direct terminal restore to Results.
- Observation parser coverage rejects cross-run result metadata, a result on a
  running snapshot, and a missing terminal result after one generation.
- IPC coverage verifies `Saved results failed with status 503.` independently
  from export messaging.
- The real Chromium recommended flow stops a run, returns to Welcome at
  `390 x 844`, verifies no page-level overflow, opens the saved Results, and
  renders the champion replay before continuing the existing corrupt-export
  recovery checks.

## Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `70` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "recommended offline run"`:
  passed.
- `npm run test:e2e`: passed all `4` real Chromium flows.

## Final Phase 10 verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `70` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed, including terminal Saved runs reopening
    at the narrow viewport.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `10.859683 s`; median case time was `0.604024 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-925660304b9545f49d5cb965d3903054`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains the terminal **Open results** and
    **No results** guidance.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,193,774` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,429,636` bytes with SHA-256
  `c4689f9c62ecd5197bdf37ab72e918486dd9312e742ba607a51b2dab6a02d7a5`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
