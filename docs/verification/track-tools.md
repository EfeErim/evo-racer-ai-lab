# Track tools evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Track Builder Redesign Verification

Original note: `track-builder-redesign.md`.

Date: `2026-07-31`

### Scope

The Track screen now exposes a visible **Open Track Builder** entry while the
full custom workspace remains closed by default. Opening it provides three
separate flows:

- Build: canonical piece editing with reorder, duplicate, delete, undo, redo,
  reset, Python-assisted closure, and an authoritative compiled preview.
- Generate: persisted seed/length/difficulty inputs, deterministic Python
  generation, preview, explicit selection, editing, save, and export actions.
- Library: TrackV1 import, Python validation, compiled local previews, explicit
  selection, edit, export, confirmed delete, and corrupt-record isolation.

The browser owns presentation and edit history only. Track geometry, closure,
self-intersection, corridor, and final validity remain Python-owned.

### Automated verification

`npm run check` passed:

- Prettier, ESLint, and TypeScript type-check.
- `54` Vitest tests across `13` files, including new builder rendering, escaped
  Python errors, tab separation, persistent generator inputs, piece reordering,
  duplication, locked start/finish, history, and TrackV1 round-trip coverage.
- Ruff format/lint, strict mypy, and `93` pytest tests, including the Phase 3
  deterministic generator/compiler/library contracts and loopback service
  integration.
- Vite production build with `17` transformed modules.

`npm run smoke:m0` passed with the frontend at `127.0.0.1:4173` and Python
health at `127.0.0.1:8765/health`. `git diff --check` passed. The new builder
modules contain no runtime URL, CDN, telemetry, or analytics reference.

The composed `npm run test:phase10` gate also passed. It regenerated all `18`
deterministic matrix cases in `17.239368 s`, built the Windows portable release,
and passed clean-runtime acceptance. The accepted ZIP SHA-256 was
`1fa92f9cd535e252511a333f4f8b5e22e59f62a2e57ecfd8ed21a912519d9e8c`.
The packaged runtime restored and completed
`run-0b0bff82a9a14266b740a7119a00c248`, used loopback only, and spawned no
external Node.js or Python process.

### Browser interaction audit

The development UI at `http://127.0.0.1:5173` was exercised against the local
Python service:

1. Track Builder opened from its visible Track-screen launcher and the starter
   loop reached **Python verified** automatically.
2. Adding a short straight produced `LOOP_NOT_CLOSED`; Undo restored a verified
   eight-piece loop.
3. Removing the last two pieces and choosing **Assist closure** made Python add
   two pieces and return a verified eight-piece loop.
4. Seed `731`, Long, Hard produced a verified `24`-piece track. It remained a
   preview until **Use this track** was pressed, then appeared as the selected
   experiment track without disabling Continue.
5. The generated track saved atomically, appeared as one compiled library card,
   and was removed through the confirmed delete action. The local track library
   was empty after cleanup.
6. `contracts/phase3-track-document.json` imported into Build only after Python
   validation. Explicit selection carried **Phase 3 Shared Oval** through
   Settings to Review; Review reported **Configuration valid** and enabled
   Start. Training was not started.
7. At a `390 x 844` viewport, document `clientWidth` and `scrollWidth` were both
   `375`. The selected-track banner, tabs, preview, controls, palette, and piece
   list remained usable without document-level horizontal overflow.

The browser warning/error log was empty. Temporary viewport overrides were
reset and no audit track remains in the local library.

## Track Builder and generator v2 verification

Original note: `track-builder-generator-v2.md`.

Date: 2026-08-04

Status: locally verified in source, Chromium, and the packaged Windows EXE.

### Corrected behavior

- A schema-valid editor draft no longer loses its canvas when the loop is open.
  Python returns presentation-only open centerline and boundary geometry while
  the draft remains invalid and cannot be selected, saved, or exported.
- Assisted closure reserves rollback-only candidates for each of the first six
  trailing pieces before spending the remaining search budget on safe appended
  suffixes. This makes the advertised six-piece repair depth reachable while
  reporting exact added and removed counts and retaining the 200-candidate cap.
- Generator version 2 retains deterministic SHA-256 ranking and exact 12, 18,
  or 24-piece targets. Easy layouts avoid chicanes and hairpins, Technical
  layouts require chicanes, and Hard layouts prefer hairpin stadium families.
  Every result is accepted by the same Python compiler used by presets, imports,
  and saved tracks.
- Switching away from an in-flight editor validation cancels its stale response
  so editor notices no longer overwrite the Generate or Library tab.
- Non-adjacent centerline endpoint contact and collinear overlap now count as
  self-intersection instead of producing ambiguous but selectable geometry.
- Closure assist owns the exact draft it was asked to repair. A newer edit
  invalidates that response, and every editor mutation is disabled while a
  Python command is pending.
- A generated preview now retains the seed, length, and difficulty that Python
  actually verified. Later form edits show `Inputs changed` and cannot relabel
  the old result with a new seed.
- The release build clears old Vite output before packaging, so the runnable
  folder contains only the current frontend asset pair.

### Verification

- `npm run check`
  - 57 Vitest tests passed.
  - 105 pytest tests passed.
  - Prettier, ESLint, TypeScript, Ruff, mypy, and production build passed.
- `npm run test:e2e`
  - The Track Builder Chromium flow retained an invalid-draft SVG, displayed
    `LOOP_NOT_CLOSED`, repaired the trailing edit, generated seed `731` as a
    24-piece Hard generator-v2 layout, kept that result tied to seed `731` after
    the form changed to seed `732`, and loaded hairpin pieces into Build.
  - The recommended offline training flow also passed.
- `npm run test:phase10`
  - The complete composed gate passed 57 Vitest tests, 105 pytest tests, the
    loopback smoke, both Chromium flows, release build, and clean-runtime
    acceptance.
  - All 18 deterministic matrix cases passed in `11.483036 s`; regression
    SHA-256 remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
- A final clean-static `npm run build:release` followed by
  `npm run test:release` verified the packaged open preview, one-piece repair,
  generator v2 hard layout, direct EXE launch, loopback-only runtime, restore,
  and absence of external Node.js or Python processes.

### Final local artifact

- Direct runnable: `release\EvoRacer\EvoRacer.exe`
- Runnable folder: 71 files, 20,177,123 bytes
- `EvoRacer.exe`: 2,573,165 bytes
- Current frontend assets in the bundle: 2
- Command scripts in the bundle: 0
- Parallel ZIP: 72 entries, 9,425,319 bytes
- ZIP SHA-256:
  `3cf9a9e4e7898d97e32311f6d2a1af9dac8cd89240b62f8559e2df1dac5b9ddd`
- Release-acceptance restored run:
  `run-2535458e41e240be9289836d72a03443`

### Honest boundary

The editor remains a sequential canonical-piece editor, not a freeform spatial
CAD surface. Open-draft geometry is visual feedback only. Closure repair is
bounded and intentionally may fail when no safe suffix or limited trailing
rollback produces a compiler-valid loop.

## Post-release Track Builder snap interaction

Original note: `post-release-track-builder-snap.md`.

Verified on `2026-08-10` for the unreleased v1.1.1 source workspace.

### User job

Build a circuit by handling modular pieces directly instead of repeatedly
clicking append and small move buttons.

### Change

- The Build tab places a compact piece tray beside the connected circuit on
  desktop and stacks both surfaces on narrow screens.
- A tray piece can be dragged onto any visible connector to insert it there.
- A placed piece can be dragged onto another connector to reorder the canonical
  sequence. Start/finish remains locked at index 01.
- Click-to-append and the existing move, duplicate, delete, undo, redo, reset,
  and closure-assist controls remain as keyboard-accessible alternatives.
- TypeScript owns only drag presentation and ordered-piece editing. The changed
  TrackV1 draft is still compiled and validated by the Python core after every
  snap.

### Evidence

- `npx.cmd vitest run tests/track-workbench.test.ts tests/track-builder.test.ts`
  passed `18 / 18` focused tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run check` passed formatting, ESLint, TypeScript type-check, all
  `109` TypeScript tests, PowerShell syntax, Python format/lint/type-check, and
  `142 / 143` Python tests. It stopped only at the existing Phase 10
  deterministic-matrix fixture mismatch from concurrent Python hardening work.
- The focused production-build Chromium flow
  `track builder previews invalid drafts, repairs them, and generates technical layouts`
  passed and inserted a short straight at connector 02 before exercising undo,
  click fallback, Python validation, and assisted closure.
- The focused Chromium flow
  `placed track pieces can be dragged to a new connector` passed and moved the
  existing long straight to connector 04.
- Browser inspection at `1280 x 720` measured `48 px` tray targets and no
  page-level horizontal overflow (`1265 / 1265`). At `390 x 844`, the assembly
  reflowed to one column, the same target measured `128.7 x 48 px`, and document
  `scrollWidth` equaled `clientWidth` (`375 / 375`).

### Boundary

No release package was rebuilt, signed, committed, pushed, tagged, or
published. Automated checks verify behavior and layout properties; they do not
replace representative user testing of subjective comfort.

## Post-release generator v3 and active-track verification

Original note: `post-release-generator-v3.md`.

Date: `2026-08-10`

### Reported problems

1. Seed-generated tracks looked simple and repetitive.
2. A successful Generate command produced a preview but did not make that track
   active until the user found and pressed a second **Use this track** action.

### Research boundary

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

### Implementation

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

### Verification evidence

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

## Post-release generator v4 and active-track clarity

Original note: `post-release-generator-v4.md`.

Date: `2026-08-10`

### User-visible problem

Generator v3 produced valid tracks but built the second half by repeating the
first half. Different seeds changed the piece sequence while keeping a visibly
mechanical two-half symmetry. Reopening Track Builder also forced the Build tab,
which showed the unrelated starter draft and made the already selected generated
track look unused.

### Change

- Python generator v4 searches bounded half laps, groups them by their
  Python-derived endpoint, and pairs different compatible halves.
- The unchanged canonical compiler remains authoritative for closure,
  self-intersection, boundaries, checkpoints, and spawn safety.
- The generator response reports layout, straight/corner, chicane, hairpin, and
  direction-change evidence.
- The browser labels the generated result **Active experiment track** and
  **Active for Review and Start**.
- Closing and reopening Track Builder retains the Generate tool and result.
- Review and Start still receive the exact generated TrackV1 selected by the
  explicit **Generate & use track** action.

### Verification

- `python\\tests\\test_phase3_tracks.py` covers same-input equality, every
  length/difficulty through the canonical compiler, asymmetric half-lap output,
  required difficulty features, and a 12-seed uniqueness corpus.
- `npm run check` passed Prettier, ESLint, TypeScript type checking, `111`
  Vitest tests, PowerShell syntax, Ruff formatting/lint, strict mypy across `27`
  files, `146` pytest tests, and the production frontend build.
- `scripts/test-e2e.ps1 -Port 8894` passed all `15` Chromium scenarios in
  `31.0 s`.
- The focused generated-track journey closed and reopened Track Builder,
  retained the Generate tab and active identity, reached Review, and captured
  the generated `24`-piece TrackV1 in the Start request.
- `npm run build:release` rebuilt the outside-ZIP executable from the verified
  source, and `npm run test:release` passed packaged open-preview, repair,
  generator-v4, direct-EXE, loopback-only, no-external-runtime, restored-run,
  and minimum-curvature result checks.
- Verified runnable: `release\EvoRacer\EvoRacer.exe` (`2,595,472` bytes).
  The parallel ZIP SHA-256 is
  `52bd876b4f7ddfe7afaca2f83ca0bb7f2900fb0847aab89fbdc7b5f2907998a5`.

### Boundary

The automated corpus proves deterministic validity, identity diversity, and
structural asymmetry. It does not prove that representative users find every
generated circuit beautiful or fun; that remains a human seed-matrix review.
