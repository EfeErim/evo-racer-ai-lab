# Post-release Review validation ownership

Date: `2026-08-04`

Scope: setup-validation concurrency and Review-route lifecycle on top of the
locally verified, unpublished `v1.1.1` correction.

## Corrected finding

- Setup validation checked only whether the returned draft still matched the
  current draft. If the user left Review while the request was pending, its
  late response could navigate back to Review and unlock Start.
- Leaving and returning to Review with the same unchanged draft started a new
  request, but the old response could satisfy that newer visit because the two
  requests had no distinct UI ownership.

## Correction

- Leaving Review while validation is checking immediately returns validation
  presentation to `not-checked`, so Start remains locked outside a verified
  Review visit.
- Each setup-validation request owns a monotonically increasing version. Both
  successful and failed responses verify that ownership before changing state.
- Leaving Review invalidates the active version. A late response therefore
  cannot navigate, unlock Start, show a stale error, or complete a newer check
  of the same draft.
- The packaged user guide documents the Review-visit ownership and fresh-check
  behavior.

## Regression coverage

The reducer test starts validation, leaves Review, and proves that checking is
canceled and a late response is ignored. Before the correction, the new
assertion failed because validation remained `checking`.

The real Chromium flow holds the first `/v1/setup/validate` response, leaves
Review, returns with the same draft, and starts a second validation. Releasing
the first response cannot complete the second check or disturb focus; only the
second response can make the configuration valid. Before the correction, the
old response hijacked the newer validation.

## Final Phase 10 verification

- `npm run test:phase10`: passed.
  - All `77` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed, including the forced out-of-order
    same-draft validation responses.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `13.654297 s`; median case time was `0.769307 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-3230ea7ece034d0abb514b432244f9e3`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains the Review-validation ownership
    behavior.
  - Both development ports were free after the gate.
- The runnable folder contains `71` files totaling `20,197,832` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,431,485`
  bytes with SHA-256
  `8e81d8d6ed0221d7c11ee829d45ad1149d249d09d43f927cb46e3bc1bd08c813`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
