import type { PresetGeometryState } from "../app-store";
import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import { type TrackWorkspaceState, renderTrackBuilder } from "../track-builder";
import { type CompiledTrackV1, renderTrackSvg } from "../track-renderer";
import {
  pageHeader,
  renderActions,
  renderActiveTrack,
  trackIdentity,
} from "./shared";

export function renderTrack(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  activeTrack: CompiledTrackV1 | undefined,
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
              ? "Preview not available"
              : "Loading preview…"
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
          <strong>${track.name}</strong>
          <small>${track.difficulty}. ${track.description}</small>
        </span>
        <span class="choice-check" aria-hidden="true">✓ Active</span>
      </label>
    `;
  }).join("");
  const presetStatus =
    presetGeometry.status === "unavailable"
      ? `<div class="notice is-warning" role="alert"><div><strong>Preset previews are not available yet.</strong><p>${escapeHtml(presetGeometry.message)}</p></div><button class="button secondary compact" type="button" data-action="retry-preset-tracks">Retry preset previews</button></div>`
      : "";

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Choose a track",
        "Presets are ready to race. The Track Builder is optional.",
      )}
      ${renderActiveTrack(
        trackIdentity(state, activeTrack, trackWorkspace.selectedSeed),
      )}
      ${presetStatus}
      <fieldset class="choice-grid">
        <legend class="sr-only">Track preset</legend>
        ${cards}
      </fieldset>
      ${renderTrackBuilder(trackWorkspace)}
      ${renderActions(
        "welcome",
        "settings",
        "Continue to settings",
        state.draft.trackPreset === null,
        "Next you choose how long to train.",
      )}
    </section>
  `;
}
