import {
  type AlgorithmId,
  type AppState,
  type NumericSetting,
  TRAINING_PRESETS,
  canRequestReview,
  getPresentationIssues,
  maximumCandidateEpisodes,
} from "../onboarding";
import { pageHeader, renderActions } from "./shared";

export function renderSettings(state: AppState): string {
  const maximumEpisodes = maximumCandidateEpisodes(state.draft.settings);
  const selectedPreset = TRAINING_PRESETS.find(
    (preset) =>
      preset.settings.algorithm === state.draft.settings.algorithm &&
      preset.settings.populationSize === state.draft.settings.populationSize &&
      preset.settings.generations === state.draft.settings.generations &&
      preset.settings.episodeSeconds === state.draft.settings.episodeSeconds &&
      preset.settings.seed === state.draft.settings.seed,
  );
  const presets = TRAINING_PRESETS.map((preset) => {
    const selected = preset.id === selectedPreset?.id;
    return `
      <button
        class="preset-button ${selected ? "is-selected" : ""}"
        type="button"
        data-training-preset="${preset.id}"
        aria-pressed="${String(selected)}"
      >
        <strong>${preset.name}</strong>
        <span>${preset.description}</span>
      </button>
    `;
  }).join("");

  const issues = getPresentationIssues(state.draft);
  const invalidFields = new Set(issues.map((issue) => issue.field));

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Training",
        "Choose a training plan.",
        "Quick start is recommended for a first run. Pick a preset and continue, or open Customize only when you need exact controls.",
      )}

      <section aria-labelledby="preset-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Pick one</p>
            <h2 id="preset-title">Training plan</h2>
          </div>
        </div>
        <div class="preset-grid">${presets}</div>
      </section>

      <p class="workload-note plan-summary">
        Selected: <strong>${selectedPreset?.name ?? "Custom settings"}</strong> ·
        maximum <strong>${String(maximumEpisodes)} candidate episodes</strong>.
        Episodes can end early after a collision or completed lap.
      </p>

      <details class="settings-panel settings-customizer" ${selectedPreset === undefined ? "open" : ""}>
        <summary>
          <span>
            <strong>Customize training</strong>
            <small>Optional algorithm and compute controls</small>
          </span>
          <span aria-hidden="true">＋</span>
        </summary>
        <div class="settings-customizer-content">
          <div class="field-grid">
          ${renderSelectField(
            "algorithm",
            "Algorithm",
            "The evolution strategy used to create each new generation.",
            state.draft.settings.algorithm,
          )}
          ${renderNumberField(
            "populationSize",
            "Population",
            "Candidates evaluated in every generation.",
            state.draft.settings.populationSize,
            10,
            500,
            invalidFields.has("populationSize"),
          )}
          ${renderNumberField(
            "generations",
            "Generations",
            "Maximum number of evolution cycles.",
            state.draft.settings.generations,
            1,
            1000,
            invalidFields.has("generations"),
          )}
          ${renderNumberField(
            "episodeSeconds",
            "Episode length",
            "Maximum simulated seconds available to each candidate.",
            state.draft.settings.episodeSeconds,
            15,
            300,
            invalidFields.has("episodeSeconds"),
          )}
          </div>

          <details class="advanced-settings">
          <summary>
            <span>
              <strong>Advanced controls</strong>
              <small>Optional reproducibility settings</small>
            </span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="advanced-content">
            ${renderNumberField(
              "seed",
              "Random seed",
              "Repeating a seed helps reproduce deterministic work in later phases.",
              state.draft.settings.seed,
              0,
              2_147_483_647,
              invalidFields.has("seed"),
            )}
          </div>
          </details>
        </div>
      </details>

      ${renderActions(
        "track",
        "review",
        "Review experiment",
        !canRequestReview(state),
        true,
      )}
    </section>
  `;
}

function renderSelectField(
  id: string,
  label: string,
  help: string,
  value: AlgorithmId,
): string {
  return `
    <div class="field">
      <div class="field-label">
        <label for="${id}">${label}</label>
        <span class="help-marker" aria-hidden="true">?</span>
      </div>
      <select id="${id}" name="${id}" data-algorithm aria-describedby="${id}-help">
        <option value="fixed-ga" ${value === "fixed-ga" ? "selected" : ""}>Fixed GA</option>
        <option value="neat" ${value === "neat" ? "selected" : ""}>NEAT</option>
      </select>
      <p id="${id}-help" class="field-help">${help}</p>
    </div>
  `;
}

function renderNumberField(
  id: NumericSetting,
  label: string,
  help: string,
  value: number,
  minimum: number,
  maximum: number,
  invalid: boolean,
): string {
  return `
    <div class="field">
      <div class="field-label">
        <label for="${id}">${label}</label>
        <span class="help-marker" aria-hidden="true">?</span>
      </div>
      <input
        id="${id}"
        name="${id}"
        type="number"
        min="${String(minimum)}"
        max="${String(maximum)}"
        step="1"
        value="${String(value)}"
        data-number-setting="${id}"
        aria-describedby="${id}-help"
        ${invalid ? 'aria-invalid="true"' : ""}
      />
      <p id="${id}-help" class="field-help">${help} Range: ${String(minimum)}–${String(maximum)}.</p>
    </div>
  `;
}
