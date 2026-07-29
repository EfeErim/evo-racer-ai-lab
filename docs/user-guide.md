# EvoRacer AI Lab User Guide

## What the application does

EvoRacer AI Lab is a local Windows x64 application for observing Fixed GA or
feed-forward NEAT controllers learn on deterministic arcade racing tracks. You
select or build a track, configure an experiment, review it, and press Start.
There are no vehicle-driving controls.

The application uses the browser only as its interface. Simulation, physics,
fitness, evolution, persistence, and replay recording run in the bundled Python
core on the same computer.

## Install and open

1. Download `EvoRacer-Windows-x64.zip` and its matching
   `EvoRacer-Windows-x64.zip.sha256` file.
2. Optionally verify the archive from PowerShell:

   ```powershell
   (Get-FileHash .\EvoRacer-Windows-x64.zip -Algorithm SHA256).Hash.ToLower()
   Get-Content .\EvoRacer-Windows-x64.zip.sha256
   ```

   The two hashes must match.

3. Extract the entire ZIP. Do not move only `EvoRacer.exe` out of its folder;
   the adjacent bundled files are required.
4. Open `EvoRacer\EvoRacer.exe`.

Node.js and Python are not required on the target computer. The application
opens its interface at `http://127.0.0.1:8765`. This address is loopback-only:
it is reachable from the same computer, not from the local network or internet.

## Run a first experiment

The setup flow is always:

```text
Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results
```

1. On Welcome, choose **Begin experiment setup**.
2. Select **Easy Oval** for the simplest first track.
3. On Training Settings, choose **Quick start** or enter valid values.
4. On Review, wait for **Configuration valid**.
5. Read the frozen track and settings, then choose **Start training**.

Opening a screen or validating settings never starts training. Only the Start
button creates a run.

## Tracks

Three bundled presets are ready to use:

- **Easy Oval** has broad, forgiving turns.
- **Technical Circuit** mixes corner types.
- **Chicane Challenge** emphasizes rapid direction changes.

The Track screen also includes:

- a sequential piece editor with undo, redo, reset, delete, and assisted
  closure;
- a deterministic generator controlled by seed, length, and difficulty; and
- versioned TrackV1 JSON import, export, save, and delete.

Every source passes through the same Python compiler and validator before it can
be selected. An invalid import is rejected with a stable error instead of being
loaded into a run.

## Training settings

**Algorithm**

- **Fixed GA** evolves a fixed `10 -> 6 -> 3` neural-network shape plus vehicle
  genes.
- **NEAT** can evolve a feed-forward network topology plus the same vehicle
  genes.

Both choices use identical Python physics, sensors, episode termination, and
fitness. See [Algorithm comparison](algorithm-comparison.md) for the evidence
and limits of comparisons in this repository.

**Population** controls how many candidates are evaluated per generation.
Larger populations require more work per generation.

**Generations** sets the maximum number of complete evolution cycles.

**Episode length** sets the maximum simulated seconds available to each
candidate. Simulation uses a fixed `1/60 s` step; it does not depend on browser
rendering speed.

**Random seed** is under Advanced controls. Reusing the same supported
configuration and seed is intended to reproduce the same result sequence.

## Observe and control a run

Training shows the current generation, best and median fitness, the selected
candidate, continuous steering/throttle/brake outputs, progress, speed, and
seven road-edge sensors.

- **Pause** prevents a later generation batch from starting.
- **Resume** permits the next complete batch.
- **Stop** finishes the run after a completed generation boundary.
- **View results** opens the terminal result once a run has stopped or
  completed.

The reviewed configuration is locked after Start. The controls on this screen
manage the experiment only; they do not drive the vehicle.

## Read results

Results contain:

- run identity, algorithm, seed, track hash, and completed generation count;
- best and median fitness history;
- the champion compared with a seeded random network and Pure Pursuit using the
  champion's vehicle setup; and
- a Python-recorded replay with motion, controller outputs, and fixed vehicle
  values.

Fitness values are meaningful only under the recorded track, settings, and
fitness contract. A short smoke run verifies execution and reproducibility; it
does not establish that one algorithm generally learns better.

## Saved runs and local data

Tracks and runs are stored under:

```text
%LOCALAPPDATA%\EvoRacerAILab
```

Runs are written atomically at complete generation boundaries. Restarting the
application never restarts training automatically. Choose Resume on a supported
interrupted run to reconstruct and verify its checkpoint before continuing.

Use the Welcome library to resume, export, or delete an exact run. Exported
files are versioned JSON records suitable for backup and inspection.

## Exit and troubleshoot

Use **Exit application** in the top bar for graceful shutdown.

If the application does not open:

1. Confirm the full extracted `EvoRacer` directory is intact.
2. Check whether another process already uses local port `8765`.
3. Close a previously running EvoRacer instance and try again.
4. Keep the application in a user-writable folder and retry.

The release is designed for offline use. If a firewall prompt appears, public
or private network access is not required because the service binds only to
`127.0.0.1`.
