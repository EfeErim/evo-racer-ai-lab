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
import type { RaceStage } from "../race-buffer";
import { renderTraining } from "./training";
import { renderWelcome } from "./welcome";

const ROUTE_ORDER = new Map<RouteId, number>(
  ROUTES.map((route, index) => [route.id, index]),
);

const MOTION_ICON = `<svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h7M2 8h10M2 11h5" /></svg>`;
const EXIT_ICON = `<svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>`;

export interface ReplayPresentation {
  frameIndex: number;
  paused: boolean;
}

function coreStatus(
  presetGeometry: PresetGeometryState,
  simulation: SimulationState,
): { tone: "success" | "info" | "warning"; glyph: string; label: string } {
  if (
    presetGeometry.status === "unavailable" ||
    simulation.status === "unavailable" ||
    (simulation.status === "ready" && simulation.error !== undefined)
  ) {
    return {
      tone: "warning",
      glyph: "!",
      label: "Local core: no response yet",
    };
  }
  return presetGeometry.status === "ready"
    ? { tone: "success", glyph: "✓", label: "Local core" }
    : { tone: "info", glyph: "…", label: "Local core: connecting" };
}

export function renderShell(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replay: ReplayPresentation,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
  systemReducedMotion: boolean,
  raceStage: RaceStage,
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
          <span class="progress-index">${String(index + 1)}</span>
          <span class="progress-label">${route.label}</span>
        </button>
      </li>
    `;
  }).join("");
  const status = coreStatus(presetGeometry, simulation);

  return `
    <a class="skip-link" href="#workspace">Skip to main content</a>
    <div class="app-shell" data-motion="${reducedMotion ? "reduced" : "full"}">
      <header class="topbar">
        <a class="brand" href="#" data-route="welcome" aria-label="EvoRacer AI Lab home">
          <span class="brand-mark" aria-hidden="true"></span>
          <strong>EvoRacer</strong>
        </a>
        <nav class="progress-nav" aria-label="Experiment progress">
          <ol class="progress-list">${steps}</ol>
        </nav>
        <div class="topbar-actions">
          <p class="local-status is-${status.tone}" title="The simulation runs on this computer. Nothing leaves it.">
            <span class="status-glyph is-${status.tone}" aria-hidden="true">${status.glyph}</span>
            <span class="tool-label">${status.label}</span>
          </p>
          <button
            class="tool-button motion-button"
            type="button"
            data-action="toggle-motion"
            aria-pressed="${String(systemReducedMotion ? !reducedMotion : reducedMotion)}"
            title="${systemReducedMotion ? "Windows asks apps to reduce motion. This choice lasts until you close EvoRacer." : reducedMotion ? "Restore interface motion" : "Reduce interface motion"}"
          >
            ${MOTION_ICON}
            <span class="tool-label">${systemReducedMotion ? (reducedMotion ? "Show race motion" : "Race motion on") : reducedMotion ? "Motion reduced" : "Reduce motion"}</span>
          </button>
          <button class="tool-button exit-button" type="button" data-action="exit-application" title="Exit application">
            ${EXIT_ICON}
            <span class="tool-label">Exit application</span>
          </button>
        </div>
      </header>

      <main id="workspace" class="workspace">
        ${renderRoute(
          state,
          presetGeometry,
          trackWorkspace,
          simulation,
          runLibrary,
          replay,
          generationTrails,
          reducedMotion,
          raceStage,
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
  replay: ReplayPresentation,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
  raceStage: RaceStage,
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
      return renderWelcome(runLibrary, presetGeometry);
    case "track":
      return renderTrack(state, presetGeometry, trackWorkspace, activeTrack);
    case "settings":
      return renderSettings(state);
    case "review":
      return renderReview(state, activeTrack, trackWorkspace.selectedSeed);
    case "training":
      return renderTraining(
        state,
        simulation,
        activeTrack,
        generationTrails,
        reducedMotion,
        raceStage,
      );
    case "results":
      return renderResults(
        state,
        simulation,
        runLibrary,
        replay,
        activeTrack,
        reducedMotion,
      );
  }
}
