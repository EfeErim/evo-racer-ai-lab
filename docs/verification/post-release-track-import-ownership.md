# Post-release Track import ownership

Date: `2026-08-04`

Scope: TrackV1 file import progress, concurrency, and Track Builder lifecycle on
top of the locally verified, unpublished `v1.1.1` correction.

## Corrected findings

- Import read and compiled a selected file without setting a Track Builder
  pending state. The file input remained enabled, so another file could begin a
  second Python compile and whichever response arrived last replaced the editor.
- A successful late import always wrote `toolsOpen: true`. Closing Track Builder
  or leaving Track while compilation was pending did not invalidate the request,
  so the old response could reopen the Builder and replace current editor state.
- Reopening a Builder whose draft was already valid replaced its truthful last
  notice with `Checking the starter draft…` even though no validation ran.

## Correction

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

## Regression coverage

The real Chromium reproduction held the actual `/v1/tracks/compile` response
for a valid imported oval. Before the correction, the file input remained
enabled and the new `toBeDisabled` assertion failed. Against the rebuilt
frontend, the picker is disabled with visible `Importing…` copy; closing the
Builder invalidates the held response, releasing it does not reopen the
workspace, and reopening shows the exact ignored-response notice.

A render-level Vitest assertion also locks the import picker and visible
progress copy whenever `workspace.pending === "import"`.

## Final Phase 10 verification

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
