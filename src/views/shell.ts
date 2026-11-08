import type {
  PresetGeometryState,
  RunLibraryState,
  SimulationState,
} from "../app-store";
import { type AppState, JOURNEY_STEPS, type RouteId } from "../onboarding";
import type { TrackWorkspaceState } from "../track-builder";
import { renderResults } from "./results";
import { renderSetup } from "./setup";
import { renderTrackBuilderPage } from "./track";
import type { TrainingStageInfo } from "../controllers/race-playback";
import { renderTraining } from "./training";
import { renderWelcome } from "./welcome";

const MOTION_ICON = `<svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h7M2 8h10M2 11h5" /></svg>`;
const MENU_ICON = `<svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10" /></svg>`;
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
  reducedMotion: boolean,
  systemReducedMotion: boolean,
  stageInfo: TrainingStageInfo,
  raceSpeed: number,
): string {
  const activeStep = JOURNEY_STEPS.findIndex((step) =>
    (step.covers as readonly RouteId[]).includes(state.route),
  );
  const steps = JOURNEY_STEPS.map((step, index) => {
    const locked =
      step.id === "setup"
        ? state.sessionStarted
        : !state.sessionStarted ||
          (step.id === "results" &&
            (simulation.status !== "ready" ||
              simulation.snapshot.result === null));
    const stateClass =
      index === activeStep
        ? "is-active"
        : activeStep >= 0 && index < activeStep
          ? "is-complete"
          : "";
    const current = index === activeStep ? ' aria-current="step"' : "";
    return `
      <li class="progress-item ${stateClass}">
        <button type="button" data-route="${step.id}"${current}${locked ? " disabled" : ""}>
          <span class="progress-index">${String(index + 1)}</span>
          <span class="progress-label">${step.label}</span>
        </button>
      </li>
    `;
  }).join("");
  const status = coreStatus(presetGeometry, simulation);
  const animating = !reducedMotion;

  return `
    <a class="skip-link" href="#workspace">Skip to main content</a>
    <div class="app-shell" data-motion="${reducedMotion ? "reduced" : "full"}">
      <header class="topbar">
        <a class="brand" href="#" data-route="welcome" aria-label="EvoRacer home"${state.sessionStarted ? ' aria-disabled="true"' : ""}>
          <span class="brand-mark" aria-hidden="true"></span>
          <strong>EvoRacer</strong>
        </a>
        <nav class="progress-nav" aria-label="Steps">
          <ol class="progress-list">${steps}</ol>
        </nav>
        <div class="topbar-actions">
          ${
            status.tone === "success"
              ? ""
              : `<p class="local-status is-${status.tone}" role="status">
            <span class="status-glyph is-${status.tone}" aria-hidden="true">${status.glyph}</span>
            <span class="tool-label">${status.label}</span>
          </p>`
          }
          <details class="app-menu">
            <summary class="tool-button" aria-label="Menu">
              ${MENU_ICON}
              <span class="tool-label">Menu</span>
            </summary>
            <div class="app-menu-panel">
              <button
                class="menu-item"
                type="button"
                data-action="toggle-motion"
                aria-pressed="${String(animating)}"
              >
                ${MOTION_ICON}
                <span>Animate races</span>
                <span class="menu-state">${animating ? "On" : "Off"}</span>
              </button>
              <p class="menu-note">${systemReducedMotion ? "Windows asks apps to reduce motion, so this starts Off. Your choice lasts until you close EvoRacer." : "Turn off to show still frames instead of moving cars."}</p>
              <p class="menu-note">Everything runs on this computer. Nothing is sent anywhere.</p>
              <button class="menu-item is-danger" type="button" data-action="exit-application">
                ${EXIT_ICON}
                <span>Exit EvoRacer</span>
              </button>
            </div>
          </details>
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
          reducedMotion,
          stageInfo,
          raceSpeed,
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
  reducedMotion: boolean,
  stageInfo: TrainingStageInfo,
  raceSpeed: number,
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
    case "setup":
      return renderSetup(state, presetGeometry, trackWorkspace, activeTrack);
    case "track":
      return renderTrackBuilderPage(state, trackWorkspace, activeTrack);
    case "training":
      return renderTraining(
        state,
        simulation,
        activeTrack,
        reducedMotion,
        stageInfo,
        raceSpeed,
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
