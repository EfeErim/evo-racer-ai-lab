import type {
  PresetGeometryState,
  RunLibraryState,
  SimulationState,
} from "../app-store";
import type { GenerationTrail } from "../generation-trails";
import { type AppState, ROUTES, type RouteId } from "../onboarding";
import type { TrackWorkspaceState } from "../track-builder";
import { renderResults } from "./results";
import { renderReview } from "./review";
import { renderSettings } from "./settings";
import { renderTrack } from "./track";
import { renderTraining } from "./training";
import { renderWelcome } from "./welcome";

const ROUTE_ORDER = new Map<RouteId, number>(
  ROUTES.map((route, index) => [route.id, index]),
);

export function renderShell(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replayFrameIndex: number,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
  systemReducedMotion: boolean,
): string {
  const activeIndex = ROUTE_ORDER.get(state.route) ?? 0;
  const steps = ROUTES.map((route, index) => {
    const locked =
      ((route.id === "training" || route.id === "results") &&
        !state.sessionStarted) ||
      (state.sessionStarted &&
        route.id !== "training" &&
        route.id !== "results");
    const stateClass =
      route.id === state.route
        ? "is-active"
        : index < activeIndex
          ? "is-complete"
          : "";
    const current = route.id === state.route ? ' aria-current="step"' : "";
    const disabled = locked ? " disabled" : "";

    return `
      <li class="progress-item ${stateClass}">
        <button type="button" data-route="${route.id}"${current}${disabled}>
          <span class="progress-index">${String(index + 1).padStart(2, "0")}</span>
          <span>${route.label}</span>
        </button>
      </li>
    `;
  }).join("");

  return `
    <a class="skip-link" href="#workspace">Skip to setup</a>
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-route="welcome" aria-label="EvoRacer AI Lab home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>
            <strong>EvoRacer</strong>
            <small>Offline evolution lab</small>
          </span>
        </a>
        <div class="topbar-actions">
          <p class="local-status">
            <span aria-hidden="true"></span>
            Local core
          </p>
          <button
            class="motion-button"
            type="button"
            data-action="toggle-motion"
            aria-pressed="${String(reducedMotion)}"
            title="${systemReducedMotion ? "Windows motion preference is active" : reducedMotion ? "Restore interface motion" : "Reduce interface motion"}"
            ${systemReducedMotion ? "disabled" : ""}
          >
            ${systemReducedMotion ? "Motion reduced by Windows" : reducedMotion ? "Motion reduced" : "Reduce motion"}
          </button>
          <button class="exit-button" type="button" data-action="exit-application" title="Exit application">
            Exit application
          </button>
        </div>
      </header>

      <aside class="sidebar" aria-label="Experiment setup progress">
        <p class="sidebar-label">Experiment setup</p>
        <ol class="progress-list">${steps}</ol>
        <div class="offline-note">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Local session</strong>
            <p>Data and processing stay on this computer.</p>
          </div>
        </div>
      </aside>

      <main id="workspace" class="workspace">
        ${renderRoute(
          state,
          presetGeometry,
          trackWorkspace,
          simulation,
          runLibrary,
          replayFrameIndex,
          generationTrails,
          reducedMotion,
        )}
      </main>
    </div>
  `;
}

function renderRoute(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replayFrameIndex: number,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const activeTrack =
    state.draft.track === null
      ? presetGeometry.status === "ready"
        ? presetGeometry.presets.find(
            (candidate) => candidate.track.id === state.draft.trackPreset,
          )
        : undefined
      : trackWorkspace.selected;
  switch (state.route) {
    case "welcome":
      return renderWelcome(runLibrary);
    case "track":
      return renderTrack(state, presetGeometry, trackWorkspace);
    case "settings":
      return renderSettings(state);
    case "review":
      return renderReview(state);
    case "training":
      return renderTraining(
        state,
        simulation,
        activeTrack,
        generationTrails,
        reducedMotion,
      );
    case "results":
      return renderResults(
        state,
        simulation,
        replayFrameIndex,
        activeTrack,
        generationTrails,
        reducedMotion,
      );
  }
}
