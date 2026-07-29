---
name: build-evo-racer
description: Build, test, review, package, or advance EvoRacer AI Lab phase by phase. Use for work in this repository involving its offline Windows application, onboarding and training UX, modular track editor, seeded track generator, arcade vehicle physics, Fixed GA, NEAT, replay, persistence, release gates, or project milestone status.
---

# Build EvoRacer

Deliver EvoRacer through verified phase gates without weakening its offline, observer-only, deterministic product contract.

## Ground the task

1. Read the repository-root `AGENTS.md`.
2. Read `PROJECT_STATE.md`.
3. Read `references/product-contract.md` before changing product behavior, architecture, schemas, physics, evolution, persistence, or packaging.
4. Read `references/phase-gates.md` before planning or implementing a phase, closing a milestone, or updating project state.
5. Inspect the working tree and preserve unrelated user changes.

## Select the work

- Work on the current phase unless the user explicitly requests a narrower diagnostic or documentation task.
- Treat later-phase prerequisites discovered early as notes, not authorization to skip the current gate.
- When requirements conflict, preserve the latest explicit user decision and update the product contract before implementation.
- Research current primary sources before selecting or upgrading dependencies or algorithms. Research may use the internet; the released application may not.

## Implement

- Keep changes limited to one coherent phase deliverable.
- Keep Python authoritative for track compilation, generated geometry,
  validation, physics, sensors, controller execution, episode evaluation,
  fitness, baselines, persistence, and Fixed GA/NEAT orchestration.
- Keep TypeScript limited to browser UI state, interaction, rendering, charts,
  and the versioned IPC client. Do not duplicate Python domain rules there.
- Keep cross-runtime messages versioned and fixture-tested.
- Prefer batched simulation commands and observation snapshots; UI render timing
  must not affect Python simulation timing or outcomes.
- Keep all runtime assets and dependencies local.
- Do not mutate an active vehicle's genome, network, or setup parameters.

## Verify

1. Run focused tests for changed behavior.
2. Run the current milestone's full gate before completion.
3. Check deterministic seed behavior when touching tracks, physics, evolution, or replay.
4. Check the offline boundary when touching dependencies, frontend assets, launcher, persistence, or packaging.
5. Save concise evidence in `PROJECT_STATE.md`.

## Close the work

- Mark a milestone complete only when all listed gates pass.
- Update the current phase and next action after verification.
- Report incomplete gates honestly; do not substitute planned work for evidence.
- Do not start the next phase in the same change unless the user explicitly requests it and the current gate is already complete.

## References

- Read `references/product-contract.md` for locked product and architecture decisions.
- Read `references/phase-gates.md` for phase deliverables, milestones, and acceptance gates.
