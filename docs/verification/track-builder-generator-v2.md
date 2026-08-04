# Track Builder and generator v2 verification

Date: 2026-08-04

Status: locally verified in source, Chromium, and the packaged Windows EXE.

## Corrected behavior

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

## Verification

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

## Final local artifact

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

## Honest boundary

The editor remains a sequential canonical-piece editor, not a freeform spatial
CAD surface. Open-draft geometry is visual feedback only. Closure repair is
bounded and intentionally may fail when no safe suffix or limited trailing
rollback produces a compiler-valid loop.
