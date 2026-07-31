# Track Builder Redesign Verification

Date: `2026-07-31`

## Scope

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

## Automated verification

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

## Browser interaction audit

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
