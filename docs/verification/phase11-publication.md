# Phase 11 Public Binary Publication Verification

## Scope

Phase 11 publishes the Phase 10-accepted Windows bundle without changing the
application's runtime behavior. Its gate covers coherent `v1.0.0` metadata,
checked-in release notes, an annotated source tag, a full GitHub Release, public
ZIP and checksum assets, and a fresh-download integrity check.

## Publication procedure

The release is prepared in this order:

1. Run the complete Phase 10 gate on the release source.
2. Record the generated ZIP SHA-256 and size.
3. Commit and push the release source.
4. Create and push annotated tag `v1.0.0` for that commit.
5. Create the GitHub Release as a draft, attach the ZIP and checksum, then
   publish it as the latest full release.
6. Run `npm run test:phase11` against the public tag and assets.

## Pre-publication evidence

The release source is commit
`0c566579532f56d92a08790cff5ef44b674bc4c9`. It passed:

- Prettier, ESLint, TypeScript type-check, `26` Vitest tests, Ruff
  format/lint, strict mypy, and `68` pytest tests.
- Development loopback smoke on `127.0.0.1`.
- All `18` matrix cases across three seeds, three presets, Fixed GA, and NEAT.
- Windows `onedir` package construction.

The matrix completed in `81.457872 s`, with a median case time of `4.039459 s`
and regression SHA-256
`88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.

The exact publication artifact then passed `npm run test:release` from the
normal repository path. It saved, restarted, restored, and completed run
`run-f8848e74fb054ce0b9774f7e9b2d49c1`, exposed only loopback sockets, and
spawned no external Node.js or Python process.

## Public evidence

- Release:
  <https://github.com/EfeErim/evo-racer-ai-lab/releases/tag/v1.0.0>
- Annotated tag: `v1.0.0`
- Tag commit: `0c566579532f56d92a08790cff5ef44b674bc4c9`
- ZIP size: `9,398,174` bytes
- Checksum asset size: `92` bytes
- ZIP SHA-256:
  `2462e678368f3e142d801d8c29c327602484d5e24c0bd3441efb0a317f1cf732`

`npm run test:phase11` used GitHub's public REST endpoints to verify that the
release is the latest full release, the tag is an annotated tag resolving to
the recorded commit on `main`, and both assets are uploaded with the recorded
sizes. It downloaded both assets to a temporary directory and recomputed the
same SHA-256 value before cleaning up.

The checked-in release notes retain the offline, observer-only product boundary
and distinguish saved deterministic and controlled-learning evidence from
claims about every seed or algorithm.
