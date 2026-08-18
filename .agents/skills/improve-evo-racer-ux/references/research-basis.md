# EvoRacer UX research basis

Research refreshed: `2026-08-10`.

Use these sources to justify decisions, not to decorate an audit. Recheck primary documentation when a requirement may have changed. Research is development-only; never add a runtime network dependency.

## Contents

1. Usability outcomes and heuristics
2. Windows desktop interaction
3. Human-AI interaction
4. Game UI and accessibility
5. Web accessibility
6. Evidence hierarchy and community research
7. EvoRacer deductions

## 1. Usability outcomes and heuristics

- [ISO 9241-11:2018](https://www.iso.org/standard/63500.html) defines usability as an outcome of use in a specified context. Evaluate effectiveness, efficiency, and satisfaction against concrete users, goals, tasks, resources, and environment; do not treat visual polish as usability proof.
- [Nielsen's 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) require visible system status, user-language terminology, control and freedom, consistency, error prevention, recognition rather than recall, efficient use, restraint, recoverable errors, and contextual help.

EvoRacer application:

- Define each audit around a player task and an observable end state.
- Keep current run state and the next valid action visible.
- Prefer recognition and contextual explanation over documentation the player must remember.
- Treat task completion, recovery cost, and avoidable actions as stronger evidence than subjective visual taste.

## 2. Windows desktop interaction

- [Windows commanding basics](https://learn.microsoft.com/en-us/windows/apps/design/basics/commanding-basics) starts with what users need to accomplish, then chooses controls and command surfaces. Buttons trigger immediate actions; menus organize secondary commands.
- [Windows progress controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls) distinguishes determinate progress for known duration from indeterminate progress for unknown duration and recommends explanatory text when the indicator alone is insufficient.
- [Windows design guidelines](https://learn.microsoft.com/en-us/windows/apps/design/guidelines-overview) emphasize consistent hierarchy, commanding, layout, typography, motion, and clear language.
- [Progressive disclosure controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls) keep the baseline simple while revealing optional detail on demand. Do not hide information required for the current task.

EvoRacer application:

- Give every screen one dominant next action and keep secondary tools subordinate.
- Use determinate generation/candidate progress because Python knows completed and total work.
- Use honest labeled waiting states for validation, generation, import, save, and shutdown.
- Collapse advanced setup and dense telemetry, not validation errors, current progress, or recovery.

## 3. Human-AI interaction

- [Guidelines for Human-AI Interaction](https://doi.org/10.1145/3290605.3300233) synthesized more than 150 recommendations and validated 18 guidelines through multiple rounds of evaluation. Relevant guidance includes making capabilities and quality clear, showing contextually relevant information, supporting efficient invocation/dismissal/correction, and explaining why the system acted as it did.
- [Microsoft Research publication and paper](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) provides the authoritative publication context and full paper.
- [Google PAIR mental models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/) recommends explaining user benefit rather than technology, setting accurate capability limits, introducing features when relevant, and failing gracefully without a dead end.
- [Google PAIR feedback and control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/) emphasizes editability, reset/fallback paths, minimal interruption, and communicating what control changes and when it takes effect.

EvoRacer application:

- Explain that the user observes evolution; they do not drive or directly teach during an episode.
- Distinguish “currently evaluating,” “generation champion,” and “final result.”
- Explain Fixed GA/NEAT in outcome language first; put topology and genome detail second.
- Show why a run is valid, paused, queued to stop, terminal, or incomparable.
- Provide correction before Start and recovery after local or algorithmic failure.

## 4. Game UI and accessibility

- [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines) are game-specific design and test guardrails covering text, contrast, input, navigation, focus, context, errors, motion, and documentation.
- [XAG 101: Text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101) recommends a minimum default rendered text body height of `18 px` for PC/VR at 1080p, support for scaling to 200%, readable spacing, sentence case, and accessible text across menus, HUDs, errors, and loading states.
- [XAG 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) requires logical, consistent navigation and keyboard-only access on PC.
- [XAG 114: UI context](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/114) recommends plain critical UI language and realistic previews of settings where possible.
- [XAG 115: Errors and destructive actions](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/115) requires identifiable, correctable errors and review, confirmation, or reversal before destructive actions.
- [XAG 117: Visual distractions and motion](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117) recommends pause, stop, hide, or frequency control for moving and auto-updating content shown alongside text.

EvoRacer application:

- Do not accept tiny labels merely to preserve a dense “lab” aesthetic.
- Keep navigation position and interaction behavior consistent across all six routes.
- Show track/setup changes in the real preview context.
- Confirm deletion of saved tracks/runs and preserve actionable error detail.
- Let the player reduce browser-owned motion without changing Python evaluation.

## 5. Web accessibility

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the baseline standard for the browser UI.
- [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) requires `24 x 24` CSS pixel targets or sufficient spacing/equivalent controls, with larger targets recommended for important actions.
- [What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) explains focus-not-obscured and focus-appearance criteria. Use a visible indicator with meaningful size and contrast.
- [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) requires success, waiting, progress, and error status changes to be programmatically determinable without unnecessary focus movement.
- [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) requires user control over long-running automatic movement or updating shown in parallel with other content.
- [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions) recommends respecting reduced-motion preferences and removing non-essential interaction motion.

EvoRacer application:

- Prefer `44 px` primary action height while treating WCAG's `24 px` target as a floor, not a goal.
- Use semantic controls, connected labels/help/errors, `role="status"` for routine changes, and `role="alert"` only for urgent errors.
- Test focus through route rerenders and poll-driven Training updates.
- Test at narrow width, 200% text/zoom, and reduced motion without losing task completion.

## 6. Evidence hierarchy and community research

Use evidence in this order:

1. EvoRacer's product contract, rendered behavior, Python-owned state, saved artifacts, and tests.
2. Primary standards and platform guidance in this file.
3. Maintainer documentation, source code, reproducible GitHub issues, and research implementations.
4. Reddit and other community reports as qualitative discovery evidence.

Read `community-evidence.md` for source-selection rules and current GitHub/Reddit findings. Never convert a popular post, reaction count, or isolated issue into a universal requirement. Use community reports to identify scenarios worth reproducing; use local measurements and task completion to decide whether EvoRacer has the problem.

## 7. EvoRacer deductions

The sources above support these project-specific priorities:

1. Optimize the recommended first experiment before expert customization.
2. Make “what is happening now?” answerable in one glance during Training.
3. Keep the race, overall progress, current candidate, and run controls above telemetry depth.
4. Use visual density only when labels remain readable and targets remain operable.
5. Pair every background operation with truthful pending, completion, and recovery states.
6. Verify that a chosen/generated track and setup are the exact values used by Review and Start.
7. Treat a passing automated suite as necessary engineering evidence, not proof that representative users find the product easy.
8. Judge generated tracks by validity, distinguishable feature composition, visual variety, and fitness for the requested driving style; a different seed alone is not evidence of meaningful variety.
