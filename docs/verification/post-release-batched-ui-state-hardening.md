# Post-release batched UI-state hardening

Date: 2026-08-04

## Corrections

- A successful automatic Saved runs refresh no longer reuses a prior error as
  its success notice. The valid library returns without a stale Retry surface.
- Track Library retry now changes `Refreshing…` to an explicit
  `Local track library refreshed.` completion message.
- Generator seed, length, and difficulty inputs are disabled while a Python
  generation command is pending, matching the existing mutation lock on editor
  and result actions.
- Track Builder command errors now render with `role="alert"` and assertive live
  semantics; non-error notices remain polite status updates.

## Verification

- Focused Track Builder tests: `11 / 11` passed.
- Forced Track/Saved-runs Chromium recovery flows: `2 / 2` passed.
- `npm run test:phase10` passed once after the complete batch:
  - `82` Vitest tests and `105` pytest tests passed.
  - All `11` Chromium flows passed.
  - All `18` deterministic Fixed GA/NEAT cases passed in `13.612335 s`; median
    case time was `0.755825 s` and regression SHA-256 remained
    `88a77019558f77947536d50b3f61c6badb9234713555f7ea4ef20d38086e8d64`.
  - PyInstaller `6.21.0` rebuilt the Windows application.
  - Clean-runtime acceptance restored and completed
    `run-ca17ce5c7be747099d5b645704004eb4`, used loopback only, and spawned no
    external Node.js or Python process.

Final local artifact:

- Runnable folder: `71` files, `20,202,698` bytes.
- Root executable: `2,573,165` bytes.
- ZIP: `72` entries, `9,433,123` bytes.
- ZIP SHA-256:
  `b44510204b76ee551f9004050afef55f41c02907132a3ee01184cc33c1a9bee2`.
- The checksum file matches the ZIP; ports `4173` and `8765` were free after
  acceptance.

Publication, tagging, and replacement of immutable `v1.0.0` / `v1.1.0` assets
were not performed.
