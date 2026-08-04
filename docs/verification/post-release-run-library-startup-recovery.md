# Post-release Saved runs startup recovery

Date: 2026-08-04

## Finding

The Saved runs library is requested when the browser starts. If that first
request failed, the exact error was rendered inside a collapsed panel and the
interface offered no retry action. The user could navigate away and back to
trigger another read, but the previous failure remained on screen until that
request completed and the failure surface still had no direct recovery path.

A forced Chromium test returned HTTP `503` for the first startup read. Before
the correction, the Saved runs panel had no `open` state, proving the failure
was hidden from sight.

## Correction

- An unavailable Saved runs library opens its panel automatically and presents
  the exact labeled HTTP, connection, or invalid-JSON cause with `role="alert"`.
- **Retry saved runs** starts a new ordered library read without reloading the
  page.
- Entering Welcome while the library is unavailable now switches to a truthful
  loading presentation before the automatic retry begins.
- Manual retry also changes state before issuing IPC, which removes the Retry
  action and prevents duplicate submission while the request is pending.
- A failed later refresh preserves the last valid versioned library, clears any
  stale pending action, and presents the exact error plus Retry beside the
  still-usable rows.
- The existing disclosure-state restoration mechanism now respects explicitly
  forced-open error panels instead of restoring an obsolete closed state over
  a new critical failure.

## Forced recovery evidence

The Chromium flow intercepts only `GET /v1/runs/library`:

1. Startup request one returns HTTP `503`; the panel opens and the exact error
   plus **Retry saved runs** are visible.
2. After navigating to Track and back to Welcome, automatic request two also
   returns HTTP `503`; the recovery surface remains open.
3. Manual Retry sends request three, replaces the action with
   `Loading local run files…`, and prevents another submission.
4. A valid RunV1 library response restores a resumable row without a page
   reload and removes the stale error.

The existing unconfirmed-Start flow also forces a later background refresh to
return HTTP `503`. The previously loaded Resume row remains visible, the error
opens automatically, and a fourth successful Retry clears the failure without
discarding the row.

## Full gate and package

`npm run test:phase10` passed after the correction:

- Prettier, ESLint, TypeScript type-check, Ruff, and strict mypy passed.
- `80` Vitest tests and `105` pytest tests passed.
- All `11` real Chromium flows passed.
- All `18` deterministic Fixed GA/NEAT cases passed in `15.144673 s`; median
  case time was `0.846960 s` and regression SHA-256 remained
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
- Clean-runtime acceptance launched the root EXE, restored and completed
  `run-e979a902f7404585828672c7e425eb89`, used loopback only, and spawned no
  external Node.js or Python process.
- Ports `4173` and `8765` were free after the gate.

Final local artifact:

- Runnable folder: `71` files, `20,202,465` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,431,793` bytes.
- ZIP SHA-256:
  `0c5b93f3ac4701a705d548fa6eb2edd6aa11ed3facb9475772241a49871010fb`.

Publication, tagging, and replacement of the immutable `v1.1.0` release were not
performed.
