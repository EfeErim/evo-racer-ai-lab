# Executable Package Correction Verification

Date: `2026-08-04`

## Contract correction

The Windows package now requires `EvoRacer.exe` at the extracted application
root. `EvoRacer.cmd` is neither generated nor accepted as the user entry point.
The package remains self-contained, offline, and loopback-only.

## Packaging implementation

- Version: `1.1.1`.
- Builder: exact PyInstaller `6.21.0` `onedir` build.
- Entrypoint: `EvoRacer\EvoRacer.exe`.
- Direct local artifact: `release\EvoRacer\EvoRacer.exe`.
- Runtime dependencies and Vite assets are bundled adjacent to the EXE.
- Python, neat-python, and PyInstaller license texts are included.

## Final acceptance

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

## Repository audit corrections

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
