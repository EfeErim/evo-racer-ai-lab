import type { SimulationState } from "../app-store";
import {
  type GenerationTrail,
  priorGenerationTrails,
  replayTrackTrail,
} from "../generation-trails";
import { escapeHtml } from "../html";
import {
  CHAMPION_REPLAY_RATE,
  liveTrackMarker,
  shouldAnimateReplay,
} from "../live-motion";
import type { AppState } from "../onboarding";
import { runCompletion, runControls, runProgress } from "../run-presentation";
import type {
  GenerationReplayV1,
  ObservationSnapshotV1,
  SelectedCarTelemetryV1,
} from "../simulation";
import { type CompiledTrackV1, renderTrackSvg } from "../track-renderer";
import { pageHeader } from "./shared";

export function showsBackgroundEvaluation(
  live: boolean,
  replay: GenerationReplayV1 | null | undefined,
): boolean {
  return (
    live && replay !== null && replay !== undefined && replay.frames.length > 0
  );
}

export function renderTraining(
  state: AppState,
  simulation: SimulationState,
  activeTrack: CompiledTrackV1 | undefined,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  let observerContent: string;
  if (simulation.status === "loading") {
    observerContent = `
      <div class="training-stage" role="status" aria-live="polite">
        <span class="data-chip">Python simulation</span>
        <h2>Creating the local run</h2>
        <p>Python is freezing the reviewed configuration before the first generation is requested.</p>
      </div>
    `;
  } else if (simulation.status === "ready") {
    const snapshot = simulation.snapshot;
    const activeCandidate = snapshot.activeCandidate;
    const live =
      snapshot.generationInProgress === true &&
      activeCandidate !== null &&
      activeCandidate !== undefined;
    const replay = snapshot.result?.replay ?? snapshot.generationReplay;
    const priorTrails = priorGenerationTrails(
      generationTrails,
      replay?.candidateId,
    );
    const backgroundEvaluation = showsBackgroundEvaluation(live, replay);
    const algorithm =
      state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT";
    const telemetry =
      snapshot.selectedCar === null
        ? `
          <div class="training-stage" role="status" aria-live="polite">
            <span class="data-chip">Run ${escapeHtml(snapshot.status)}</span>
            <h2>${snapshot.generationInProgress === true ? "Starting" : "Preparing"} generation ${String(snapshot.generation + 1)}</h2>
            <p>Python is evaluating the next candidate. Live track telemetry will appear here.</p>
          </div>
        `
        : `
          ${renderLiveRace(
            snapshot.selectedCar,
            activeCandidate,
            activeTrack,
            live,
            replay,
            priorTrails,
            reducedMotion,
          )}
          ${renderSelectedCarTelemetry(
            snapshot.selectedCar,
            backgroundEvaluation
              ? `${algorithm} background candidate (not the replay above)`
              : live
                ? `${algorithm} candidate in evaluation`
                : `${algorithm} generation champion`,
            backgroundEvaluation
              ? "background live"
              : live
                ? "live"
                : snapshot.status,
          )}
        `;
    observerContent = `
      ${renderRunRecoveryNotice(simulation.error)}
      ${renderRunOverview(snapshot)}
      ${renderTrainingCompletion(snapshot)}
      ${telemetry}
      ${renderFitnessChart(snapshot.fitnessHistory)}
    `;
  } else if (simulation.status === "unavailable") {
    observerContent = `
      <div class="training-stage" role="alert">
        <span class="data-chip">Local core unavailable</span>
        <h2>Telemetry could not be loaded</h2>
        <p>${escapeHtml(simulation.message)}</p>
      </div>
    `;
  } else {
    observerContent = `
      <div class="training-stage">
        <span class="data-chip">Configuration locked</span>
        <h2>Waiting for the versioned run snapshot</h2>
        <p>The selected ${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"} setup is read-only.</p>
      </div>
    `;
  }

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Training",
        "Training workspace",
        "The reviewed configuration is locked. Python owns physics, sensing, and episode evaluation.",
      )}
      ${observerContent}
      ${renderRunControls(simulation)}
    </section>
  `;
}

function renderRunRecoveryNotice(message: string | undefined): string {
  if (message === undefined) {
    return "";
  }
  return `
    <section class="training-recovery-notice" role="alert" aria-labelledby="training-recovery-title">
      <span class="data-chip">Update delayed</span>
      <div>
        <h2 id="training-recovery-title">Keeping the last verified run state</h2>
        <p>${escapeHtml(message)}</p>
        <p>EvoRacer will retry telemetry automatically. Run controls remain available after the current request finishes.</p>
      </div>
    </section>
  `;
}

function renderLiveRace(
  telemetry: SelectedCarTelemetryV1,
  activeCandidate: ObservationSnapshotV1["activeCandidate"],
  activeTrack: CompiledTrackV1 | undefined,
  live: boolean,
  replay: GenerationReplayV1 | undefined | null,
  priorTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const staticReplayFrame =
    reducedMotion && replay !== null && replay !== undefined
      ? replay.frames.at(-1)
      : replay?.frames[0];
  const marker =
    staticReplayFrame === undefined
      ? liveTrackMarker(telemetry)
      : {
          x: staticReplayFrame.x,
          y: staticReplayFrame.y,
          heading: staticReplayFrame.heading,
        };
  const replaying = replay !== null && replay !== undefined;
  const currentTrail = replaying ? replayTrackTrail(replay) : undefined;
  const animatedReplay =
    replaying && shouldAnimateReplay(reducedMotion, replay.frames.length);
  const candidateLabel = replaying
    ? animatedReplay
      ? `Champion replay · ${String(CHAMPION_REPLAY_RATE)}×`
      : reducedMotion
        ? "Champion replay · reduced motion"
        : "Champion replay · single frame"
    : live && activeCandidate !== null && activeCandidate !== undefined
      ? `Candidate ${String(activeCandidate.index)} / ${String(activeCandidate.total)}`
      : "Latest generation champion";
  const displayId = replaying ? replay.candidateId : telemetry.selectedCarId;
  return `
    <section class="live-race-panel" aria-labelledby="live-race-title">
      <div class="chart-heading">
        <div>
          <p class="section-kicker">${animatedReplay ? "Smooth Python champion replay" : replaying ? "Static Python champion frame" : live ? "Live Python simulation" : "Latest Python telemetry"}</p>
          <h2 id="live-race-title">${escapeHtml(displayId)}</h2>
        </div>
        <span class="data-chip ${live ? "is-live" : ""}">${candidateLabel}</span>
      </div>
      <div
        class="live-race-stage"
        role="img"
        aria-label="${animatedReplay ? "Smooth champion replay" : replaying ? "Static champion replay" : live ? "Live" : "Latest"} car position${currentTrail === undefined ? "" : " with its complete recorded path"}${priorTrails.length === 0 ? "" : ` and ${String(priorTrails.length)} earlier generation champion path${priorTrails.length === 1 ? "" : "s"}`}"
      >
        ${
          activeTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : marker !== undefined
              ? renderTrackSvg(activeTrack, marker, priorTrails, currentTrail)
              : renderTrackSvg(
                  activeTrack,
                  undefined,
                  priorTrails,
                  currentTrail,
                )
        }
      </div>
      ${renderGenerationTrailSummary(currentTrail !== undefined, priorTrails.length)}
      <div class="live-race-footer">
        <span>${animatedReplay ? "Full authoritative path · buffered replay at 60 FPS" : replaying ? (reducedMotion ? "Full authoritative path · final frame held for reduced motion" : "Full authoritative path · single recorded frame") : live ? "Accelerated live evaluation" : "Generation boundary"}</span>
        <strong>${replaying ? `${String(replay.frames.length)} Python frames` : `${telemetry.simulatedSeconds.toFixed(2)} simulated seconds · ${(telemetry.progress * 100).toFixed(1)}%`}</strong>
      </div>
    </section>
  `;
}

function renderGenerationTrailSummary(
  hasCurrentPath: boolean,
  priorCount: number,
): string {
  if (!hasCurrentPath && priorCount === 0) {
    return "";
  }
  return `
    <div class="generation-trail-summary" aria-live="polite">
      <span class="current-path-label"><i aria-hidden="true"></i> Displayed champion</span>
      ${priorCount === 0 ? "" : `<span class="prior-path-label"><i aria-hidden="true"></i> ${String(priorCount)} earlier champion${priorCount === 1 ? "" : "s"}</span>`}
      <strong>Python-recorded driving path${priorCount === 0 ? "" : " · older paths fade"}</strong>
    </div>
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
    <details class="telemetry-panel telemetry-disclosure">
      <summary class="telemetry-heading">
        <div>
          <p class="section-kicker">Selected car · ${escapeHtml(telemetry.selectedCarId)}</p>
          <h2 id="telemetry-title">${escapeHtml(title)}</h2>
        </div>
        <span class="data-chip">${escapeHtml(status)}</span>
      </summary>
      <div class="telemetry-content">
        <dl class="telemetry-metrics">${metrics}</dl>
        <div class="sensor-panel">
          <div>
            <h3>Road-edge sensors</h3>
            <p>Seven Python-derived rays · ${telemetry.simulatedSeconds.toFixed(2)} simulated seconds</p>
          </div>
          <ul>${sensors}</ul>
        </div>
        <p class="telemetry-note">
          Vehicle setup and controller parameters stayed fixed during this episode.
          Controls are observer telemetry only; there are no driving inputs.
        </p>
      </div>
    </details>
  `;
}

function renderRunOverview(snapshot: ObservationSnapshotV1): string {
  const report = snapshot.generationReport;
  const progress = runProgress(snapshot);
  return `
    <section class="run-overview" aria-label="Live run status">
      <div>
        <span class="data-chip">${escapeHtml(snapshot.status)}</span>
        <p>Run ${escapeHtml(snapshot.runId.slice(0, 16))}</p>
      </div>
      <dl>
        <div><dt>Generation</dt><dd>${String(snapshot.generation)} / ${String(snapshot.totalGenerations)}</dd></div>
        <div><dt>Best fitness</dt><dd>${report === null ? "—" : report.bestFitness.toFixed(3)}</dd></div>
        <div><dt>Median fitness</dt><dd>${report === null ? "—" : report.medianFitness.toFixed(3)}</dd></div>
        <div><dt>Champion</dt><dd>${report === null ? "—" : escapeHtml(report.championId)}</dd></div>
      </dl>
      <div class="run-progress">
        <div><span>Overall evaluation progress</span><strong>${progress.percent}</strong></div>
        <progress max="1" value="${String(progress.fraction)}">${progress.percent}</progress>
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
      <p class="section-kicker">${resultsAvailable ? "Results ready" : "No results"}</p>
      <div class="training-completion-heading">
        <h2 id="training-completion-title">${completion.title}</h2>
        <button class="button primary" type="button" data-action="${resultsAvailable ? "view-results" : "new-setup"}">
          ${resultsAvailable ? "Open results" : "Create another setup"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p>${completion.message}</p>
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
    <div class="page-actions run-controls" aria-label="Run controls">
      <div>
        <button class="button secondary" type="button" data-focus-key="run-pause-toggle" data-action="${controls.pauseAction === "resume" ? "resume-run" : "pause-run"}" ${controls.pauseDisabled ? "disabled" : ""}>
          ${controls.pauseLabel}
        </button>
        <button class="button secondary" type="button" data-action="stop-run" ${controls.stopDisabled ? "disabled" : ""}>
          ${controls.stopLabel}
        </button>
        <p class="run-control-note" role="status">${controls.note}</p>
      </div>
      <button class="button primary" type="button" data-action="view-results" ${simulation.snapshot.result === null ? "disabled" : ""}>
        View results
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

export function renderFitnessChart(
  history: ObservationSnapshotV1["fitnessHistory"],
): string {
  if (history.length === 0) {
    return `
      <section class="fitness-chart" aria-labelledby="fitness-chart-title">
        <h2 id="fitness-chart-title">Fitness history</h2>
        <p>No completed generation yet.</p>
      </section>
    `;
  }
  const values = history.flatMap((point) => [
    point.bestFitness,
    point.medianFitness,
  ]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number): number =>
    history.length === 1 ? 50 : 4 + (index / (history.length - 1)) * 92;
  const y = (value: number): number => 92 - ((value - minimum) / span) * 84;
  const best = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.bestFitness).toFixed(2)}`,
    )
    .join(" ");
  const median = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.medianFitness).toFixed(2)}`,
    )
    .join(" ");
  const singlePointMarkers =
    history.length === 1 && history[0] !== undefined
      ? `
        <circle class="chart-point median-point" cx="${x(0).toFixed(2)}" cy="${y(history[0].medianFitness).toFixed(2)}" r="2"></circle>
        <circle class="chart-point best-point" cx="${x(0).toFixed(2)}" cy="${y(history[0].bestFitness).toFixed(2)}" r="2"></circle>
      `
      : "";
  return `
    <section class="fitness-chart" aria-labelledby="fitness-chart-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Python generation reports</p><h2 id="fitness-chart-title">Fitness history</h2></div>
        <p><span class="legend best"></span> Best <span class="legend median"></span> Median</p>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Best and median fitness by generation" preserveAspectRatio="none">
        <polyline class="chart-line median-line" points="${median}"></polyline>
        <polyline class="chart-line best-line" points="${best}"></polyline>
        ${singlePointMarkers}
      </svg>
      <p>Generation ${String(history[0]?.generation ?? 0)} to ${String(history.at(-1)?.generation ?? 0)} · range ${minimum.toFixed(2)} to ${maximum.toFixed(2)}</p>
    </section>
  `;
}
