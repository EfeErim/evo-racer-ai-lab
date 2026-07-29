# Phase 9 Windows Offline Package Verification

Verified on `2026-07-29` on Windows 11 x64 build `26200` with Node.js
`24.13.0`, npm `11.9.0`, Python `3.13.5`, and PyInstaller `6.21.0`.

## Release artifact

The command:

```powershell
npm run build:release
```

completed the Vite production build and PyInstaller `onedir` build, copied the
README and license notices, and created:

```text
release\EvoRacer-Windows-x64.zip
release\EvoRacer-Windows-x64.zip.sha256
```

The final ZIP was `9,537,598` bytes. Its SHA-256 was:

```text
ab1a3126385c2c536169bb50124df436b4043ad4ab3afc74b6d4b518179b6149
```

The checksum file matched the archive. The extracted distribution contained
`EvoRacer.exe`, all bundled runtime files and frontend assets, `README.md`,
`THIRD-PARTY-NOTICES.txt`, the Python license, and the PyInstaller license.

## Clean-runtime and offline acceptance

The command:

```powershell
npm run test:release
```

passed against a fresh extraction of the ZIP. The acceptance process received
only `%SystemRoot%\System32` on `PATH`; `PYTHONHOME` and `PYTHONPATH` were
removed. HTTP, HTTPS, and all-protocol proxy variables pointed at an unreachable
loopback endpoint while `NO_PROXY` allowed only `127.0.0.1` and `localhost`.

The packaged process:

- served health and the production frontend from `127.0.0.1:8765`;
- started Fixed GA run `run-22089c3857804993b70dd2d0fccbeb9c`;
- completed and atomically saved generation `1 / 2`;
- shut down cleanly;
- restarted from the same extracted package and data directory;
- listed and explicitly restored the interrupted run;
- completed generation `2 / 2` and returned champion replay frames;
- opened no non-loopback process socket; and
- spawned no Node.js, Python, or Pythonw child process.

This verifies the packaged runtime without relying on installed Node.js or
Python and exercises save/restore while outbound access is unavailable through
the configured runtime environment. The live connection inventory remained
loopback-only throughout the acceptance.

## Production browser audit

The extracted `EvoRacer.exe` was opened through the production server and tested
in the in-app browser:

1. Welcome loaded from `http://127.0.0.1:8765/`.
2. Easy Oval and Quick start were selected.
3. Review returned `Configuration valid`; no run existed before the explicit
   Start click.
4. Start opened the locked Training workspace.
5. A Fixed GA generation completed with fitness history, selected-car
   telemetry, and seven sensor rays.
6. Stop produced a terminal result after a complete generation boundary.
7. Results rendered champion/baseline comparison and a `139`-frame replay.
8. The saved run appeared on Welcome after reopening the UI.

The browser console contained zero warnings or errors. The only document
resource references were the same-origin hashed JavaScript and CSS assets under
`/assets/`. At a `390 x 844` viewport override, document `scrollWidth` and
`clientWidth` both equaled `375`, and the Exit action remained visible.

The Exit action displayed its confirmation, returned the final shutdown page,
and terminated the packaged process. A subsequent process check found no
remaining `EvoRacer` process.

## Repository gate

The command:

```powershell
npm run check
```

passed Prettier, ESLint, TypeScript type-check, `25` Vitest tests, Ruff
format/lint, strict mypy, `67` pytest tests, and the Vite production build.

The command:

```powershell
npm run smoke:m0
```

passed with both development processes on loopback. `git diff --check` also
passed.
