# Offline acceptance in Windows Sandbox

Roadmap step 4. It proves the packaged application on a clean Windows that has no
network, no Python, and no Node.js. Windows Sandbox starts a fresh Windows each time and
discards it on close. The configuration format follows
[Microsoft's `.wsb` reference](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file).
That reference requires absolute host paths, and it says changes in a writable mapped
folder survive the sandbox.

## How to run it

1. Enable Windows Sandbox once. Run this in an administrator PowerShell, then restart:
   `Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM`
2. Build the package with `npm run build:release`.
3. Run `npm run test:sandbox`.

The host script, `scripts/test-sandbox.ps1`, writes
`.runtime_tmp\sandbox\EvoRacer-offline.wsb` and opens it. The configuration has these
settings:

- `<Networking>Disable</Networking>`. Clipboard, printer, audio, and video redirection
  are also off.
- `release\EvoRacer` is mapped read-only to `C:\EvoRacer`.
- `scripts\sandbox` is mapped read-only to `C:\Acceptance`.
- `.runtime_tmp\sandbox\evidence` is the only writable mapping, at `C:\Evidence`.
- At sign-in, a visible PowerShell window runs `C:\Acceptance\sandbox-acceptance.ps1`.

## What the sandbox script checks

The script checks these on its own:

- No Python or Node.js is on `PATH` or registered in the registry. The Microsoft Store
  `python` stub is not a runtime and is ignored.
- A TCP connection to `1.1.1.1:443` and a DNS lookup of `example.com` both fail.
- `EvoRacer.exe` starts the normal way, with its default browser and its default data
  folder, and reports ready on `127.0.0.1:8765`.
- At each of three checkpoints, every TCP endpoint owned by an EvoRacer process is on
  loopback, and no `python`, `pythonw`, or `node` child process exists. The checkpoints
  are first launch, after training, and second launch.
- The first launch has no saved runs. After training, a run is `completed` or `stopped`.
  After Exit, every EvoRacer process ends. After a second launch, the same run is still
  listed.

The person running the test does the user interface steps the script prints:

1. Review recommended experiment.
2. Start training.
3. Watch Training until it finishes, or press Stop after generation.
4. Open results.
5. Exit.
6. In the relaunched app, open the run from Saved runs. Check that its Results match.

Evidence is written to `.runtime_tmp\sandbox\evidence\sandbox-acceptance.json` and a
transcript to `sandbox-acceptance.log` next to it. The evidence includes the
`EvoRacer.exe` SHA-256, the adapter list, every checkpoint, and every check.

## Host self-test, 2026-11-08

Windows Sandbox is not enabled on the development machine yet, so the sandbox itself
has not run. What was verified:

- `npm run build:release` built `release\EvoRacer\EvoRacer.exe`, with ZIP SHA-256
  `61e262ae4c6faea9d32fa3e70433cc5295d7f19d3f2f2937256eeb0ded1683c7`.
- `scripts/test-sandbox.ps1 -NoLaunch` wrote the configuration above, and it parsed as
  XML.
- `scripts/sandbox/sandbox-acceptance.ps1 -SelfTest` ran against that package on the
  host. Self-test mode uses a temporary data folder, opens no browser, replaces the user
  interface steps with a small run through the local API, and skips the two
  clean-machine checks, because the host has Python, Node.js, and a network. All `11`
  remaining checks passed. The only listener at each checkpoint was
  `127.0.0.1:8765`.

The first self-test failed because the run used population `6`, below the minimum of
`10`, and the script did not check the start response. The script now fails loudly when
a start is rejected.

## Result in Windows Sandbox

Not run yet.
