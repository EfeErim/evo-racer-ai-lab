# EvoRacer UX verification playbook

Use this playbook to convert UX claims into observable evidence. Select every scenario affected by the change; broad UX claims require the full matrix.

## 1. Establish the baseline

Before editing:

1. Record the starting route, data state, viewport, motion preference, and input method.
2. Capture the complete task, not only the screen under discussion.
3. Note task completion, wrong turns, required actions, blocked states, and recovery cost.
4. Capture a DOM snapshot for semantics and a screenshot only when visual judgment matters.
5. Measure critical text, targets, focus, contrast, overflow, and content position.

Do not preserve a poor baseline merely because existing E2E tests encode it. Update tests when the intended user behavior changes.

## 2. Scenario matrix

### First experiment

- Fresh Welcome communicates observer-only purpose.
- Recommended setup reaches Review directly.
- Validation is visible and Start remains explicit.
- Start submits the shown track and setup.
- Training shows real current work before the first generation completes.
- Terminal status exposes Results immediately.

### Custom experiment

- Preset selection remains active through Review and Start.
- Generated track becomes active without hidden secondary work.
- Edited/imported track reports exact actionable validation.
- Settings preset and advanced edits show their consequence and evaluation budget.
- Leaving and returning does not silently replace valid choices.

### Track Builder

- Open/close focus handoff works.
- Editor, generator, and library tabs follow correct semantics and keyboard order.
- Preview and validity are readable at desktop and narrow widths.
- Undo, redo, delete, reset, assist, generate, import, save, select, export, and delete expose truthful pending/success/error states.
- Generated/selected TrackV1 is asserted in the downstream Start request.

### Training

- Candidate/replay motion comes from Python observations only.
- Overall generation and active-candidate progress are distinguishable.
- Pause/resume/stop behavior and generation-boundary queueing are explicit.
- Polling rerenders do not steal focus or close disclosures.
- Transient observation and command failures retain the last valid snapshot and a retryable path.
- Reduced motion stops presentation interpolation without changing simulation state.

### Results and saved runs

- Improvement, champion, baselines, metadata, and comparability are understandable.
- Replay navigation clamps empty, single-frame, and terminal states safely.
- Saved run open, resume, export, and delete preserve correct route/action ownership.
- Destructive actions require confirmation and report exact completion.
- Corrupt records are isolated without blocking valid entries.

## 3. Presentation matrix

Test at least:

- desktop `1280 x 720`;
- narrow `390 x 844`;
- keyboard-only navigation;
- operating-system reduced motion;
- 200% browser zoom or equivalent text scaling;
- default, loading, empty, validation failure, transport failure, and success states.

For a shipped Windows UX change, repeat the critical journey through the packaged application, not only Vite development mode.

## 4. Measurements

### Typography

- Inspect computed CSS font size and rendered bounds for critical labels, help, statuses, table data, and controls.
- Reject meaningful text below `12px` CSS.
- Target `14px` or larger for ordinary UI and `16px` or larger for task instructions.
- At 1080p, compare rendered body height with XAG 101's `18px` PC guidance.
- Verify text can scale without clipping, overlap, two-dimensional reading scroll, or loss of function.

### Targets and focus

- Measure each primary and dense adjacent target.
- Prefer `44px` primary action height; enforce WCAG `24 x 24` minimum or valid spacing/equivalent exception.
- Verify a visible focus indicator, logical order, no obscured focus, and stable focus after rerenders.

### Contrast and state

- Measure ordinary text at `4.5:1` and meaningful non-text/focus at `3:1` minimum.
- Verify selected, disabled, pending, success, warning, and error states without color alone.

### Layout

- Compare document `scrollWidth` and `clientWidth`.
- Check that essential actions are visible without page-length searching.
- Allow contained table/sequence scrolling when labeled and usable; reject complete-page horizontal overflow.

### Progress truth

- Map every displayed numerator, denominator, percentage, and label to a Python observation field or a documented UI-only presentation state.
- Never estimate time remaining unless measured and explicitly labeled as an estimate.
- Verify pending status appears immediately and completion/failure does not depend on focus movement.

## 5. Automated evidence

Use the smallest test that proves each behavior:

- Vitest for TypeScript state transitions, render contracts, parsing, and focus helpers.
- pytest for Python-owned validation, observer state, persistence, and domain outcomes.
- E2E for complete tasks, semantics, keyboard operation, route ownership, actual request payloads, and browser measurements.
- `npm run check` for source acceptance.
- `npm run test:e2e` for journey acceptance.
- `npm run test:release` for packaged browser behavior and offline/runtime boundaries.
- `npm run test:phase10` only when the complete current release gate is required.

A test that checks text existence does not prove readability. A screenshot does not prove keyboard access. A unit test does not prove the value reached Start. Use evidence matched to the claim.

## 6. Human validation boundary

Automated and expert review can verify conformance, consistency, task wiring, and obvious friction. It cannot prove subjective satisfaction or intuitive use for representative people.

For a top-tier UX claim, plan moderated or unmoderated task testing with at least these prompts:

1. “Show me what this application does and start the recommended experiment.”
2. “Generate a hard long track and use it for a new run.”
3. “Tell me what the AI is doing right now and stop it safely.”
4. “Decide whether the final champion improved and why.”
5. “Return later and continue an interrupted run.”

Record task success, time on task, wrong turns, assistance, recovery, and a post-task ease rating. Use SUS only for overall perceived usability after representative task exposure; do not substitute it for observed task evidence.

## 7. Evidence record template

For each verified change, record:

```text
User job:
Baseline problem:
Change:
Viewport/input/state:
Behavioral proof:
Measurement proof:
Automated commands:
Packaged proof:
Remaining human-validation limit:
```

Completion requires evidence for every affected happy path, failure path, viewport/input mode, product invariant, and named acceptance command. If any required evidence is missing, report the work as incomplete.

