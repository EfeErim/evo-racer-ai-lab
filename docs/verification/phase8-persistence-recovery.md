# Phase 8 Persistence and Recovery Verification

Date: 2026-07-29

## Delivered boundary

- Python-owned version 1 run documents under
  `%LOCALAPPDATA%\EvoRacerAILab\runs\<run-id>\run.json`.
- Atomic replacement after Start and every complete generation or run command.
- Embedded TrackV1 schema identity, frozen settings, observation checkpoint,
  and canonical snapshot SHA-256.
- Restart-safe run listing, explicit deterministic resume, corrupt-record
  isolation, exact-record delete, and versioned JSON export.
- Welcome-screen saved-run table with Resume, Export, and Delete actions.
- Shared `contracts/phase8-run-document.json` fixture parsed by TypeScript and
  validated by Python.

## Persistence design evidence

`python/src/evo_racer/run_library.py` writes a named temporary file in the
destination run directory, flushes and `fsync`s it, closes it, and calls
`os.replace`. JSON serialization uses sorted keys, one complete document, and
`allow_nan=False`.

The design was checked against the current Python 3.13 standard-library
documentation for
[`NamedTemporaryFile`](https://docs.python.org/3.13/library/tempfile.html#tempfile.NamedTemporaryFile),
[`os.fsync`](https://docs.python.org/3.13/library/os.html#os.fsync),
[`os.replace`](https://docs.python.org/3.13/library/os.html#os.replace), and
[`json`](https://docs.python.org/3.13/library/json.html).

## Deterministic recovery evidence

`python/tests/test_run_library.py` interrupts Fixed GA and NEAT after generation
1 of 2, saves the run document, creates a new manager, explicitly resumes, and
finishes the run. For both algorithms, the restored final fitness history,
generation report, selected-car telemetry, terminal result, baselines, and
replay equal the uninterrupted seeded run.

The same test module verifies atomic-file cleanup, restart persistence of tracks
and runs, export/delete, checkpoint-digest rejection, and isolation of a corrupt
record without blocking the valid run.

`python/tests/test_service.py` exercises the loopback run-library list, resume,
observe-to-completion, export, and delete endpoints across a new service
instance.

## Browser evidence

The local UI was inspected at a `390 x 844` viewport:

- the Welcome screen displayed Run schema v1 and a saved interrupted run;
- Resume was an explicit user action and restored generation `1 / 2`;
- the run completed at generation `2 / 2` and Results rendered the deterministic
  fitness history, champion/baselines, and replay;
- the Results document had no horizontal overflow (`scrollWidth == clientWidth`
  at `375`);
- the browser console contained zero warnings or errors;
- the temporary browser-audit run was deleted through the loopback API and its
  local directory no longer existed.

## Gate commands

Focused verification:

```powershell
npm run typecheck
npm run lint
npm run test
npm run typecheck:python
npm run lint:python
.\.venv\Scripts\python.exe -m pytest python/tests/test_run_library.py python/tests/test_service.py python/tests/test_observer.py -q
```

Phase-level verification:

```powershell
npm run check
npm run smoke:m0
git diff --check
```

The final phase-level counts and outcomes are recorded in `PROJECT_STATE.md`.
