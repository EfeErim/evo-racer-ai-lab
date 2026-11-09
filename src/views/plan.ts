import {
  type AlgorithmId,
  type AppState,
  type NumericSetting,
  type TrainingSettings,
  TRAINING_PRESETS,
  getPresentationIssues,
  maximumCandidateEpisodes,
} from "../onboarding";

export function selectedTrainingPreset(settings: TrainingSettings) {
  return TRAINING_PRESETS.find(
    (preset) =>
      preset.settings.algorithm === settings.algorithm &&
      preset.settings.populationSize === settings.populationSize &&
      preset.settings.generations === settings.generations &&
      preset.settings.episodeSeconds === settings.episodeSeconds &&
      preset.settings.seed === settings.seed,
  );
}

export function renderPlanSection(state: AppState): string {
  const { settings } = state.draft;
  const maximumEpisodes = maximumCandidateEpisodes(settings);
  const selectedPreset = selectedTrainingPreset(settings);
  const presets = TRAINING_PRESETS.map((preset) => {
    const selected = preset.id === selectedPreset?.id;
    return `
      <button
        class="preset-button ${selected ? "is-selected" : ""}"
        type="button"
        data-training-preset="${preset.id}"
        aria-pressed="${String(selected)}"
      >
        <span class="preset-title">
          <strong>${preset.name}</strong>
          <span class="preset-check" aria-hidden="true">${selected ? "✓ Selected" : ""}</span>
        </span>
        <span>${preset.outcome}</span>
        <span class="preset-budget">${String(preset.settings.populationSize)} cars × ${String(preset.settings.generations)} generations</span>
      </button>
    `;
  }).join("");

  const issues = getPresentationIssues(state.draft);
  const invalidFields = new Set(issues.map((issue) => issue.field));
  const budgetIsKnown = Number.isFinite(maximumEpisodes);

  return `
    <section class="setup-section" aria-labelledby="plan-title">
      <header class="setup-section-header">
        <h2 id="plan-title"><span class="step-number" aria-hidden="true">2</span>Training plan</h2>
        <p>Longer plans give evolution more chances to improve, and take longer.</p>
      </header>

      <div class="preset-grid" role="group" aria-label="Training plan">${presets}</div>

      <p class="budget-note" role="status">
        ${
          budgetIsKnown
            ? `<strong>${selectedPreset?.name ?? "Custom settings"}: ${String(settings.populationSize)} cars × ${String(settings.generations)} generations.</strong>
        Each car gets up to ${String(settings.episodeSeconds)} simulated seconds per attempt, so at most ${String(maximumEpisodes)} attempts in total.`
            : "<strong>Enter valid numbers to see the evaluation budget.</strong>"
        }
      </p>

      <details class="disclosure settings-customizer" ${selectedPreset === undefined ? "open" : ""} ${issues.length > 0 ? 'data-force-open="true" open' : ""}>
        <summary>
          <h2>Exact settings</h2>
          <span class="disclosure-hint">Optional</span>
        </summary>
        <div class="disclosure-body field-grid">
          ${renderSelectField(
            "algorithm",
            "Network type",
            "How each new generation is built. Fixed keeps one network shape. Growing can add connections (NEAT).",
            settings.algorithm,
          )}
          ${renderNumberField(
            "populationSize",
            "Cars per generation",
            "Also called the population.",
            settings.populationSize,
            10,
            500,
            invalidFields.has("populationSize"),
          )}
          ${renderNumberField(
            "generations",
            "Generations",
            "The most evolution cycles this run can use.",
            settings.generations,
            1,
            1000,
            invalidFields.has("generations"),
          )}
          ${renderNumberField(
            "episodeSeconds",
            "Seconds per attempt",
            "Simulated time each car gets.",
            settings.episodeSeconds,
            15,
            300,
            invalidFields.has("episodeSeconds"),
          )}
          ${renderNumberField(
            "seed",
            "Random seed",
            "The same seed and settings repeat the same result.",
            settings.seed,
            0,
            2_147_483_647,
            invalidFields.has("seed"),
          )}
        </div>
      </details>

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
      <label for="${id}">${label}</label>
      <select id="${id}" name="${id}" data-algorithm aria-describedby="${id}-help">
        <option value="fixed-ga" ${value === "fixed-ga" ? "selected" : ""}>Fixed network</option>
        <option value="neat" ${value === "neat" ? "selected" : ""}>Growing network</option>
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
  const range = `${String(minimum)} to ${String(maximum)}`;
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input
        id="${id}"
        name="${id}"
        type="number"
        min="${String(minimum)}"
        max="${String(maximum)}"
        step="1"
        value="${Number.isFinite(value) ? String(value) : ""}"
        data-number-setting="${id}"
        aria-describedby="${id}-help"
        ${invalid ? 'aria-invalid="true"' : ""}
      />
      <p id="${id}-help" class="field-help ${invalid ? "is-error" : ""}">${
        invalid
          ? `<span aria-hidden="true">! </span>Enter a whole number from ${range}.`
          : `${help} Range: ${range}.`
      }</p>
    </div>
  `;
}
