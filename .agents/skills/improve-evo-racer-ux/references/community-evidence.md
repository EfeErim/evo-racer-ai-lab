# Community and open-source evidence

Research refreshed: `2026-08-10`.

Use this reference for public benchmarking, GitHub/Reddit research, Track Builder work, and seeded track-generation UX. These sources reveal recurring failure modes and implementation patterns. They do not replace EvoRacer's product contract, primary standards, local reproduction, measurements, or user testing.

## Contents

1. Evidence rules
2. Desktop and game UI signals
3. Procedural track-generation signals
4. EvoRacer acceptance implications

## 1. Evidence rules

- Prefer maintained source code, maintainer-authored documentation, confirmed issues with reproduction steps, and research-linked implementations.
- Record source date, scope, platform, issue status, and whether the evidence describes a symptom, implementation, or verified outcome.
- Treat Reddit posts as purposive samples, not representative surveys. Look for the same friction across different threads and communities.
- Do not use votes, stars, reactions, or comment volume as a quality metric.
- Do not copy another project's algorithm or UX wholesale. Extract the constraint, reproduce the risk in EvoRacer, then choose the smallest project-consistent fix.
- Recheck links and current status when making a release-blocking decision.

## 2. Desktop and game UI signals

### GitHub

- [Godot issue #56341](https://github.com/godotengine/godot/issues/56341) is a confirmed Windows/Linux DPI-scaling issue with reproduction steps. It shows that UI scale must be tested across monitors and DPI contexts: both oversized controls that reduce usable content and undersized text can break the task.
- [Mindustry's maintained UI strings](https://github.com/Anuken/Mindustry/blob/master/core/assets/bundles/bundle.properties) expose practical game settings for UI scaling, screen shake, visual effects, and an apply/revert countdown for scale changes. Use this as implementation evidence that presentation controls need safe preview and recovery, not as a numeric accessibility standard.
- [LasseHenrich/racetrack-generation](https://github.com/LasseHenrich/racetrack-generation) separates a small manual surface from advanced generation internals. Its README also discloses incomplete automation and quality-control limits. This supports progressive disclosure and honest status language for generator tools.

### Reddit

- In [How small is too small (in UI)?](https://www.reddit.com/r/gamedev/comments/17foubf/how_small_is_too_small_in_ui/), the author could read their own UI while another player could not. Replies repeatedly point to font choice, contrast, scaling, layout reflow, and testing with more people. The useful signal is that developer eyesight and workstation distance are insufficient acceptance tests.
- [UI Readability Advice from an Aging Gamer](https://www.reddit.com/r/GameDevelopment/comments/1v5xufh/ui_readability_advice_from_an_aging_gamer/) reports recurring difficulty with small text/icons across viewing distances, handhelds, and streaming layouts. Treat the proposed scale values as opinion; retain the scenarios for testing.
- [UI's in so many games are tiny](https://www.reddit.com/r/gaming/comments/yf86l1/uis_in_so_many_games_are_absolutely_tiny_why_is/) and [Every game should have adjustable text/UI scale](https://www.reddit.com/r/gaming/comments/1id5h7q/every_game_should_have_easily_adjustable_textui/) repeat the same inability-to-read and insufficient-scaling pattern from player communities. They strengthen discovery priority but do not establish conformance thresholds.

EvoRacer response:

- Test rendered text and controls at the supported desktop viewport, narrow layouts, browser zoom/text scaling, Windows scaling, and at least one secondary-DPI scenario when packaging is affected.
- Preserve useful content density while scaling: reflow, scroll, or disclose secondary detail instead of shrinking critical labels.
- Preview consequential presentation settings and provide an obvious revert path.

## 3. Procedural track-generation signals

### GitHub and research implementation

- [LasseHenrich/racetrack-generation](https://github.com/LasseHenrich/racetrack-generation) implements closed arcade-like tracks using constrained, repulsive curves and exposes deep customization. Its linked work focuses on self-intersection avoidance, compact packing, splines, crossings, and output expressiveness. The repo explicitly warns that intersection introduction lacks complete quality control, demonstrating why geometry generation and quality acceptance must be separate stages.
- [Godot Road Generator](https://github.com/TheDuckCow/godot-road-generator) documents the cost of aligning modular pieces and distinguishes editor creation from in-game procedural needs. Use it as an implementation comparison for canonical pieces and generated geometry, not as a direct dependency.

### Reddit

- In [Fun race track procedural generation](https://www.reddit.com/r/proceduralgeneration/comments/hdvm52/fun_race_track_procedural_generation_i_made_for/), viewers identified the absence of straights and overly smooth segments despite valid, attractive loops. The discussion proposes explicit feature families such as straights, hairpins, chicanes, and recognizable corner sequences. This is qualitative evidence that geometric validity alone does not create interesting tracks.
- [Generating and validating looping free-form racing tracks](https://www.reddit.com/r/proceduralgeneration/comments/1b0viu1/generating_and_validating_looping_free_form_racing/) describes a staged pipeline: generate through waypoints, smooth, then reject intersections and excessively tight turns. The useful pattern is post-generation validation after smoothing, because smoothing can invalidate an initially valid path.
- [Complete procedural race track generator](https://www.reddit.com/r/proceduralgeneration/comments/1c5kfe8/complete_procedural_race_track_generator/) describes scored segment placement against a base shape, backtracking/restarts, and post-processing. It also notes that leaving a grid can improve variety while making closure harder. Treat the algorithm as a comparison, not a prescription.
- [Procedurally generated race tracks](https://www.reddit.com/r/proceduralgeneration/comments/qq1nuh/procedurally_generated_race_tracks/) discusses tunable length, curvature, control-point spacing, straights, chicanes, banking, and elevation. The recurring signal is that meaningful track identity comes from bounded feature composition, not unstructured randomness.

EvoRacer response:

- Keep seed-to-TrackV1 generation deterministic and Python-authoritative.
- Separate generation from quality gates. Validate closure, self-intersection, minimum clearance, turn feasibility, checkpoint ordering, spawn safety, and canonical serialization after all smoothing/post-processing.
- Add measurable variety descriptors such as length, straight ratio, turn-count distribution, curvature bands, direction balance, and named feature families. Compare a seed corpus; do not judge variety from two screenshots.
- Offer a small set of player-facing styles such as Balanced, Fast, Technical, and Wild only when each maps to bounded Python-owned parameters and produces measurably distinct corpora.
- Show a generated track as a candidate with seed, style, feature summary, and preview. Require an explicit `Use this track` action.
- On apply, replace the active track atomically and show its identity. Review and Start must submit that exact TrackV1; a preview-only update is a P1 journey failure.
- Preserve the last valid active track when generation or validation fails. Explain the rejected constraint and allow retry with the same or a new seed.

## 4. EvoRacer acceptance implications

For a seeded generator or Track Builder change, require all of the following:

1. The same normalized seed and settings produce byte-stable canonical TrackV1 output in repeated Python tests.
2. A fixed cross-seed corpus passes validity gates and reports feature-distribution evidence.
3. Selected styles have documented, statistically distinguishable feature targets without changing physics or controller rules.
4. The UI distinguishes candidate, active, saved, and submitted track states.
5. The user can preview, apply, regenerate, recover from rejection, and identify the active track without remembering a prior screen.
6. Browser/E2E coverage proves the generated TrackV1 identity reaches Review and the Start request.
7. Human review samples a seed matrix for perceived repetition and visual coherence; automated diversity metrics are not presented as proof of beauty or fun.
