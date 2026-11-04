import type { RunLibraryState, SimulationState } from "../app-store";
import { replayTrackTrail } from "../generation-trails";
import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import type {
  ObservationSnapshotV1,
  ReplayFrameV1,
  RunResultV1,
} from "../simulation";
import { type CompiledTrackV1, renderTrackSvg } from "../track-renderer";
import { pageHeader } from "./shared";
import type { ReplayPresentation } from "./shell";
import { renderFitnessChart } from "./training";

export interface ResultVerdict {
  headline: string;
  evidence: string;
  tone: "success" | "warning" | "info";
  glyph: string;
}

/** Answers "did performance improve?" using only Python-reported fitness. */
export function fitnessVerdict(result: RunResultV1): ResultVerdict {
  const first = result.fitnessHistory[0];
  if (first === undefined || result.fitnessHistory.length < 2) {
    return {
      headline: "Too early to say: only one generation finished",
      evidence: `Best fitness is ${result.champion.fitness.toFixed(1)}. Improvement needs at least two finished generations to compare.`,
      tone: "info",
      glyph: "–",
    };
  }
  const gain = result.champion.fitness - first.bestFitness;
  const span = `from ${first.bestFitness.toFixed(1)} in the first generation to ${result.champion.fitness.toFixed(1)}`;
  return gain > 1e-6
    ? {
        headline: "Yes, best fitness improved over the run",
        evidence: `It rose by ${gain.toFixed(1)}, ${span}.`,
        tone: "success",
        glyph: "↑",
      }
    : {
        headline: "No, best fitness did not improve over the run",
        evidence: `It went ${span}. A longer plan may give evolution more chances.`,
        tone: "warning",
        glyph: "→",
      };
}

function savedRunStatus(
  runLibrary: RunLibraryState,
  runId: string,
): { glyph: string; tone: string; label: string } {
  if (runLibrary.status === "unavailable") {
    return {
      glyph: "!",
      tone: "warning",
      label: "Saved status unknown: no response yet",
    };
  }
  if (runLibrary.status === "loading") {
    return { glyph: "…", tone: "info", label: "Checking saved runs" };
  }
  return runLibrary.value.runs.some((run) => run.runId === runId)
    ? { glyph: "✓", tone: "success", label: "Saved on this computer" }
    : { glyph: "…", tone: "info", label: "Not in Saved runs yet" };
}

function championAnswer(result: RunResultV1): string {
  const racingLine = result.racingLineComparison;
  const comparison = result.baselineComparisons[0];
  const lap =
    comparison?.finished === true
      ? "Finished the lap"
      : `Reached ${(result.champion.progress * 100).toFixed(1)}% of the lap`;
  const collisions = comparison?.collisionCount ?? 0;
  return `
    <strong>${lap}</strong>
    <p>${collisions === 0 ? "No collisions" : collisions === 1 ? "1 collision" : `${String(collisions)} collisions`}. Ideal-line match: ${racingLine === undefined ? "not available for this older run" : racingLine.matched ? "matched" : `not matched (${racingLine.meanDeviationMeters.toFixed(1)} m average deviation, target ${racingLine.meanToleranceMeters.toFixed(1)} m)`}.</p>
  `;
}

function compareAnswer(result: RunResultV1): string {
  const champion = result.champion.fitness;
  const references = result.baselineComparisons.slice(1);
  const ahead = references.filter((item) => champion > item.fitness);
  const headline =
    references.length === 0
      ? "No reference controllers"
      : ahead.length === references.length
        ? "Ahead of every reference"
        : ahead.length === 0
          ? "Behind every reference"
          : `Ahead of ${String(ahead.length)} of ${String(references.length)} references`;
  return `
    <strong>${headline}</strong>
    <p>${references
      .map((item) => `${escapeHtml(item.label)}: ${item.fitness.toFixed(1)}`)
      .join(
        ". ",
      )}${references.length === 0 ? "" : "."} Champion: ${champion.toFixed(1)}.</p>
  `;
}

function trustAnswer(
  result: RunResultV1,
  previousRuns: ObservationSnapshotV1["previousRuns"],
): string {
  const { generationsCompleted, generationsRequested } = result.metadata;
  const stoppedEarly = generationsCompleted < generationsRequested;
  const earlier = previousRuns.length;
  return `
    <strong>${earlier === 0 ? "Within this run only" : `Yes, with ${String(earlier)} earlier run${earlier === 1 ? "" : "s"}`}</strong>
    <p>References used the same track and car setup. ${
      earlier === 0
        ? "No earlier run used the same track and settings, so compare across runs only after repeating them."
        : "Earlier runs match this track and settings."
    }${stoppedEarly ? ` This run stopped at ${String(generationsCompleted)} of ${String(generationsRequested)} generations.` : ""}</p>
  `;
}

export function renderResults(
  state: AppState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replay: ReplayPresentation,
  replayTrack: CompiledTrackV1 | undefined,
  reducedMotion: boolean,
): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Track";
  const result =
    simulation.status === "ready" ? simulation.snapshot.result : null;
  if (result === null || simulation.status !== "ready") {
    return `
      <section class="page" aria-labelledby="page-title">
        ${pageHeader(
          "No results yet",
          `${escapeHtml(trackName)}. Results appear when the run finishes or stops.`,
        )}
        <div class="page-actions">
          <button class="button secondary" type="button" data-route="training">Back to Training</button>
        </div>
      </section>
    `;
  }
  const snapshot = simulation.snapshot;
  const verdict = fitnessVerdict(result);
  const saved = savedRunStatus(runLibrary, snapshot.runId);
  const racingLine = result.racingLineComparison;
  const comparisons = result.baselineComparisons
    .map(
      (item) => `
        <tr>
          <th scope="row">${escapeHtml(item.label)}</th>
          <td>${item.fitness.toFixed(1)}</td>
          <td>${(item.progress * 100).toFixed(1)}%</td>
          <td>${item.finished ? "Finished" : "Did not finish"}</td>
        </tr>
      `,
    )
    .join("");
  const previous =
    snapshot.previousRuns.length === 0
      ? "<p>No earlier run has the same track and evaluation budget.</p>"
      : `
        <p class="field-help">Only runs with the same track, population, generations, and seconds per attempt are listed.</p>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Earlier comparable runs table">
          <table>
          <thead><tr><th>Run</th><th>Network</th><th>Seed</th><th>Generations</th><th>Champion fitness</th><th>Lap progress</th></tr></thead>
          <tbody>
            ${snapshot.previousRuns
              .map(
                (run) => `
                  <tr>
                    <th scope="row" class="data-id">${escapeHtml(run.runId.slice(0, 16))}</th>
                    <td>${run.algorithm === "neat" ? "Growing" : "Fixed"}</td>
                    <td>${String(run.seed)}</td>
                    <td>${String(run.generationsCompleted)}</td>
                    <td>${run.championFitness.toFixed(1)}</td>
                    <td>${(run.championProgress * 100).toFixed(1)}%</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
          </table>
        </div>
      `;
  return `
    <section class="page results-page" aria-labelledby="page-title">
      <header class="results-header">
        <span class="status-glyph is-${verdict.tone} is-large" aria-hidden="true">${verdict.glyph}</span>
        <div class="results-title">
          <h1 id="page-title" tabindex="-1">${verdict.headline}</h1>
          <p class="page-lead">${verdict.evidence}</p>
          <p class="saved-status"><span class="status-glyph is-${saved.tone}" aria-hidden="true">${saved.glyph}</span> ${saved.label}</p>
        </div>
        <div class="results-actions">
          <button class="button secondary" type="button" data-action="revise-setup">
            <span aria-hidden="true">←</span>
            Back to Review
          </button>
          <button class="button primary" type="button" data-action="new-setup">
            Start a new run
          </button>
        </div>
      </header>

      <dl class="answer-list" aria-label="Result summary">
        <div>
          <dt>What did the champion achieve?</dt>
          <dd>${championAnswer(result)}</dd>
        </div>
        <div>
          <dt>How does it compare?</dt>
          <dd>${compareAnswer(result)}</dd>
        </div>
        <div>
          <dt>Can the comparison be trusted?</dt>
          <dd>${trustAnswer(result, snapshot.previousRuns)}</dd>
        </div>
      </dl>

      <div class="results-layout">
        ${renderReplay(
          result.replay.frames,
          result.replay.candidateId,
          replayTrack,
          racingLine,
          replay,
          reducedMotion,
        )}
        <div class="results-side">
          <section class="panel" aria-labelledby="fitness-chart-title">
            <h2 id="fitness-chart-title">Fitness over generations</h2>
            ${renderFitnessChart(result.fitnessHistory)}
          </section>
          <section class="panel" aria-labelledby="baseline-title">
            <h2 id="baseline-title">Champion vs baselines</h2>
            <p class="field-help">Same track and car setup. The seeded random network is untrained, and Pure Pursuit is a hand-written steering reference.</p>
            <div class="table-scroll" tabindex="0" role="region" aria-label="Champion and baseline table">
              <table><thead><tr><th>Driver</th><th>Fitness</th><th>Lap</th><th>Outcome</th></tr></thead><tbody>${comparisons}</tbody></table>
            </div>
          </section>
        </div>
      </div>

      <details class="disclosure result-details">
        <summary><h2>Earlier comparable runs</h2><span class="chip">${String(snapshot.previousRuns.length)}</span></summary>
        <div class="disclosure-body" id="run-comparison-title">${previous}</div>
      </details>
      <details class="disclosure result-details">
        <summary><h2>Run details</h2></summary>
        <div class="disclosure-body">
          <dl class="fact-grid">
            <div><dt>Track</dt><dd>${escapeHtml(result.metadata.trackName)}</dd></div>
            <div><dt>Network</dt><dd>${result.metadata.algorithm === "neat" ? "Growing (NEAT)" : "Fixed (GA)"}</dd></div>
            <div><dt>Seed</dt><dd>${String(result.metadata.seed)}</dd></div>
            <div><dt>Generations</dt><dd>${String(result.metadata.generationsCompleted)} of ${String(result.metadata.generationsRequested)}</dd></div>
            <div><dt>Run</dt><dd class="data-id">${escapeHtml(result.metadata.runId)}</dd></div>
            <div><dt>Champion</dt><dd class="data-id">${escapeHtml(result.champion.candidateId)}</dd></div>
            <div><dt>Track SHA-256</dt><dd class="data-id">${escapeHtml(result.metadata.trackSha256.slice(0, 12))}…</dd></div>
          </dl>
          ${
            racingLine === undefined
              ? ""
              : `<p class="field-help">Ideal line: average deviation ${racingLine.meanDeviationMeters.toFixed(2)} m (target at most ${racingLine.meanToleranceMeters.toFixed(2)} m), 95th percentile ${racingLine.p95DeviationMeters.toFixed(2)} m (target at most ${racingLine.p95ToleranceMeters.toFixed(2)} m). The line minimizes curvature. It is a benchmark, not the fastest possible lap.</p>`
          }
        </div>
      </details>
    </section>
  `;
}

function renderReplay(
  frames: ReplayFrameV1[],
  candidateId: string,
  replayTrack: CompiledTrackV1 | undefined,
  racingLine: RunResultV1["racingLineComparison"],
  replay: ReplayPresentation,
  reducedMotion: boolean,
): string {
  const heldIndex = replay.paused
    ? Math.min(replay.frameIndex, frames.length - 1)
    : reducedMotion
      ? frames.length - 1
      : 0;
  const frame = frames[heldIndex];
  if (frame === undefined) {
    return `
      <section class="panel replay-panel" aria-labelledby="replay-title">
        <h2 id="replay-title">Champion replay</h2>
        <p>This run has no recorded frames.</p>
      </section>
    `;
  }
  const playing = !replay.paused && !reducedMotion && frames.length > 1;
  const currentTrail = replayTrackTrail({ candidateId, frames });
  const referenceTrail =
    racingLine === undefined
      ? undefined
      : { candidateId: racingLine.method, points: racingLine.referenceLine };
  const stepDisabled = frames.length <= 1 ? "disabled" : "";
  const status = playing
    ? "Playing at 1× speed"
    : `Frame ${String(heldIndex + 1)} of ${String(frames.length)} · ${frame.simulatedSeconds.toFixed(2)} simulated s`;
  return `
    <section class="panel replay-panel" aria-labelledby="replay-title">
      <div class="race-heading">
        <h2 id="replay-title">Champion replay</h2>
        <span class="chip" role="status">${status}</span>
      </div>
      <div class="replay-stage" role="img" aria-label="Champion path overlaid with the minimum-curvature ideal racing-line reference">
        ${
          replayTrack === undefined
            ? '<p class="track-preview-status">Track preview is not available.</p>'
            : renderTrackSvg(
                replayTrack,
                frame,
                [],
                currentTrail,
                referenceTrail,
              )
        }
      </div>
      <div class="replay-controls" role="group" aria-label="Replay controls">
        <button class="button secondary" type="button" data-focus-key="replay-toggle" data-action="replay-toggle" ${reducedMotion || frames.length <= 1 ? "disabled" : ""}>
          <span aria-hidden="true">${playing ? "‖" : "▶"}</span>
          ${playing ? "Pause" : "Play"}
        </button>
        <button class="button secondary" type="button" data-focus-key="replay-previous" data-action="replay-previous" ${stepDisabled}>
          <span aria-hidden="true">◀</span>
          Step back
        </button>
        <button class="button secondary" type="button" data-focus-key="replay-next" data-action="replay-next" ${stepDisabled}>
          Step forward
          <span aria-hidden="true">▶</span>
        </button>
        <button class="button secondary" type="button" data-focus-key="replay-restart" data-action="replay-restart" ${stepDisabled}>
          Restart
        </button>
      </div>
      ${reducedMotion ? '<p class="field-help">Motion is reduced, so Play is off. Use the step buttons, or change motion in the top bar.</p>' : ""}
      <div class="line-legend">
        <span><i class="line-key is-current" aria-hidden="true"></i>Champion path</span>
        <span><i class="line-key is-ideal" aria-hidden="true"></i>Ideal line (smoothest curve)</span>
        <span class="data-id">${escapeHtml(candidateId)}</span>
      </div>
    </section>
  `;
}
