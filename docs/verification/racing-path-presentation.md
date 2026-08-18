# Racing path presentation correction

Date: `2026-08-10`

## Baseline problem

The Training and Results track renderer deliberately removed the currently
displayed champion from the visible trajectory set. It drew only up to seven
earlier generation champions as similarly prominent dashed lines. With reduced
motion active, the car also stayed on the replay's first frame. A completed run
therefore showed old paths and a car at the start line, but not the complete
route belonging to the champion named above the track.

The reproduced completed run `run-4e6dce86aeb445e093ff8abe72f572ab`
displayed candidate `g0007-c0002`, while the SVG contained only candidates from
generations zero through six. The marker was `translate(5.001 0)` even though
the final authoritative replay frame was at `(74.2, 40.058)`.

## Research decision

- [Minimum-curvature trajectory planning](https://arxiv.org/abs/2309.09186)
  and [sequential minimum-time racing trajectory generation](https://arxiv.org/abs/1902.00606)
  treat an ideal racing line as an optimization problem with track and vehicle
  constraints. Adding such a planner would change EvoRacer's learning problem;
  it is not a presentation fix.
- The [TUM trajectory planning implementation](https://github.com/TUMFTM/global_racetrajectory_optimization)
  likewise separates reference-line optimization from vehicle control. The
  corrected UI therefore labels and displays the controller's actual recorded
  trajectory, not a fabricated ideal line.
- Research on [uncertain trajectory visualization](https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.100/1-hci/hci-paper/2023/IMWUT_2023_Uncertainty_Trajectory_final.pdf)
  identifies clutter when multiple trajectory marks compete. The current path
  is now visually primary; historical paths use lower width and opacity.
- The [W3C SVG stroke specification](https://www.w3.org/TR/svg-strokes/)
  defines stroke width, opacity, caps, joins, and dashes as presentation
  controls. EvoRacer uses those controls without altering any Python position.

## Change

- The current replay is deterministically sampled to at most 64 points for
  display, matching the existing bounded trail contract.
- Its candidate id is attached to one solid green `current-generation-path`.
- Earlier paths remain visible, but their opacity now ranges from `0.08` to
  `0.28`, their stroke is thinner, and road centerline/boundaries render above
  them.
- Actual off-road motion remains visible. No clipping, projection, spline, or
  browser-authored racing line is introduced.
- Reduced motion selects the final recorded replay frame as the static marker.
- The same current-path treatment is used in Training and Results, including
  restored saved runs.
- The E2E harness accepts an optional loopback-only `EVORACER_E2E_PORT` while
  retaining `8765` as its default. This lets source acceptance run without
  terminating an already-open packaged EvoRacer instance; the production
  origin remains `http://127.0.0.1:8765` unless the Vite test build explicitly
  supplies its local override. `scripts/test-e2e.ps1` also accepts `-Port` and
  `-Grep` for an isolated focused run.

## Evidence

- `npm run check`: passed Prettier, ESLint, TypeScript type-check, `107` Vitest
  tests, PowerShell parsing, Ruff format/lint, strict mypy across `25` files,
  `140` pytest tests, and the production Vite build. The first sandboxed attempt
  was blocked by the owner-only `.pytest_cache` ACL; the identical gate passed
  outside that sandbox boundary.
- Browser, completed run at the default desktop viewport: the current SVG path
  id and displayed champion both resolved to `g0007-c0002`; seven prior paths
  rendered at opacities `0.08` through `0.28`; document and stage overflow were
  both zero.
- Browser, reduced motion: the current path ended at `(74.2, 40.058)` and the
  static marker used the same coordinates and recorded heading.
- Browser, `390 x 844`: document width remained `375 / 375`, the race stage and
  legend had zero horizontal overflow, and legend text rendered at `12.8 px`.
- `scripts/test-e2e.ps1 -Port 8876`: all `14` real Chromium flows passed in
  `3.2m`, including the new reduced-motion Training assertion that the displayed
  candidate id matches the solid path and that the marker uses the path's final
  recorded point. After every worker completed, the isolated service accepted
  its versioned shutdown acknowledgement and the runner exited `0`.

The change does not claim that the champion found an optimal racing line or
that automated checks prove the visualization is subjectively ideal.
