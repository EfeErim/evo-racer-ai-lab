import type { PresetGeometryState, RunLibraryState } from "../app-store";
import { escapeHtml } from "../html";
import {
  maximumCandidateEpisodes,
  TRACK_PRESETS,
  TRAINING_PRESETS,
} from "../onboarding";
import { renderTrackSvg, trackLengthMeters } from "../track-renderer";

const STATUS_LABELS: Record<string, string> = {
  running: "Interrupted",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

export function renderWelcome(
  runLibrary: RunLibraryState,
  presetGeometry: PresetGeometryState,
): string {
  const pending =
    runLibrary.status === "ready" ? runLibrary.pending : undefined;
  const libraryNotice =
    runLibrary.status === "ready"
      ? runLibrary.notice.tone === "error"
        ? `
            <div class="notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.notice.message)}</p>
              <button class="button secondary compact" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : `<p class="notice is-${runLibrary.notice.tone}" role="status">${escapeHtml(runLibrary.notice.message)}</p>`
      : "";
  const forceSavedRunsOpen =
    runLibrary.status === "unavailable" ||
    (runLibrary.status === "ready" && runLibrary.notice.tone === "error");
  const savedRunCount =
    runLibrary.status === "ready"
      ? `${String(runLibrary.value.runs.length)} saved`
      : runLibrary.status === "loading"
        ? "Loading"
        : "No response yet";
  const savedRuns =
    runLibrary.status === "loading"
      ? "<p>Loading local run files…</p>"
      : runLibrary.status === "unavailable"
        ? `
            <div class="notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.message)}</p>
              <button class="button secondary compact" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : runLibrary.value.runs.length === 0
          ? `${libraryNotice}<p>No saved runs yet. Every run you start will appear here.</p>`
          : `
            ${libraryNotice}
            <div class="table-scroll" tabindex="0" role="region" aria-label="Saved runs table">
              <table>
              <thead><tr><th>Track</th><th>Generations</th><th>Status</th><th>Run</th><th>Actions</th></tr></thead>
              <tbody>
                ${runLibrary.value.runs
                  .map(
                    (run) => `
                      <tr>
                        <th scope="row">${escapeHtml(run.trackName)}</th>
                        <td>${String(run.generation)} of ${String(run.totalGenerations)}</td>
                        <td>${escapeHtml(STATUS_LABELS[run.status] ?? run.status)}</td>
                        <td class="data-id">${escapeHtml(run.runId.slice(0, 18))}</td>
                        <td>
                          <div class="library-actions">
                            ${
                              run.resumable
                                ? `<button class="button secondary compact" type="button" data-run-action="resume" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "resume" && pending.runId === run.runId ? "Restoring…" : "Resume"}</button>`
                                : run.championFitness !== null
                                  ? `<button class="button secondary compact" type="button" data-run-action="open" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "open" && pending.runId === run.runId ? "Opening…" : "Open results"}</button>`
                                  : `<button class="button secondary compact" type="button" disabled>No results</button>`
                            }
                            <button class="button secondary compact" type="button" data-run-action="export" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "export" && pending.runId === run.runId ? "Exporting…" : "Export"}</button>
                            <button class="button danger compact" type="button" data-run-action="delete" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "delete" && pending.runId === run.runId ? "Deleting…" : "Delete"}</button>
                          </div>
                          ${run.resumeUnavailableReason ? `<p>${escapeHtml(run.resumeUnavailableReason)}</p>` : ""}
                        </td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
              </table>
            </div>
            ${
              runLibrary.value.isolated.length === 0
                ? ""
                : `<p role="status">${String(runLibrary.value.isolated.length)} damaged run record(s) were set aside. The other runs are unaffected.</p>`
            }
          `;
  const recommendedTrack = TRACK_PRESETS[0];
  const recommendedPlan = TRAINING_PRESETS[0];
  const compiled =
    presetGeometry.status === "ready"
      ? presetGeometry.presets.find(
          (candidate) => candidate.track.id === recommendedTrack.id,
        )
      : undefined;
  return `
    <section class="page welcome-page" aria-labelledby="page-title">
      <div class="welcome-hero">
        <div class="welcome-intro">
          <h1 id="page-title" tabindex="-1">AI cars learn to race by evolution, and you watch.</h1>
          <div class="welcome-actions">
            <button class="button primary" type="button" data-action="review-recommended" ${pending?.action === "resume" ? "disabled" : ""}>
              Review recommended experiment
              <span aria-hidden="true">→</span>
            </button>
            <button class="button secondary" type="button" data-action="begin-setup" ${pending?.action === "resume" ? "disabled" : ""}>
              Choose track and settings
            </button>
          </div>
          <p class="next-hint">Next you check the setup. Training begins only when you press Start.</p>
        </div>
        <aside class="recommended" aria-label="Recommended first experiment">
          <div class="recommended-preview" aria-hidden="true">
            ${compiled === undefined ? "" : renderTrackSvg(compiled)}
          </div>
          <dl class="fact-list">
            <div><dt>Track</dt><dd>${recommendedTrack.name}${compiled === undefined ? "" : ` · ${String(Math.round(trackLengthMeters(compiled)))} m`}</dd></div>
            <div><dt>Training plan</dt><dd>${recommendedPlan.name}</dd></div>
            <div><dt>Budget</dt><dd>Up to ${String(maximumCandidateEpisodes(recommendedPlan.settings))} candidate evaluations</dd></div>
          </dl>
        </aside>
      </div>

      <ol class="loop-steps" aria-label="How EvoRacer works">
        <li><span aria-hidden="true">1</span><p><strong>Set up</strong> Pick a track and how long to train.</p></li>
        <li><span aria-hidden="true">2</span><p><strong>Watch</strong> Each generation of cars tries the track. The best ones breed the next.</p></li>
        <li><span aria-hidden="true">3</span><p><strong>Compare</strong> See whether the best car improved, and replay it.</p></li>
      </ol>

      <details class="disclosure saved-runs-panel" ${forceSavedRunsOpen ? 'open data-force-open="true"' : ""}>
        <summary>
          <h2 id="saved-runs-title">Saved runs</h2>
          <span class="chip">${savedRunCount}</span>
        </summary>
        <div class="disclosure-body">${savedRuns}</div>
      </details>
    </section>
  `;
}
