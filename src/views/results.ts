import type { SimulationState } from "../app-store";
import { type GenerationTrail, replayTrackTrail } from "../generation-trails";
import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import type { ReplayFrameV1, RunResultV1 } from "../simulation";
import { type CompiledTrackV1, renderTrackSvg } from "../track-renderer";
import { pageHeader } from "./shared";
import { renderFitnessChart } from "./training";

export function renderResults(
  state: AppState,
  simulation: SimulationState,
  replayFrameIndex: number,
  replayTrack: CompiledTrackV1 | undefined,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Track";
  const result =
    simulation.status === "ready" ? simulation.snapshot.result : null;
  if (result === null) {
    return `
      <section class="page" aria-labelledby="page-title">
        ${pageHeader(
          "Experiment / Results",
          "Results",
          "A terminal Python result is required before replay and comparison.",
        )}
        <div class="empty-results">
          <span class="data-chip">No terminal result</span>
          <h2>Return to Training</h2>
          <p>${escapeHtml(trackName)} · the reviewed configuration remains locked.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-route="training">Back to Training</button>
        </div>
      </section>
    `;
  }
  if (simulation.status !== "ready") {
    return "";
  }
  const snapshot = simulation.snapshot;
  void replayFrameIndex;
  void generationTrails;
  const championComparison = result.baselineComparisons[0];
  const firstBest =
    result.fitnessHistory[0]?.bestFitness ?? result.champion.fitness;
  const fitnessGain = result.champion.fitness - firstBest;
  const improvement = fitnessGain > 1e-6;
  const racingLine = result.racingLineComparison;
  const lineHeadline =
    racingLine === undefined
      ? "Ideal-line comparison unavailable"
      : racingLine.matched
        ? "Yes — the champion matched the ideal-line benchmark"
        : racingLine.championFinished
          ? "Not yet — the champion finished, but used a different line"
          : "Not yet — the champion did not complete the lap";
  const lineEvidence =
    racingLine === undefined
      ? "This result predates the geometric racing-line benchmark."
      : `Average deviation ${racingLine.meanDeviationMeters.toFixed(2)} m (target ≤ ${racingLine.meanToleranceMeters.toFixed(2)} m); 95th percentile ${racingLine.p95DeviationMeters.toFixed(2)} m (target ≤ ${racingLine.p95ToleranceMeters.toFixed(2)} m).`;
  const comparisons = result.baselineComparisons
    .map(
      (item) => `
        <tr>
          <th scope="row">${escapeHtml(item.label)}</th>
          <td>${item.fitness.toFixed(3)}</td>
          <td>${(item.progress * 100).toFixed(1)}%</td>
          <td>${item.finished ? "Finished" : escapeHtml(item.controller.replaceAll("_", " "))}</td>
        </tr>
      `,
    )
    .join("");
  const previous =
    snapshot.previousRuns.length === 0
      ? "<p>No earlier run has the same track and evaluation budget.</p>"
      : `
        <p class="comparison-note">Only runs with the same track, population, generation count, and episode duration are shown.</p>
        <div class="table-scroll">
          <table>
          <thead><tr><th>Run</th><th>Algorithm</th><th>Seed</th><th>Generations</th><th>Champion</th><th>Progress</th></tr></thead>
          <tbody>
            ${snapshot.previousRuns
              .map(
                (run) => `
                  <tr>
                    <th scope="row">${escapeHtml(run.runId.slice(0, 16))}</th>
                    <td>${escapeHtml(run.algorithm)}</td>
                    <td>${String(run.seed)}</td>
                    <td>${String(run.generationsCompleted)}</td>
                    <td>${run.championFitness.toFixed(3)}</td>
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
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Results",
        "What did the AI achieve?",
        "Read the verdict first, then inspect the champion against the same Python-owned track and reference.",
      )}
      <section class="result-verdict" aria-labelledby="result-verdict-title">
        <div class="result-verdict-copy">
          <p class="section-kicker">Ideal racing line · geometric reference</p>
          <h2 id="result-verdict-title">${lineHeadline}</h2>
          <p>${lineEvidence}</p>
          <p class="comparison-note">The dashed cyan line minimizes geometric curvature inside the road corridor. It is a benchmark, not proof of the globally fastest lap.</p>
        </div>
        <div class="verdict-grid" aria-label="Result summary">
          <article><span>Learning</span><strong>${improvement ? "Improved" : "No measured gain"}</strong><p>${fitnessGain >= 0 ? "+" : ""}${fitnessGain.toFixed(3)} fitness from generation 1 best</p></article>
          <article><span>Lap outcome</span><strong>${championComparison?.finished === true ? "Finished" : "Incomplete"}</strong><p>${(result.champion.progress * 100).toFixed(1)}% progress · ${String(championComparison?.collisionCount ?? 0)} collision(s)</p></article>
          <article><span>Ideal-line match</span><strong>${racingLine === undefined ? "Unavailable" : racingLine.matched ? "Matched" : "Not matched"}</strong><p>${racingLine === undefined ? "Older result contract" : `${racingLine.meanDeviationMeters.toFixed(2)} m average deviation`}</p></article>
          <article><span>Training</span><strong>${String(result.metadata.generationsCompleted)} / ${String(result.metadata.generationsRequested)}</strong><p>${escapeHtml(result.metadata.algorithm)} · seed ${String(result.metadata.seed)}</p></article>
        </div>
      </section>
      ${renderReplay(
        result.replay.frames,
        result.replay.candidateId,
        replayTrack,
        racingLine,
        reducedMotion,
      )}
      <div class="result-analysis-grid">
        ${renderFitnessChart(result.fitnessHistory)}
        <section class="comparison-panel" aria-labelledby="baseline-title">
          <div class="chart-heading"><div><p class="section-kicker">Same track and vehicle setup</p><h2 id="baseline-title">Champion vs baselines</h2></div></div>
          <p class="comparison-note">Higher fitness and progress are better. Compare these values only inside this run.</p>
          <div class="table-scroll"><table><thead><tr><th>Controller</th><th>Fitness</th><th>Progress</th><th>Outcome</th></tr></thead><tbody>${comparisons}</tbody></table></div>
        </section>
      </div>
      <details class="result-details"><summary>Previous comparable runs</summary><div class="result-details-body" id="run-comparison-title">${previous}</div></details>
      <details class="result-details">
        <summary>Run details</summary>
        <dl class="result-metadata">
          <div><dt>Track</dt><dd>${escapeHtml(result.metadata.trackName)}</dd></div>
          <div><dt>Run</dt><dd>${escapeHtml(result.metadata.runId)}</dd></div>
          <div><dt>Champion</dt><dd>${escapeHtml(result.champion.candidateId)}</dd></div>
          <div><dt>Track SHA-256</dt><dd>${escapeHtml(result.metadata.trackSha256.slice(0, 12))}…</dd></div>
        </dl>
      </details>
      <div class="page-actions">
        <button class="button primary" type="button" data-action="new-setup">
          Create another setup
        </button>
      </div>
    </section>
  `;
}

function renderReplay(
  frames: ReplayFrameV1[],
  candidateId: string,
  replayTrack: CompiledTrackV1 | undefined,
  racingLine: RunResultV1["racingLineComparison"],
  reducedMotion: boolean,
): string {
  const frame = reducedMotion ? frames.at(-1) : frames[0];
  if (frame === undefined) {
    return `
      <section class="replay-panel" aria-labelledby="replay-title">
        <h2 id="replay-title">Champion replay</h2>
        <p>No replay frames were produced.</p>
      </section>
    `;
  }
  const currentTrail = replayTrackTrail({ candidateId, frames });
  const referenceTrail =
    racingLine === undefined
      ? undefined
      : { candidateId: racingLine.method, points: racingLine.referenceLine };
  return `
    <section class="replay-panel" aria-labelledby="replay-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Actual route vs geometric benchmark</p><h2 id="replay-title">Champion and ideal racing line</h2></div>
        <span class="data-chip">${reducedMotion ? "Final frame · motion reduced" : "Smooth replay · 1×"}</span>
      </div>
      <div class="replay-stage" role="img" aria-label="Champion path overlaid with the minimum-curvature ideal racing-line reference">
        ${
          replayTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : renderTrackSvg(
                replayTrack,
                frame,
                [],
                currentTrail,
                referenceTrail,
              )
        }
      </div>
      <div class="racing-line-legend" aria-label="Racing-line legend">
        <span><i class="actual-line-key" aria-hidden="true"></i>Champion path</span>
        <span><i class="ideal-line-key" aria-hidden="true"></i>Ideal line · minimum curvature</span>
        <span>${escapeHtml(candidateId)} · ${String(frames.length)} recorded Python frames</span>
      </div>
    </section>
  `;
}
