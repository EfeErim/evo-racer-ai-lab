# Post-release setup accessibility semantics

Date: `2026-08-04`

Scope: accessible naming and relationship integrity for Track selection,
Training Settings, and Track Builder on top of the locally verified,
unpublished `v1.1.1` correction.

## Corrected findings

- A real-browser accessibility snapshot showed each preset radio absorbing the
  decorative compiled-track SVG label. For example, Easy Oval was announced as
  `Easy Oval compiled track preview Easy Easy Oval ...` instead of one concise
  choice name.
- The Algorithm select rendered a visible plain-language help paragraph with
  id `algorithm-help` but did not reference it through `aria-describedby`.
- Inactive Track Builder tabs exposed `aria-controls` values whose target
  panels did not exist until selected. Only the active panel was present, so
  two of the three tab relationships were incomplete at any moment.

## Correction

- Each preset radio owns an explicit accessible name containing track name,
  difficulty, and description. Its adjacent SVG preview is decorative within
  the choice and is removed from the accessibility tree.
- Algorithm now references `algorithm-help` exactly like the numeric settings
  reference their help paragraphs.
- Each inactive Track Builder tab retains an empty, hidden `tabpanel` with the
  matching id and `aria-labelledby`. Selecting the tab replaces that inert
  placeholder with its interactive content.

## Regression coverage

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

## Final Phase 10 verification

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
