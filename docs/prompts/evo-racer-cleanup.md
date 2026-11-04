# EvoRacer cleanup prompt

Use this prompt in a new Claude Code session opened at
`C:\Users\MONSTER\repos\evo-racer-ai-lab`. It addresses the findings from the
repository review on `2026-11-04`, after `main` reached `dd05a89`.

---

You are working in the EvoRacer AI Lab repository. Follow `AGENTS.md` first.
Use `.agents/skills/build-evo-racer/SKILL.md` for planning, implementation,
review, and verification. Read `PROJECT_STATE.md` before changing code.

## Goal

Resolve the open high- and medium-priority review findings below, one at a
time, without changing player-visible behavior, the Python-owned simulation
rules, or the offline and loopback product invariants. Work in small commits on
a feature branch created from `main`. Do not push, tag, or publish unless I ask.

## Ground rules

- Run `py -3.13` tooling through the existing `.venv`. Use `scripts/setup.ps1`
  if `.venv` or `node_modules` is missing.
- Do not add remote URLs, CDNs, telemetry, fonts, or runtime downloads. Do not
  bind any service to a non-loopback address.
- Do not reimplement Python domain rules in TypeScript.
- Before adding or upgrading a dependency, read its current primary
  documentation and state the version and source in your report.
- Update `PROJECT_STATE.md` only after recording concrete verification evidence
  (exact commands, results, and artifact paths).
- Do not claim a finding is fixed unless the change exists in the diff and its
  verification ran.

## Findings to resolve, in this order

### 1. Split `src/app.ts` (3976 lines)

`src/app.ts` holds 41 top-level functions and 26 module-level `let` variables.
Every render replaces the whole shell with `root.innerHTML`, and focus is
preserved by capture and restore logic.

- Extract route and view modules (for example Welcome, Track, Settings, Review,
  Training, Results, Saved runs, and Track Builder) plus a small state store.
- Keep `escapeHtml` on every interpolated value. Do not introduce a second
  escaping path.
- Move in behavior-preserving steps. After each step, run the TypeScript checks
  and Vitest.
- Acceptance: `npm run check` passes, `npm run test:e2e` passes all `15` flows,
  and `src/app.ts` is materially smaller with no duplicate logic left behind.

### 2. Make `PROJECT_STATE.md` a state document, not a changelog

The file is about `1080` lines. Its `Unreleased v1.1.1` section is a long list
of per-fix entries.

- Keep the current phase, active milestone, blockers, next action, gate
  definitions, and a short evidence index.
- Move per-fix history into `docs/releases/v1.1.1.md` or the matching
  `docs/verification/*.md` file.
- Keep every artifact path that the document cites valid.
- Acceptance: `npm run format:check` passes, every cited path exists, and no
  verified fact is lost.

### 3. Consolidate `docs/verification/`

There are `45` files, many of them small `post-release-*` notes.

- Propose a grouping first, then merge the notes into fewer files by theme.
- Preserve the evidence content. Update all references in `PROJECT_STATE.md`,
  README, and other docs.
- Acceptance: no broken links, and a script or grep check shows zero dangling
  references.

### 4. Add continuous integration

There is no `.github` directory, so the full check runs only by hand.

- Add a GitHub Actions workflow on `windows-latest` that runs `npm ci`,
  `npm run check`, and `npm run test:e2e` (install Playwright Chromium first).
- Read the current official GitHub Actions and `actions/setup-node` docs, and
  pin actions to full commit SHAs.
- The workflow must not change any runtime behavior or add a runtime dependency.
- Acceptance: the workflow file is valid YAML, and you describe exactly what it
  runs. Do not claim it passes until it has run on GitHub.

### 5. Move dev tooling out of the shipped package

`python/src/evo_racer/hardening.py` is the Phase 10 regression and benchmark
matrix. It is development and release-gate tooling, but it lives in the runtime
package.

- Move it to a tooling location (for example `python/tools/` or `scripts/`),
  update imports in `python/tests/test_phase10_hardening.py`,
  `scripts/phase10-gate.ps1`, `scripts/test-thorough.ps1`, and
  `scripts/test-release.ps1`, and check `packaging/EvoRacer.spec`.
- Keep the regression SHA-256 unchanged. The reviewed fixture is
  `contracts/phase10-regression.json`.
- Acceptance: `npm run test:python` and `npm run test:phase10` pass, and the
  release build still bundles the application without the tooling.

### 6. Remove hard-coded `.venv` paths

About nine PowerShell scripts and several `package.json` scripts hard-code
`.venv\Scripts\python.exe`.

- Add one helper that resolves the venv interpreter and fails with a clear
  message when it is missing. Use it from the scripts.
- Keep `py -3.13` for venv creation in `scripts/setup.ps1`.
- Acceptance: each script still runs, and a missing venv gives a clear error.

### 7. Review broad exception handlers

- `python/src/evo_racer/launcher.py:87`
- `python/src/evo_racer/observer.py:144`
- `python/src/evo_racer/observer.py:749`

For each one, decide whether it should catch a narrower type and whether the
error must be logged or surfaced. Add a focused test for any behavior change.

### 8. Confirm development origins are not active in release

`ALLOWED_DEVELOPMENT_ORIGINS` in `python/src/evo_racer/service.py` permits
additional CORS origins. Check whether it can be reached in the packaged
application. If it can, gate it behind an explicit development switch and add a
test. Report what you found even if no change is needed.

### 9. Split `e2e/offline-flow.spec.ts` by flow

The file has `1381` lines and `15` tests. Split it into themed spec files
without changing test count or assertions. Acceptance: `npm run test:e2e`
still passes all `15` flows.

### 10. Verify TypeScript and typescript-eslint compatibility

`typescript` is pinned to `6.0.3`. `AGENTS.md` requires a typescript-eslint
compatible release. Read the typescript-eslint support matrix, confirm
compatibility with evidence, and record it in `PROJECT_STATE.md`.

## Verification before each commit

1. `npm run check`
2. For frontend changes: `npm run test:e2e`
3. For Python changes: `npm run test:python` and `npm run typecheck:python`
4. For release-adjacent changes: `npm run test:phase10`, and `npm run test:release`
   only when you have confirmed it will not disturb the existing release files

## Report format

For each finding, report:

- its status: fixed, partly fixed, not fixed, or not applicable
- the commit SHA and the files changed
- the exact commands run and their results
- anything you could not verify, and why

Start with the findings that are blocked or unverified.
