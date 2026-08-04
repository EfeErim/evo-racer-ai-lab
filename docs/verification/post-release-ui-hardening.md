# Post-release UI hardening

Date: `2026-08-04`

Scope: targeted browser and code review on top of the locally verified,
unpublished `v1.1.1` executable and Track Builder correction.

## Corrected findings

- Changing the generator seed after a successful Python generation updated the
  draft state but did not update the visible result until another full render.
  Seed input and generator radio changes now synchronize the selected styling,
  stale-result badge, and status notice without replacing the focused input.
  The preview continues to display the seed Python actually verified and tells
  the user to generate again before the new inputs apply.
- Populated saved-run and previous-run tables could expand the complete Results
  document at a narrow viewport. Wide comparison tables now scroll inside a
  bounded local container instead of creating page-level horizontal overflow.

## Browser verification

The development UI was inspected at `390 x 844` with a populated local run
library. Changing a generated seed from `42` to `43` immediately displayed
`Inputs changed`, retained the verified `Seed 42` metadata, and produced no
console warning or error. On the populated saved-run surface, document
`scrollWidth` and `clientWidth` both measured `375`; the table retained its own
bounded horizontal scroll.

The real Chromium suite now requires the stale-result indicator before any tab
switch and asserts that the terminal Results page has no page-level horizontal
overflow at `390 x 844`.

## Final verification

- `npm run check`: passed with `57` Vitest tests and `105` pytest tests.
- `npm run smoke:m0`: passed and released ports `4173` and `8765`.
- `npm run test:e2e`: both Chromium flows passed.
- `npm run test:phase10`: passed.
  - All `18` deterministic matrix cases matched the reviewed regression in
    `11.569158 s`; regression SHA-256 remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows `onedir` application.
  - Clean-runtime acceptance started the outside-ZIP EXE directly, restored
    and completed `run-4e1e44c6ae2946f28595a3fda84b5863`, observed loopback
    traffic only, and found no external Node.js or Python child process.
  - `git diff --check` passed.
- The runnable folder contains `71` files totaling `20,178,216` bytes.
- `release\EvoRacer\EvoRacer.exe` is `2,573,165` bytes.
- `release\EvoRacer-Windows-x64.zip` is `9,425,553` bytes with SHA-256
  `d066b4ef4cc3c52032e79725c424ed23bdfa7a63833fea1088bc79ed8df5e2ca`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created.
