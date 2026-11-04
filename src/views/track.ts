import type { PresetGeometryState } from "../app-store";
import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import { type TrackWorkspaceState, renderTrackBuilder } from "../track-builder";
import { renderTrackSvg } from "../track-renderer";
import { pageHeader, renderActions } from "./shared";

export function renderTrack(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
): string {
  const cards = TRACK_PRESETS.map((track) => {
    const selected = state.draft.trackPreset === track.id;
    const compiled =
      presetGeometry.status === "ready"
        ? presetGeometry.presets.find(
            (candidate) => candidate.track.id === track.id,
          )
        : undefined;
    const preview =
      compiled === undefined
        ? `<span class="track-preview-status">${
            presetGeometry.status === "unavailable"
              ? "Local preview unavailable"
              : "Compiling local geometry..."
          }</span>`
        : renderTrackSvg(compiled);
    return `
      <label class="choice-card ${selected ? "is-selected" : ""}">
        <input
          type="radio"
          name="trackPreset"
          value="${track.id}"
          aria-label="${escapeHtml(`${track.name}. ${track.difficulty}. ${track.description}`)}"
          ${selected ? "checked" : ""}
        />
        <span class="track-preview" aria-hidden="true">
          ${preview}
        </span>
        <span class="choice-copy">
          <span class="choice-kicker">${track.difficulty}</span>
          <strong>${track.name}</strong>
          <small>${track.description}</small>
        </span>
        <span class="choice-check" aria-hidden="true">✓</span>
      </label>
    `;
  }).join("");
  const presetStatus =
    presetGeometry.status === "unavailable"
      ? `<div class="library-warning" role="alert"><strong>Preset previews unavailable.</strong><p>${escapeHtml(presetGeometry.message)}</p><button class="button secondary" type="button" data-action="retry-preset-tracks">Retry preset previews</button></div>`
      : "";

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Track",
        "Choose a track.",
        "Start from a verified preset or open Track Builder for a custom circuit.",
      )}
      ${presetStatus}
      <fieldset class="choice-grid">
        <legend class="sr-only">Track preset</legend>
        ${cards}
      </fieldset>
      ${renderTrackBuilder(trackWorkspace, state.draft.track !== null)}
      ${renderActions(
        "welcome",
        "settings",
        "Continue to settings",
        state.draft.trackPreset === null,
      )}
    </section>
  `;
}
