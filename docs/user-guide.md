# EvoRacer AI Lab User Guide

## What the application does

EvoRacer AI Lab is a local Windows x64 application for observing Fixed GA or
feed-forward NEAT controllers learn on deterministic arcade racing tracks. You
select or build a track, choose a training plan, and press Start.
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

The application has three steps, shown in the top bar:

```text
Home -> Set up -> Race -> Results
```

1. On Home, choose **Set up a race**. **Easy Oval** and **Quick check** are
   already selected for a first run.
2. Set up shows the track, the training plan, and a **Ready to race** panel at
   the bottom. Python checks the setup automatically; wait for
   **Setup is valid**.
3. Choose **Start training**.

Opening a screen or checking a setup never starts training. Only the Start
button creates a run.

If the setup is invalid, the panel lists the issue with a link to the section to
fix and a **Check again** button.

If Python rejects Start, Set up stays open, shows the exact issue, and requires
another check before another attempt. If the Start response is interrupted,
Set up keeps the valid setup and says **No response yet. Try again.** A run may
or may not have started, so open **Open Home and Saved runs** to check before
choosing **Start training** again.

Returning to Home keeps your Set up choices. **New race** on Results starts over
from the recommended setup.

## Tracks

Three bundled presets are ready to use:

- **Easy Oval** has broad, forgiving turns.
- **Technical Circuit** mixes corner types.
- **Chicane Challenge** emphasizes rapid direction changes.

The Track section of Set up marks the selected track. A track you made in the
Track Builder appears there as **Your own track** with its name and length. The
Track Builder page shows the active track's name, length, and seed. Presets have
no seed because their layout is fixed.

Select **Open Track Builder** in the Track section of Set up. This is optional. The Track Builder opens as its own page; **Done** returns to Set up. The
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
heading, closing it with × returns focus to **Open Track Builder** on Set up, and reopening it
returns to the last-used tool instead of replacing a generated result with the
starter Build draft.

Builder drafts, generated candidates, and imported previews never select
themselves. Only **Use this track** makes one active, and the result is then
identified by **Active track** and **Active for this race**, and Set up
shows it as the selected track.

Every source passes through the same Python compiler and validator before it can
be selected. An invalid import is rejected with a stable error instead of being
loaded into a run. Generate, save, and delete failures name the operation that
failed; a delete is reported as successful only when Python confirms that the
exact local record was removed.

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

- **Quick check** is the default demo, using NEAT: 16 candidates, 10 generations,
  and 30 simulated seconds per episode. In a saved test it finished an Easy Oval
  lap with 8 of 10 seeds. Harder tracks need a longer preset.
- **Balanced** is a longer Fixed GA run: 24 candidates, 20 generations, and 30
  simulated seconds per episode.
- **Thorough** is an extended NEAT experiment: 48 candidates, 40 generations,
  and 60 simulated seconds per episode.

Set up shows the number of cars, generations, and the maximum number of
attempts before Start. One evaluation is one car attempting the track once, and a
collision or completed lap can end it early. Existing saved
runs keep their original frozen settings; choose New setup to use a newer
preset.

## Observe and control a run

The race is the largest element on the Race screen. Beside it are the current
generation, the best score so far, the car being tested now, overall progress,
and the run controls. Overall progress is real work done by Python. The race
drawing is presentation only, and training never waits for it.

Training evaluates cars much faster than real time, so the race shows the most
recently finished generation. When a generation finishes, Python sends the best
12 of its cars, and they race together on the track from the start line: the
generation's best car is bright green, the others are blue, and a car that
crashed turns red where it stopped. The heading names the generation, and the
footer says when training has already moved on to a later one. When a race ends,
the newest finished generation starts; if none is newer, the same race plays
again. Choose **1×**, **2×**, or **4×** to change how fast the race plays.

Earlier generations' best paths stay on the track as faint dashed lines. Before the first generation finishes, the track
shows a short note instead of cars.

**Score over generations** and **Car telemetry** sit below the race and are
collapsed by default. Open **Car telemetry** whenever you want the full
six-metric and seven-sensor inspection view; closing it keeps the race and
generation progress as the primary workspace.

**Menu** in the top bar holds **Animate races** and **Exit EvoRacer**. Turn
**Animate races** off to show still frames: the race holds each car at the end of
its attempt, and the Results replay holds its frame. If Windows animation effects
are off, races start still; choose **Play the race** on the Race screen, or turn
**Animate races** on, to animate them until you close EvoRacer. This setting
changes presentation only; it cannot alter a candidate, physics step, fitness
value, or deterministic result.

If the EvoRacer tab is in the background, training still runs at full speed but
the interface checks for new observations less often. Returning to the tab
triggers an immediate refresh; no manual catch-up or resume action is needed.
The same screen shows continuous steering/throttle/brake outputs, progress,
speed, seven road-edge sensors, and candidate position within the population.
Best and median fitness update when a complete generation reaches its
deterministic boundary.

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

Results lead with the answer to whether the cars got better over the run (whether
the best score improved), plus whether the run is saved on this computer.
**Change setup and race again** returns to Set up with the same choices, and
**New race** returns to Home. Results also contain:

- three more answers: what the champion achieved (lap, collisions, and whether
  it stayed close to the smooth reference line), how it compares with the
  references, and how sure the comparison is;
- a champion replay with **Play**/**Pause**, **Step back**, **Step forward**,
  **Restart**, and a **Replay position** slider, drawing a solid recorded champion path over a dashed
  minimum-curvature reference calculated by Python;
- a score-over-generations chart with labeled axes and a legend, plus the
  champion compared with a seeded random network and Pure Pursuit using the
  champion's vehicle setup. Pure Pursuit shows its best of several caution levels
  for that car, and the table says if a reference crashed;
- run identity, algorithm, seed, track hash, and completed generation count
  under **Run details**; and
- earlier saved champions only when their track, population, generation budget,
  completed generations, and episode duration match.

The smooth reference line comparison is intentionally strict. Python reports the mean and
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
time; drag the slider to jump to any recorded frame. With **Animate races** off
(in **Menu**), the replay holds its final frame without hiding either route;
Play is then off and the slider and step buttons still work.

## Saved runs and local data

Tracks and runs are stored under:

```text
%LOCALAPPDATA%\EvoRacerAILab
```

Runs are written atomically at complete generation boundaries. Restarting the
application never restarts training automatically. Choose Resume on a supported
interrupted run to reconstruct and verify its checkpoint before continuing.

Use Saved runs on Home to resume, export, or delete an exact run. Exported
files are versioned JSON records suitable for backup and inspection.

Interrupted running or paused records provide **Resume**. Completed and safely
stopped records provide **Open results**, which revalidates the saved RunV1,
recompiles its Python track geometry, and opens the stored champion comparison
and replay without restarting training. A stopped record with no completed
generation correctly shows **No results** instead.

## Exit and troubleshoot

Use **Exit EvoRacer** in the top-bar **Menu** for graceful shutdown. Closing the browser
tab leaves EvoRacer running in the background. Opening `EvoRacer.exe` again opens
that running copy in a new tab.

If the application does not open:

1. Confirm the full extracted `EvoRacer` directory is intact.
2. If EvoRacer reports that port `8765` is in use, close the other program using
   it, then open EvoRacer again.
3. Keep the application in a user-writable folder and retry.

The release is designed for offline use. If a firewall prompt appears, public
or private network access is not required because the service binds only to
`127.0.0.1`.
