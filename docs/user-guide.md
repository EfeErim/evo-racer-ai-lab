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

1. On Welcome, choose **Review recommended experiment**. This always selects
   **Easy Oval** and **Quick check**, even if you changed the setup earlier.
2. Wait for **Setup is valid** on Review.
3. Read the track and settings, then choose **Start training**.

Welcome also summarizes the player loop: set up, watch, and compare. This
introduction is only guidance; it does not create or start a run.

Choose **Choose track and settings** instead when you want a different track or
training plan. That path is:

```text
Welcome -> Track -> Settings -> Review -> Start -> Training -> Results
```

Opening a screen or validating settings never starts training. Only the Start
button creates a run.

Validation belongs to the current Review visit. If you choose Edit or otherwise
leave Review while Python is checking, that request is released from the UI and
Start remains locked. Returning to Review starts a fresh check; a late response
from the earlier visit cannot bring Review back, unlock Start, or complete the
newer check.

If Python rejects Start, Review stays open, shows the exact issue, and requires
another check before another attempt. If the Start response is interrupted,
Review keeps the valid setup and says **No response yet. Try again.** A run may
or may not have started, so open **Welcome and Saved runs** to check before
choosing **Start training** again.

## Tracks

Three bundled presets are ready to use:

- **Easy Oval** has broad, forgiving turns.
- **Technical Circuit** mixes corner types.
- **Chicane Challenge** emphasizes rapid direction changes.

The Track screen always shows the active track's name, length, and seed in a bar
that stays in view. Presets have no seed because their layout is fixed.

Select **Open Track Builder** on the Track screen. This is optional. The
workspace has three focused tabs, and each tab shows its current status:

- **Editor** provides a large Python-compiled preview, track name and road-width
  controls, and a compact piece tray beside the connected circuit. Drag a tray
  piece onto any glowing connector to snap it into that position; drag a placed
  piece to another connector to reorder it. Clicking a tray piece still adds it
  at the end, and move/duplicate/delete plus undo/redo/reset remain available for
  keyboard and precise editing. Python revalidates the canonical draft after
  every snap or edit and shows stable issue codes when the loop is invalid.
- **Generate** creates a deterministic candidate track from seed, length, and
  difficulty. Generator v5 samples varied half laps instead of repeating one half
  twice, producing asymmetric closed circuits. Easy mixes flowing 45-degree and
  90-degree corners, Technical includes direction changes and chicanes, and Hard
  includes both chicanes and hairpins. The result shows its seed, length, layout,
  and feature counts, and it stays a candidate until you choose **Use this
  track**. **Regenerate seed N** repeats the same inputs and confirms whether the
  track came back identical. Choose **Edit pieces** to continue in the Editor.
- **Library** imports versioned TrackV1 JSON and manages atomically saved local
  tracks. Saved tracks can be selected, edited, exported, or deleted after a
  confirmation.

With a keyboard, Left Arrow and Right Arrow move between Builder tabs; Home and
End move to the first and last tab. Opening the Builder moves focus to its
heading, closing it returns focus to **Open Track Builder**, and reopening it
returns to the last-used tool instead of replacing a generated result with the
starter Build draft.

Builder drafts, generated candidates, and imported previews never select
themselves. Only **Use this track** makes one active, and the result is then
identified by **Active track** and **Active for Review and Start**.

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
**Exact settings** unless you need them.

**Network type**

- **Fixed network** (Fixed GA) evolves a fixed `10 -> 6 -> 3` neural-network
  shape plus vehicle genes.
- **Growing network** (NEAT) can evolve a feed-forward network topology plus the
  same vehicle genes.

Both choices use identical Python physics, sensors, episode termination, and
fitness. See [Algorithm comparison](algorithm-comparison.md) for the evidence
and limits of comparisons in this repository.

**Cars per generation** (the population) controls how many candidates are
evaluated per generation. Larger populations require more work per generation.

**Generations** sets the maximum number of complete evolution cycles.

**Seconds per attempt** sets the maximum simulated seconds available to each
candidate. Simulation uses a fixed `1/60 s` step; it does not depend on browser
rendering speed.

**Random seed** is also under **Exact settings**. Reusing the same supported
configuration and seed is intended to reproduce the same result sequence. Exact
settings stays open while its values are edited.

The bundled presets expose their maximum workload directly:

- **Quick check** is the default visual demo: 10 candidates, 8 generations,
  and 15 simulated seconds per episode.
- **Balanced** is a longer Fixed GA run: 24 candidates, 20 generations, and 30
  simulated seconds per episode.
- **Thorough** is an extended NEAT experiment: 48 candidates, 40 generations,
  and 60 simulated seconds per episode.

The Settings and Review screens show the maximum number of candidate evaluations
before Start. One evaluation is one car attempting the track once, and a
collision or completed lap can end it early. Existing saved
runs keep their original frozen settings; choose New setup to use a newer
preset.

## Observe and control a run

The race is the largest element on the Training screen. Beside it are the current
generation, completed generations, best fitness so far, the active candidate,
evaluation progress, and the run controls. Evaluation progress is real work done
by Python. The race panel labelled **Replay** is presentation only, and training
does not wait for it.

Training evaluates cars much faster than real time, so the race view uses a
two-second buffer. The panel first shows **Buffering 2 s**. Every two seconds
after that, it plays the car that most recently finished during the previous two
seconds, fitting that car's complete recorded run into the next two seconds. A
run shorter than two simulated seconds plays at real speed and holds its last
frame. The heading names the car's generation and position in the population, and
the footer shows its simulated time, playback speed, and lap progress. This view
is about two seconds behind Python; the selected-car summary still shows the car
racing now. The buffered car is a recent sample, not a ranking: it can be weak.

After a pause or stop, the car on screen finishes and the panel returns to the
latest Python generation champion at `2x` simulated speed. The browser fills only
the visual frames between recorded Python positions, so motion stays smooth while
training continues at full speed. The car's complete Python-recorded route is the
solid green **Displayed car** or **Displayed champion** path. As new generations
finish, the track keeps up to seven earlier champion paths as faint dashed
context below the road markings.
Off-road sections remain visible instead of being snapped back onto the track.
Up to eight sampled paths are saved with the run, so reopening that same run
restores its own comparison without inheriting paths from another experiment.

**Fitness over generations** and **Car telemetry** sit below the race and are
collapsed by default. Open **Car telemetry** whenever you want the full
six-metric and seven-sensor inspection view; closing it keeps the race and
generation progress as the primary workspace.

Use **Reduce motion** in the top bar to hold replay and interpolated car motion
still without pausing or changing Python evaluation. If Windows animation effects
are off, EvoRacer reduces motion automatically, skips the two-second race buffer,
and labels the control **Show race motion**. Select it to turn on the buffered
race and smooth replays until you close EvoRacer. This setting changes
presentation only; it cannot alter a candidate, physics step, fitness value, or
deterministic result. The static marker uses the replay's final recorded frame,
while the complete path remains visible.

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

While Python is evaluating a generation, Pause or Stop is queued rather than
interrupting a candidate episode. The button and status note confirm the queued
command until that deterministic boundary is reached.

When the run completes or stops, a status panel with **Open results** appears at
the top of the screen and stays in view while you scroll.

The reviewed configuration is locked after Start. The controls on this screen
manage the experiment only; they do not drive the vehicle.

## Read results

Results lead with the answer to whether best fitness improved over the run, plus
whether the run is saved on this computer. **Back to Review** returns to the same
setup, and **Start a new run** returns to Welcome. Results also contain:

- three more answers: what the champion achieved (lap, collisions, ideal-line
  match), how it compares with the references, and whether the comparison can be
  trusted;
- a champion replay with **Play**/**Pause**, **Step back**, **Step forward**, and
  **Restart**, drawing a solid recorded champion path over a dashed
  minimum-curvature reference calculated by Python;
- a fitness-over-generations chart with labeled axes and a legend, plus the
  champion compared with a seeded random network and Pure Pursuit using the
  champion's vehicle setup;
- run identity, algorithm, seed, track hash, and completed generation count
  under **Run details**; and
- earlier saved champions only when their track, population, generation budget,
  completed generations, and episode duration match.

The **Ideal-line match** is intentionally strict. Python reports the mean and
95th-percentile distance between the recorded champion and its deterministic
minimum-curvature reference. A match requires the champion to finish the lap
and stay within both displayed tolerances. This geometric reference is useful
for comparison, but it is not proof of the globally fastest possible lap; a
true minimum-time solution would also optimize the speed profile and vehicle
dynamics.

Fitness values are meaningful only under the recorded track, settings, and
fitness contract. A short smoke run verifies execution and reproducibility; it
does not establish that one algorithm generally learns better.

Results plays the Python-recorded champion automatically at `1x` simulated
speed and fills visual positions between its timestamped frames. **Pause** holds
the current recorded frame, and the step buttons move one recorded frame at a
time. **Reduce motion** in the top bar holds the final frame without hiding
either route; Play is then off and the step buttons still work.
Empty replays, non-positive sampling intervals, negative times, and frames whose
simulated times do not increase are treated as corrupt local run data instead
of being animated. When a Saved results record fails this check, its exact
replay error is shown while the valid run library remains available for another
action.

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
