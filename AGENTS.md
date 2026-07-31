# EvoRacer AI Lab Agent Instructions

## Scope

- Work only inside this repository unless the user explicitly expands scope.
- Do not modify sibling portfolio projects or `D:\bitirme projesi`.
- Treat existing user changes as owned work; preserve unrelated changes.

## Required workflow

- Use `.agents/skills/build-evo-racer/SKILL.md` for planning, implementation, review, testing, packaging, or phase-completion work in this repository.
- Read `PROJECT_STATE.md` before changing code or declaring a milestone complete.
- Complete the current phase and its gate before starting a later phase.
- Update `PROJECT_STATE.md` only after recording concrete verification evidence.
- Research current primary documentation before introducing or upgrading a dependency, algorithm, packaging mechanism, or file format.

## Product invariants

- The released Windows x64 application must work with Wi-Fi and Ethernet disabled.
- Never add runtime calls to remote APIs, CDNs, telemetry, analytics, update services, remote fonts, model downloads, or remote assets.
- Loopback communication on `127.0.0.1` is local-only IPC. Bind no runtime service to a LAN or public interface.
- Bundle every runtime dependency in a transparent portable folder. The user
  only extracts the release ZIP and opens `EvoRacer.cmd`; application source and
  web assets must remain outside executable archives.
- Never start training automatically. Require the user to review valid settings and press Start.
- The user observes AI racing and never drives a vehicle. Keyboard and pointer input are UI-only.
- Keep vehicle physics arcade-style and deterministic; do not introduce simulation-grade tire, suspension, drivetrain, or weight-transfer systems.
- Steering, throttle, and brake are continuous controller outputs.
- Genome, neural-network, and vehicle-setup parameters remain fixed throughout an episode. Mutate or cross them only while creating the next generation.
- `frontBrakeBias` and `frontDriveBias` are continuous `[0,1]` genome genes with no narrower artificial range.

## Engineering conventions

- Use Python as the canonical application and simulation core wherever browser
  execution is not required: tracks, generated geometry, validation, seeded
  generation, physics, sensors, controller execution, episode evaluation,
  fitness, baselines, evolution, persistence, and the local service.
- Keep TypeScript limited to browser-facing UI state, interaction, rendering,
  charts, and the versioned IPC client. Do not duplicate Python domain rules in
  TypeScript.
- Exchange versioned JSON contracts between TypeScript and Python. Prefer
  batched commands and observation snapshots so rendering cadence cannot change
  simulation results.
- Use `py -3.13`, not `python`, in Windows commands for this workspace.
- Keep TypeScript pinned to a typescript-eslint-compatible release; do not upgrade it independently.
- Keep generated geometry derived from canonical track-piece data instead of persisting duplicate boundaries and checkpoints.
- Prefer deterministic seeded behavior and stable serialization.
- Store user data locally under `%LOCALAPPDATA%\EvoRacerAILab`.

## Verification

- Run focused tests for every change.
- Before closing a phase, run all checks required by `.agents/skills/build-evo-racer/references/phase-gates.md`.
- Verify TypeScript/Python contract fixtures from both runtimes.
- For release work, test the packaged application on clean Windows with outbound networking disabled.
- Do not claim learning improvement, determinism, offline operation, performance, or milestone completion without saved evidence.

## Code review rules

- Flag any remote URL, runtime download, telemetry path, or non-loopback bind as a release blocker.
- Flag any mutation of genome or vehicle setup during an active episode as a correctness bug.
- Flag any TypeScript reimplementation of Python track, physics, sensor,
  controller, evaluation, fitness, evolution, or persistence rules.
- Flag phase advancement without its documented gate evidence.
