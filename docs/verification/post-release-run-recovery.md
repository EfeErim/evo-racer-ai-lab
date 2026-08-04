# Post-release run recovery hardening

Date: `2026-08-04`

Scope: run start, observation, pause/resume/stop command, and restore behavior on
top of the locally verified, unpublished `v1.1.1` correction.

## Corrected findings

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

## Browser verification

The real Chromium suite injects a temporary `503` observation failure, verifies
that live status and controls remain available, and waits for automatic
recovery. It then holds an older observation request open while a stop command
fails with `503`, releases the stale response, and verifies that the older
response cannot clear the command warning. A later observation recovers the
surface, and a second stop request reaches terminal Results.

The scenario runs at `390 x 844`, verifies no page-level horizontal overflow,
and checks the exact messages `Run observation failed with status 503.` and
`Run command failed with status 503.`.

## Final verification

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
