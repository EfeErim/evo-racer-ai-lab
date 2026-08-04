# Post-release unconfirmed-Start Saved-run recovery

Date: `2026-08-04`

Scope: the recovery path after an interrupted Start response, Welcome route
entry, and truthful run-library refresh errors on top of the locally verified,
unpublished `v1.1.1` correction.

## Corrected findings

- An interrupted Start response correctly returned to Review and directed the
  user to **Welcome and Saved runs**, but navigating there reused the last run
  library snapshot. If Python had accepted and persisted the request before the
  transport interruption, the new run could remain invisible and the user
  could retry Start unnecessarily.
- Run-library refresh failures discarded the operation-specific IPC error and
  replaced an HTTP status such as `503` with a generic unavailable message.
- A naive entry refresh could overwrite the existing notice that a late Saved
  action response had been dismissed after leaving Welcome.

## Correction

- Every actual route entry into Welcome starts a new monotonic run-library
  request. Startup loading remains separate, while repeated Welcome entries
  invalidate older list responses through the existing request version.
- A ready library shows a temporary `Refreshing Saved runs from local storage.`
  notice while the request is active.
- Successful refreshes merge the current Python-owned list while restoring the
  prior meaningful notice, including dismissed-action ownership feedback.
- Refresh failures expose the exact IPC error, such as
  `Run library request failed with status 503.`.

## Regression coverage

The new real Chromium flow returns an empty run list at startup, interrupts
Start with HTTP `503`, and publishes a resumable run only in the next list
response. Before the correction, clicking **Welcome and Saved runs** left the
request count at `1`; after the correction it performs request `2` and exposes
the recovered run's Resume action.

The same flow then leaves and re-enters Welcome while request `3` returns HTTP
`503`; it verifies the exact run-library error. The existing held Saved-results
response test also proves that the entry refresh does not erase
`Saved run response ignored after leaving Welcome.`.

## Final Phase 10 verification

- `npm run test:phase10`: passed after formatting the new Chromium scenario.
  - All `77` Vitest and `105` pytest tests passed.
  - All `5` real Chromium flows passed, including unconfirmed-Start recovery,
    exact refresh failure, and retained dismissed-action feedback.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `14.809975 s`; median case time was `0.771648 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-abe94ba053e3450ab7c0961f5221be86`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged JavaScript contains both Saved-run refresh messages and the
    truthful fallback path.
  - Both development ports were free after the gate.
- The runnable folder contains `71` files totaling `20,198,396` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,428,496`
  bytes with SHA-256
  `0d91cf3e88fd389ca5805bcd23f2de5208bbf5c2ea510ecacc5dddc3fa5b0534`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
