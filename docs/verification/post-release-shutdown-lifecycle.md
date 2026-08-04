# Post-release shutdown lifecycle ownership

Date: 2026-08-04

## Finding

The browser replaced the application with its final shutdown message only after
the local shutdown request succeeded, but it did not record that the application
was stopped. Any earlier request that returned afterward could still call the
normal renderer and recreate the complete app shell over
`EvoRacer has shut down.`. While shutdown was pending, the original controls also
remained usable and permitted another Exit action. Failures were reduced to the
generic `EvoRacer could not stop the local core.` alert.

A forced-order Chromium test held the initial Run Library response, completed a
mock shutdown, and then released the held response. Before the correction the
final shutdown heading disappeared because the late library response rendered
the Welcome interface again. A second test confirmed that no pending shutdown
presentation existed before a delayed HTTP `503` response.

## Correction

- The browser now owns an explicit `active`, `shutting-down`, or `stopped`
  lifecycle.
- Confirming Exit immediately clears observation scheduling and replay animation,
  replaces the app controls with a focused `Shutting down EvoRacer…` screen,
  and prevents duplicate shutdown submission.
- The normal renderer and observation scheduler operate only while the lifecycle
  is active. A successful shutdown removes the visibility listener and retains
  the terminal screen permanently even if an older request resolves later.
- A shutdown failure restores the active interface, resumes observation when
  applicable, and displays the exact labeled IPC error such as
  `Application shutdown failed with status 503.`.

## Browser evidence

`npx playwright test e2e/offline-flow.spec.ts --grep "late startup responses|shutdown exposes pending"`
passed both forced-order Chromium flows:

1. A delayed startup Run Library response could not resurrect `.app-shell` after
   the final shutdown screen was focused.
2. A delayed `503` shutdown exposed the focused pending screen, removed the Exit
   button during the request, reported the exact failure, and restored a usable
   Welcome screen with Exit available again.

`npm run test:e2e` then passed all `9` real Chromium flows.

## Full gate and package

`npm run test:phase10` passed after the correction:

- Prettier, ESLint, TypeScript type-check, Ruff, and strict mypy passed.
- `78` Vitest tests and `105` pytest tests passed.
- All `9` real Chromium flows passed.
- All `18` deterministic Fixed GA/NEAT cases passed in `11.059239 s`; median
  case time was `0.607503 s` and the regression SHA-256 remained
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
- Clean-runtime acceptance launched the root-level EXE, restored and completed
  `run-2abc580f12cc479d92b627b4372251e7`, used loopback only, and spawned no
  external Node.js or Python process.
- Ports `4173` and `8765` were free after the gate.

Final local artifact:

- Runnable folder: `71` files, `20,200,169` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,431,543` bytes.
- ZIP SHA-256:
  `8dcc4bbeec2496cb319b2b08eb16b10d85525aaf9cf9bedf47900b2e00b18f82`.

Publication, tagging, and replacement of the immutable `v1.1.0` release were not
performed.
