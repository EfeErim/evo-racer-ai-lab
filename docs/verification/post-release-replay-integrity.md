# Post-release replay integrity

Date: `2026-08-04`

Scope: Results replay navigation and Python-authored replay contract integrity
on top of the locally verified, unpublished `v1.1.1` correction.

## Corrected findings

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

## Correction

- Generation and terminal replay frame arrays must contain at least one frame.
- Every replay time must be non-negative and strictly greater than its previous
  frame time.
- Terminal `sampleEverySteps` must be a positive integer.
- Results uses one bounded navigation helper for Previous, Next, and Restart,
  and normalizes the displayed index before selecting a frame.
- Invalid Saved results show the exact parser error while retaining the valid
  library and re-enabling **Open results** for a later retry.

## Reproduction and regression coverage

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

## Final Phase 10 verification

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
