# Post-release generator v3 and active-track verification

Date: `2026-08-10`

## Reported problems

1. Seed-generated tracks looked simple and repetitive.
2. A successful Generate command produced a preview but did not make that track
   active until the user found and pressed a second **Use this track** action.

## Research boundary

The implementation follows the search-based procedural content generation
model: keep a canonical representation, generate a bounded candidate set, and
evaluate quality separately from technical feasibility. This is consistent with
the representation/search/evaluation separation described in
[Search-Based Procedural Content Generation: A Taxonomy and Survey](https://doi.org/10.1109/TCIAIG.2011.2148116)
and the use of explicit player-facing track evaluation in
[TrackGen](https://doi.org/10.1016/j.asoc.2014.11.010). The earlier
[interactive TORCS track work](https://groups.csail.mit.edu/EVO-DesignOpt/gecco2011Proceedings/proceedings/p395.pdf)
also supports treating track interest as a design objective instead of accepting
the first technically closed loop.

No runtime dependency, remote service, asset, telemetry path, or network call
was added. Research informed local development only.

## Implementation

- Generator version increased from `2` to `3`, so the deterministic mapping
  change is explicit instead of silently changing existing seed semantics.
- Python performs a bounded seeded backtracking search for a half lap with a net
  turn of 180 degrees. Repeating that motif under rotational symmetry closes a
  balanced loop while preserving the exact `12 / 18 / 24` piece contract.
- Seeded SHA-256 ordering selects among equally ranked layouts without depending
  on browser state or render timing.
- Easy requires both 45-degree and 90-degree corners and forbids chicanes and
  hairpins. Technical additionally requires opposing turn directions and a
  chicane. Hard requires opposing directions, a chicane, and a hairpin.
- Repeated pieces, special-piece counts, direction changes, and piece variety
  rank technically feasible candidates before the unchanged Python compiler
  makes the final closure and self-intersection decision.
- The search retains the hard `200` candidate cap and existing rectangle/stadium
  candidates only as late safety fallbacks.
- A successful **Generate & use track** response updates the selected compiled
  track and setup draft atomically. Review and Start therefore receive the same
  Python-verified TrackV1 without a second selection action.

## Verification evidence

- `python/tests/test_phase3_tracks.py`: `13` focused tests passed, including
  byte-stable repeat generation, all length/difficulty combinations, v3 layout
  structure, compiler equality, and library persistence.
- A development matrix covering seeds `0..9`, all three lengths, and all three
  difficulties produced `90 / 90` valid tracks, `90` unique track ids, and a
  maximum of one compiled candidate before acceptance in `12.798387 s`.
- `npm run check` passed Prettier, ESLint, TypeScript, `106` Vitest tests, Ruff,
  strict mypy across `25` files, `140` pytest tests, and the production Vite
  build.
- `npm run test:e2e` passed all `13` Chromium flows. The dedicated generator
  flow captured the submitted `/v1/runs/start` payload and verified that
  Technical/Long seed `90210` reached Start as a `24`-piece custom track without
  another selection action.
- In-app browser inspection generated Hard/Long seed `731`, visually confirmed
  a non-template balanced loop, showed **Selected for this experiment**
  immediately, and carried `Hard Long 731` with `24` canonical pieces into a
  Python-accepted Review screen.
- `npm run test:release` accepted generator v3 through the directly launched
  packaged EXE. The complete `npm run test:phase10` gate then passed source,
  loopback smoke, all `13` Chromium flows, the `18`-case deterministic matrix,
  Windows build, and clean-runtime acceptance. The matrix took `11.134059 s`
  with a `0.61629 s` median, and its regression SHA-256 remained
  `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- The accepted local package restored and completed
  `run-bff22dc5aad549b3ace22fe7b8c2ead3`. Its ZIP SHA-256 is
  `20170276b1fe6963e50dfb29b0a1a09d4011149cf11ae5c4d7b49da13232de0d`;
  the EXE remains explicitly unsigned.
