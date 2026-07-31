# Personal Offline Hardening Verification

Verified on `2026-07-31` on Windows 11 x64 with Node.js `24.13.0`, npm
`11.9.0`, Python `3.13.5`, Playwright `1.61.1`, and Chromium `149.0.7827.55`.

## Durable evolution and comparable runs

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

## Real browser flow

`npm run test:e2e` passed one Chromium flow covering Welcome, the disabled
pre-Start Training route, recommended setup review, authoritative validation,
explicit Start, an immediate queued Stop, and Results. The browser console had
no errors.

Playwright is a development-only dependency. Browser binaries are not included
in the offline application ZIP.

## Thorough preset

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

## Transparent portable package

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

## Public release

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
