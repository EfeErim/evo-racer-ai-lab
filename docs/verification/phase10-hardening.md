# Phase 10 Hardening and Portfolio Release Verification

Verified on `2026-07-29` on Windows 11 x64 build `26200` with Node.js
`24.13.0`, npm `11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

## Deterministic regression matrix

`evo_racer.hardening` completed Fixed GA and NEAT smoke runs for seeds `19`,
`73`, and `211` across Easy Oval, Technical Circuit, and Chicane Challenge.
Each of the `18` cases used population `10`, one generation, a `15 s` episode,
and the canonical fixed `1/60 s` simulation step.

The reviewed fixture is `contracts/phase10-regression.json`. It records the
track hash, champion and baseline values, replay frame count, and SHA-256 of
each complete terminal result. Python regenerated the matrix and required exact
fixture equality. TypeScript independently verified its version, coverage,
uniqueness, finite public metrics, replay presence, and hash shapes.

The measured matrix completed in `77.613886 s`; its median case time was
`3.863451 s`. The ignored machine-readable report was written to
`.runtime_tmp/phase10/performance.json` with regression SHA-256
`88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
These are local smoke timings, not end-user training-performance claims.

## Algorithm comparison

Across the nine one-generation smoke cases per algorithm:

| Algorithm | Mean champion fitness | Median champion fitness | Paired wins | Zero-fitness champions |
| --------- | --------------------: | ----------------------: | ----------: | ---------------------: |
| Fixed GA  |          103.83024287 |            109.49896879 |       6 / 9 |                      0 |
| NEAT      |           52.92941111 |             31.09698435 |       3 / 9 |                      0 |

The matrix contains 900 simulation steps per episode and is designed to detect
deterministic drift across complete algorithm paths. It does not support a claim
that Fixed GA generally learns better.

The separate controlled Phase 5 evidence remains the only saved learning
improvement claim: Fixed GA median fitness increased from `0.000000` to
`99.599264` over seven generations, and the champion beat a seeded random
network with identical vehicle genes. Phase 6 evidence proves NEAT
multi-generation completion, shared evaluation, generation-boundary mutation,
and deterministic checkpoint continuation, not an equivalent improvement
benchmark.

The public comparison and selection guidance is saved in
`docs/algorithm-comparison.md`.

## Documentation and demo audit

The repository now contains:

- a current public README and evidence boundary;
- the complete architecture responsibility and hardening boundary;
- a packaged `USER-GUIDE.md`;
- an evidence-backed algorithm comparison; and
- local SVG demo media at `docs/media/evoracer-results-demo.svg`.

The local application was exercised from Welcome through Easy Oval selection,
review, explicit Start, three complete Fixed GA generations, Stop, Results,
baseline comparison, and a `451`-frame replay. The observed run was Fixed GA
seed `42`; its champion fitness was `320.052` with `26.7%` progress. Pure
Pursuit completed the same track with the champion vehicle setup.

Browser inspection found no warning or error log. The development document
referenced only `/@vite/client`, `/src/main.ts`, and local fragments. Its
`scrollWidth` and `clientWidth` were both `1265`.

## Full repository and release gate

The complete Phase 10 command is:

```powershell
npm run test:phase10
```

It passed:

- Prettier, ESLint, TypeScript type-check, `26` Vitest tests, Ruff
  format/lint, strict mypy, `68` pytest tests, and the Vite production build;
- the development frontend/Python loopback smoke;
- exact regeneration of all `18` deterministic cases and the measured report;
- PyInstaller `6.21.0` `onedir` packaging; and
- clean-runtime extraction, restart, deterministic restore, completion, replay,
  loopback socket audit, and child-process audit.

The final `9,540,521`-byte archive SHA-256 was:

```text
536a54f74d4c03b97e665be5456356ebf8ffc6fa5b7b365084e1b909330c307f
```

Clean-runtime acceptance restored and completed run
`run-ede5749304bb45c38bc5acb276273591`. The extracted package contained the
new `USER-GUIDE.md`, used no installed Node.js or Python, opened no
non-loopback process socket, and spawned no Node.js or Python child process.
`git diff --check` passed.

## Claim boundary

- Determinism claims apply to the saved fixtures, seeds, versions, and exact
  configuration under test.
- Offline and clean-runtime claims apply to the tested Windows package and
  acceptance environment.
- Smoke timing is not a production capacity or hardware-independent
  performance guarantee.
- The repository does not claim that either evolution algorithm is universally
  superior.
