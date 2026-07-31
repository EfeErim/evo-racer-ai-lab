# Smooth Training Replay Verification

Verified on `2026-07-31` on Windows 11 x64 with Node.js `24.13.0`, npm
`11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

## Corrected behavior

- Python exposes the completed generation champion's recorded telemetry as a
  transient, versioned `generationReplay` observation field.
- The browser continuously presents those authoritative frames at `2x`
  simulated speed using `requestAnimationFrame` after the first generation.
- Position and the shortest heading arc are interpolated only between adjacent
  Python timestamps. The browser does not predict state, supply a physics step,
  or slow the background training worker to rendering speed.
- The transient replay is omitted from run documents, preserving deterministic
  checkpoint and restart projections.
- Atomic run-document replacement retries bounded Windows sharing violations so
  simultaneous local reads cannot intermittently fail generation advancement.

## Browser evidence

A real local browser flow completed an `8` generation Fixed GA run. The
Training panel reported `Smooth Python champion replay`, `Champion replay · 2x`,
and `151 Python frames` for the final champion.

- During an active run, `24` marker samples taken about `16 ms` apart contained
  `23` distinct SVG transforms.
- During the completed champion loop, all `18` samples contained distinct
  transforms.
- The browser console contained zero warnings or errors.

These samples verify presentation continuity; they are not a claim about display
refresh rate on every target computer.

## Replay lookup optimization

Timestamp lookup now uses binary search instead of scanning the replay from the
first frame on every animation frame. A local presentation-only microbenchmark
with 4,096 ordered frames and 60,000 lookups measured `147.164 ms` for the
former linear lookup and `14.872 ms` for the binary lookup (`9.9x`). This is a
lookup benchmark, not an end-user frame-rate guarantee. Unit coverage verifies
long replays, adjacent-frame interpolation, heading wrap, and duplicate
timestamps.

## Prior-generation evolution trail on 2026-07-31

The browser now retains a bounded presentation history from newly received
Python generation-champion replays. Each path is sampled to at most 64 recorded
points; the current replay plus seven prior paths is the maximum retained. Only
the prior paths are rendered, from `0.16` opacity for the oldest to `0.62` for
the newest, behind the animated current champion.

A real eight-generation Quick start run reached seven prior champion paths,
kept them visible on the terminal Results replay, and produced zero browser
warning/error logs. At `390 x 844`, document `scrollWidth` equaled `clientWidth`
(`375`) and the trail summary remained within the content width. Focused tests
cover replay deduplication, delta retention, 64-point sampling, eight-path
storage, seven-path rendering, cross-run isolation, endpoint preservation, and
the SVG opacity order.

## Automated and packaged evidence

`npm run test:phase10` passed:

- Prettier, ESLint, TypeScript type-check, `46` Vitest tests, Ruff format/lint,
  strict mypy, and `87` pytest tests.
- Unit coverage for timestamp interpolation, heading wrap, replay looping,
  optional contract parsing, transient persistence boundaries, and bounded
  Windows atomic-replace retry.
- Development loopback smoke and all `18` deterministic matrix cases.
- Windows PyInstaller `onedir` and ZIP construction.
- Clean-runtime packaged acceptance requiring live position telemetry and a
  multi-frame Python generation replay, followed by pause, restart/resume,
  completion, replay verification, and loopback-only sockets.

The rebuilt local ZIP SHA-256 is
`a064939f1097cc135880efd7e52f1df87bc784440b1d9f7bd7eb12791a40e8f3`.
This working-tree correction is not part of the immutable published `v1.0.0`
tag or its existing public assets.
