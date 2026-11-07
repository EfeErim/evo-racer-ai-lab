# EvoRacer AI Lab Project State

This file records the current position only. Per-fix history lives in
[`docs/releases/v1.1.1.md`](docs/releases/v1.1.1.md), and completed milestone
evidence lives in
[`docs/verification/milestone-history.md`](docs/verification/milestone-history.md).

## Current position

- Current phase: `Post-release v1.1.1 game and interface hardening`
- Status: `Physics v2 and its saved-run compatibility are on main and source-, CI-, Chromium-, and Windows-package-verified; evolved champions use the brake mainly as a constant speed limit; the rebuilt artifact remains unsigned and unpublished`
- Active milestone: `None`
- Last verified: `2026-11-06`

## Milestones

| Milestone | Scope                            | Status     | Evidence                                              |
| --------- | -------------------------------- | ---------- | ----------------------------------------------------- |
| M0        | Reproducible skeleton            | `complete` | `docs/verification/milestone-history.md`              |
| M1        | Offline shell and onboarding     | `complete` | `docs/verification/phase1-browser-audit.md`           |
| M2        | Track core and presets           | `complete` | `docs/verification/phase2-track-core.md`              |
| M3        | Editor, generator, track library | `complete` | `docs/verification/phase3-track-authoring.md`         |
| M4        | Physics, sensors, baselines      | `complete` | `docs/verification/phase4-physics.md`                 |
| M5        | Fixed GA                         | `complete` | `docs/verification/phase5-fixed-ga.md`                |
| M6        | NEAT                             | `complete` | `docs/verification/phase6-neat.md`                    |
| M7        | Observer experience and results  | `complete` | `docs/verification/phase7-observer-results.md`        |
| M8        | Persistence and recovery         | `complete` | `docs/verification/phase8-persistence-recovery.md`    |
| M9        | Windows offline package          | `complete` | `docs/verification/phase9-windows-offline-package.md` |
| M10       | Hardening and portfolio release  | `complete` | `docs/verification/phase10-hardening.md`              |
| M11       | Public binary publication        | `complete` | `docs/verification/phase11-publication.md`            |
| M12       | Personal offline v1.1.0          | `complete` | `docs/verification/release-hardening-audits.md`       |

## Gate definitions

Phase deliverables and acceptance gates are defined in
`.agents/skills/build-evo-racer/references/phase-gates.md`. A milestone closes
only when its deliverables exist, focused and phase-level tests pass, evidence
is recorded here, and documentation matches behavior.

## Evidence index

- Unreleased v1.1.1 per-fix history and package evidence:
  `docs/releases/v1.1.1.md`
- v1.1.0 hardening, verified repository facts, and milestone gate results:
  `docs/verification/milestone-history.md`
- Learning benchmark results: `contracts/learning-benchmark-v2.json`, with physics v1
  kept in `contracts/learning-benchmark.json`
- Physics v2 experiments and held-out matrix: `docs/verification/physics-v2.md`
- Phase and theme verification notes: `docs/verification/`

## Latest verification

Recorded on `2026-11-06` and `2026-11-07` for physics v2, first on the working tree on
top of `dd65b40`, then on `main`. Findings and limits are in
[`docs/verification/physics-v2.md`](docs/verification/physics-v2.md).

- `npm run test:phase10` passed as one command: `142` Vitest and `180` pytest tests, the
  loopback smoke, all `30` Chromium flows, all `18` matrix cases in `22.51 s` with
  regression SHA-256
  `0de8fb4b6915b1b26800ee680ec2619971a78b6a2eb4c17d3dd2e4635afab963`, the Windows build,
  and release acceptance including run `run-d84a8d3e02124529afbe5cee62e721e0`. The ZIP is
  `9,473,692` bytes with SHA-256
  `5a07dbce8be60f3280e701b7eccbe5ecf3511b44285b50ff99dd3cc2a341d7a4`.
- `npm run test:learning` verified all `30` cases against
  `contracts/learning-benchmark-v2.json`. Evolution beat the control in `25 / 30`.
- The predeclared held-out matrix saved `96` paired runs. Selection beat the control in
  `84 / 96`, and `55 / 96` evolved champions finished a lap.
- `python/tools/champion_brake_study.py` replayed all `96` champions from their saved
  genomes and reproduced each saved step count, finish flag, and termination. Of `55`
  finishers, `36` fail without brakes, but `54` still finish with the brake held constant
  at its mean. This analysis is exploratory and was added after the matrix ran.
- The packaged EXE, run with a temporary data folder seeded with physics v1 records, was
  driven through Review, Start, Training, and Results on Quick check. The champion
  finished at fitness `2297.8` against Pure Pursuit `2267.5`. The completed v1 run opened
  with its replay. The interrupted v1 run showed its explanation and no Resume, and the
  service refused it with `RUN_PHYSICS_INCOMPATIBLE`. All three runs exported and were
  listed again after the application exited and relaunched, and the v2 run reopened. The
  console had no errors, every request went to `127.0.0.1:8765`, and the only listener
  was on `127.0.0.1`.
- The Exit button was used with the browser's confirmation replaced by script, so the
  native confirmation prompt itself was not exercised. After Exit, no process or listener
  remained. A clean Windows machine with its network adapters disabled, 200% zoom, a
  screen reader, and first-time participants were not tested.
- This work landed on `main` as `fbf70eb` and `ef6b5be`. GitHub CI run `42359132144`
  passed on `ef6b5be`, including source checks and browser flows. A fresh
  `core.autocrlf=true` clone of that commit also passed `npm run check` (`142` Vitest,
  `180` pytest) and all `30` Chromium flows.
- `python/tools/brake_value_study.py`, an exploratory analysis, found that with the
  default car, varying the brake saves `1.1` to `4.4 s` per lap over the best constant
  speed. Under current fitness that is worth `11` to `44` points, against `1000` to `1300`
  for finishing.

Recorded on `2026-11-05` for the faster track generator and test suite, on the
uncommitted `test/faster-suite` working tree on top of `254ba2a`.

- The generator compiled every paired candidate before using the first. It now produces
  candidates on demand. Over `216` inputs (seeds `0` to `23`, `3` lengths, `3`
  difficulties, all in parallel) every response hash is identical to the earlier code;
  total generation time fell from `1667 s` to `195 s`, median from `4.45 s` to `0.91 s`,
  and maximum from `28.7 s` to `2.1 s`. The generator version is unchanged.
- pytest fell from `439 s` to `120 s`, with no test removed. `npm run check` passed in
  `145 s` with `139` Vitest and `175` pytest tests, and `npm run test:e2e` passed all
  `27` Chromium flows.
- `npm run build:release` and `npm run test:release` passed, including run
  `run-9c48bf46e20e427fad41868c21cf057e`. The ZIP is `9,471,385` bytes with SHA-256
  `25fee3ca0711ef8652a206438bbc9751c0c4ece168d02b6dbd22b7cb88ec66ab`. The learning
  benchmark was not rerun, because presets do not use the generator. CI has not run on
  this change.

Recorded on `2026-11-05` for the corrected Pure Pursuit reference and the learning
benchmark. The archive hash in this entry describes an earlier build. Findings and limits are in
[`docs/verification/learning-benchmark.md`](docs/verification/learning-benchmark.md).

These results are for the uncommitted working tree on `fix/learning-benchmark`, on top
of `e3027dc`.

- `npm run check` passed formatting, docs, lint, types, `139` Vitest and `171` pytest
  tests, and the production build. `npm run test:e2e` passed all `27` Chromium flows.
- `npm run test:learning` reproduced all `30` saved cases in `243 s`.
  `python/tools/hardening.py --fixture contracts/phase10-regression.json` verified all
  `18` cases in `33.9 s` with regression SHA-256
  `38f226ca983982f2263ee734bcde9c3fb6cf7a06ba360ad9015493932cde7105`. A field-by-field
  comparison with `HEAD` found only `pursuitFitness`, `pursuitProgress`, and
  `resultSha256` changed, in `15` cases.
- `npm run build:release` and `npm run test:release` passed, including run
  `run-7df49f3b943541108b830d2985a71cb4`. The ZIP is `9,470,281` bytes with SHA-256
  `fe89e829cd215674fbd32c52f800675187829a1bf7693d687e4da86e427c8c29`.
- The packaged EXE, run with a temporary data folder, was driven through Review, Start,
  Training, and Results for the recommended Quick check. Its champion finished the lap
  at fitness `2259.3`, Pure Pursuit finished at `2282.5`, and the random network read
  **Crashed**. The console had no errors and every request went to `127.0.0.1:8765`.
- Exit was not confirmed in that session because the hidden browser pane dismissed the
  confirmation, so the process was stopped directly. `npm run test:release` covers
  packaged startup and acceptance; this entry does not add a new check of the Exit
  button. The **Ran out of time** label is covered by Vitest only, since no packaged run
  produced it.
- `npm run test:phase10` was not run as one command. Its source checks, browser flows,
  matrix, smoke, build, release acceptance, and `git diff --check` were run individually.
  A clean Windows machine with its network adapters disabled was not tested.
- `npm run smoke:m0` passed after commit `b833259`, which contains these results.
- GitHub CI run `42046802452` passed on `254ba2a` on `main` in about `10` minutes,
  including source checks and browser flows.

Recorded on `2026-11-04` and `2026-11-05` for the CI repair, NEAT run isolation, port
ownership, and new Quick check budget. Causes and measurements are in
[`docs/verification/first-run-and-isolation.md`](docs/verification/first-run-and-isolation.md).

- In a clean `core.autocrlf=true` clone, `npm run test:e2e` passed `27` of `27` flows.
  `npm run check` passed formatting, docs, lint, types, and `135` Vitest tests. pytest
  had `163` passed and `1` failed from a `2 s` test timeout that also fails at `0c12cf6`.
  After that timeout was fixed, `test_service.py` and `test_launcher.py` passed `23`
  tests. `npm run check` then passed in full in the working tree: `135` Vitest and
  `164` pytest tests, plus the production build.
- `npm run build:release` and `npm run test:release` passed. The ZIP is `9,468,792`
  bytes with SHA-256
  `d22c2f92c73dc3091463910cf8b17159718db9b083e6990c18b1f694bb6a0e68`.
- The packaged EXE was clicked through Review, Start, Training, and Results. The Quick
  check on Easy Oval with seed `42` finished a lap. A second launch exited and left one
  listening process.
- GitHub CI run `41912431292` passed on `bcbf4e2`, which landed on `main` as `1b8ed53`
  with the same content, including source checks and browser
  flows. Every earlier recorded run on `main` failed.

Recorded on `2026-11-04` for the UI redesign, since committed in `0c12cf6` with the
race buffer below. Findings and measurements are in
[`docs/verification/ui-redesign.md`](docs/verification/ui-redesign.md). The archive
hashes in this entry and the two below describe earlier builds.

- `npm run check` passed: `135` Vitest and `158` pytest tests.
- `scripts/test-e2e.ps1 -Port 8798`: all `27` Chromium flows passed, including the
  two `e2e/track-builder.spec.ts` flows recorded as failing below.
- `npm run build:release` and `npm run test:release` passed. The ZIP is
  `9,464,880` bytes with SHA-256
  `28c1cd97620ba0c188ea8a9caa7da88d89334554a0168c4c3977641124935186`. This build
  replaced the `9241c104...` archive below and includes the redesign.
- Human usability testing, 200% zoom, a screen reader, a click-through of the
  packaged EXE, and a clean Windows machine with its network adapters disabled were
  not tested.

Recorded on `2026-11-04` for the two-second race buffer, since committed in `0c12cf6`.

- `npm run test:release` passed against the archive below, including run
  `run-ea5028c8295642b5bcd939faac50e1ac`, with loopback-only traffic and no
  external Node.js or Python process. It does not exercise the race clip or the
  buffered Training view, and it did not run on a clean Windows machine with its
  network adapters disabled.
- `npm run build:release` produced `release\EvoRacer\EvoRacer.exe` at `17:55:24`
  and `release\EvoRacer-Windows-x64.zip` with SHA-256
  `9241c10400a8143815294ec21c81625aad02b6ed2e289adaa4264bf124687f47`. Later
  concurrent UI edits in the working tree are not in this build.
- Over HTTP on port `8799`, that EXE bound only `127.0.0.1`, served the new bundle,
  returned `4` distinct race clips of `61` frames when requested, omitted the clip
  otherwise, and rejected a non-boolean request. The packaged page was not opened
  in a browser. One early smoke attempt reported no exit within `20 s` after
  shutdown; the cause is unknown, and `13` later attempts exited in under `1 s`.
- `npm run check` reached the production build with `158` pytest tests passing,
  including `python/tests/test_race_clip.py`.
- `scripts/test-e2e.ps1 -Port 8799`: `15` of `17` Chromium flows passed, including
  the new buffer flows. The two failures are in `e2e/track-builder.spec.ts`, which
  still expects `generator v4` after `c84f321` moved to generator version `5`.
- A real Balanced run changed cars at `2166`, `4252`, `6403`, and `8507 ms`, about
  every `2.1 s`. Stopping it let the car on screen finish before the champion
  replay returned.

Recorded on `2026-11-04` for the repository cleanup on branch
`chore/review-cleanup`:

- `npm run test:phase10` passed: `npm run check` (`111` Vitest and `151` pytest
  tests), the loopback smoke, all `15` Chromium flows, all `18` deterministic
  matrix cases in `13.639687 s` (median `0.767014 s`), the Windows build, and
  clean-runtime acceptance of `run-15aee91431d44d58946cb9b98d5ae0fd`.
- `npm run test:thorough` completed all `40` NEAT generations in `130.459674 s`
  with champion progress `1.0`.
- The current regression SHA-256 is
  `ebabfd77d04ff86870f207fc6627f5a14d50ff59a85779f2297d174b2cbe304d`, and `main`
  produces the same value. Earlier documents cite `88a77019...`, which predates
  the `contracts/phase10-regression.json` change in `ae638e3`.
- `release\EvoRacer-Windows-x64.zip` is `9,465,582` bytes with SHA-256
  `79fa476b4b23f35e60870d31bbbd4e13348cfeba55019d291399ec2b66dc1d4f`. It contains
  `index-CexApzbY.js` (`137,686` bytes) and `index-BeHh3psU.css` (`50,959`
  bytes). Artifact values in `docs/releases/v1.1.1.md` describe earlier builds.
- The packaged EXE answered `403` to Origins `http://127.0.0.1:4173` and
  `http://localhost:5173`, and `200` to its own origin. `PYZ-00.toc` does not
  contain the `hardening` tooling module.
- `typescript` `6.0.3` is within the `>=4.8.4 <6.1.0` range required by
  `typescript-eslint` `8.65.0`, according to its installed `peerDependencies`
  and <https://typescript-eslint.io/users/dependency-versions/>. `npm run lint`
  passes.
- `.github/workflows/ci.yml` parsed as YAML through Prettier. It had not run on
  GitHub at that time.
- Release acceptance blocks outbound traffic with unreachable proxies. A clean
  Windows machine with its network adapters disabled was not tested.

## Blockers

- The rebuilt EXE remains unsigned by explicit user decision; Authenticode is
  optional publication hardening and must not be claimed without a trusted
  certificate. No tag, push, or public release was requested.

## Next action

Decide whether physics v2's result is enough: brakes now matter, but evolved drivers use
them mainly as a constant speed limit, and current fitness pays little for lap time. Work
directly on `main`. Any
further physics, fitness, or settings change must be measured on new seeds and tracks,
because the held-out matrix is now development evidence. Remaining open checks are human
usability testing, 200% zoom, a screen reader, and a clean Windows machine with its
network adapters disabled.
Push, tag, publish, or apply the optional trusted-signing path only on explicit
request. Preserve the immutable
`v1.0.0` and `v1.1.0` tags, published
assets, saved evidence, and product claim boundary.

## State update rule

When work changes this file:

1. Record only verified facts. Put per-fix detail in the release or
   verification document, not here.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
