# First run, run isolation, and CI repair

Recorded on `2026-11-04` and `2026-11-05`. GitHub CI run `41912431292` passed on
commit `bcbf4e2`, which landed on `main` as `1b8ed53` with the same content, including
source checks and browser flows.

## CI

Every recorded run on `main` failed at **Run source checks** (`41810326778`,
`41850081633`, `41875041221`). The job logs need GitHub sign-in and were not read, so
both causes below come from reproducing the checks in a clean clone with
`core.autocrlf=true`, which is the Windows runner's default.

| Cause                                                                    | Evidence                                                               | Fix                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ci.yml` had no line-ending rule, so it checked out as CRLF              | Prettier flagged only that file in the clone                           | `.gitattributes` now uses `* text=auto eol=lf`, with `*.ps1` kept as CRLF      |
| A service test allowed `2 s` for track generation, which takes `2.0-2.3` | The test failed three of three times, and also at unmodified `0c12cf6` | That test's request timeout is now `30 s`. Generator speed itself is unchanged |

## NEAT runs shared random state

neat-python draws only from the process-global `random` module, so a second run changed
the first run's results. Both runs then failed to resume with `RUN_CHECKPOINT_INVALID`.
Reproduced through `RunManager` with two NEAT runs observed at once. A browser path that
reaches this, such as a second tab, was not exercised.

`NEATRandomStream` now gives each run a private generator state and restores the global
state afterwards. A lock is held for each generation, so concurrent NEAT generations run
one at a time. New tests in `python/tests/test_observer.py` cover results beside a
second run, untouched global state, and resuming both runs after a restart.

`python/tests/test_phase10_hardening.py` passed, so the saved single-run regression
matrix is unchanged.

## Second launch and port ownership

On Windows a second server process bound the occupied port without error and both kept
running. [Microsoft documents](https://learn.microsoft.com/en-us/windows/win32/WinSock/using-so-reuseaddr-and-so-exclusiveaddruse)
the resulting behavior as indeterminate. The server now binds with
`SO_EXCLUSIVEADDRUSE` on Windows. A second launch checks `/health` and opens the running
copy. If another program holds the port, the launcher reports that in plain words.

Packaged `release\EvoRacer\EvoRacer.exe` on port `8813`: the second launch exited with
code `0` in under `1 s`, one process was listening, and the port was free after shutdown.
The port-held-by-another-program message is covered by a test, not by the packaged EXE.

## Quick check budget

The old preset (`10` cars, `8` generations, `15 s`) finished `0` of `15` runs across the
presets, with `5` seeds per track. A lap was out of reach on Easy Oval: the highest full
throttle speed measured across the setups tried was `15.1 m/s`, and `245 m` at that speed
already takes over `16 s`.

Easy Oval through the real `RunSession` path, `10` seeds including the default `42`, with
ten runs in parallel. Wall times are therefore under load.

| Algorithm | Cars | Generations | Seconds | Laps finished | Seed 42 finished | Median wall time |
| --------- | ---: | ----------: | ------: | ------------: | ---------------- | ---------------: |
| Fixed GA  |   10 |           8 |      30 |        2 / 10 | No               |           `14 s` |
| Fixed GA  |   16 |          10 |      30 |        4 / 10 | No               |           `27 s` |
| Fixed GA  |   20 |          12 |      30 |        3 / 10 | Yes              |           `43 s` |
| NEAT      |   10 |           8 |      30 |        4 / 10 | Yes              |           `14 s` |
| NEAT      |   12 |          10 |      30 |        7 / 10 | Yes              |           `21 s` |
| NEAT      |   16 |          10 |      30 |        8 / 10 | Yes              |           `23 s` |

Quick check is now NEAT with `16` cars, `10` generations, and `30 s`. Two of ten seeds
still miss a lap. This budget was measured on Easy Oval only, and the preset's text says
harder tracks need more.

## Commands

| Command                                                       | Result                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` in the clean autocrlf clone                   | Formatting, docs, lint, types, and `135` Vitest passed. pytest: `163` passed, `1` failed, the timeout above. The stage stopped there, before the build. |
| `pytest test_service.py test_launcher.py` in the clone, after | `23` passed.                                                                                                                                            |
| `npm run check` in the working tree, after the timeout fix    | Passed in full: `135` Vitest, `164` pytest, and the production build.                                                                                   |
| `npm run test:e2e` in the clean autocrlf clone                | `27` of `27` Chromium flows passed.                                                                                                                     |
| `npm run build:release`, `npm run test:release`               | Passed with loopback-only traffic. Run `run-3d2c2ff902e64942b5cd9be472732162`.                                                                          |
| Packaged EXE clicked through Review, Start, Training, Results | Seed `42` finished the lap in `24.07` simulated s. No console errors. Requests stayed on `127.0.0.1`.                                                   |

`release\EvoRacer-Windows-x64.zip` is `9,468,792` bytes with SHA-256
`d22c2f92c73dc3091463910cf8b17159718db9b083e6990c18b1f694bb6a0e68`.

In that run the champion and Pure Pursuit showed the same fitness, `2259.33`. Both took
`1444` steps. They drove differently (mean throttle `0.91` and `0.63`, top speed `11.2`
and `13.8 m/s`), and fitness depends on steps, so the tie is a coincidence and not a
copied value.

## Limits

- Clean Windows with network adapters disabled and human usability testing were not done.
