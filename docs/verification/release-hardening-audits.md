# Release hardening and audit evidence

Each section preserves one original verification note; its former file name is
shown below the heading.

## Personal Offline Hardening Verification

Original note: `personal-offline-hardening.md`.

Verified on `2026-07-31` on Windows 11 x64 with Node.js `24.13.0`, npm
`11.9.0`, Python `3.13.5`, Playwright `1.61.1`, and Chromium `149.0.7827.55`.

### Durable evolution and comparable runs

- Python checkpoints retain at most eight generation-champion paths with at
  most 64 recorded points each.
- A restored run reproduces and returns its own saved trail. Legacy version 1
  run files without the optional trail field remain readable.
- Terminal run comparison filters by exact track SHA-256, population,
  requested and completed generations, and episode duration before exposing a
  prior champion to the UI.
- Pause or Stop requested before the first worker starts remains queued until
  the first deterministic generation boundary.

Focused persistence, service, and observer tests passed `39 / 39` cases.

### Real browser flow

`npm run test:e2e` passed one Chromium flow covering Welcome, the disabled
pre-Start Training route, recommended setup review, authoritative validation,
explicit Start, an immediate queued Stop, and Results. The browser console had
no errors.

Playwright is a development-only dependency. Browser binaries are not included
in the offline application ZIP.

### Thorough preset

`npm run test:thorough` completed the bundled Thorough configuration:

```text
track:              Easy Oval
algorithm:          NEAT
population:         48
generations:        40 / 40
episode seconds:    60
seed:               42
elapsed:            207.521299 s
median generation:  4.420601 s
slowest generation: 11.408456 s
champion progress:  1.0
checkpoint size:    62,465 bytes
retained trails:    8
result SHA-256:     4bbf0c8f3ff45954314c2694dc092dd5b87d0782862d0f8f3873119f265306f6
```

### Transparent portable package

The release builder downloads the official Python `3.13.5` Windows embeddable
archive only at build time and verifies SHA-256
`7d2650fd9d1b9d002d4a315d5f354247fd6a44f30517c7ef577b08f57a0fb6d9`.
The extracted release contains:

```text
EvoRacer\EvoRacer.cmd
EvoRacer\app\evo_racer\
EvoRacer\app\web\
EvoRacer\runtime\
```

It contains no frozen `EvoRacer.exe`. `npm run test:phase10` passed `54`
Vitest tests, `96` pytest tests, the loopback development smoke, one real
Chromium flow, all `18` deterministic matrix cases in `17.58354 s`, portable ZIP construction, and
fresh-extraction offline acceptance. The accepted ZIP SHA-256 is:

```text
8bb0f1305379aa90b2efb642cf1cc33fcfe6caf7b17ed101c10d401e1f8046e1
```

The accepted runtime used only `127.0.0.1`, restored and completed saved run
`run-c0fe1bc150b54b66b9eefc45de0fe7b8`, and spawned no external Node.js or
Python process.

The packaging mechanism follows the official Python
[Windows embeddable distribution guidance](https://docs.python.org/3.13/using/windows.html#the-embeddable-package).
The browser test follows Playwright's official
[installation and test-runner guidance](https://playwright.dev/docs/intro).

### Public release

Release commit `bd610fb69aee7b5a7796b588306622b80b538723` and annotated tag
`v1.1.0` are pushed. The
[v1.1.0 GitHub Release](https://github.com/EfeErim/evo-racer-ai-lab/releases/tag/v1.1.0)
is the latest full release and contains the verified ZIP plus its separate
SHA-256 asset.

`npm run test:phase11` verified public tag identity, release state, asset names
and sizes, and a fresh-download SHA-256 match:

```text
8bb0f1305379aa90b2efb642cf1cc33fcfe6caf7b17ed101c10d401e1f8046e1
```

## Executable Package Correction Verification

Original note: `executable-package-correction.md`.

Date: `2026-08-04`

### Contract correction

The Windows package now requires `EvoRacer.exe` at the extracted application
root. `EvoRacer.cmd` is neither generated nor accepted as the user entry point.
The package remains self-contained, offline, and loopback-only.

### Packaging implementation

- Version: `1.1.1`.
- Builder: exact PyInstaller `6.21.0` `onedir` build.
- Entrypoint: `EvoRacer\EvoRacer.exe`.
- Direct local artifact: `release\EvoRacer\EvoRacer.exe`.
- Runtime dependencies and Vite assets are bundled adjacent to the EXE.
- Python, neat-python, and PyInstaller license texts are included.

### Final acceptance

`npm run build:release` retained a complete runnable `release\EvoRacer` folder
and produced a parallel ZIP containing the same root-level EXE and no
`EvoRacer.cmd`. `npm run test:release` first opened the outside-ZIP EXE, then
extracted the ZIP with a system-only `PATH`, removed Python environment
variables, and configured unreachable outbound proxies. It verified that:

- `EvoRacer.exe` starts directly and owns the `127.0.0.1:8765` service;
- the packaged process opens no non-loopback connection;
- no external Node.js or Python child process is spawned;
- training, checkpoint persistence, graceful shutdown, restart, deterministic
  restore, completion, and replay all work from the extracted package.

The composed `npm run test:phase10` gate passed `57` Vitest tests, `105` pytest
tests, both real Chromium flows, all `18` deterministic matrix cases in
`11.483036 s`, the PyInstaller build, and the clean-runtime acceptance above.
The final accepted run was `run-2535458e41e240be9289836d72a03443`.

The directly runnable folder contains `71` files totaling `20,177,123` bytes.
The final ZIP contains `72` entries and is `9,425,319` bytes.
`EvoRacer/EvoRacer.exe` is `2,573,165` bytes; no `EvoRacer.cmd` entry exists.
The final ZIP SHA-256 is
`3cf9a9e4e7898d97e32311f6d2a1af9dac8cd89240b62f8559e2df1dac5b9ddd`.

### Repository audit corrections

- `npm audit` identified the development-only transitive
  `brace-expansion 5.0.8` advisory `GHSA-rgw5-rvv9-x895`. The lock now resolves
  `5.0.9`, and `npm audit --audit-level=low` reports zero vulnerabilities.
- `npm run smoke:m0` now fails closed when either required port is already
  occupied and requests graceful Python shutdown before PID-scoped fallback
  cleanup. Two consecutive smoke runs passed and left ports `4173` and `8765`
  free.
- Read-only browser inspection at `1280 x 720` and `390 x 844` found no
  page-level horizontal overflow, external runtime resources, or browser
  warnings/errors in the Welcome and Track Builder surfaces.
- Release starter acceptance now performs PID-scoped fallback cleanup even when
  startup, health, ownership, or graceful-shutdown assertions fail.

## Deep second audit

Original note: `deep-second-audit.md`.

Date: `2026-08-04`

Scope: a second file-by-file review of the Python simulation, evolution,
persistence, track, service, and packaging paths; the TypeScript IPC, parsing,
state, Track Builder, observer, replay, and result paths; and their focused
tests and release gates.

### Corrected findings

- A run record containing non-finite JSON numbers could raise a raw serializer
  error and block the complete run library. Checkpoint hashing now converts
  non-JSON-safe values into `RunRecordError`, so only that record is isolated.
- Runtime-neutral NEAT payloads now reject duplicate input keys, duplicate
  output keys, and input/output key overlap before activation.
- Track validation now treats non-adjacent endpoint contact and collinear
  overlap as centerline self-intersection. This prevents ambiguous projection
  and progress on a loop that previously passed the strict-crossing-only test.
- `Controls` rejects `NaN` and both infinities instead of silently clamping them
  into apparently valid steering, throttle, or brake values.
- Setup validation responses are tied to the exact reviewed draft. Editing the
  setup while validation is in flight cannot unlock Start with a stale result.
- Closure-assist responses are tied to the exact editor request. Newer edits
  invalidate older responses, and all editor mutation controls are disabled
  while a Python command is pending.
- Observation and run-command responses verify that their run is still active
  after the asynchronous request. A late response cannot resurrect or replace
  a newer session.
- Saved-run deletion now asks for confirmation, matching the existing track
  deletion safeguard.
- Direct-EXE acceptance now terminates the exact starter/runtime PID when an
  assertion fails, preventing an orphan process from poisoning later gates.

### Browser verification

The production UI was served by the local Python launcher and exercised through
Welcome, Track Builder, generator v2, custom-track selection, Review, explicit
Start, live Fixed GA training, champion replay, seven prior evolution trails,
`8 / 8` completion, and Results. No run existed before Start. The test-only run
and its dedicated data root were removed after shutdown.

### Final verification

- `npm audit --audit-level=low`: zero vulnerabilities.
- `npm run test:phase10`: passed.
  - `57` Vitest tests.
  - `105` pytest tests.
  - Development loopback smoke.
  - `2` real Chromium flows.
  - `18` deterministic matrix cases in `11.483036 s` with regression SHA-256
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` Windows `onedir` build.
  - Direct outside-ZIP EXE start, extracted-EXE start, checkpoint restart and
    completion, loopback-only socket audit, and no external Node.js or Python
    child process.
  - `git diff --check`.
- Final ZIP: `9,425,319` bytes, SHA-256
  `3cf9a9e4e7898d97e32311f6d2a1af9dac8cd89240b62f8559e2df1dac5b9ddd`.

The `v1.1.1` package remains local and unpublished. No commit, tag, push, or
public release was created during this audit.

## Deep audit remediation

Original note: `deep-audit-remediation.md`.

Date: `2026-08-05`

Latest full-gate revalidation: `2026-08-10`

Scope: close every repository defect found by the `2026-08-05` deep audit,
re-run the complete source and browser gates, and replace the stale local
Windows artifact with a package built from the corrected source.

### Corrected findings

- Ruff formatting is clean in the Python observation parser.
- The live-candidate observer test now gives generation, replay, and baseline
  evaluations the same shortened test budget. Terminal comparison validation
  remains strict and the manager persists the completed run successfully.
- The delayed-startup shutdown browser fixture now returns the versioned
  `status: "shutting-down"` acknowledgement required by the IPC client.
- `package.json`, `pyproject.toml`, and `evo_racer.__version__` all report
  `1.1.1`. A Python regression test covers the three metadata surfaces.
- `PROJECT_STATE.md` and the v1.1.1 release notes now distinguish the current
  package evidence from the previous executable baseline.

### Verification

- Focused observer persistence and package-metadata pytest cases passed.
- Focused delayed-startup shutdown Chromium acceptance passed.
- `npm run check` passed `106` Vitest tests, `139` pytest tests, Prettier,
  ESLint, TypeScript type-check, Ruff format/lint, strict mypy across `25`
  files, and the production frontend build.
- `npm run test:e2e` passed all `11` Chromium flows.
- `npm run test:phase10` passed the complete composed gate:
  - development loopback smoke;
  - all `11` Chromium flows;
  - all `18` deterministic Fixed GA/NEAT matrix cases in `15.292302 s`;
  - regression SHA-256
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`;
  - PyInstaller `6.21.0` Windows `onedir` build;
  - direct outside-ZIP EXE startup, checkpoint restore and completion;
  - loopback-only sockets and no external Node.js or Python process.
- The runnable folder contains `71` files totaling `20,216,528` bytes. Its
  root `EvoRacer.exe` is `2,581,406` bytes and no command script exists.
- The ZIP contains `72` entries and is `9,441,709` bytes. Its SHA-256 is
  `ccaadf5973e53bf4c4fc6a4a548785ef460c1c9855c7e85cfcb5fe6216177318`.
- Packaged `index-HUqrIiEv.js` and `index-CuIuzCwM.css` match the current
  production build by name, byte size, and hash.

### Signing boundary

`Get-AuthenticodeSignature` reports `NotSigned`. The current user's Windows
certificate store has no code-signing certificate, so a trusted Authenticode
signature cannot be produced in this environment. No self-signed certificate
was created or presented as a trusted distribution identity. The unsigned
artifact is accepted for the current local-release scope; signing remains an
optional publication-hardening step rather than a completion blocker.

Maintainers can sign an already verified local release after installing the
Windows SDK and a trusted code-signing certificate with an accessible private
key:

```powershell
npm run sign:release -- `
  -CertificateThumbprint <40-character SHA-1 thumbprint> `
  -CertificateStoreLocation CurrentUser `
  -TimestampUrl <RFC 3161 timestamp URL>
```

`scripts/sign-release.ps1` fails before modifying the EXE when the certificate,
private key, code-signing EKU, current validity, timestamp URL, or SignTool is
missing. After signing, it verifies the Authenticode policy and exact signer,
then rebuilds the ZIP and checksum from the signed runnable folder. Private keys
and certificate passwords are never accepted as repository inputs.

The script parsed with zero PowerShell syntax errors. A missing-certificate
preflight exited `1`; the before/after SHA-256 values of both
`release\EvoRacer\EvoRacer.exe` and `release\EvoRacer-Windows-x64.zip` remained
identical, proving the preflight fails before artifact mutation.
