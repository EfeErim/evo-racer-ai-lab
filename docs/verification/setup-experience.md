# Setup experience correction

Verified on `2026-07-31` in the local Windows development application.

## Correction

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

## Evidence

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
