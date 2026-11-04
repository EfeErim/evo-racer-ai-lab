# Recovery and error evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Post-release run recovery hardening

Original note: `post-release-run-recovery.md`.

Date: `2026-08-04`

Scope: run start, observation, pause/resume/stop command, and restore behavior on
top of the locally verified, unpublished `v1.1.1` correction.

### Corrected findings

- Run IPC failures used the generic `Local track command` label. Start,
  observation, command, and restore failures now identify the operation that
  actually failed and retain the HTTP status.
- Pause, resume, and stop remained clickable while a command request was in
  flight. Both controls now lock locally and show the pending command until the
  Python core acknowledges it.
- A slower observation response could overwrite a newer command response. Run
  requests now use a monotonic ownership version, so only the latest response
  for the current run may update the interface.
- A transient observation or command failure discarded the last ready snapshot
  and stopped recovery. The interface now keeps the last Python-verified run
  state visible, presents the exact failure, and retries observation
  automatically without advancing simulation in the browser.

### Browser verification

The real Chromium suite injects a temporary `503` observation failure, verifies
that live status and controls remain available, and waits for automatic
recovery. It then holds an older observation request open while a stop command
fails with `503`, releases the stale response, and verifies that the older
response cannot clear the command warning. A later observation recovers the
surface, and a second stop request reaches terminal Results.

The scenario runs at `390 x 844`, verifies no page-level horizontal overflow,
and checks the exact messages `Run observation failed with status 503.` and
`Run command failed with status 503.`.

### Final verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `59` Vitest and `105` pytest tests passed.
  - All `3` real Chromium flows passed, including the delayed stale-response
    recovery scenario.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `14.077176 s`; median case time was `0.738282 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-ac428c5178564012955410c2093a5c99`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,179,975` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,426,242` bytes with SHA-256
  `d41e5c5f4b21cb79493218915f999eac9c8680806e0b354a71e0eb37266baffc`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.

## Post-release Start recovery

Original note: `post-release-start-recovery.md`.

Date: `2026-08-04`

Scope: explicit Start failure handling and saved-run restore review on top of
the locally verified, unpublished `v1.1.1` correction.

### Corrected finding

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

### Regression coverage

Two onboarding state tests cover rejected and unconfirmed Start transitions.
The real Chromium recommended-run flow now performs this complete sequence:

1. Python-style `valid: false` Start rejection;
2. Review error display with Start locked;
3. successful revalidation;
4. injected HTTP `503` Start response;
5. unknown-result guidance with the valid setup and Start available;
6. explicit retry with a real Python run; and
7. Stop, Results, corrupt-export recovery, and retained Saved runs.

### Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `67` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "recommended offline run"`:
  passed.
- `npm run test:e2e`: passed all `4` real Chromium flows.

### Final Phase 10 verification

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

## Post-release saved-results recovery

Original note: `post-release-saved-results-recovery.md`.

Date: `2026-08-04`

Scope: terminal Saved runs access and terminal observation consistency on top
of the locally verified, unpublished `v1.1.1` correction.

### Corrected findings

- Welcome displayed a disabled **Resume** button for every completed or stopped
  record. After an application restart, the user could export or delete a
  terminal run but could not reopen its Results, comparisons, or replay.
- The browser parser validated individual result fields but did not require the
  result metadata run identity, terminal status, and generation counts to match
  the containing observation snapshot. It also accepted terminal results on a
  running snapshot and a generation-bearing terminal snapshot without a
  result. Those contradictions could produce a misleading or locked UI.

### Correction

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

### Regression coverage

- Onboarding state coverage verifies direct terminal restore to Results.
- Observation parser coverage rejects cross-run result metadata, a result on a
  running snapshot, and a missing terminal result after one generation.
- IPC coverage verifies `Saved results failed with status 503.` independently
  from export messaging.
- The real Chromium recommended flow stops a run, returns to Welcome at
  `390 x 844`, verifies no page-level overflow, opens the saved Results, and
  renders the champion replay before continuing the existing corrupt-export
  recovery checks.

### Focused verification

- `npm run typecheck`: passed.
- `npm test`: passed all `70` Vitest tests.
- `npx playwright test e2e/offline-flow.spec.ts --grep "recommended offline run"`:
  passed.
- `npm run test:e2e`: passed all `4` real Chromium flows.

### Final Phase 10 verification

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

## Post-release unconfirmed-Start Saved-run recovery

Original note: `post-release-unconfirmed-start-library-refresh.md`.

Date: `2026-08-04`

Scope: the recovery path after an interrupted Start response, Welcome route
entry, and truthful run-library refresh errors on top of the locally verified,
unpublished `v1.1.1` correction.

### Corrected findings

- An interrupted Start response correctly returned to Review and directed the
  user to **Welcome and Saved runs**, but navigating there reused the last run
  library snapshot. If Python had accepted and persisted the request before the
  transport interruption, the new run could remain invisible and the user
  could retry Start unnecessarily.
- Run-library refresh failures discarded the operation-specific IPC error and
  replaced an HTTP status such as `503` with a generic unavailable message.
- A naive entry refresh could overwrite the existing notice that a late Saved
  action response had been dismissed after leaving Welcome.

### Correction

- Every actual route entry into Welcome starts a new monotonic run-library
  request. Startup loading remains separate, while repeated Welcome entries
  invalidate older list responses through the existing request version.
- A ready library shows a temporary `Refreshing Saved runs from local storage.`
  notice while the request is active.
- Successful refreshes merge the current Python-owned list while restoring the
  prior meaningful notice, including dismissed-action ownership feedback.
- Refresh failures expose the exact IPC error, such as
  `Run library request failed with status 503.`.

### Regression coverage

The new real Chromium flow returns an empty run list at startup, interrupts
Start with HTTP `503`, and publishes a resumable run only in the next list
response. Before the correction, clicking **Welcome and Saved runs** left the
request count at `1`; after the correction it performs request `2` and exposes
the recovered run's Resume action.

The same flow then leaves and re-enters Welcome while request `3` returns HTTP
`503`; it verifies the exact run-library error. The existing held Saved-results
response test also proves that the entry refresh does not erase
`Saved run response ignored after leaving Welcome.`.

### Final Phase 10 verification

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

## Post-release Track startup recovery

Original note: `post-release-track-startup-recovery.md`.

Date: 2026-08-04

### Finding

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

### Correction

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

### Forced recovery evidence

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

### Full gate and package

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

## Post-release Saved runs startup recovery

Original note: `post-release-run-library-startup-recovery.md`.

Date: 2026-08-04

### Finding

The Saved runs library is requested when the browser starts. If that first
request failed, the exact error was rendered inside a collapsed panel and the
interface offered no retry action. The user could navigate away and back to
trigger another read, but the previous failure remained on screen until that
request completed and the failure surface still had no direct recovery path.

A forced Chromium test returned HTTP `503` for the first startup read. Before
the correction, the Saved runs panel had no `open` state, proving the failure
was hidden from sight.

### Correction

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

### Forced recovery evidence

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

### Full gate and package

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

## Post-release library and IPC error hardening

Original note: `post-release-library-error-hardening.md`.

Date: `2026-08-04`

Scope: Track Builder commands, track/run library actions, and versioned local
IPC response validation on top of the locally verified, unpublished `v1.1.1`
correction.

### Corrected findings

- Compile, assist, generate, save, and library requests shared generic track
  labels. HTTP failures now name the operation that actually failed, while
  connection failures retain their original error as the JavaScript `cause`.
- Python returns HTTP 200 with `deleted: false` when the requested local record
  no longer exists. Track and run deletion previously ignored that field; Track
  Builder could therefore report a successful deletion that never happened.
  Deletion now requires contract version 1, the exact requested identity, and
  `deleted: true`.
- Run export discarded Python's stable error message. A corrupt export now
  surfaces `The local run is corrupt and cannot be exported.` instead of a
  generic fallback.
- Track save, compile, and library payloads were trusted as TypeScript casts.
  Malformed, non-finite, identity-mismatched, or invalid-JSON responses now fail
  closed before reaching rendering state.
- One failed Resume, Export, or Delete replaced the complete valid Saved runs
  library with `unavailable`. Run actions now lock as one owned request, expose
  pending/success/error notices, and preserve the valid library after an
  operation-level failure. A restored custom track must compile successfully
  before the run can enter Training.

### Reproduction and browser verification

Before the correction, all four initial IPC regressions failed:

- generation 503 used `Local track command` instead of `Track generation`;
- `deleted: false` resolved successfully for both track and run deletion;
- corrupt run export lost the Python error; and
- an empty track-save response resolved as a successful typed value.

Chromium also reproduced the generic generation failure. The final real-browser
flow injects that 503, verifies the exact operation message, retries generation
successfully, saves the generated track, and injects `deleted: false` without
allowing a false success notice. A second injected corrupt-run export verifies
the `Exporting…` lock, exact Python error, retained Saved runs table, and
re-enabled actions.

### Final verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `65` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `10.853611 s`; median case time was `0.600820 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-7965f02ccf134d69a3fa169be19ca326`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,189,174` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,428,928` bytes with SHA-256
  `f156716cdd13df42eca95377e86c12205a2421343cab58ef8c7c9bab98c79f21`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.

## Post-release replay integrity

Original note: `post-release-replay-integrity.md`.

Date: `2026-08-04`

Scope: Results replay navigation and Python-authored replay contract integrity
on top of the locally verified, unpublished `v1.1.1` correction.

### Corrected findings

- A zero-frame terminal replay passed the TypeScript observation parser. On
  **Next**, the Results state calculated `frames.length - 1` and stored `-1` as
  its current frame index.
- A stale Results index could remain larger than a replacement replay and make
  the frame badge disagree with the final frame actually rendered.
- Replay timestamps were checked only for finite numbers. The presentation
  animation uses timestamp-ordered binary search, so a corrupt local RunV1 with
  duplicate or decreasing times could select the wrong interval and visibly
  jump backward.
- `sampleEverySteps` accepted zero and negative integers even though Python
  emits a positive fixed replay interval.

Python episode evaluation always records at least its final snapshot, records
strictly increasing non-negative simulated times, and emits a positive replay
sampling interval. The browser correction validates those transport invariants
without duplicating simulation behavior.

### Correction

- Generation and terminal replay frame arrays must contain at least one frame.
- Every replay time must be non-negative and strictly greater than its previous
  frame time.
- Terminal `sampleEverySteps` must be a positive integer.
- Results uses one bounded navigation helper for Previous, Next, and Restart,
  and normalizes the displayed index before selecting a frame.
- Invalid Saved results show the exact parser error while retaining the valid
  library and re-enabling **Open results** for a later retry.

### Reproduction and regression coverage

The new tests were run before the correction and produced five expected
failures: empty and unordered replay payloads were accepted, invalid sampling
was accepted, and the missing navigation helpers allowed invalid indexes.

After the correction:

- all `75` Vitest tests pass, including empty, single-frame, stale-index,
  invalid-sampling, empty-live-replay, and non-increasing-time cases;
- the real Chromium flow moves `Frame 1` to `Frame 2`, restarts at `Frame 1`,
  injects a duplicate timestamp into the actual Saved RunV1 export response,
  verifies the exact error, and successfully retries the same library action;
- the packaged `USER-GUIDE.md` contains the replay-boundary and corrupt-record
  behavior.

### Final Phase 10 verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `75` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.653313 s`; median case time was `0.639895 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-a360b93fe212402a98a9de15592d4560`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - Both development ports were free after the gate and `git diff --check`
    passed.
- The runnable folder contains `71` files totaling `20,195,376` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,430,713`
  bytes with SHA-256
  `a17796150f571a9d76b2d0cfc3c9d07b71731638a9661c3202b17da41e3a3c63`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
