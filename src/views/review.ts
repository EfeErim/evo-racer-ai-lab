import { escapeHtml } from "../html";
import {
  type AppState,
  TRACK_PRESETS,
  canStartSession,
  getPresentationIssues,
  maximumCandidateEpisodes,
  startFailurePresentation,
} from "../onboarding";
import { pageHeader } from "./shared";

export function renderReview(state: AppState): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Not selected";
  const trackDescription =
    state.draft.track === null
      ? (preset?.description ?? "Choose a track to continue.")
      : `${String(state.draft.track.pieces.length)} canonical pieces · local TrackV1`;
  const status = renderValidationStatus(state);
  const startDisabled = !canStartSession(state);
  const maximumEpisodes = maximumCandidateEpisodes(state.draft.settings);

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Review",
        "Review the setup.",
        "Confirm the track and training parameters. Starting makes this configuration read-only.",
      )}

      <div class="review-grid">
        <section class="review-card" aria-labelledby="track-review-title">
          <div class="review-heading">
            <div>
              <p class="section-kicker">Track</p>
              <h2 id="track-review-title">${escapeHtml(trackName)}</h2>
            </div>
            <button type="button" data-route="track">Edit</button>
          </div>
          <p>${escapeHtml(trackDescription)}</p>
        </section>

        <section class="review-card" aria-labelledby="training-review-title">
          <div class="review-heading">
            <div>
              <p class="section-kicker">Training</p>
              <h2 id="training-review-title">${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"}</h2>
            </div>
            <button type="button" data-route="settings">Edit</button>
          </div>
          <dl class="review-values">
            <div><dt>Population</dt><dd>${String(state.draft.settings.populationSize)}</dd></div>
            <div><dt>Generations</dt><dd>${String(state.draft.settings.generations)}</dd></div>
            <div><dt>Episode</dt><dd>${String(state.draft.settings.episodeSeconds)}s</dd></div>
            <div><dt>Seed</dt><dd>${String(state.draft.settings.seed)}</dd></div>
          </dl>
          <p class="workload-note">
            Maximum workload: <strong>${String(maximumEpisodes)} candidate episodes</strong>.
            This is a compute budget, not a wall-clock estimate.
          </p>
        </section>
      </div>

      ${status}
      ${renderStartFailure(state)}

      <div class="start-panel">
        <div>
          <p class="section-kicker">Manual start</p>
          <h2>Start this experiment</h2>
          <p>No run begins from navigation or validation alone.</p>
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
          ${startDisabled ? "Start requires successful local validation." : "Configuration is valid. Start is available."}
        </p>
      </div>

      <div class="page-actions">
        <button class="button secondary" type="button" data-route="settings">
          <span aria-hidden="true">←</span>
          Back to settings
        </button>
        <button class="button text-button" type="button" data-action="review">
          Validate again
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
    <section class="start-failure-notice" role="alert" aria-labelledby="start-failure-title">
      <span class="data-chip">${presentation.badge}</span>
      <div>
        <h2 id="start-failure-title">Training did not open</h2>
        <p>${escapeHtml(state.startFailure.message)}</p>
        <p>${presentation.guidance}</p>
        <button class="button secondary" type="button" data-route="welcome">
          Open Welcome and Saved runs
        </button>
      </div>
    </section>
  `;
}

function renderValidationStatus(state: AppState): string {
  if (state.validation.status === "checking") {
    return `
      <div class="validation-status is-checking" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <div><strong>Checking with the local core</strong><p>Start stays locked during validation.</p></div>
      </div>
    `;
  }

  if (
    state.validation.status === "checked" &&
    state.validation.response.valid
  ) {
    return `
      <div class="validation-status is-valid" role="status" aria-live="polite">
        <span class="status-icon" aria-hidden="true">✓</span>
        <div><strong>Configuration valid</strong><p>The local core accepted contract version 1.</p></div>
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

  return `
    <div class="validation-status is-invalid" role="alert">
      <span class="status-icon" aria-hidden="true">!</span>
      <div>
        <strong>Start is locked</strong>
        <ul>${errorList || "<li>Validate the setup with the local core.</li>"}</ul>
      </div>
    </div>
  `;
}
