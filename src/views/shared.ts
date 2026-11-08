import { escapeHtml } from "../html";
import { type AppState, TRACK_PRESETS } from "../onboarding";
import { type CompiledTrackV1, trackLengthMeters } from "../track-renderer";

export function pageHeader(title: string, description: string): string {
  return `
    <header class="page-header">
      <h1 id="page-title" tabindex="-1">${title}</h1>
      <p class="page-lead">${description}</p>
    </header>
  `;
}

export interface TrackIdentity {
  name: string;
  summary: string;
  seed: string;
  custom: boolean;
}

/** What the player needs to recognize the track Review and Start will submit. */
export function trackIdentity(
  state: AppState,
  compiled: CompiledTrackV1 | undefined,
  selectedSeed: number | undefined,
): TrackIdentity {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const custom = state.draft.track !== null;
  const pieces =
    state.draft.track?.pieces.length ?? compiled?.track.pieces.length;
  const parts = [
    pieces === undefined
      ? undefined
      : `${String(pieces)} piece${pieces === 1 ? "" : "s"}`,
    compiled === undefined
      ? undefined
      : `${String(Math.round(trackLengthMeters(compiled)))} m long`,
  ].filter((part) => part !== undefined);
  return {
    name: state.draft.track?.name ?? preset?.name ?? "Not selected",
    summary: parts.length === 0 ? "Measuring the track…" : parts.join(" · "),
    seed: !custom
      ? "None, preset layout"
      : selectedSeed === undefined
        ? "None, built or imported"
        : String(selectedSeed),
    custom,
  };
}

export function renderActiveTrack(identity: TrackIdentity): string {
  return `
    <section class="active-track" aria-label="Active track">
      <span class="status-glyph is-success" aria-hidden="true">✓</span>
      <dl>
        <div><dt>Active track</dt><dd>${escapeHtml(identity.name)}</dd></div>
        <div><dt>Length</dt><dd>${escapeHtml(identity.summary)}</dd></div>
        <div><dt>Seed</dt><dd>${escapeHtml(identity.seed)}</dd></div>
      </dl>
      ${
        identity.custom
          ? '<button class="button secondary compact" type="button" data-track-action="open-selected-builder">Edit in Track Builder</button>'
          : ""
      }
    </section>
  `;
}
