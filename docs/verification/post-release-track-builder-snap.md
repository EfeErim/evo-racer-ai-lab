# Post-release Track Builder snap interaction

Verified on `2026-08-10` for the unreleased v1.1.1 source workspace.

## User job

Build a circuit by handling modular pieces directly instead of repeatedly
clicking append and small move buttons.

## Change

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

## Evidence

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

## Boundary

No release package was rebuilt, signed, committed, pushed, tagged, or
published. Automated checks verify behavior and layout properties; they do not
replace representative user testing of subjective comfort.
