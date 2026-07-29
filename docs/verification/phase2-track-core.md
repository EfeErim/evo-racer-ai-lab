# Phase 2 Track Core Verification

Verified on `2026-07-29`.

## Automated gate

`npm run check` passed:

- Prettier and Ruff formatting checks
- ESLint and Ruff lint
- strict TypeScript and Python type-checks
- 11 TypeScript tests across three files
- 12 Python tests
- Vite production build

The Phase 2 tests prove:

- all three bundled presets compile through the canonical Python compiler;
- compiled centerlines and both boundaries close at the same point;
- invalid version, piece, start/finish, corridor, closure, and
  self-intersection fixtures return their saved stable error codes;
- repeated compilation serializes identically;
- Python output matches the shared Easy Oval geometry fixture;
- TypeScript accepts that same fixture and renders only its supplied geometry;
- the loopback service returns Easy Oval, Technical Circuit, and Chicane
  Challenge from `GET /v1/tracks/presets`.

## Runtime and UI checks

`npm run smoke:m0` passed with the frontend at `127.0.0.1:4173` and Python
health at `127.0.0.1:8765/health`.

The local Track screen was opened against the development service. Inspection
found three preset cards, three compiled SVGs, three road paths, and three start
lines, with no unavailable placeholders. Selecting Chicane Challenge enabled
Continue. The browser console contained no warnings or errors.

A static runtime URL scan found only the intended `127.0.0.1` frontend and
Python service URLs. `git diff --check` passed.
