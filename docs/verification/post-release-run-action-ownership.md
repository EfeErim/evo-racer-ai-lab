# Post-release Saved action route ownership

Date: `2026-08-04`

Scope: asynchronous Saved-run actions and route changes on top of the locally
verified, unpublished `v1.1.1` correction.

## Corrected finding

Saved result opening checked only that the response was the latest run request
and that the UI was on Welcome when the final compile completed. It did not
record whether the user had left Welcome while the request was pending.

The real Chromium reproduction held a valid Python RunV1 export response,
navigated `Welcome -> Track -> Welcome`, and then released the older response.
Before the correction, both final conditions still looked current and the late
request unexpectedly replaced Welcome with Results. The same error path could
also touch a newer loading simulation after a different Start request.

## Correction

- Saved-run UI actions now own an independent monotonically increasing action
  version in addition to the existing run and library request versions.
- Every accepted route change invalidates the pending Saved action, clears its
  pending presentation, and releases a loading Open/Resume placeholder.
- Open and Resume re-check action ownership after each awaited local response;
  custom-track restoration checks again after Python compilation.
- Export does not start a late browser download after ownership is lost.
- Delete and Resume may already have changed Python-owned persistence before a
  user leaves Welcome. Their dismissed responses therefore refresh the run
  library instead of presenting an inaccurate cancellation claim.
- A stale failure cannot clear or replace a newer simulation state or library
  notice.

## Regression coverage

The forced-delay Chromium scenario failed before the correction because the
late response rendered Results. Against the rebuilt frontend it now remains on
Welcome, exposes `Saved run response ignored after leaving Welcome.`, keeps the
saved record actionable, and then completes both corrupt-replay recovery and a
fresh successful Open results action.

Focused verification passed:

- `npm run check`: `75` Vitest and `105` pytest tests plus formatting, lint,
  strict type-checks, and the production frontend build.
- `npm run test:e2e`: all `4` real Chromium flows.

## Final Phase 10 verification

- `npm run test:phase10`: passed.
  - All `75` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed, including the forced leave-return race.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.162584 s`; median case time was `0.609299 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-283c4ea281064383a40e5a2545ed2159`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains the Saved-action ownership behavior.
  - Both development ports were free after the gate and `git diff --check`
    passed.
- The runnable folder contains `71` files totaling `20,196,346` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,431,834`
  bytes with SHA-256
  `295fa0188149484abfd069f156408dada9a7acaf6099ea5f9062f0e9a2a22d95`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
