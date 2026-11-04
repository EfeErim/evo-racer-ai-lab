# UI state ownership evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Post-release library refresh ownership

Original note: `post-release-library-refresh-ownership.md`.

Date: `2026-08-04`

Scope: concurrent Track and Saved runs library refresh ownership on top of the
locally verified, unpublished `v1.1.1` correction.

### Corrected findings

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

### Correction

- Track and Saved runs refreshes now own independent monotonically increasing
  request versions.
- A response or failure changes browser state only when its request version is
  still the latest for that library.
- Track library data is first awaited into a local value and only then merged
  into the current `trackWorkspace`. The refresh therefore cannot resurrect
  pre-request disclosure, editor, generator, selection, or pending state.
- Python remains the source of every library value; this ownership logic affects
  only which versioned local response the browser is allowed to present.

### Reproduction and regression coverage

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

### Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `70` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "track builder|recommended offline"`:
  passed both forced out-of-order response flows after the correction.
- `npm run test:e2e`: passed all `4` real Chromium flows.

### Final Phase 10 verification

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

## Post-release Saved action route ownership

Original note: `post-release-run-action-ownership.md`.

Date: `2026-08-04`

Scope: asynchronous Saved-run actions and route changes on top of the locally
verified, unpublished `v1.1.1` correction.

### Corrected finding

Saved result opening checked only that the response was the latest run request
and that the UI was on Welcome when the final compile completed. It did not
record whether the user had left Welcome while the request was pending.

The real Chromium reproduction held a valid Python RunV1 export response,
navigated `Welcome -> Track -> Welcome`, and then released the older response.
Before the correction, both final conditions still looked current and the late
request unexpectedly replaced Welcome with Results. The same error path could
also touch a newer loading simulation after a different Start request.

### Correction

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

### Regression coverage

The forced-delay Chromium scenario failed before the correction because the
late response rendered Results. Against the rebuilt frontend it now remains on
Welcome, exposes `Saved run response ignored after leaving Welcome.`, keeps the
saved record actionable, and then completes both corrupt-replay recovery and a
fresh successful Open results action.

Focused verification passed:

- `npm run check`: `75` Vitest and `105` pytest tests plus formatting, lint,
  strict type-checks, and the production frontend build.
- `npm run test:e2e`: all `4` real Chromium flows.

### Final Phase 10 verification

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

## Post-release Track import ownership

Original note: `post-release-track-import-ownership.md`.

Date: `2026-08-04`

Scope: TrackV1 file import progress, concurrency, and Track Builder lifecycle on
top of the locally verified, unpublished `v1.1.1` correction.

### Corrected findings

- Import read and compiled a selected file without setting a Track Builder
  pending state. The file input remained enabled, so another file could begin a
  second Python compile and whichever response arrived last replaced the editor.
- A successful late import always wrote `toolsOpen: true`. Closing Track Builder
  or leaving Track while compilation was pending did not invalidate the request,
  so the old response could reopen the Builder and replace current editor state.
- Reopening a Builder whose draft was already valid replaced its truthful last
  notice with `Checking the starter draft…` even though no validation ran.

### Correction

- Import uses an explicit `import` pending state. The Library file picker shows
  `Importing…` and is disabled while the file is read and Python validates it.
- Every import owns a monotonically increasing request version. The version is
  checked after file reading, after Python compilation, and before an error can
  change presentation state.
- Closing Track Builder or navigating away from Track invalidates a pending
  import, releases the UI lock, and records why the late response is ignored.
- A stale import cannot reopen Track Builder, overwrite the editor, or surface a
  stale error.
- Opening an already validated Builder preserves its last notice; only an
  unchecked starter draft announces a new validation.

### Regression coverage

The real Chromium reproduction held the actual `/v1/tracks/compile` response
for a valid imported oval. Before the correction, the file input remained
enabled and the new `toBeDisabled` assertion failed. Against the rebuilt
frontend, the picker is disabled with visible `Importing…` copy; closing the
Builder invalidates the held response, releasing it does not reopen the
workspace, and reopening shows the exact ignored-response notice.

A render-level Vitest assertion also locks the import picker and visible
progress copy whenever `workspace.pending === "import"`.

### Final Phase 10 verification

- `npm run test:phase10`: passed.
  - All `76` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed, including the held import response.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.345849 s`; median case time was `0.619539 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-7cc68f7df03f4b3f819c8401fb61600f`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged `USER-GUIDE.md` contains the Track import pending and ownership
    behavior.
  - Both development ports were free after the gate and `git diff --check`
    passed.
- The runnable folder contains `71` files totaling `20,197,275` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,429,077`
  bytes with SHA-256
  `2732e5e280657fc36239e205693fada88e0aad3e375bac89c4062c479af564af`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.

## Post-release Track command ownership

Original note: `post-release-track-command-ownership.md`.

Date: 2026-08-04

### Finding

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

### Correction

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

### Forced-order browser evidence

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

### Full gate and package

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

## Post-release Review validation ownership

Original note: `post-release-validation-route-ownership.md`.

Date: `2026-08-04`

Scope: setup-validation concurrency and Review-route lifecycle on top of the
locally verified, unpublished `v1.1.1` correction.

### Corrected finding

- Setup validation checked only whether the returned draft still matched the
  current draft. If the user left Review while the request was pending, its
  late response could navigate back to Review and unlock Start.
- Leaving and returning to Review with the same unchanged draft started a new
  request, but the old response could satisfy that newer visit because the two
  requests had no distinct UI ownership.

### Correction

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

### Regression coverage

The reducer test starts validation, leaves Review, and proves that checking is
canceled and a late response is ignored. Before the correction, the new
assertion failed because validation remained `checking`.

The real Chromium flow holds the first `/v1/setup/validate` response, leaves
Review, returns with the same draft, and starts a second validation. Releasing
the first response cannot complete the second check or disturb focus; only the
second response can make the configuration valid. Before the correction, the
old response hijacked the newer validation.

### Final Phase 10 verification

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

## Post-release shutdown lifecycle ownership

Original note: `post-release-shutdown-lifecycle.md`.

Date: 2026-08-04

### Finding

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

### Correction

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

### Browser evidence

`npx playwright test e2e/offline-flow.spec.ts --grep "late startup responses|shutdown exposes pending"`
passed both forced-order Chromium flows:

1. A delayed startup Run Library response could not resurrect `.app-shell` after
   the final shutdown screen was focused.
2. A delayed `503` shutdown exposed the focused pending screen, removed the Exit
   button during the request, reported the exact failure, and restored a usable
   Welcome screen with Exit available again.

`npm run test:e2e` then passed all `9` real Chromium flows.

### Full gate and package

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

## Post-release batched UI-state hardening

Original note: `post-release-batched-ui-state-hardening.md`.

Date: 2026-08-04

### Corrections

- A successful automatic Saved runs refresh no longer reuses a prior error as
  its success notice. The valid library returns without a stale Retry surface.
- Track Library retry now changes `Refreshing…` to an explicit
  `Local track library refreshed.` completion message.
- Generator seed, length, and difficulty inputs are disabled while a Python
  generation command is pending, matching the existing mutation lock on editor
  and result actions.
- Track Builder command errors now render with `role="alert"` and assertive live
  semantics; non-error notices remain polite status updates.

### Verification

- Focused Track Builder tests: `11 / 11` passed.
- Forced Track/Saved-runs Chromium recovery flows: `2 / 2` passed.
- `npm run test:phase10` passed once after the complete batch:
  - `82` Vitest tests and `105` pytest tests passed.
  - All `11` Chromium flows passed.
  - All `18` deterministic Fixed GA/NEAT cases passed in `13.612335 s`; median
    case time was `0.755825 s` and regression SHA-256 remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows application.
  - Clean-runtime acceptance restored and completed
    `run-ca17ce5c7be747099d5b645704004eb4`, used loopback only, and spawned no
    external Node.js or Python process.

Final local artifact:

- Runnable folder: `71` files, `20,202,698` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,433,123` bytes.
- ZIP SHA-256:
  `b44510204b76ee551f9004050afef55f41c02907132a3ee01184cc33c1a9bee2`.
- The checksum file matches the ZIP; ports `4173` and `8765` were free after
  acceptance.

Publication, tagging, and replacement of immutable `v1.0.0` / `v1.1.0` assets
were not performed.

## Post-release keyboard and interface-state hardening

Original note: `post-release-keyboard-state-hardening.md`.

Date: `2026-08-04`

Scope: keyboard focus, disclosure state, and Track Builder tab semantics on top
of the locally verified, unpublished `v1.1.1` correction.

### Corrected findings

- The `250 ms` visible-document observation refresh replaced the Training DOM
  and dropped keyboard focus. A focused Pause, Resume, or Stop control could
  therefore become unreachable before the next keyboard action. Same-route
  renders now restore the focused control without scrolling the page.
- A pending run command temporarily disables its controls. Focus ownership is
  now retained while that control is disabled and restored if a transient
  command failure makes it available again.
- Re-rendering Settings forgot the open/closed state of `details` elements.
  Changing Random seed collapsed Advanced controls and lost input focus. The
  interface now preserves each disclosure's explicit state and the focused
  input across same-route renders.
- Track Builder used `tab` roles without the complete keyboard model. Tabs now
  use roving `tabindex`, stable `aria-controls` / `aria-labelledby` links, and
  Left Arrow, Right Arrow, Home, and End navigation. Opening the builder focuses
  its heading; closing it returns focus to the launcher.

### Reproduction and browser verification

Before the correction, Chromium reproduced both primary failures:

- Track Builder's heading remained inactive after opening and validation.
- A focused `Stop after generation` button became inactive within `750 ms` of
  normal Training observation polling.

The final real-browser suite verifies:

- builder open/close focus handoff;
- tab selection and focus through Right Arrow, Home, and End;
- focus retention through an asynchronous Python road-width validation;
- open Customize training and Advanced controls state plus Random seed focus
  after a state-changing input event;
- the Review card's Edit track focus through a deliberately delayed setup
  validation, despite a same-route sidebar button with the same destination;
- Stop focus across ordinary polling; and
- Stop focus restoration after an injected transient `503` run-command
  failure.

### Final verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `59` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `13.248602 s`; median case time was `0.738296 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-1d68f089113a46569db29586c1c3cd5c`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,183,756` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,426,954` bytes with SHA-256
  `23973bc394498d8a431e2109a8cb52546c687ba48cb4c64fc31e08aa31a48774`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
