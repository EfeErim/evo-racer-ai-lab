# Post-release Track command ownership

Date: 2026-08-04

## Finding

Track Builder disabled its editing controls while Generate was pending, but the
setup progress navigation remained intentionally available. If the user left
Track before the Python response returned, the late response still populated the
generated preview and success notice. The same ownership gap affected closure
assistance and the presentation around Save/Delete. Save and Delete are special:
their Python-owned local mutation may already be durable even when the user has
dismissed the browser presentation.

The first forced-delay Chromium regression reproduced the defect before the fix:
after leaving Track and releasing the held Generate response, a generated track
geometry was present (`expected 0`, `received 1`).

## Correction

- Assist, Generate, Save, and Delete now carry monotonic Track-command ownership.
- Leaving Track, closing Track Builder, or changing Builder tools clears the
  pending presentation and invalidates its late response.
- A dismissed Assist or Generate result cannot repair the editor, install a
  generated preview, or replace the notice after the user has moved on.
- A dismissed Save or Delete response performs a new ordered read of the
  Python-owned track library. The UI does not claim that a mutation was canceled
  when it may already have completed.
- Track validation and TrackV1 import retain their dedicated request ownership;
  canceling their owning Builder context also invalidates those requests.
- Save now displays `Saving…` and announces
  `Saving the selected track to local storage.` while it is pending.

## Forced-order browser evidence

Two real Chromium tests hold successful local responses and release them only
after navigation:

1. A delayed Generate response is released after leaving Track. Returning to the
   still-open Builder shows `Waiting for inputs`, no generated track geometry,
   and the truthful dismissed-response notice.
2. A TrackV1 save is allowed to complete in Python while its HTTP response is
   held. After leaving Track and releasing the response, returning to Library
   shows the saved track from a fresh library read without the response taking
   over the route.

Focused verification:

- `npx vitest run tests/track-builder.test.ts`
  - `8 / 8` passed, including the pending `Saving…` presentation.
- `npx playwright test e2e/offline-flow.spec.ts --grep "late generated track|dismissed track save"`
  - `2 / 2` Chromium flows passed.
- `npm run test:e2e`
  - all `7` Chromium flows passed.

## Full gate and package

`npm run test:phase10` passed after the correction:

- Prettier, ESLint, TypeScript type-check, Ruff, and strict mypy passed.
- `78` Vitest tests and `105` pytest tests passed.
- All `7` real Chromium flows passed.
- All `18` deterministic Fixed GA/NEAT matrix cases passed in `13.777547 s`;
  median case time was `0.722686 s` and regression SHA-256 remained
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
- Clean-runtime acceptance launched the root-level EXE, restored and completed
  `run-c5445018d3514b1db2120541b1c2ec6a`, used loopback only, and spawned no
  external Node.js or Python process.
- Both development ports, `4173` and `8765`, were free after the gate.

Final local artifact:

- Runnable folder: `71` files, `20,199,358` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,431,558` bytes.
- ZIP SHA-256:
  `ef2bb45d535421e56361ad6061fcdf1550fe35a7f04d88684e790368bc15a504`.

Publication, tagging, and replacement of the immutable `v1.1.0` release were not
performed.
