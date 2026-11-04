# EvoRacer AI Lab Project State

This file records the current position only. Per-fix history lives in
[`docs/releases/v1.1.1.md`](docs/releases/v1.1.1.md), and completed milestone
evidence lives in
[`docs/verification/milestone-history.md`](docs/verification/milestone-history.md).

## Current position

- Current phase: `Post-release v1.1.1 game and interface hardening`
- Status: `Generator v4 asymmetric circuits, active-track clarity, Smooth Results replay, and the Python-owned minimum-curvature reference are source-, Chromium-, and Windows-package-verified; the rebuilt v1.1.1 artifact remains unsigned and unpublished`
- Active milestone: `None`
- Last verified: `2026-11-04`

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
- Phase and theme verification notes: `docs/verification/`

## Blockers

- The rebuilt EXE remains unsigned by explicit user decision; Authenticode is
  optional publication hardening and must not be claimed without a trusted
  certificate. No commit, tag, push, or public release was requested.

## Next action

Commit, tag, publish, or apply the optional trusted-signing path only on
explicit request. Preserve the immutable `v1.0.0` and `v1.1.0` tags, published
assets, saved evidence, and product claim boundary.

## State update rule

When work changes this file:

1. Record only verified facts. Put per-fix detail in the release or
   verification document, not here.
2. Add the exact commands or artifact paths used as evidence.
3. Mark a milestone complete only when every gate in `phase-gates.md` passes.
4. Set the next phase to `in_progress`; never mark multiple phases active.
