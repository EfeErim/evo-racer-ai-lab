# Post-release Start recovery

Date: `2026-08-04`

Scope: explicit Start failure handling and saved-run restore review on top of
the locally verified, unpublished `v1.1.1` correction.

## Corrected finding

The browser marked the session as started and moved to Training before the
local Python Start response arrived. An HTTP failure or a versioned
`valid: false` response then replaced the loading panel with a terminal
telemetry error while the setup routes remained locked. The user had no Review
or retry path even though no run snapshot was available.

Python validates first, then creates the run identity and atomically persists
the initial checkpoint before returning a successful snapshot. The browser now
distinguishes these outcomes:

- an application-level rejection returns to Review, displays Python's exact
  error, locks Start, and requires authoritative validation again;
- an interrupted HTTP response returns to Review with the still-valid setup,
  states that the Start result is unknown, and links to Welcome and Saved runs
  before an explicit retry; and
- a confirmed response alone enters the locked Training workspace.

Saved-run restore already failed safely on Welcome: rejected responses,
transport failures, and invalid restored custom tracks keep the valid library
visible, clear the pending action, and do not enter Training.

## Regression coverage

Two onboarding state tests cover rejected and unconfirmed Start transitions.
The real Chromium recommended-run flow now performs this complete sequence:

1. Python-style `valid: false` Start rejection;
2. Review error display with Start locked;
3. successful revalidation;
4. injected HTTP `503` Start response;
5. unknown-result guidance with the valid setup and Start available;
6. explicit retry with a real Python run; and
7. Stop, Results, corrupt-export recovery, and retained Saved runs.

## Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `67` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "recommended offline run"`:
  passed.
- `npm run test:e2e`: passed all `4` real Chromium flows.

## Final Phase 10 verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `67` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed. The Start-recovery flow expects only
    Chromium's injected HTTP `503` resource error and rejects every other
    console error.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.013596 s`; median case time was `0.606815 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-fecd60f37d5144bdb978bdc3d12a76d1`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains the rejected and unknown-result Start
    recovery guidance.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,191,177` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,428,855` bytes with SHA-256
  `922f40a5b4e73f0caa99b87beded6102b82fc63c421731bc569d6d7ef388f196`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
