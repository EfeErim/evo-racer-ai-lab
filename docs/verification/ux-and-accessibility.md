# UX and accessibility evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Setup experience correction

Original note: `setup-experience.md`.

Verified on `2026-07-31` in the local Windows development application.

### Correction

- Welcome presents one primary **Review recommended setup** action for the
  preselected `Easy Oval + Quick start` configuration. Validation still runs
  through the Python-owned version 1 contract, and training still requires the
  separate explicit **Start training** action.
- **Customize setup** retains the complete Track and Training Settings route.
- The saved-run library, custom-track editor/generator/library, and exact
  algorithm/compute controls are collapsed until requested.
- The custom-track panel preserves its open state across editor renders.
- Observation polling changed from `100 ms` to `250 ms`. This caps scheduled
  full-interface refreshes at `4 Hz` instead of `10 Hz` while timestamp-based
  marker presentation continues through `requestAnimationFrame`.
- Hidden documents now poll at `1 Hz`, visible documents remain at `4 Hz`, and
  returning to the tab triggers an immediate observation. Only one observation
  may be in flight at once.
- After a replay arrives, the browser acknowledges its candidate id. Python
  omits the unchanged replay from later payloads without rebuilding its frames,
  while the browser retains that replay only for the same run.
- Training now shows overall evaluation progress plus the active generation and
  candidate. Pause and Stop are labeled as generation-boundary actions, and a
  queued command remains visible until Python applies it.
- On narrow screens, the horizontal setup rail recenters the active route after
  each observation render and remains scrollable without exposing the native
  Windows scrollbar.
- A terminal run now places a **Results ready** handoff directly below its run
  status. Terminal Pause/Stop controls are removed instead of leaving redundant
  disabled controls below the full telemetry page.

### Evidence

- `npm run check` passed Prettier, ESLint, TypeScript type-check, `43` Vitest
  tests, Ruff format/lint, strict mypy, `87` pytest tests, and the Vite
  production build.
- Browser interaction followed **Review recommended setup** to a valid Review
  without starting a run; **Start training** remained a separate enabled
  action.
- The customization path opened with Easy Oval and Quick start selected. Custom
  track tools and exact training controls were initially collapsed, and the
  track-tools panel remained open after adding an editor piece.
- At `390 x 844`, the simplified Welcome view had no document-level horizontal
  overflow (`scrollWidth = clientWidth = 390`).
- At `390 x 844`, Training centered the active `05 Training` route with
  `railScrollLeft = 403`; document `scrollWidth` still equaled `clientWidth`
  (`375`) and the native rail scrollbar was absent.
- For a completed eight-generation run, **Open results** was entirely visible at
  `482-522 px` in the `720 px` desktop viewport and `752-792 px` in the
  `844 px` mobile viewport. Clicking it opened the complete Results screen.
- A fresh eight-generation Quick start run kept the smooth champion replay
  visible from generation two through the 151-frame terminal replay while the
  acknowledged-delta path was active.
- Browser warning and error logs were empty during the reviewed flow.

The polling and replay-delta changes affect presentation traffic only. They do
not supply a simulation step, alter fixed-step evaluation, or mutate a run
configuration.

## Post-release UX foundations

Original note: `post-release-ux-foundations.md`.

Date: 2026-08-10

### Scope

This pass focuses on the player-facing experience and browser-owned presentation
logic. It does not change Python simulation, physics, evolution, persistence, or
versioned IPC contracts. The locked offline, observer-only, explicit-Start, and
deterministic product boundaries remain unchanged.

### Primary-source research

The implementation decisions use the following current guidance:

- [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines): game UI should provide consistent navigation, visible focus, readable text, recoverable errors, and controllable motion.
- [XAG 101: Text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101): menu, HUD, prompt, and error text must remain readable across the complete experience.
- [XAG 102: Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102): standard text and meaningful visual elements should maintain strong contrast; important state must not rely on color alone.
- [XAG 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) and [XAG 113: UI focus handling](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113): navigation order and interaction patterns should stay predictable, with a clearly visible focus indicator.
- [XAG 117: Visual distractions and motion settings](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117): continuously moving or auto-updating presentation should be pausable or removable.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [WCAG 2.2 additions](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): keep focus visible, avoid obscured focus, and provide at least 24 by 24 CSS pixel targets or adequate spacing.
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): linked tabs and panels need predictable arrow-key, Home, and End navigation.
- [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions): routine updates should be polite while actionable failures should be assertive.
- [Windows progress controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls): use determinate progress for known work and text for useful background status.
- [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion): honor the operating-system preference and remove non-essential motion.

### Baseline audit

The current v1.1.1 flow already had strong safety and recovery behavior:

- Training never starts without Review, successful Python validation, and an
  explicit Start action.
- Async requests have route and request ownership, preserving valid state after
  late or failed responses.
- Keyboard focus and disclosure state survive same-route renders.
- Track Builder implements linked tabs with roving focus and arrow-key support.
- Dynamic status and error surfaces use polite status or assertive alert
  semantics.
- System reduced-motion preference stops champion replay animation.

The live `1280 x 720` browser audit exposed the primary usability gap. Important
navigation, button, explanatory, telemetry, and table text commonly rendered at
approximately `8.6` to `11.5 px`. The structure was understandable, but the
small type, restrained state contrast, and dense technical presentation made the
product feel like a diagnostic dashboard instead of an approachable AI racing
experience.

### Design decisions

1. **Make the product promise immediate.** Welcome explains the three-part loop:
   choose a track, watch evolution, and compare the champion.
2. **Make readable the default.** Primary UI copy targets `13` to `16 px`, inputs
   stay at `16 px`, and labels remain at least `12 px` except for decorative
   metadata.
3. **Use comfortably sized actions.** Primary, secondary, navigation, and compact
   editor controls target a minimum height of `44 px` where layout permits.
4. **Communicate state through more than color.** Selection uses border, surface,
   and a check mark; focus uses a high-contrast outline; progress retains text
   labels and numeric values.
5. **Keep the race primary.** The authoritative track and moving car remain the
   main Training surface. Dense sensors and telemetry stay inspectable through
   progressive disclosure.
6. **Give motion an in-product off switch.** The system preference remains
   authoritative, and a visible local control can additionally reduce replay and
   interpolation motion without changing simulation state or outcomes.
7. **Preserve expert depth.** Track Builder, exact training controls, local run
   recovery, telemetry, and deterministic details remain available without
   competing with the recommended first-run path.

### Acceptance checks

- Existing TypeScript and Python checks remain green.
- No remote URL or runtime asset is introduced.
- Welcome, Track, Settings, Review, Training, and Results retain their existing
  contracts and keyboard behavior.
- The motion control changes browser presentation only.
- Desktop and narrow layouts have no page-level horizontal overflow.
- The first-run path remains `Welcome -> Review -> explicit Start` and never
  starts automatically.

## Post-release UI hardening

Original note: `post-release-ui-hardening.md`.

Date: `2026-08-04`

Scope: targeted browser and code review on top of the locally verified,
unpublished `v1.1.1` executable and Track Builder correction.

### Corrected findings

- Changing the generator seed after a successful Python generation updated the
  draft state but did not update the visible result until another full render.
  Seed input and generator radio changes now synchronize the selected styling,
  stale-result badge, and status notice without replacing the focused input.
  The preview continues to display the seed Python actually verified and tells
  the user to generate again before the new inputs apply.
- Populated saved-run and previous-run tables could expand the complete Results
  document at a narrow viewport. Wide comparison tables now scroll inside a
  bounded local container instead of creating page-level horizontal overflow.

### Browser verification

The development UI was inspected at `390 x 844` with a populated local run
library. Changing a generated seed from `42` to `43` immediately displayed
`Inputs changed`, retained the verified `Seed 42` metadata, and produced no
console warning or error. On the populated saved-run surface, document
`scrollWidth` and `clientWidth` both measured `375`; the table retained its own
bounded horizontal scroll.

The real Chromium suite now requires the stale-result indicator before any tab
switch and asserts that the terminal Results page has no page-level horizontal
overflow at `390 x 844`.

### Final verification

- `npm run check`: passed with `57` Vitest tests and `105` pytest tests.
- `npm run smoke:m0`: passed and released ports `4173` and `8765`.
- `npm run test:e2e`: both Chromium flows passed.
- `npm run test:phase10`: passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.569158 s`; regression SHA-256 remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-4e1e44c6ae2946f28595a3fda84b5863`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,178,216` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,425,553` bytes with SHA-256
  `d066b4ef4cc3c52032e79725c424ed23bdfa7a63833fea1088bc79ed8df5e2ca`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.

## Post-release setup accessibility semantics

Original note: `post-release-accessibility-semantics.md`.

Date: `2026-08-04`

Scope: accessible naming and relationship integrity for Track selection,
Training Settings, and Track Builder on top of the locally verified,
unpublished `v1.1.1` correction.

### Corrected findings

- A real-browser accessibility snapshot showed each preset radio absorbing the
  decorative compiled-track SVG label. For example, Easy Oval was announced as
  `Easy Oval compiled track preview Easy Easy Oval ...` instead of one concise
  choice name.
- The Algorithm select rendered a visible plain-language help paragraph with
  id `algorithm-help` but did not reference it through `aria-describedby`.
- Inactive Track Builder tabs exposed `aria-controls` values whose target
  panels did not exist until selected. Only the active panel was present, so
  two of the three tab relationships were incomplete at any moment.

### Correction

- Each preset radio owns an explicit accessible name containing track name,
  difficulty, and description. Its adjacent SVG preview is decorative within
  the choice and is removed from the accessibility tree.
- Algorithm now references `algorithm-help` exactly like the numeric settings
  reference their help paragraphs.
- Each inactive Track Builder tab retains an empty, hidden `tabpanel` with the
  matching id and `aria-labelledby`. Selecting the tab replaces that inert
  placeholder with its interactive content.

### Regression coverage

- The Track Builder Vitest assertion initially failed because
  `track-builder-panel-generate` and `track-builder-panel-library` were absent
  while Build was active. It now verifies both hidden targets.
- The real Chromium Track flow initially could not locate the corrected exact
  Easy Oval radio name because the SVG label contaminated it. The same flow now
  locates the exact radio name and confirms it is checked.
- The real Chromium Settings flow initially received no `aria-describedby` on
  Algorithm. It now verifies the exact `algorithm-help` relationship while
  retaining disclosure state and keyboard focus.
- Read-only in-app browser inspection at `1265 px` client width also found no
  document overflow, duplicate ids, empty button names, or missing labels on
  visible image roles in the inspected Track Builder state.

### Final Phase 10 verification

- `npm run test:phase10`: passed.
  - All `77` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed with the new radio, help-text, and
    tab-panel relationship assertions.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `13.373297 s`; median case time was `0.716752 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-dd9cc208540c4e539859475e243fd8d7`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - The packaged JavaScript contains the explicit preset label construction,
    the Algorithm help relationship, and the hidden inactive-panel template.
  - Both development ports were free after the gate.
- The runnable folder contains `71` files totaling `20,198,116` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` contains `72` entries and is `9,431,125`
  bytes with SHA-256
  `7696501a9536324da9a483dce6112393efe7a855896ce2c1c24d8ee247cb3ce1`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
