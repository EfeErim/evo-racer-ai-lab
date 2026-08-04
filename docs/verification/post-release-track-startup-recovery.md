# Post-release Track startup recovery

Date: 2026-08-04

## Finding

Preset geometry and the local Track Library are requested when the browser
starts. A failed Track Library request left `library` as `null`, which the
Library tab interpreted only as loading. The exact error appeared in the footer,
but the main panel displayed `Loading local library…` forever and exposed no
retry. Preset failures discarded their actual cause and left every card at the
generic `Local preview unavailable` state.

A forced Chromium test returned HTTP `503` for the first startup requests.
Before the correction, entering Track did not send a second request
(`expected 2`, `received 1`), proving that the interface could not recover
without a full reload.

## Correction

- Track Library presentation now distinguishes `loading`, `ready`, and
  `unavailable`; a failed first read cannot masquerade as an active spinner.
- Entering Track automatically retries unavailable preset geometry and Track
  Library sources with their existing monotonic request ownership.
- If the automatic retry also fails, Track exposes the exact labeled HTTP,
  connection, or invalid-JSON cause.
- **Retry preset previews** and **Retry local library** operate independently.
- A failed later background library refresh retains any already valid library
  instead of replacing it with an unavailable surface.
- Preset loading now uses the shared loopback request helper, so connection,
  HTTP, and malformed-JSON errors are labeled consistently before rendering.

## Forced recovery evidence

The Chromium test returns HTTP `503` for request one and two, then permits the
real Python response for request three:

1. Startup request one fails.
2. Entering Track automatically performs request two; both exact `503` errors
   become visible and the library panel is explicitly unavailable rather than
   loading.
3. The two independent Retry actions perform request three.
4. All three Python-compiled preset SVGs and the versioned local Track Library
   return without reloading the page.

Focused verification:

- `npx vitest run tests/track-builder.test.ts tests/ipc-errors.test.ts`
  - `17 / 17` passed, including unavailable-library rendering and labeled
    invalid preset JSON.
- `npx playwright test e2e/offline-flow.spec.ts --grep "Track recovers failed preset"`
  - the forced three-request Chromium flow passed.
- `npm run test:e2e`
  - all `10` Chromium flows passed.

## Full gate and package

`npm run test:phase10` passed after the correction:

- Prettier, ESLint, TypeScript type-check, Ruff, and strict mypy passed.
- `80` Vitest tests and `105` pytest tests passed.
- All `10` real Chromium flows passed.
- All `18` deterministic Fixed GA/NEAT cases passed in `11.248635 s`; median
  case time was `0.610023 s` and regression SHA-256 remained
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
- Clean-runtime acceptance launched the root EXE, restored and completed
  `run-fe0477d259f2492bb42489079d1a8dd5`, used loopback only, and spawned no
  external Node.js or Python process.
- Ports `4173` and `8765` were free after the gate.

Final local artifact:

- Runnable folder: `71` files, `20,201,481` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,431,863` bytes.
- ZIP SHA-256:
  `bfc6f9ef2ae5bdc6df0099a343b73c2c98d3245ec919bc5e07c24c31a5b867c1`.

Publication, tagging, and replacement of the immutable `v1.1.0` release were not
performed.
