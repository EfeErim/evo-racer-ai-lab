# Post-release generator v4 and active-track clarity

Date: `2026-08-10`

## User-visible problem

Generator v3 produced valid tracks but built the second half by repeating the
first half. Different seeds changed the piece sequence while keeping a visibly
mechanical two-half symmetry. Reopening Track Builder also forced the Build tab,
which showed the unrelated starter draft and made the already selected generated
track look unused.

## Change

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

## Verification

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

## Boundary

The automated corpus proves deterministic validity, identity diversity, and
structural asymmetry. It does not prove that representative users find every
generated circuit beautiful or fun; that remains a human seed-matrix review.
