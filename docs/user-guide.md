# EvoRacer AI Lab User Guide

EvoRacer shows Fixed GA or NEAT controllers learning to drive a track. You choose a
track and a training plan and press Start; you never drive. Simulation, training and
saving run in the bundled Python core on this computer, and the browser is only the
interface.

## Install and open

1. Download `EvoRacer-Windows-x64.zip` and `EvoRacer-Windows-x64.zip.sha256`. To check
   the archive, compare `(Get-FileHash .\EvoRacer-Windows-x64.zip).Hash.ToLower()` with
   the hash in the `.sha256` file.
2. Extract the whole ZIP and open `EvoRacer\EvoRacer.exe`. Keep the `EvoRacer` folder
   together; Node.js and Python are not needed.

The interface opens at `http://127.0.0.1:8765`, which only this computer can reach. No
network access is needed, so a firewall prompt can be declined.

## Run a first experiment

1. On Home, choose **Set up a race**. **Easy Oval** and **Quick check** are preselected.
2. Wait for **Setup is valid**, then choose **Start training**. Nothing trains until
   you press Start.
3. If Python rejects the setup, the panel names the issue and offers **Check again**.
   If the Start response never arrives, a run may or may not exist: check **Saved runs**
   on Home before pressing Start again.

## Tracks

The presets are **Easy Oval**, **Technical Circuit** and **Chicane Challenge**.
**Open Track Builder** in Set up opens three tabs:

- **Editor**: drag pieces onto a connector, reorder, undo and redo. Python validates
  the loop after every edit and **Close the loop** repairs an open one.
- **Generate**: builds a track from a seed, length and difficulty. The same inputs
  always give the same track.
- **Library**: import TrackV1 JSON, and select, export or delete saved tracks.

A draft, generated or imported track becomes the race track only after **Use this
track**.

## Training plans

| Plan        | Algorithm | Cars | Generations | Seconds per attempt |
| ----------- | --------- | ---: | ----------: | ------------------: |
| Quick check | NEAT      |   16 |          10 |                  30 |
| Balanced    | Fixed GA  |   24 |          20 |                  30 |
| Thorough    | NEAT      |   48 |          40 |                  60 |

Chicane Challenge usually needs Thorough. **Exact settings** exposes the network type,
population, generations, attempt length and random seed; the same settings and seed
reproduce the same run. Settings are fixed once training starts.

## Watch a run

Training runs much faster than real time, so Race replays the latest finished
generation: its best 12 cars race together, the leader in green, crashed cars in red.
Choose **1×**, **2×** or **4×** for playback speed. **Car telemetry** shows controller
outputs, speed and the seven road-edge sensors.

**Pause after generation** and **Stop after generation** take effect at the end of the
current generation. **Menu** holds **Animate races** (turn off for still frames) and
**Exit EvoRacer**.

## Results

Results says whether the best score improved, replays the champion against a
minimum-curvature reference line, and compares it with a seeded random network and Pure
Pursuit driving the champion's car. **Change setup and race again** returns to Set up.

## Saved runs and data

Tracks and runs are saved under `%LOCALAPPDATA%\EvoRacerAILab` after every generation.
**Saved runs** on Home can resume an interrupted run, open results, export a run as
JSON or delete it. Restarting EvoRacer never restarts training by itself.

## Troubleshooting

Closing the browser tab leaves EvoRacer running; opening `EvoRacer.exe` again opens a
new tab. Use **Exit EvoRacer** to quit. If EvoRacer reports that port `8765` is in use,
close the other program using it and try again. Errors are written to
`%LOCALAPPDATA%\EvoRacerAILab\logs\evoracer.log`; include that file when you report a
problem.
