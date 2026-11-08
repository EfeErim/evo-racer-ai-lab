import type { PresetGeometryState } from "../app-store";
import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import { type TrackWorkspaceState, renderTrackBuilder } from "../track-builder";
import { type CompiledTrackV1, renderTrackSvg } from "../track-renderer";
import { renderActiveTrack, trackIdentity } from "./shared";

export function renderTrackChoices(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  activeTrack: CompiledTrackV1 | undefined,
): string {
  const customTrack = state.draft.track;
  const cards = TRACK_PRESETS.map((track) => {
    const selected =
      customTrack === null && state.draft.trackPreset === track.id;
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
        <span class="choice-check" aria-hidden="true">✓ Selected</span>
      </label>
    `;
  }).join("");
  const customCard =
    customTrack === null
      ? `
        <div class="choice-card custom-track-card">
          <span class="choice-copy">
            <strong>Your own track</strong>
            <small>Build one piece by piece, generate one from a seed, or open a track file.</small>
          </span>
          <button class="button secondary" type="button" data-track-action="open-builder">
            Open Track Builder <span aria-hidden="true">→</span>
          </button>
        </div>
      `
      : `
        <div class="choice-card custom-track-card is-selected">
          <span class="track-preview" aria-hidden="true">
            ${activeTrack === undefined ? "" : renderTrackSvg(activeTrack)}
          </span>
          <span class="choice-copy">
            <strong>${escapeHtml(customTrack.name)}</strong>
            <small>${escapeHtml(trackIdentity(state, activeTrack, trackWorkspace.selectedSeed).summary)}. Your own track.</small>
          </span>
          <span class="choice-check" aria-hidden="true">✓ Selected</span>
          <button class="button secondary compact" type="button" data-track-action="open-builder">Open Track Builder <span aria-hidden="true">→</span></button>
        </div>
      `;
  const presetStatus =
    presetGeometry.status === "unavailable"
      ? `<div class="notice is-warning" role="alert"><div><strong>Preset previews are not available yet.</strong><p>${escapeHtml(presetGeometry.message)}</p></div><button class="button secondary compact" type="button" data-action="retry-preset-tracks">Retry preset previews</button></div>`
      : "";

  return `
    <section class="setup-section" aria-labelledby="track-title">
      <header class="setup-section-header">
        <h2 id="track-title"><span class="step-number" aria-hidden="true">1</span>Track</h2>
        <p>The cars learn to drive this track.</p>
      </header>
      ${presetStatus}
      <fieldset class="choice-grid">
        <legend class="sr-only">Track</legend>
        ${cards}
        ${customCard}
      </fieldset>
    </section>
  `;
}

/** The Track Builder as its own page; Set up stays one click away. */
export function renderTrackBuilderPage(
  state: AppState,
  trackWorkspace: TrackWorkspaceState,
  activeTrack: CompiledTrackV1 | undefined,
): string {
  return `
    <section class="page builder-page" aria-labelledby="page-title">
      <header class="page-header with-actions">
        <div>
          <h1 id="page-title" tabindex="-1">Track Builder</h1>
          <p class="page-lead">Build, generate, or open a track. Press <strong>Use this track</strong> to race on it.</p>
        </div>
        <button class="button primary" type="button" data-route="setup">
          Done <span aria-hidden="true">→</span>
        </button>
      </header>
      ${renderActiveTrack(
        trackIdentity(state, activeTrack, trackWorkspace.selectedSeed),
      )}
      ${renderTrackBuilder({ ...trackWorkspace, toolsOpen: true })}
    </section>
  `;
}
