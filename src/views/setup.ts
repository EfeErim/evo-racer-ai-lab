import type { PresetGeometryState } from "../app-store";
import type { AppState } from "../onboarding";
import type { TrackWorkspaceState } from "../track-builder";
import type { CompiledTrackV1 } from "../track-renderer";
import { renderStartPanel } from "./review";
import { renderPlanSection } from "./settings";
import { pageHeader } from "./shared";
import { renderTrackChoices } from "./track";

/** One page for every choice before a race, with Start at the bottom. */
export function renderSetup(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  activeTrack: CompiledTrackV1 | undefined,
): string {
  return `
    <section class="page setup-page" aria-labelledby="page-title">
      ${pageHeader(
        "Set up a race",
        "Pick a track and a training plan. Nothing starts until you press Start training.",
      )}
      ${renderTrackChoices(state, presetGeometry, trackWorkspace, activeTrack)}
      ${renderPlanSection(state)}
      ${renderStartPanel(state, activeTrack, trackWorkspace.selectedSeed)}
    </section>
  `;
}
