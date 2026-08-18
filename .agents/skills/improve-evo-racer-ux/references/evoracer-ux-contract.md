# EvoRacer UX contract

This reference specializes the repository product contract for UX work. If it conflicts with repository-root instructions or the build skill's product contract, the authoritative repository instruction wins.

## Locked product boundaries

- Run completely offline as a Windows x64 application with bundled dependencies.
- Use loopback-only `127.0.0.1` IPC; add no runtime remote asset, font, API, telemetry, analytics, update, or download.
- Start at Welcome and never begin training automatically.
- Require a valid reviewed setup and an explicit Start action.
- Keep the user an observer; provide no vehicle-driving control.
- Keep Python authoritative for tracks, validation, simulation, evolution, persistence, and results.
- Keep TypeScript limited to UI state, interaction, rendering, charts, and versioned IPC.
- Keep visualization timing independent of deterministic simulation outcomes.
- Keep product copy in English and user data local.

## Core audiences

### Curious first-time user

Wants to see AI cars evolve quickly without understanding genetic algorithms. Needs a short promise, a recommended setup, explicit Start, visible movement/progress, and a clear result.

### Returning experimenter

Wants to change one meaningful factor, compare runs, resume work, and understand whether results are comparable. Needs persistent context, compact controls, and trustworthy metadata.

### Track creator

Wants to create or generate an interesting valid track and know it is the track used for training. Needs immediate preview, corrective validation, undo/repair, and unambiguous active selection.

### Keyboard or motion-sensitive user

Needs complete keyboard operation, durable focus, readable text, stable auto-updating surfaces, and motion reduction that does not alter results.

## Canonical journeys

### Recommended first experiment

`Welcome -> Review recommended setup -> validation -> explicit Start -> Training -> Results`

Success means the user can state what the application will do, sees the chosen track/setup, intentionally starts, observes real progress, and reaches a comprehensible result without opening advanced tools.

### Full custom experiment

`Welcome -> Track -> Training Settings -> Review -> explicit Start -> Training -> Results`

Success means the selected preset, edited track, imported track, or generated track remains visibly active and is the exact TrackV1 submitted to Start. Advanced settings explain effects and show the maximum evaluation budget before Start.

### Recovery

`Failure/interruption -> exact status -> safe retained context -> explicit retry/resume/back path`

Success means no late response resurrects dismissed UI, no transient failure erases the last valid snapshot, and the user can continue without guessing whether work happened.

## Screen responsibilities

### Welcome

- State the observer-only value proposition in plain language.
- Make the recommended experiment the primary action.
- Show the three-part loop without presenting a tutorial wall.
- Keep Saved runs discoverable but secondary.

### Track

- Make the active track unmistakable.
- Keep preset selection easy and the Track Builder clearly optional.
- In Builder, separate editor, generator, and library tasks without hiding their current status.
- Keep preview, validation, and the action that makes a track active together.

### Training Settings

- Lead with outcome-oriented presets.
- Keep exact numeric controls collapsed until requested.
- Explain cost using maximum candidate episodes and expected task implications, not vague labels alone.

### Review

- Summarize only consequential choices.
- Show validation as pending, valid, or actionable failure.
- Keep Edit routes obvious and Start locked until current validation succeeds.
- State that navigation/validation alone does not start training.

### Training

- Prioritize the authoritative track, moving evaluated candidate or champion replay, completed generations, active candidate, and controls.
- Distinguish evaluation progress from replay presentation.
- Make queued boundary commands explicit.
- Keep telemetry and network/genome detail subordinate.
- Surface Results beside terminal status.

### Results

- Answer: did performance improve, what did the champion achieve, how does it compare, and can the comparison be trusted?
- Keep chart legends, units, baselines, and result status readable.
- Make replay controls and return/new-run actions obvious.

## Copy rules

- Name the user outcome: `Generate & use track`, not `Submit`.
- Use sentence case and direct verbs.
- Explain unfamiliar terms at first use; never expose internal error categories as the only message.
- State what happened, what remains safe, and what the user can do next.
- Avoid marketing claims, anthropomorphic AI language, defensive disclaimers, and dense implementation detail in the primary flow.
- Never label stopped work `Complete`, uncertain transport `Failed`, or an old preview as matching edited inputs.

## Visual hierarchy rules

- One primary action per decision surface.
- Essential state and action stay above optional detail.
- Ordinary UI text targets at least `14px` CSS; task instructions target `16px` or more. Validate actual rendered body height against game accessibility guidance.
- Text below `12px` CSS is unacceptable for meaningful information.
- Primary targets prefer `44px` height; dense secondary controls still meet accessible size/spacing.
- Use layout, weight, wording, iconography, and contrast together; color is never the only state signal.
- Dense lab data may use tables and compact notation, but not at the cost of legibility, focus, or horizontal document overflow.

## State ownership rules

- Every pending action belongs to the route, panel, and request version where it began.
- Late presentation responses cannot navigate, reopen, replace, or announce success after their context is gone.
- Mutating Python commands may require a fresh ordered read even when their UI response is dismissed.
- Preserve focus and disclosure state during same-route rerenders.
- Preserve the last valid snapshot during transient observation/command failure.
- Display Python-authored stable validation detail; do not recreate domain validation in TypeScript.

## Current high-risk surfaces

Always remeasure the current build; this list is routing guidance, not proof of a defect.

- Microtypography and dense captions in Track Builder, navigation, chips, tables, and telemetry.
- Multiple card surfaces competing for primary hierarchy.
- Long or visually dense Track Builder workflows.
- Training screens where auto-updating detail competes with the race and progress.
- Terminal Results or recovery actions displaced by long content.
- Status messages that are visible but overly chatty, generic, or not programmatically announced.
- Narrow-screen tables and grids that preserve data but make the task hard to follow.

