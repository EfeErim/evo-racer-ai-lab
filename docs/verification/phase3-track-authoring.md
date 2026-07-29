# Phase 3 Track Authoring Verification

Date: `2026-07-29`

## Automated gate

`npm run check` passed:

- Prettier and ESLint.
- TypeScript type-check.
- 15 Vitest tests, including sequential editor history, TrackV1 JSON
  import/export, and the shared Phase 3 fixture.
- Ruff format/lint and strict mypy.
- 20 pytest tests, including deterministic generation, all nine
  length/difficulty combinations, bounded closure assistance, atomic library
  round-trip, corrupt-record isolation, CORS deletion, and the shared fixture.
- Vite production build.

`npm run smoke:m0` passed with the frontend and Python service bound to
`127.0.0.1`.

`git diff --check` passed. A scan of `src` and `python/src` found no
non-loopback runtime URL.

## M3 contract evidence

- Presets call `compile_track`; edited and imported tracks call the versioned
  compile endpoint; generated candidates call `compile_track`; saved tracks
  reload through `compile_track_payload`.
- `test_same_generator_inputs_reproduce_identical_canonical_json` compared
  sorted compact JSON from two identical requests byte for byte.
- Short, Medium, and Long produced exactly 12, 18, and 24 pieces for Easy,
  Technical, and Hard. Every result was recompiled through the public compiler.
- Generator and assisted-closure searches enforce the 200-candidate ceiling.
- Unknown segment JSON returned `UNKNOWN_SEGMENT_KIND`; malformed local JSON was
  isolated as `CORRUPT_TRACK_RECORD`.
- `contracts/phase3-track-document.json` passed both Python compilation and
  TypeScript document parsing.

## Browser interaction audit

The local UI at `http://127.0.0.1:5173` was exercised against the Python service:

- Three preset cards rendered Python-derived SVG geometry.
- Deleting the final two editor pieces and selecting Assist closure added two
  pieces in Python and restored an eight-piece valid loop.
- Seed `731`, Long, Hard generated and selected a 24-piece track. It saved
  atomically, appeared in the local library, and was deleted again.
- The shared TrackV1 fixture imported through the file input, displayed its
  compiled preview, continued through Settings, and passed Review validation.
  Start became enabled only after that validation; it was not activated during
  the audit.
- The deletion flow was repeated after adding dynamic-path CORS preflight
  coverage and ended with `No saved tracks yet`.
- Browser console audit found zero warnings or errors.
- At a `390 x 844` viewport override, the document client width and scroll width
  both measured `375`, with no document-level horizontal overflow. The override
  was reset after inspection.

No test track remains in the local library.
