---
name: improve-evo-racer-ux
description: Audit, research, redesign, implement, and verify EvoRacer AI Lab user experience end to end. Use for requests about UI, UX, usability, onboarding, navigation, visual hierarchy, readability, accessibility, Track Builder usability, setup friction, training observability, Results comprehension, saved-run recovery, responsive behavior, or a player-facing review of the offline Windows application.
---

# Improve EvoRacer UX

Make the complete player journey understandable, efficient, readable, recoverable, and visibly alive without weakening EvoRacer's offline, observer-only, deterministic product contract.

## Ground the work

1. Read repository-root `AGENTS.md` and `PROJECT_STATE.md`.
2. Read `../build-evo-racer/SKILL.md`, its `references/product-contract.md`, and its `references/phase-gates.md`.
3. Inspect the dirty worktree and preserve unrelated user changes.
4. Read `references/evoracer-ux-contract.md` for every task.
5. Read `references/research-basis.md` for a full audit, redesign, new interaction pattern, accessibility decision, or research request.
6. Read `references/community-evidence.md` for public benchmarking, GitHub/Reddit research, Track Builder work, or seeded track-generation UX.
7. Read `references/verification-playbook.md` before changing UI or claiming UX completion.

Treat the current rendered application and actual task behavior as the source of truth. Do not infer usability from component names, green tests, screenshots alone, or prior evidence.

## Choose the operating mode

- For a diagnosis or review, inspect and report evidence without changing files.
- For an audit or redesign, cover the complete relevant user job, not only the presenting screen.
- For an implementation request, fix the interaction and its states, add focused coverage, run the proportional gate, and record evidence.
- For broad requests such as “make the UX excellent,” begin with the recommended first-run journey, then the custom journey, observation, results, and recovery in that order.
- For new patterns or unstable standards, research current primary sources before deciding. Research may use the internet; the released product may not.

## Start from user jobs

Define the exact job, starting state, success state, and likely failure states before editing a screen. Use these core jobs unless the user narrows scope:

1. Understand what EvoRacer does and start a safe first experiment without outside help.
2. Choose or create a track, configure training, review consequences, and start explicitly.
3. Observe real AI progress, identify what is happening now, and control the run confidently.
4. Understand whether evolution improved, inspect the champion, and compare trustworthy results.
5. Recover from interruption, invalid input, local-core failure, or a saved run without losing context.

Measure the complete task. A locally improved control does not count if the next screen remains confusing or the selected value is not used downstream.

## Audit before redesigning

Run the relevant task from a clean/default state and from at least one failure state. Inspect:

- information architecture and next-action clarity;
- visible system status, progress truthfulness, and action ownership;
- visual hierarchy, typography, density, contrast, and whitespace;
- recognition versus recall, terminology, and contextual help;
- keyboard order, focus visibility, semantic structure, and status announcements;
- pointer target size, narrow-screen layout, zoom/text scaling, and reduced motion;
- loading, empty, stale, rejected, disconnected, destructive, and completed states;
- whether UI state and the Python-owned domain state agree.

Record every issue as: user job, direct evidence, user impact, root cause, severity, recommended correction, and proof required. Use:

- `P0`: prevents safe use, loses data, starts unintended work, or violates offline/deterministic boundaries;
- `P1`: blocks a core journey or makes current state/action materially unclear;
- `P2`: causes repeated friction, poor readability, or avoidable recovery cost;
- `P3`: polish with limited task impact.

Do not inflate severity because a screen looks unfashionable. Do not lower severity because a workaround exists elsewhere.
Treat GitHub issues and community posts as discovery signals. Confirm product behavior locally and use standards, measurements, tests, or representative user research for acceptance claims.

## Apply EvoRacer design rules

- Keep one unmistakable primary action on each decision surface; make its label describe the outcome.
- Keep the current state, next action, and result of the last action spatially close.
- Show essential status and recovery actions immediately. Use progressive disclosure only for optional depth.
- Prefer plain player language over GA/NEAT, IPC, schema, compiler, or service jargon. Keep technical detail available on demand.
- Explain AI capability, limits, current work, and result quality. Never imply that animation itself proves learning.
- Make known progress determinate and labeled. Describe unknown waits truthfully; never invent percentages or time remaining.
- Do not permit microtext. Treat rendered critical text below the XAG PC readability target as a defect; treat CSS text below `12px` as a blocker unless it is decorative and redundant. Aim for at least `14px` ordinary UI text and `16px` task instructions while separately verifying rendered size, scaling, and context.
- Prefer at least `44px` primary targets. Never go below WCAG's `24 x 24` minimum or its spacing exception without documented essentiality and an equivalent control.
- Use at least `4.5:1` contrast for ordinary text and `3:1` for meaningful non-text UI and visible focus. Never rely on color alone.
- Preserve a clearly visible keyboard focus indicator and logical focus order through rerenders, dialogs, tabs, and route changes.
- Honor the operating-system reduced-motion preference. Offer a visible presentation-only motion control where live replay competes with reading.
- Keep the race and current progress visually primary during Training. Put detailed telemetry behind a clear disclosure.
- Keep Results and recovery actions near terminal status; do not require a long search or page-length scroll.
- Treat a generated track as a reviewable candidate, not as implicitly selected. Make the apply action explicit, show the active track identity, and preserve it through Review and Start.
- Make seeded generation visibly deterministic: show the seed, a concise feature summary, and a same-seed regeneration path. Offer meaningful archetype/complexity choices without exposing raw algorithm internals first.
- Keep the interface a focused Windows desktop tool, not a marketing landing page or a wall of cards.

## Design the state model, not only the happy path

For every asynchronous action, define idle, pending, success, validation failure, transport failure, stale response, cancellation/dismissal, and retry behavior. Preserve the last valid Python-verified state when a transient presentation request fails.

Never:

- start training automatically;
- claim that an unconfirmed request succeeded or failed definitively;
- let a late response reopen a dismissed surface or overwrite newer state;
- hide the only recovery action inside collapsed content;
- report a generic local-core outage when Python returned a specific rejection;
- implement Python domain rules in TypeScript;
- use browser animation or polling cadence to advance simulation.

## Implement coherently

1. Correct the task flow and state ownership before visual styling.
2. Use semantic HTML and native controls where possible.
3. Keep Python authoritative for validation, tracks, simulation, evolution, persistence, and results.
4. Keep TypeScript responsible for interaction, presentation, rendering, and versioned IPC only.
5. Keep product copy concise, natural, and in English.
6. Update tests, user documentation, and evidence with the behavior.
7. Avoid dependencies or remote assets for visual polish; use local CSS, HTML, SVG, and bundled assets.

## Verify with behavior and measurements

Follow `references/verification-playbook.md`. At minimum:

1. Run focused unit/contract tests for changed state behavior.
2. Exercise the complete affected task in a real Chromium browser.
3. Test keyboard-only operation, visible focus, desktop and narrow viewports, reduced motion, and at least one failure/recovery path.
4. Measure rendered text, targets, overflow, and contrast for critical surfaces; do not rely on stylesheet intent.
5. Assert consequential state downstream, such as the TrackV1 or setup actually submitted to Start.
6. For generated tracks, verify same-seed equality, cross-seed variety, quality-gate rejection, explicit candidate application, and the exact active TrackV1 at Review and Start.
7. Run `npm run check`; run `npm run test:e2e` for journey changes.
8. Run `npm run test:release` when the shipped browser experience or package contents change. Run the documented composed gate before declaring the current release complete.
9. Update `PROJECT_STATE.md` only after concrete evidence exists.

Do not claim satisfaction, intuitiveness, learning improvement, or top-tier UX from automated checks alone. Without representative user testing, report verified usability properties and remaining human-validation limits.

## Report the result

Lead with what changed for the user. For an audit, order findings by severity and include the affected task, evidence, fix, and acceptance proof. For implementation, report the completed task outcome, tests and measurements, package path if rebuilt, and any unverified human-research boundary. State explicitly when commit, push, signing, or publication was not requested.
