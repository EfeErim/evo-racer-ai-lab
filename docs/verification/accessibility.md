# Accessibility verification

Roadmap step 3, recorded on 2026-11-07. Automated checks find only part of the
accessibility problems a screen can have, so a manual screen reader pass is still
required (see [NVDA checklist](#nvda-checklist)).

## Automated scan

`e2e/accessibility.spec.ts` runs [`@axe-core/playwright`](https://playwright.dev/docs/accessibility-testing)
`4.14.0` (axe-core `4.14`), a pinned development dependency that does not ship in the
package. It checks the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`
on nine surfaces in both dark and light color schemes:

- Welcome
- Track
- Track Builder
- Settings
- Settings with Exact settings open
- Review
- Training while running
- Training after it finishes
- Results

The test fails on any serious or critical violation and records every finding.

The first run found one serious violation on Review, `definition-list`: the two Edit
buttons sat directly inside the summary's `<dl>` groups, so assistive technology could
not pair each term with its value. Each button is now inside its own `<dd>`. After the
fix, all `18` scans report **no violations of any impact**.

## Reflow and text scaling

The same nine surfaces are walked at `320 × 640` CSS px, which is a 1280 px window at
`400%` zoom (WCAG 1.4.10), and at `640 × 400`, which is `200%` (WCAG 1.4.4). Each is
measured for horizontal overflow, text smaller than the project minimum, contrast below
`4.5:1`, and targets below `24 × 24` px.

At `320` px the progress bar overflowed the page by `41` px because the current step
kept its visible label. Below `361` px that label is now visually hidden. The page title
still names the step, and `aria-current="step"` still marks it. The saved runs table
scrolls inside its own container, which WCAG 1.4.10 allows for two-dimensional data,
and does not widen the page. Both widths now pass on every surface.

## Keyboard

The existing keyboard-only journey test now runs at `1280` and `320` px: Welcome,
Review, Start, Stop after generation, Open results, and replay Pause. Focus must be
visibly outlined at each step. Both widths pass, and passed `3 / 3` times each as the
first test against a fresh service.

That repetition exposed a test defect, not a product one. Fifteen e2e waits used
`getByText("Setup is valid")`, which also matched the locked hint "It unlocks when the
setup is valid.". So they could continue while the check was still running and Start
was still disabled. They now require an exact match.

## Commands

- `npx playwright test e2e/accessibility.spec.ts`: `4` passed.
- `npm run test:e2e`: `35` passed.
- `npm run check`, `npm run lint`, and `npm run format:check`: passed.

`npm run test:release` was not run for this change. The release gate in roadmap step 6
covers the packaged application.

## NVDA checklist

This is a manual pass of about 15 minutes. Use NVDA with Chrome or Edge. The packaged EXE
opens in the default browser.

1. **Launch:** NVDA reads the page title, then "AI cars learn to race by evolution, and
   you watch." as the heading.
2. **Skip link:** The first Tab announces "Skip to main content", and Enter moves into
   the main area.
3. **Progress:** Tabbing through the step bar announces each step's number and name, and
   says "current step" on Welcome.
4. **Recommended setup:** "Review recommended experiment" opens Review, and the heading
   "Review and start" is read.
5. **Summary:** In browse mode, the Track, Training plan, Population, and Evaluation
   budget terms are read with their values. The Edit buttons are announced as
   "Edit track" and "Edit training plan".
6. **Check status:** "Checking the setup", then "Setup is valid", are announced without
   moving focus.
7. **Start:** The Start training button is announced. While locked, it is announced as
   unavailable with the reason "Start requires a successful setup check."
8. **Training status:** After Start, progress updates are announced without stealing
   focus. "Stop after generation" can be reached and pressed.
9. **Finish:** When training stops, "Open results" can be reached and its purpose is
   clear.
10. **Results:** The result summary is read. The comparison table reads its headers with
    each cell (Ctrl+Alt+arrows), and replay Pause and Play announce their new state.
11. **Saved runs:** On Welcome, the Saved runs disclosure announces collapsed or
    expanded state. Its table actions say which run they act on.

Record each item as pass or fail with a note, and add the results to this file.
