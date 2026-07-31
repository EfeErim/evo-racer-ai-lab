# Training performance correction

Verified on `2026-07-29` on Windows 11 x64 with Python `3.13.5`.

## Cause

The former Balanced default requested 48 candidates, 30 generations, and 90
simulated seconds per episode. Its maximum budget was 1,440 candidate episodes,
or 7,776,000 fixed `1/60 s` simulation steps. Road-edge sensor rays and
centerline projections also rebuilt invariant segment values inside the hot
step loop.

## Correction

- Centerline and boundary segment values are derived once per compiled track
  and reused by projection and sensor queries.
- The episode evaluator reuses the post-step centerline projection as the next
  step's observation projection.
- Quick start is the initial preset at `10 x 8 x 15 s`.
- Balanced is `24 x 20 x 30 s`; Thorough is `48 x 40 x 60 s`.
- Settings and Review show the maximum candidate-episode budget before Start.

Saved runs remain immutable and retain the settings with which they were
created.

## Evidence

The reviewed 18-case Phase 10 matrix remained byte-for-byte deterministic:

```text
Verified 18 deterministic cases.
regressionSha256:
88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64
```

The same machine and matrix measured:

| Measurement |      Before |       After |
| ----------- | ----------: | ----------: |
| Total       | 81.457872 s | 26.195954 s |
| Median case |  4.039459 s |  1.318960 s |

A focused profiled Fixed GA generation at 10 candidates and 15 simulated
seconds fell from `9.345320 s` to `2.938516 s` under identical profiler
instrumentation. The Phase 10 report is generated locally at
`.runtime_tmp/phase10/performance-speed-fix.json`; `.runtime_tmp` is intentionally
ignored because it contains machine-local evidence.

The complete Phase 10 gate then passed with 27 Vitest tests, 70 pytest tests,
all 18 deterministic cases, a rebuilt Windows ZIP, and clean-runtime packaged
acceptance across an explicit generation-boundary pause, process restart, and
resume. The verified local archive SHA-256 is
`8d73110a593941dbccd92dd0b3c22be651fb56ff2ee7defd81fce536b8366059`.

## Follow-up correction on 2026-07-31

Active observation responses no longer scan and validate the complete saved-run
library or repeat the unchanged setup payload. Saved-run summaries are loaded
only for a terminal result, while explicit resume still returns the setup needed
by the browser. On the local library with 12 runs, 20 active response builds
fell from `0.3904666000 s` and `1667` bytes per response to `0.0000233000 s`
and `343` bytes per response.

Road-edge sensors now reject boundary segments whose precomputed bounds cannot
overlap the finite sensor ray. The original intersection calculation is still
used for every possible hit. A three-track by three-heading regression compares
the optimized result with the former unfiltered calculation at `1e-12`
absolute tolerance.

For a Fixed GA generation with 10 candidates, 15 simulated seconds, Easy Oval,
and seed 42, three alternating measurements produced these medians:

| Sensor path     | Median generation time |
| --------------- | ---------------------: |
| Unfiltered      |             1.351269 s |
| Bounds-filtered |             0.645795 s |

Every optimized and unfiltered terminal snapshot was equal. The final 18-case
deterministic matrix completed in `14.480483 s` and still matched regression
SHA-256 `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.

The run manager also prevents a terminal response from becoming visible before
its atomic checkpoint is durable, and run reads retry the bounded Windows
sharing gap around `os.replace`. The restart, completion, export, and delete
service regression passed 10 consecutive repetitions after this correction.
The complete Phase 10 gate passed with 31 Vitest tests, 83 pytest tests, the
deterministic matrix, Windows packaging, and clean-runtime restart/resume
acceptance. The local unreleased ZIP SHA-256 is
`dfbf0c1f8b6306aba09eabe21fd39d959303cecec846945818f6408d7bfd358c`.

## Further hot-path reduction on 2026-07-31

Centerline projection now compares squared distances inside the segment loop
and computes one square root only for the selected projection. Sensor sweeps
also reject boundary segments outside the sensor origin's finite search square
once before evaluating the seven individual rays.

Five same-command Fixed GA generation measurements immediately before and after
this change used 10 candidates, 15 simulated seconds, Easy Oval, and seed 42:

| Measurement       | Before (s) | After (s) |
| ----------------- | ---------: | --------: |
| Median generation |   0.648346 |  0.609922 |

The measured median was `5.9%` lower. All five post-change fitness-history,
generation-report, and champion projections were equal. The deterministic
matrix remains the release-level proof that the optimized path preserves the
saved product results.

The complete Phase 10 gate passed after these changes with `37` Vitest tests,
`83` pytest tests, all `18` deterministic cases in `14.125051 s`, a rebuilt
Windows package, and clean-runtime acceptance. The latest local ZIP SHA-256 is
`b67baa539ab82c6baa3ee8bccdc35bdd4e990cd5e33d979d3b287a0134c25ae4`.

## Projection reuse iteration on 2026-07-31

Profiling showed that the swept collision check projected each returned safe
position, then the episode evaluator projected that same position again for
progress. The physics step now returns the sweep's exact projection and the
evaluator reuses it as the next authoritative projection.

In one profiled 10-candidate Fixed GA generation, calls to `project` fell from
`19,083` to `9,548`. Seven same-command measurements immediately before and
after used Easy Oval, seed 42, and 15 simulated seconds per candidate:

| Measurement       | Before (s) | After (s) |
| ----------------- | ---------: | --------: |
| Median generation |   0.716530 |  0.569015 |

The median was `20.6%` lower. All seven post-change fitness histories,
generation reports, and champion projections were equal. The focused physics
test also proves one candidate projection is retained by the step, while the
full deterministic matrix remains the release-level equality gate.

The complete Phase 10 gate passed after projection reuse with `39` Vitest tests,
`84` pytest tests, all `18` deterministic cases in `11.616566 s`, and
clean-runtime Windows acceptance. The rebuilt local ZIP SHA-256 is
`ec4dbfe7457e6c1039612fdf4f4bc801cab8ed349e11ce83ce16cd3dc6196606`.

## Replay transport iteration on 2026-07-31

Observation polling previously rebuilt and returned every frame of the current
generation-champion replay at each `250 ms` refresh. The browser now acknowledges
the replay candidate it has already parsed. Python omits that replay until the
champion changes, and the client retains the acknowledged replay only while run
identity remains equal. Hidden documents also reduce polling from `4 Hz` to
`1 Hz`, then refresh immediately on return.

The measurement used the same 151-frame champion replay seen in the reviewed
Quick start browser run. Its full JSON observation was `30,314` bytes; the
acknowledged delta was `632` bytes, a `97.915%` reduction. Across 200 snapshot
build-and-JSON-serialization iterations, the full path took `0.233250 s` and the
acknowledged path took `0.003173 s`, a `98.64%` reduction. These are local
transport microbenchmarks, not simulation-throughput claims.

Focused coverage verifies Python omission without rebuilding frames, manager
request validation and delta delivery, TypeScript same-run merge behavior,
cross-run cache isolation, the optional IPC hint, `250 ms`/`1000 ms` cadence,
and immediate visible-state scheduling. A real eight-generation browser run
kept showing the smooth replay through completion and recorded no warning or
error log.

The complete Phase 10 gate passed after this iteration with `43` Vitest tests,
`87` pytest tests, all `18` deterministic cases in `10.506833 s`, and
clean-runtime Windows acceptance. The regression SHA-256 remained
`88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
The rebuilt local ZIP is `9,765,073` bytes with SHA-256
`f1e60a7d6ee3c41e1fe9dbc6a5fbf7f87ea9e1d70263463a2531432c0fe55a3b`.
