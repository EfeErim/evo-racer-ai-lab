import { escapeHtml } from "../html";
import {
  type AppState,
  canStartSession,
  getPresentationIssues,
  maximumCandidateEpisodes,
  startFailurePresentation,
} from "../onboarding";
import type { CompiledTrackV1 } from "../track-renderer";
import { selectedTrainingPreset } from "./settings";
import { trackIdentity } from "./shared";

/** The bottom of Set up: what will run, whether it is valid, and Start. */
export function renderStartPanel(
  state: AppState,
  activeTrack: CompiledTrackV1 | undefined,
  selectedSeed: number | undefined,
): string {
  const identity = trackIdentity(state, activeTrack, selectedSeed);
  const { settings } = state.draft;
  const preset = selectedTrainingPreset(settings);
  const startDisabled = !canStartSession(state);
  const maximumEpisodes = maximumCandidateEpisodes(settings);

  return `
    <section class="start-panel" aria-labelledby="start-title">
      <div class="start-summary">
        <h2 id="start-title">Ready to race</h2>
        <p>
          <strong>${escapeHtml(identity.name)}</strong> · ${preset?.name ?? "Custom settings"} ·
          ${String(settings.populationSize)} cars × ${String(settings.generations)} generations
          <span class="start-budget">(up to ${String(maximumEpisodes)} attempts)</span>
        </p>
        ${renderValidationStatus(state)}
      </div>
      <button
        class="button primary start-button"
        type="button"
        data-action="start-session"
        ${startDisabled ? "disabled" : ""}
        aria-describedby="start-condition"
      >
        Start training
        <span aria-hidden="true">→</span>
      </button>
      <p id="start-condition" class="sr-only">
        ${startDisabled ? "Start unlocks once the local core accepts this setup." : "Start is available. Training begins only when you press it."}
      </p>
    </section>
    ${renderStartFailure(state)}
  `;
}

function renderStartFailure(state: AppState): string {
  if (state.startFailure === null) {
    return "";
  }
  const presentation = startFailurePresentation(state.startFailure);
  return `
    <section class="notice is-warning start-failure-notice" role="alert" aria-labelledby="start-failure-title">
      <div>
        <h2 id="start-failure-title">${presentation.title}</h2>
        <p>${escapeHtml(state.startFailure.message)}</p>
        <p>${presentation.guidance}</p>
      </div>
      <button class="button secondary compact" type="button" data-route="welcome">
        Open Home and Saved runs
      </button>
    </section>
  `;
}

function fixTargetFor(field: string): { target: string; label: string } | null {
  if (field === "service") {
    return null;
  }
  return field === "track" || field === "trackPreset" || field === "pieces"
    ? { target: "track-title", label: "Fix the track" }
    : { target: "plan-title", label: "Fix the settings" };
}

function renderValidationStatus(state: AppState): string {
  if (state.validation.status === "checking") {
    return `
      <div class="validation-status is-checking" role="status" aria-live="polite">
        <span class="status-glyph is-info is-pending" aria-hidden="true">…</span>
        <div><strong>Checking the setup…</strong></div>
      </div>
    `;
  }

  if (
    state.validation.status === "checked" &&
    state.validation.response.valid
  ) {
    return `
      <div class="validation-status is-valid" role="status" aria-live="polite">
        <span class="status-glyph is-success" aria-hidden="true">✓</span>
        <div><strong>Setup is valid</strong> <span>Nothing runs until you press Start training.</span></div>
      </div>
    `;
  }

  const errors =
    state.validation.status === "checked"
      ? state.validation.response.errors
      : getPresentationIssues(state.draft);
  const errorList = errors
    .map((error) => `<li>${escapeHtml(error.message)}</li>`)
    .join("");
  const fix = errors[0] === undefined ? null : fixTargetFor(errors[0].field);

  return `
    <div class="validation-status is-invalid" role="alert">
      <span class="status-glyph is-danger" aria-hidden="true">!</span>
      <div>
        <strong>Start is locked.</strong>
        <ul>${errorList || "<li>Check the setup again to continue.</li>"}</ul>
      </div>
      ${fix === null ? '<button class="button secondary compact" type="button" data-action="review">Check again</button>' : `<a class="button secondary compact" href="#${fix.target}">${fix.label}</a>`}
    </div>
  `;
}
