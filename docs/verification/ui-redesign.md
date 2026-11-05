# UI redesign verification

Recorded on `2026-11-04` for the redesign requested in
[`docs/ui-redesign-prompt.md`](../ui-redesign-prompt.md). It was committed in
`0c12cf6` together with the two-second race buffer. Build values below describe that
build.

## Initial audit

The rendered app was walked in Chromium at `1280 x 800` and `390 x 844` before
any edit, from Welcome through Results, with text, targets, contrast, and overflow
measured in the page.

| Sev | User job            | Evidence                                                                                                                               | Fix                                                                                                                                  |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | First experiment    | **Review recommended setup** validated the current draft, so it could review a different track than the Easy Oval it named.            | New `use-recommended` transition restores the recommended draft first.                                                               |
| P1  | Custom track        | A generated track became active immediately, with no candidate state.                                                                  | Generation only creates a candidate. **Use this track** applies it. **Regenerate seed N** reports whether the track came back equal. |
| P1  | Observe and control | A press longer than one poll on Pause or Stop could lose its click, because each poll replaced the pressed button. Found during audit. | Polling renders wait for pointer release. Regression test holds a press for `700 ms`.                                                |
| P1  | Observe and control | At 1280 x 800 the race started at y=525, below a large header and status panel. Page height was `1658 px`.                             | Compact header, race fills the window, status and controls sit beside it. Page height is `935 px`.                                   |
| P1  | Results             | Replay had no play, pause, or step controls. `moveReplay` existed with no UI.                                                          | Play/Pause, Step back, Step forward, Restart, with the held frame shown.                                                             |
| P1  | Results             | After Stop, the results button could be off screen (top=`-297 px`, `-413 px` at 390).                                                  | Terminal panel is sticky at the top. Asserted in viewport.                                                                           |
| P1  | Results             | No path back to Review, and the page led with the ideal-line benchmark instead of whether fitness improved.                            | Heading answers the question. **Back to Review** added. New `revise-setup` transition requires a fresh check.                        |
| P1  | Readability         | Text as small as `8 px`, with 30 to 129 strings under `14 px` per screen.                                                              | Token type scale. Only IDs, codes, and chart ticks use `12 px`.                                                                      |
| P1  | Keyboard            | Generator choices had no visible focus ring on their hidden radios.                                                                    | `:has(input:focus-visible)` ring on cards, choices, and the file picker.                                                             |
| P2  | First experiment    | At 390 the primary action was at y=`1028` on an `844 px` screen.                                                                       | Now at y=`201`.                                                                                                                      |
| P2  | Narrow window       | Top bar labels were hidden with `font-size: 0`, measured as `0 px` text.                                                               | Icons with visually hidden labels. Accessible names are kept.                                                                        |
| P2  | Recovery            | Unconfirmed requests were worded "failed".                                                                                             | IPC transport wording is "no confirmed response yet. Try again." Python's own rejection text is unchanged.                           |
| P2  | Settings            | Exact settings were two nested disclosures. Invalid values had no message beside the field and Continue was disabled without a reason. | One disclosure, inline errors, forced open while invalid, and a stated reason beside Continue.                                       |
| P2  | Observe, Results    | Fitness chart had no axis labels or units, and counted generations from 0 while the rest of the app counts from 1.                     | Labeled axes and units, dashed median line, generations from 1.                                                                      |
| P2  | Track               | Active track identity appeared only for custom tracks, with no length or seed.                                                         | Sticky bar with name, length, and seed on every Track view. Tabs show status.                                                        |
| P3  | Motion              | The in-app motion toggle did not stop CSS transitions.                                                                                 | `data-motion` on the shell removes them.                                                                                             |
| P3  | Copy                | Jargon in primary text: GA, NEAT, TrackV1, canonical, candidate episodes, raw run IDs as headings.                                     | Plain words, with terms explained once. IDs remain as secondary data.                                                                |
| P3  | Local status        | **Local core** never changed, whatever the core did.                                                                                   | Shows connecting and no-response states, with a shape as well as color.                                                              |

No P0 finding was observed: training never started by itself and no offline
boundary was crossed.

## Measurements

Rendered values from the audit script, walking the real journey. The first two
columns are before the redesign, in the old dark-only theme.

| Surface           | Viewport | Smallest text before | Smallest text after  | Page height before | Page height after |
| ----------------- | -------- | -------------------- | -------------------- | ------------------ | ----------------- |
| Welcome           | 1280     | `10.4 px`            | `12 px` (run IDs)    | `841`              | `800`             |
| Review            | 1280     | `10.4 px`            | `14 px`              | `945`              | `800`             |
| Training, running | 1280     | `10.4 px`            | `12 px` (IDs)        | `1658`             | `935`             |
| Results           | 1280     | `10.4 px`            | `12 px` (IDs, ticks) | `1672`             | `1115`            |
| Results           | 390      | `0 px` (hidden hack) | `12 px` (IDs, ticks) | `2606`             | `2182`            |

After the redesign, at both viewports and in both themes, the audit recorded no
text contrast below `4.5:1`, no target below `24 x 24` CSS px, no primary action
below `44 px`, no document overflow, and no page errors. The contrast check covers
text only. Non-text contrast (`3:1`) was chosen in the token values but was not
measured automatically.

`e2e/ui-standards.spec.ts` keeps these limits as a repeatable test on Welcome,
Review, Training, terminal Training, and Results. Track and Settings were measured
by the audit script only.

## Commands

| Command                                         | Result                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                 | Passed: `135` Vitest and `158` pytest tests, lint, formatting, types, docs, and build.                                                |
| `scripts/test-e2e.ps1 -Port 8798`               | `27` of `27` Chromium flows passed, `10` of them new in `e2e/ui-standards.spec.ts`.                                                   |
| `npm run build:release`, `npm run test:release` | Passed. Run `run-7ed8a07a79d8482498a4134c98eb3541` restored and completed, loopback only, with no external Node.js or Python process. |

`release\EvoRacer-Windows-x64.zip` is `9,464,880` bytes with SHA-256
`28c1cd97620ba0c188ea8a9caa7da88d89334554a0168c4c3977641124935186`. It contains
`index-B2nN7rXq.js` and `index-BD1ial9C.css`. The artifact is unsigned and
unpublished.

Behaviors the new flows assert:

- Keyboard only: Welcome to Start to Stop to Results to replay Pause, with a
  visible focus indicator at each stop and focus kept through polling.
- Reduced motion with the OS setting emulated: transitions are `0s`, the replay
  marker holds still, Play is disabled, and stepping still moves it.
- The track submitted to `/v1/runs/start` deep-equals the track Python generated
  and the player applied.
- The recommended action reviews Easy Oval and Quick check after other choices.
- A generated track leaves the active track unchanged until **Use this track**,
  and regenerating a seed reports an identical track.

Earlier flows cover transport failure and retry, late responses after dismissal,
and Python's exact rejection text. The dismissal and stale-response logic was not
changed by this redesign.

The two `e2e/track-builder.spec.ts` failures recorded before this work are fixed.
They expected `generator v4`, and the specs now expect `generator v5`.

## Limits

- No representative person has used this design. These results show measured
  properties and working task paths. They do not show that the app is intuitive
  or pleasant, and human usability testing is still needed.
- Keyboard and 200% zoom: the keyboard path above is automated. 200% zoom and a
  screen reader were not tested.
- Release acceptance checks the packaged service, contracts, and offline boundary.
  The redesigned screens were driven in Chromium against the built frontend served
  by the Python launcher, not by clicking through the packaged EXE.
- Clean Windows with network adapters disabled was not tested.
