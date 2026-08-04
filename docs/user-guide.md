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

3. Extract the entire ZIP; do not run the application from inside the archive.
4. Open `EvoRacer\EvoRacer.exe`.

Node.js and Python are not required on the target computer. The application
opens its interface at `http://127.0.0.1:8765`. This address is loopback-only:
it is reachable from the same computer, not from the local network or internet.
The EXE and its adjacent bundled files form one application, so keep the
extracted `EvoRacer` folder together when moving it.

## Run a first experiment

For the simplest first run:

1. On Welcome, choose **Review recommended setup**. This selects **Easy Oval**
   and **Quick start**.
2. Wait for **Configuration valid** on Review.
3. Read the frozen track and settings, then choose **Start training**.

Choose **Customize setup** instead when you want a different track or training
plan. That path is:

```text
Welcome -> Track -> Training Settings -> Review -> Start -> Training -> Results
```

Opening a screen or validating settings never starts training. Only the Start
button creates a run.

Validation belongs to the current Review visit. If you choose Edit or otherwise
leave Review while Python is checking, that request is released from the UI and
Start remains locked. Returning to Review starts a fresh check; a late response
from the earlier visit cannot bring Review back, unlock Start, or complete the
newer check.

If Python rejects Start, Review stays open, shows the exact issue, and requires
validation again before another attempt. If the Start response is interrupted,
Review keeps the valid setup but labels the result as unknown. Open **Welcome
and Saved runs** to check whether the local core created a run before choosing
**Start training** again.

## Tracks

Three bundled presets are ready to use:

- **Easy Oval** has broad, forgiving turns.
- **Technical Circuit** mixes corner types.
- **Chicane Challenge** emphasizes rapid direction changes.

Select **Open Track Builder** on the Track screen. The workspace has three
focused tabs:

- **Build** provides a large Python-compiled preview, track name and road-width
  controls, a readable piece palette, reorder/duplicate/delete actions,
  undo/redo/reset, and Python-assisted closure. Python revalidates the canonical
  draft after each edit and shows stable issue codes when the loop is invalid.
- **Generate** creates a deterministic track from seed, length, and difficulty.
  Generation produces a verified preview; choose **Use this track** explicitly
  to apply it to the experiment or **Edit pieces** to continue in Build.
- **Library** imports versioned TrackV1 JSON and manages atomically saved local
  tracks. Saved tracks can be selected, edited, exported, or deleted after a
  confirmation.

With a keyboard, Left Arrow and Right Arrow move between Builder tabs; Home and
End move to the first and last tab. Opening the Builder moves focus to its
heading, and closing it returns focus to **Open Track Builder**.

Builder drafts and generated/imported previews never select themselves. A
custom track enters the setup only after **Use this track** is pressed.

Every source passes through the same Python compiler and validator before it can
be selected. An invalid import is rejected with a stable error instead of being
loaded into a run. Generate, save, and delete failures name the operation that
failed; a delete is reported as successful only when Python confirms that the
exact local record was removed.

While an imported JSON file is being read and validated, the picker shows
**Importing…** and cannot accept a second file. Closing Track Builder or leaving
the Track screen invalidates that pending presentation. A late Python response
cannot reopen the Builder or replace the current editor after you leave.

Library refreshes are ordered. A delayed older response cannot close the Track
Builder, replace current editor/generator work, or hide a track that a newer
save refresh already confirmed.

## Training settings

Choose a training plan first. The exact controls below stay collapsed under
**Customize training** unless you need them.

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

**Random seed** is under Advanced controls inside **Customize training**.
Reusing the same supported configuration and seed is intended to reproduce the
same result sequence. Open Customize training and Advanced controls remain open
while their values are edited.

The bundled presets expose their maximum workload directly:

- **Quick start** is the default visual demo: 10 candidates, 8 generations,
  and 15 simulated seconds per episode.
- **Balanced** is a longer Fixed GA run: 24 candidates, 20 generations, and 30
  simulated seconds per episode.
- **Thorough** is an extended NEAT experiment: 48 candidates, 40 generations,
  and 60 simulated seconds per episode.

The Settings and Review screens show the maximum candidate-episode count before
Start. A collision or completed lap can end an episode early. Existing saved
runs keep their original frozen settings; choose New setup to use a newer
preset.

## Observe and control a run

During the first generation, Training shows the currently evaluated candidate
moving from live Python snapshots. After that generation completes, the panel
continuously plays the latest Python generation champion at `2x` simulated
speed. The browser fills only the visual frames between recorded Python
positions, so motion stays smooth while training continues at full speed.
As new generations finish, the track keeps up to seven earlier champion paths
as an **Evolution trail**. Older paths are fainter, so the newest route is easy
to compare with earlier attempts. Up to eight sampled paths are saved with the
run, so reopening that same run restores its own trail without inheriting paths
from another experiment.
If the EvoRacer tab is in the background, training still runs at full speed but
the interface checks for new observations less often. Returning to the tab
triggers an immediate refresh; no manual catch-up or resume action is needed.
The same screen shows continuous steering/throttle/brake outputs, progress,
speed, seven road-edge sensors, and candidate position within the population.
Best and median fitness update when a complete generation reaches its
deterministic boundary.

Observation refreshes preserve the currently focused Training control. If a
temporary local-core error releases a pending Pause, Resume, or Stop command,
focus returns to that control so keyboard operation can continue.

The overall progress bar combines completed generations with the candidates
already completed in the active generation. It is evaluation progress, not a
wall-clock estimate.

- **Pause after generation** prevents a later generation batch from starting.
- **Resume** permits the next complete batch.
- **Stop after generation** finishes the run after a completed generation
  boundary.
- **View results** opens the terminal result once a run has stopped or
  completed.

While Python is evaluating a generation, Pause or Stop is queued rather than
interrupting a candidate episode. The button and status note confirm the queued
command until that deterministic boundary is reached.

When the run completes or stops, a **Results ready** panel appears immediately
below the run status. Use **Open results** there to continue without scrolling
through the telemetry and replay panels first.

The reviewed configuration is locked after Start. The controls on this screen
manage the experiment only; they do not drive the vehicle.

## Read results

Results contain:

- run identity, algorithm, seed, track hash, and completed generation count;
- best and median fitness history;
- the champion compared with a seeded random network and Pure Pursuit using the
  champion's vehicle setup; and
- earlier saved champions only when their track, population, generation budget,
  completed generations, and episode duration match; and
- a Python-recorded replay with motion, controller outputs, and fixed vehicle
  values.

Fitness values are meaningful only under the recorded track, settings, and
fitness contract. A short smoke run verifies execution and reproducibility; it
does not establish that one algorithm generally learns better.

Replay opens on the first recorded Python frame. **Previous**, **Next**, and
**Restart** stay within the available frame range, including a one-frame
replay. Empty replays, non-positive sampling intervals, negative times, and
frames whose simulated times do not increase are treated as corrupt local run
data instead of being animated. When a Saved results record fails this check,
its exact replay error is shown while the valid run library remains available
for another action.

## Saved runs and local data

Tracks and runs are stored under:

```text
%LOCALAPPDATA%\EvoRacerAILab
```

Runs are written atomically at complete generation boundaries. Restarting the
application never restarts training automatically. Choose Resume on a supported
interrupted run to reconstruct and verify its checkpoint before continuing.

Use the Welcome library to resume, export, or delete an exact run. Exported
files are versioned JSON records suitable for backup and inspection. Library
actions lock while pending. If one action fails, its exact error is shown while
the rest of the valid run library remains available.

Saved-run refreshes are ordered as well. A delayed startup list cannot replace
a newer terminal-run list or make a newly saved run temporarily disappear.

Saved-run actions also belong to the Welcome screen where they were started.
If you leave Welcome before a response returns, that late response cannot open
Results, restore Training, or start a download after you come back. Open and
Export responses are ignored. Because Python may already have completed a
requested Resume or Delete, EvoRacer refreshes the run library in the
background instead of claiming that the local operation was canceled.

Interrupted running or paused records provide **Resume**. Completed and safely
stopped records provide **Open results**, which revalidates the saved RunV1,
recompiles its Python track geometry, and opens the stored champion comparison
and replay without restarting training. A stopped record with no completed
generation correctly shows **No results** instead.

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
