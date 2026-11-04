import type { RunLibraryState } from "../app-store";
import { escapeHtml } from "../html";
import { pageHeader } from "./shared";

export function renderWelcome(runLibrary: RunLibraryState): string {
  const pending =
    runLibrary.status === "ready" ? runLibrary.pending : undefined;
  const libraryNotice =
    runLibrary.status === "ready"
      ? runLibrary.notice.tone === "error"
        ? `
            <div class="run-library-notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.notice.message)}</p>
              <button class="button secondary" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : `<p class="run-library-notice is-${runLibrary.notice.tone}" role="status">${escapeHtml(runLibrary.notice.message)}</p>`
      : "";
  const forceSavedRunsOpen =
    runLibrary.status === "unavailable" ||
    (runLibrary.status === "ready" && runLibrary.notice.tone === "error");
  const savedRuns =
    runLibrary.status === "loading"
      ? "<p>Loading local run files…</p>"
      : runLibrary.status === "unavailable"
        ? `
            <div class="run-library-notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.message)}</p>
              <button class="button secondary" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : runLibrary.value.runs.length === 0
          ? `${libraryNotice}<p>No saved runs yet. Every started run will appear here.</p>`
          : `
            ${libraryNotice}
            <div class="table-scroll">
              <table>
              <thead><tr><th>Run</th><th>Track</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${runLibrary.value.runs
                  .map(
                    (run) => `
                      <tr>
                        <th scope="row">${escapeHtml(run.runId.slice(0, 18))}</th>
                        <td>${escapeHtml(run.trackName)} · ${escapeHtml(run.algorithm)}</td>
                        <td>${String(run.generation)} / ${String(run.totalGenerations)}</td>
                        <td>${escapeHtml(run.status)}</td>
                        <td>
                          <div class="library-actions">
                            ${
                              run.resumable
                                ? `<button class="button secondary" type="button" data-run-action="resume" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "resume" && pending.runId === run.runId ? "Restoring…" : "Resume"}</button>`
                                : run.championFitness !== null
                                  ? `<button class="button secondary" type="button" data-run-action="open" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "open" && pending.runId === run.runId ? "Opening…" : "Open results"}</button>`
                                  : `<button class="button secondary" type="button" disabled>No results</button>`
                            }
                            <button class="button secondary" type="button" data-run-action="export" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "export" && pending.runId === run.runId ? "Exporting…" : "Export"}</button>
                            <button class="button secondary" type="button" data-run-action="delete" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "delete" && pending.runId === run.runId ? "Deleting…" : "Delete"}</button>
                          </div>
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
                : `<p role="status">${String(runLibrary.value.isolated.length)} corrupt run record(s) were isolated without blocking this library.</p>`
            }
          `;
  return `
    <section class="page welcome-page" aria-labelledby="page-title">
      ${pageHeader(
        "EvoRacer / New experiment",
        "Start an AI racing experiment.",
        "Choose a circuit, watch a population learn the racing line, and compare the champion. Nothing runs until you review the setup and press Start.",
      )}

      <div class="welcome-journey" aria-label="How EvoRacer works">
        <div>
          <span aria-hidden="true">01</span>
          <p><strong>Choose a track</strong>Start with the forgiving oval or build your own circuit.</p>
        </div>
        <div>
          <span aria-hidden="true">02</span>
          <p><strong>Watch evolution</strong>See each candidate race with Python-owned physics and telemetry.</p>
        </div>
        <div>
          <span aria-hidden="true">03</span>
          <p><strong>Compare the champion</strong>Replay the best car and inspect real generation progress.</p>
        </div>
      </div>

      <div class="welcome-panel">
        <div class="welcome-summary" aria-label="Experiment setup summary">
          <div class="summary-row">
            <span>Track</span>
            <strong>Easy Oval</strong>
          </div>
          <div class="summary-row">
            <span>Training</span>
            <strong>Quick start · Fixed GA · 80 candidate episodes</strong>
          </div>
          <div class="summary-row">
            <span>Run policy</span>
            <strong>Manual start after local validation</strong>
          </div>
        </div>
        <div class="welcome-aside">
          <span class="data-chip">Local only</span>
          <p>No account, cloud connection, telemetry, or automatic training.</p>
          <div class="welcome-actions">
            <button class="button primary" type="button" data-action="review" ${pending?.action === "resume" ? "disabled" : ""}>
              Review recommended setup
            </button>
            <button class="button secondary" type="button" data-action="begin-setup" ${pending?.action === "resume" ? "disabled" : ""}>
              Customize setup
            </button>
          </div>
        </div>
      </div>
      <details class="comparison-panel saved-runs-panel" ${forceSavedRunsOpen ? 'open data-force-open="true"' : ""}>
        <summary class="chart-heading">
          <div>
            <p class="section-kicker">Versioned local recovery</p>
            <h2 id="saved-runs-title">Saved runs</h2>
          </div>
          <span class="data-chip">Open library</span>
        </summary>
        <div class="saved-runs-content">${savedRuns}</div>
      </details>
    </section>
  `;
}
