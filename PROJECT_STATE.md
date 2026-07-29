# EvoRacer AI Lab Project State

## Current position

- Current phase: `Phase 1 - Offline shell and onboarding`
- Status: `in_progress`
- Active milestone: `M1 - Offline shell and onboarding`
- Last verified: `2026-07-29`

## Verified repository facts

- Git is initialized on branch `main`.
- The current README defines the Windows x64, offline, observer-only product and
  explicitly excludes human vehicle controls and non-loopback runtime services.
- The browser shell is TypeScript; the authoritative application, simulation,
  evaluation, evolution, and persistence core is planned in Python.
- TypeScript is restricted to browser UI state, interaction, rendering, charts,
  and the versioned IPC client.
- The Phase 0 Python service binds to `127.0.0.1` and has no third-party runtime
  dependency.
- JavaScript dependencies are exact in `package.json` and transitively locked in
  `package-lock.json`. Python development dependencies are exact in
  `requirements-dev.lock`.

## Completed milestones

### M0 - Reproducible Skeleton

Status: `complete`

Delivered:

- [x] Current README and Python-first architecture decisions.
- [x] Git repository, `.gitignore`, and `.gitattributes`.
- [x] Minimal TypeScript browser shell and Python application-core package.
- [x] Exact compatible JavaScript and Python dependency sets.
- [x] Format, lint, type-check, test, build, development, and smoke entrypoints.
- [x] One Python test and two TypeScript tests.
- [x] Loopback-only frontend and Python process startup.

Verification evidence recorded on `2026-07-29`:

- Toolchain: Node.js `v24.13.0`, npm `11.9.0`, Python `3.13.5`.
- `npm run check` passed Prettier, ESLint, TypeScript type-check, two Vitest
  tests, Ruff format/lint, strict mypy, one pytest test, and the Vite production
  build.
- `npm run smoke:m0` passed with the frontend at
  `http://127.0.0.1:4173` and Python health at
  `http://127.0.0.1:8765/health`.
- A clean copy at `.runtime_tmp/m0-clean-setup`, created without `.venv`,
  `node_modules`, `dist`, `.git`, or prior runtime files, passed these commands
  in order:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
  npm run check
  npm run smoke:m0
  ```

- Clean setup installed the exact locks, reported zero npm audit
  vulnerabilities, passed the same tests and build, and opened both loopback
  processes. The temporary validation copy was removed after verification.

## Blockers

- None.

## Next action

Implement Phase 1 only: the offline application shell and onboarding flow. Do
not start Phase 2 until every M1 gate passes.

## State update rule

When work changes this file:

1. Record only verified facts.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
