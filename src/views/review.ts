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
import { pageHeader, trackIdentity } from "./shared";

export function renderReview(
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
    <section class="page review-page" aria-labelledby="page-title">
      ${pageHeader(
        "Review and start",
        "Check these choices. They are locked once training starts.",
      )}

      <dl class="review-summary">
        <div>
          <dt>Track</dt>
          <dd><strong>${escapeHtml(identity.name)}</strong> <span>${escapeHtml(identity.summary)}</span></dd>
          <dd><button class="button secondary compact" type="button" data-route="track" aria-label="Edit track">Edit</button></dd>
        </div>
        <div>
          <dt>Training plan</dt>
          <dd><strong>${preset?.name ?? "Custom settings"}</strong></dd>
          <dd><button class="button secondary compact" type="button" data-route="settings" aria-label="Edit training plan">Edit</button></dd>
        </div>
        <div>
          <dt>Population</dt>
          <dd><strong>${String(settings.populationSize)} cars</strong> <span>per generation</span></dd>
        </div>
        <div>
          <dt>Evaluation budget</dt>
          <dd><strong>Up to ${String(maximumEpisodes)} candidate evaluations</strong> <span>${String(settings.generations)} generations, up to ${String(settings.episodeSeconds)} s per attempt. This counts work, not clock time.</span></dd>
        </div>
      </dl>

      ${renderValidationStatus(state)}
      ${renderStartFailure(state)}

      <div class="start-panel">
        <p>
          <strong>Start is the only action that begins training.</strong>
          ${startDisabled ? "It unlocks when the setup is valid." : "Nothing has started yet."}
        </p>
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
          ${startDisabled ? "Start requires a successful setup check." : "Start is available."}
        </p>
      </div>

      <div class="page-actions">
        <button class="button secondary" type="button" data-route="settings">
          <span aria-hidden="true">←</span>
          Back to settings
        </button>
        <button class="button secondary" type="button" data-action="review">
          Check again
        </button>
      </div>
    </section>
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
        Open Welcome and Saved runs
      </button>
    </section>
  `;
}

function fixRouteFor(field: string): {
  route: "track" | "settings";
  label: string;
} | null {
  if (field === "service") {
    return null;
  }
  return field === "track" || field === "trackPreset" || field === "pieces"
    ? { route: "track", label: "Fix the track" }
    : { route: "settings", label: "Fix the settings" };
}

function renderValidationStatus(state: AppState): string {
  if (state.validation.status === "checking") {
    return `
      <div class="validation-status is-checking" role="status" aria-live="polite">
        <span class="status-glyph is-info is-pending" aria-hidden="true">…</span>
        <div><strong>Checking the setup</strong><p>Start stays locked until this finishes.</p></div>
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
        <div><strong>Setup is valid</strong><p>The local core accepted this track and these settings.</p></div>
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
  const fix = errors[0] === undefined ? null : fixRouteFor(errors[0].field);

  return `
    <div class="validation-status is-invalid" role="alert">
      <span class="status-glyph is-danger" aria-hidden="true">!</span>
      <div>
        <strong>Start is locked</strong>
        <ul>${errorList || "<li>Check the setup again to continue.</li>"}</ul>
      </div>
      ${fix === null ? "" : `<button class="button secondary compact" type="button" data-route="${fix.route}">${fix.label}</button>`}
    </div>
  `;
}
