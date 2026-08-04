# Post-release keyboard and interface-state hardening

Date: `2026-08-04`

Scope: keyboard focus, disclosure state, and Track Builder tab semantics on top
of the locally verified, unpublished `v1.1.1` correction.

## Corrected findings

- The `250 ms` visible-document observation refresh replaced the Training DOM
  and dropped keyboard focus. A focused Pause, Resume, or Stop control could
  therefore become unreachable before the next keyboard action. Same-route
  renders now restore the focused control without scrolling the page.
- A pending run command temporarily disables its controls. Focus ownership is
  now retained while that control is disabled and restored if a transient
  command failure makes it available again.
- Re-rendering Settings forgot the open/closed state of `details` elements.
  Changing Random seed collapsed Advanced controls and lost input focus. The
  interface now preserves each disclosure's explicit state and the focused
  input across same-route renders.
- Track Builder used `tab` roles without the complete keyboard model. Tabs now
  use roving `tabindex`, stable `aria-controls` / `aria-labelledby` links, and
  Left Arrow, Right Arrow, Home, and End navigation. Opening the builder focuses
  its heading; closing it returns focus to the launcher.

## Reproduction and browser verification

Before the correction, Chromium reproduced both primary failures:

- Track Builder's heading remained inactive after opening and validation.
- A focused `Stop after generation` button became inactive within `750 ms` of
  normal Training observation polling.

The final real-browser suite verifies:

- builder open/close focus handoff;
- tab selection and focus through Right Arrow, Home, and End;
- focus retention through an asynchronous Python road-width validation;
- open Customize training and Advanced controls state plus Random seed focus
  after a state-changing input event;
- the Review card's Edit track focus through a deliberately delayed setup
  validation, despite a same-route sidebar button with the same destination;
- Stop focus across ordinary polling; and
- Stop focus restoration after an injected transient `503` run-command
  failure.

## Final verification

- `npm run test:phase10`: passed.
  - Prettier, ESLint, TypeScript type-check, Ruff format/lint, and strict mypy
    passed.
  - All `59` Vitest and `105` pytest tests passed.
  - All `4` real Chromium flows passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `13.248602 s`; median case time was `0.738296 s` and regression SHA-256
    remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-1d68f089113a46569db29586c1c3cd5c`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,183,756` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,426,954` bytes with SHA-256
  `23973bc394498d8a431e2109a8cb52546c687ba48cb4c64fc31e08aa31a48774`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
