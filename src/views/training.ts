import type { SimulationState } from "../app-store";
import {
  RACE_SPEEDS,
  type TrainingStageInfo,
} from "../controllers/race-playback";
import { escapeHtml } from "../html";
import type { AppState } from "../onboarding";
import { runCompletion, runControls, runProgress } from "../run-presentation";
import type {
  ObservationSnapshotV1,
  SelectedCarTelemetryV1,
} from "../simulation";
import type { CompiledTrackV1 } from "../track-renderer";

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

const RUN_STATUS_GLYPHS: Record<string, { glyph: string; tone: string }> = {
  running: { glyph: "▶", tone: "info" },
  paused: { glyph: "‖", tone: "warning" },
  stopped: { glyph: "■", tone: "warning" },
  completed: { glyph: "✓", tone: "success" },
};

export function renderTraining(
  state: AppState,
  simulation: SimulationState,
  activeTrack: CompiledTrackV1 | undefined,
  reducedMotion: boolean,
  stageInfo: TrainingStageInfo,
  raceSpeed: number,
): string {
  const header = (status?: string): string => {
    const statusGlyph =
      status === undefined ? undefined : RUN_STATUS_GLYPHS[status];
    return `
      <header class="training-header">
        <h1 id="page-title" tabindex="-1">Race</h1>
        ${
          status === undefined || statusGlyph === undefined
            ? ""
            : `<span class="chip is-${statusGlyph.tone}"><span aria-hidden="true">${statusGlyph.glyph}</span> ${escapeHtml(RUN_STATUS_LABELS[status] ?? status)}</span>`
        }
        <p>${escapeHtml(state.draft.track?.name ?? activeTrack?.track.name ?? "Selected track")}. The AI drives; you watch it learn.</p>
      </header>
    `;
  };
  if (simulation.status === "loading") {
    return `
      <section class="page training-page" aria-labelledby="page-title">
        ${header()}
        <div class="training-stage" role="status" aria-live="polite">
          <h2>Creating the run</h2>
          <p>The local core is locking your settings before the first generation starts.</p>
        </div>
      </section>
    `;
  }
  if (simulation.status === "unavailable") {
    return `
      <section class="page training-page" aria-labelledby="page-title">
        ${header()}
        <div class="training-stage" role="alert">
          <h2>No response yet from the local core</h2>
          <p>${escapeHtml(simulation.message)}</p>
        </div>
      </section>
    `;
  }
  if (simulation.status !== "ready") {
    return `
      <section class="page training-page" aria-labelledby="page-title">
        ${header()}
        <div class="training-stage" role="status">
          <h2>Waiting for the first update</h2>
          <p>Your settings are locked.</p>
        </div>
      </section>
    `;
  }

  const snapshot = simulation.snapshot;
  const activeCandidate = snapshot.activeCandidate;
  const live =
    snapshot.generationInProgress === true &&
    activeCandidate !== null &&
    activeCandidate !== undefined;
  const race = renderRaceStage(
    stageInfo,
    activeTrack,
    snapshot,
    reducedMotion,
    raceSpeed,
  );
  const telemetry =
    snapshot.selectedCar === null
      ? ""
      : renderSelectedCarTelemetry(
          snapshot.selectedCar,
          live ? "Car being evaluated now" : "Latest generation champion",
          live
            ? "Live"
            : (RUN_STATUS_LABELS[snapshot.status] ?? snapshot.status),
        );

  return `
    <section class="page training-page" aria-labelledby="page-title">
      ${header(snapshot.status)}
      ${renderTrainingCompletion(snapshot)}
      ${renderRunRecoveryNotice(simulation.error)}
      <div class="training-layout">
        <div class="training-main">${race}</div>
        <aside class="training-side">
          ${renderRunOverview(snapshot)}
          ${renderRunControls(simulation)}
        </aside>
      </div>
      <div class="training-details">
        ${renderFitnessDisclosure(snapshot.fitnessHistory)}
        ${telemetry}
      </div>
    </section>
  `;
}

function renderRunRecoveryNotice(message: string | undefined): string {
  if (message === undefined) {
    return "";
  }
  return `
    <section class="notice is-warning training-recovery-notice" role="alert" aria-labelledby="training-recovery-title">
      <div>
        <h2 id="training-recovery-title">Keeping the last confirmed run state</h2>
        <p>${escapeHtml(message)}</p>
        <p>Updates retry on their own. Run controls come back when the current request finishes.</p>
      </div>
    </section>
  `;
}

export function raceCaption(
  info: TrainingStageInfo,
  snapshot: ObservationSnapshotV1,
): { title: string; detail: string } {
  if (info.mode === "race") {
    const ahead =
      snapshot.status === "running" && snapshot.generation > info.generation
        ? ` Training is already on generation ${String(Math.min(snapshot.totalGenerations, snapshot.generation + 1))}.`
        : "";
    return {
      title: `Generation ${String(info.generation)} race`,
      detail: `The best ${String(info.carCount)} of ${String(info.populationSize)} cars of generation ${String(info.generation)}, racing together. The bright car scored best (${info.leaderFitness.toFixed(1)}).${ahead}`,
    };
  }
  if (info.mode === "champion") {
    return {
      title: "Champion lap",
      detail: "The best car found so far, replayed on loop.",
    };
  }
  return {
    title: `Generation ${String(Math.min(snapshot.totalGenerations, snapshot.generation + 1))} is racing`,
    detail:
      snapshot.status === "running"
        ? "The cars appear here as soon as the first generation finishes."
        : "No race was recorded for this run.",
  };
}

function renderRaceStage(
  info: TrainingStageInfo,
  activeTrack: CompiledTrackV1 | undefined,
  snapshot: ObservationSnapshotV1,
  reducedMotion: boolean,
  raceSpeed: number,
): string {
  const caption = raceCaption(info, snapshot);
  const speedControl =
    info.mode === "race" && !reducedMotion
      ? `
        <div class="speed-toggle" role="group" aria-label="Race speed">
          ${RACE_SPEEDS.map(
            (speed) =>
              `<button type="button" class="speed-option" data-action="race-speed" data-speed="${String(speed)}" aria-pressed="${String(speed === raceSpeed)}">${String(speed)}×</button>`,
          ).join("")}
        </div>
      `
      : reducedMotion && info.mode !== "waiting"
        ? '<button class="button secondary compact" type="button" data-action="toggle-motion">▶ Play the race</button>'
        : `<span class="chip is-info">${info.mode === "champion" ? "Replay" : "Waiting"}</span>`;
  const legend =
    info.mode === "race"
      ? `
        <div class="line-legend">
          <span><i class="car-key is-leader" aria-hidden="true"></i>Best car</span>
          <span><i class="car-key is-pack" aria-hidden="true"></i>Other cars</span>
          <span><i class="car-key is-crashed" aria-hidden="true"></i>Crashed</span>
          <span><i class="line-key is-prior" aria-hidden="true"></i>Earlier best paths</span>
        </div>
      `
      : "";
  const stage =
    activeTrack === undefined
      ? '<div class="live-race-stage"><p class="track-preview-status">Track preview is not available.</p></div>'
      : `<div class="live-race-stage" data-race-host="training" data-race-label="${escapeHtml(`${caption.title}. ${caption.detail}`)}">${info.mode === "waiting" ? `<p class="race-overlay" role="status">${escapeHtml(caption.detail)}</p>` : ""}</div>`;
  return `
    <section class="live-race-panel" aria-labelledby="live-race-title">
      <div class="race-heading">
        <h2 id="live-race-title">${escapeHtml(caption.title)}</h2>
        ${speedControl}
      </div>
      ${stage}
      <div class="race-footer">
        ${legend}
        <p>${escapeHtml(info.mode === "waiting" ? "Replay presentation only: training never waits for it." : caption.detail)}</p>
      </div>
    </section>
  `;
}

function renderSelectedCarTelemetry(
  telemetry: SelectedCarTelemetryV1,
  title: string,
  status: string,
): string {
  const metricValues: [string, string][] = [
    ["Speed", `${telemetry.speed.toFixed(2)} m/s`],
    ["Lateral speed", `${telemetry.lateralSpeed.toFixed(2)} m/s`],
    ["Steering", telemetry.steering.toFixed(3)],
    ["Throttle", telemetry.throttle.toFixed(3)],
    ["Brake", telemetry.brake.toFixed(3)],
    ["Progress", `${(telemetry.progress * 100).toFixed(1)}%`],
  ];
  const metrics = metricValues
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
  const sensors = telemetry.sensorDistances
    .map(
      (distance, index) => `
        <li>
          <span>Ray ${String(index + 1)}</span>
          <meter min="0" max="36" value="${String(distance)}">${distance.toFixed(1)} m</meter>
          <strong>${distance.toFixed(1)} m</strong>
        </li>
      `,
    )
    .join("");

  return `
    <details class="disclosure telemetry-disclosure">
      <summary>
        <h2 id="telemetry-title">Car telemetry</h2>
        <span class="disclosure-hint">${escapeHtml(title)}</span>
        <span class="chip">${escapeHtml(status)}</span>
      </summary>
      <div class="disclosure-body">
        <p class="data-id">${escapeHtml(telemetry.selectedCarId)} · ${telemetry.simulatedSeconds.toFixed(2)} simulated s</p>
        <dl class="fact-grid">${metrics}</dl>
        <div class="sensor-panel">
          <h3>Road-edge sensors</h3>
          <ul>${sensors}</ul>
        </div>
        <p class="field-help">The car's setup and network stay fixed for the whole attempt. Only steering, throttle, and brake change.</p>
      </div>
    </details>
  `;
}

function renderRunOverview(snapshot: ObservationSnapshotV1): string {
  const progress = runProgress(snapshot);
  const active = snapshot.activeCandidate;
  const evaluating =
    snapshot.generationInProgress === true &&
    active !== null &&
    active !== undefined;
  const currentGeneration = Math.min(
    snapshot.totalGenerations,
    snapshot.generation + (evaluating ? 1 : 0),
  );
  const bestSoFar =
    snapshot.fitnessHistory.length === 0
      ? null
      : Math.max(...snapshot.fitnessHistory.map((item) => item.bestFitness));
  return `
    <section class="run-overview" aria-label="Live run status">
      <dl class="stat-list">
        <div><dt>Generation</dt><dd>${String(currentGeneration)} of ${String(snapshot.totalGenerations)}</dd></div>
        <div><dt>Best score so far</dt><dd>${bestSoFar === null ? "None yet" : bestSoFar.toFixed(1)}</dd></div>
        <div><dt>Now testing</dt><dd>${evaluating ? `Car ${String(active.index)} of ${String(active.total)}` : "Nothing right now"}</dd></div>
      </dl>
      <p class="field-help">The score (fitness) rewards distance and finishing the lap. Higher is better.</p>
      <div class="run-progress">
        <div><span>Overall progress</span><strong>${progress.percent}</strong></div>
        <progress max="1" value="${String(progress.fraction)}" aria-label="Overall progress">${progress.percent}</progress>
        <p>${escapeHtml(progress.label)}</p>
      </div>
    </section>
  `;
}

export function renderTrainingCompletion(
  snapshot: ObservationSnapshotV1,
): string {
  const completion = runCompletion(snapshot);
  if (completion === null) {
    return "";
  }
  const resultsAvailable = snapshot.result !== null;
  return `
    <section class="training-completion" role="status" aria-labelledby="training-completion-title">
      <div>
        <h2 id="training-completion-title">${completion.title}${resultsAvailable ? ". Results ready." : "."}</h2>
        <p>${completion.message}</p>
      </div>
      <button class="button primary" type="button" data-action="${resultsAvailable ? "view-results" : "new-setup"}">
        ${resultsAvailable ? "Open results" : "Set up a new run"}
        <span aria-hidden="true">→</span>
      </button>
    </section>
  `;
}

function renderRunControls(simulation: SimulationState): string {
  if (simulation.status !== "ready") {
    return "";
  }
  const controls = runControls(
    simulation.snapshot,
    simulation.commandRequest ?? null,
  );
  if (
    simulation.snapshot.status === "completed" ||
    simulation.snapshot.status === "stopped"
  ) {
    return "";
  }
  return `
    <div class="run-controls" role="group" aria-label="Run controls">
      <button class="button secondary" type="button" data-focus-key="run-pause-toggle" data-action="${controls.pauseAction === "resume" ? "resume-run" : "pause-run"}" ${controls.pauseDisabled ? "disabled" : ""}>
        ${controls.pauseLabel}
      </button>
      <button class="button secondary" type="button" data-focus-key="run-stop" data-action="stop-run" ${controls.stopDisabled ? "disabled" : ""}>
        ${controls.stopLabel}
      </button>
      <p class="run-control-note" role="status">${controls.note}</p>
    </div>
  `;
}

function renderFitnessDisclosure(
  history: ObservationSnapshotV1["fitnessHistory"],
): string {
  const latest = history.at(-1);
  return `
    <details class="disclosure fitness-disclosure">
      <summary>
        <h2>Score over generations</h2>
        <span class="disclosure-hint">${latest === undefined ? "No finished generation yet" : `Latest best ${latest.bestFitness.toFixed(1)}`}</span>
      </summary>
      <div class="disclosure-body">${renderFitnessChart(history)}</div>
    </details>
  `;
}

function chartTicks(minimum: number, maximum: number): number[] {
  const span = Math.max(maximum - minimum, 1e-6);
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const ticks: number[] = [];
  for (
    let value = Math.floor(minimum / step) * step;
    value <= maximum + step * 0.999;
    value += step
  ) {
    ticks.push(value);
  }
  return ticks;
}

function generationTicks(first: number, last: number): number[] {
  if (first === last) {
    return [first];
  }
  const step = Math.max(1, Math.ceil((last - first) / 5));
  const ticks: number[] = [];
  for (let value = first; value < last; value += step) {
    ticks.push(value);
  }
  ticks.push(last);
  return ticks;
}

/**
 * The plot stretches to its box, so tick labels live in separate SVGs with no
 * viewBox: percent positions follow the plot while text keeps its CSS size.
 * The local service's CSP forbids inline style attributes.
 * Generations are stored from 0 and shown from 1, like the rest of the app.
 */
export function renderFitnessChart(
  history: ObservationSnapshotV1["fitnessHistory"],
): string {
  if (history.length === 0) {
    return `
      <section class="fitness-chart" aria-label="Fitness over generations">
        <p>No generation has finished yet.</p>
      </section>
    `;
  }
  const values = history.flatMap((point) => [
    point.bestFitness,
    point.medianFitness,
  ]);
  const yTicks = chartTicks(Math.min(...values), Math.max(...values));
  const minimum = yTicks[0] ?? 0;
  const maximum = yTicks.at(-1) ?? 1;
  const span = Math.max(maximum - minimum, 1e-6);
  const firstGeneration = history[0]?.generation ?? 0;
  const lastGeneration = history.at(-1)?.generation ?? firstGeneration;
  const generationSpan = lastGeneration - firstGeneration;
  const x = (generation: number): number =>
    generationSpan === 0
      ? 50
      : ((generation - firstGeneration) / generationSpan) * 100;
  const y = (value: number): number => 100 - ((value - minimum) / span) * 100;
  const line = (field: "bestFitness" | "medianFitness"): string =>
    history
      .map(
        (point) =>
          `${x(point.generation).toFixed(2)},${y(point[field]).toFixed(2)}`,
      )
      .join(" ");
  const showPoints = history.length <= 40;
  const points = (
    field: "bestFitness" | "medianFitness",
    className: string,
  ): string =>
    showPoints
      ? history
          .map((point) => {
            const px = x(point.generation).toFixed(2);
            const py = y(point[field]).toFixed(2);
            return `<line class="chart-point ${className}" x1="${px}" y1="${py}" x2="${px}" y2="${py}"></line>`;
          })
          .join("")
      : "";
  const first = history[0];
  const last = history.at(-1);
  const summary =
    first === undefined || last === undefined
      ? ""
      : `Best fitness went from ${first.bestFitness.toFixed(1)} at generation ${String(first.generation + 1)} to ${last.bestFitness.toFixed(1)} at generation ${String(last.generation + 1)}. Median fitness went from ${first.medianFitness.toFixed(1)} to ${last.medianFitness.toFixed(1)}.`;
  return `
    <section class="fitness-chart" aria-label="Fitness over generations">
      <div class="chart-legend">
        <span><i class="line-key is-best" aria-hidden="true"></i>Best car</span>
        <span><i class="line-key is-median" aria-hidden="true"></i>Median car</span>
      </div>
      <div class="chart-frame">
        <span class="chart-axis-y">Fitness (score)</span>
        <svg class="chart-y-ticks" aria-hidden="true">
          ${yTicks
            .map(
              (tick) =>
                `<text x="100%" y="${y(tick).toFixed(2)}%">${formatTick(tick)}</text>`,
            )
            .join("")}
        </svg>
        <div class="chart-plot">
          <svg viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="none">
            ${yTicks
              .map(
                (tick) =>
                  `<line class="chart-grid" x1="0" x2="100" y1="${y(tick).toFixed(2)}" y2="${y(tick).toFixed(2)}"></line>`,
              )
              .join("")}
            <polyline class="chart-line median-line" points="${line("medianFitness")}"></polyline>
            <polyline class="chart-line best-line" points="${line("bestFitness")}"></polyline>
            ${points("medianFitness", "median-point")}
            ${points("bestFitness", "best-point")}
          </svg>
        </div>
        <svg class="chart-x-ticks" aria-hidden="true">
          ${generationTicks(firstGeneration, lastGeneration)
            .map(
              (tick) =>
                `<text x="${x(tick).toFixed(2)}%" y="1em">${String(tick + 1)}</text>`,
            )
            .join("")}
        </svg>
        <span class="chart-axis-x">Generation (count)</span>
      </div>
    </section>
  `;
}

function formatTick(value: number): string {
  return Number(value.toFixed(2)).toString();
}
