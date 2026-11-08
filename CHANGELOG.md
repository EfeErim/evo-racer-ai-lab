# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned as 1.1.1.

### Added

- Physics v2 with saved-run compatibility for runs recorded under v1.
- Training view plays back the full recorded run of the most recent finisher
  instead of jumping between samples from different cars.
- Training-plan presets whose descriptions are tied to measured outcomes.
- Accessibility scan (axe) of every screen in the browser tests, and an offline
  acceptance test in a network-less Windows Sandbox.

### Changed

- `EvoRacer.exe` is the entry point again; `EvoRacer.cmd` is no longer needed.
- The track generator builds asymmetric layouts from varied seeded half laps:
  harder settings require chicanes and hairpins.
- A successfully generated track is selected immediately.
- Quick check uses NEAT with 16 cars, 10 generations and 30 s episodes so that it
  can complete laps on Easy Oval.
- Documentation reorganized: experiment write-ups live in `docs/experiments/`,
  version history in this file. npm scripts renamed (`smoke`, `test:gate`,
  `verify:release`).

### Fixed

- Concurrent NEAT runs no longer affect each other's results or block resume.
- A second launch opens the running instance instead of failing on the port.
- Exit can no longer be triggered twice, and late responses cannot redraw the UI
  after shutdown.
- Custom tracks no longer show as active after the draft falls back to a preset.
- Hardened corrupt-run isolation, NEAT network-key validation and track
  self-contact detection.

## [1.1.0] - 2026-07-31

### Added

- Track Builder with Build, Generate and Library tabs.
- Smooth live observation and generation-champion replay with an evolution trail
  restored from the run checkpoint.
- Comparison with previous runs on identical track and evaluation budgets.

### Changed

- Portable package: `EvoRacer.cmd` with plain application modules and an isolated
  Python runtime instead of a frozen executable.

### Fixed

- Pause and Stop requested immediately after Start take effect at the next
  generation boundary.

## [1.0.0] - 2026-07-29

First release.

### Added

- Preset, hand-built, generated, imported and saved tracks, all compiled and
  validated by one Python track compiler.
- Fixed-step arcade physics with seven road-edge sensors.
- Fixed-topology genetic algorithm and feed-forward NEAT.
- Live observation with pause/resume/stop, telemetry, results, baseline
  comparison, replay and recovery of interrupted runs.
- Self-contained Windows x64 package; no Node.js or Python needed on the target
  machine.

[Unreleased]: https://github.com/EfeErim/evo-racer-ai-lab/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/EfeErim/evo-racer-ai-lab/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/EfeErim/evo-racer-ai-lab/releases/tag/v1.0.0
