# Deep audit remediation

Date: `2026-08-05`

Latest full-gate revalidation: `2026-08-10`

Scope: close every repository defect found by the `2026-08-05` deep audit,
re-run the complete source and browser gates, and replace the stale local
Windows artifact with a package built from the corrected source.

## Corrected findings

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

## Verification

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

## Signing boundary

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
