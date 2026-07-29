import {
  ROUTES,
  TRACK_PRESETS,
  TRAINING_PRESETS,
  canRequestReview,
  canStartSession,
  createInitialState,
  getPresentationIssues,
  transition,
  type AlgorithmId,
  type AppAction,
  type AppState,
  type NumericSetting,
  type RouteId,
  type TrainingPresetId,
} from "./onboarding";
import {
  assistTrackClosure,
  compileTrack,
  deleteTrack,
  generateTrack,
  loadPresetTracks,
  loadTrackLibrary,
  saveTrack,
  serviceUnavailableResponse,
  validateSetup,
} from "./ipc";
import { renderTrackSvg, type CompiledTrackV1 } from "./track-renderer";
import {
  SEGMENT_CATALOGUE,
  addEditorPiece,
  createEditorState,
  deleteEditorPiece,
  editorTrack,
  parseTrackDocument,
  redoEditor,
  replaceEditorTrack,
  resetEditor,
  serializeTrackDocument,
  undoEditor,
  updateEditorDetails,
  type EditorState,
  type SegmentKind,
  type TrackLibraryResponse,
} from "./track-workbench";

const ROUTE_ORDER = new Map<RouteId, number>(
  ROUTES.map((route, index) => [route.id, index]),
);

export interface AppController {
  getState(): AppState;
  dispatch(action: AppAction): void;
}

type PresetGeometryState =
  | { status: "loading" }
  | { status: "ready"; presets: CompiledTrackV1[] }
  | { status: "unavailable" };

interface TrackWorkspaceState {
  editor: EditorState;
  active?: CompiledTrackV1;
  library: TrackLibraryResponse | null;
  message: string;
}

export function mountApp(root: HTMLElement): AppController {
  let state = createInitialState();
  let presetGeometry: PresetGeometryState = { status: "loading" };
  let trackWorkspace: TrackWorkspaceState = {
    editor: createEditorState(),
    library: null,
    message: "Editor geometry is checked by Python when you validate it.",
  };

  const dispatch = (action: AppAction): void => {
    const previousRoute = state.route;
    state = transition(state, action);
    render(state.route !== previousRoute);
  };

  const review = async (): Promise<void> => {
    if (!canRequestReview(state)) {
      state = { ...state, route: "settings" };
      render(true);
      return;
    }

    dispatch({ type: "validation-started" });
    try {
      const response = await validateSetup(state.draft);
      dispatch({ type: "validation-received", response });
    } catch {
      dispatch({
        type: "validation-received",
        response: serviceUnavailableResponse(),
      });
    }
  };

  const refreshLibrary = async (): Promise<void> => {
    try {
      trackWorkspace = {
        ...trackWorkspace,
        library: await loadTrackLibrary(),
      };
    } catch {
      trackWorkspace = {
        ...trackWorkspace,
        message: "The local track library is unavailable.",
      };
    }
    render();
  };

  const useCompiled = (compiled: CompiledTrackV1, message: string): void => {
    trackWorkspace = { ...trackWorkspace, active: compiled, message };
    dispatch({ type: "select-custom-track", track: compiled.track });
  };

  const handleTrackAction = async (
    action: string,
    element: HTMLElement,
  ): Promise<void> => {
    try {
      switch (action) {
        case "editor-add": {
          const kind = element.dataset.segmentKind as SegmentKind | undefined;
          if (kind !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              editor: addEditorPiece(trackWorkspace.editor, kind),
              active: undefined,
              message: "Sequence changed. Validate it with the local core.",
            };
          }
          render();
          return;
        }
        case "editor-delete": {
          const index = Number(element.dataset.pieceIndex);
          trackWorkspace = {
            ...trackWorkspace,
            editor: deleteEditorPiece(trackWorkspace.editor, index),
            active: undefined,
            message: "Sequence changed. Validate it with the local core.",
          };
          render();
          return;
        }
        case "editor-undo":
          trackWorkspace = {
            ...trackWorkspace,
            editor: undoEditor(trackWorkspace.editor),
            active: undefined,
          };
          render();
          return;
        case "editor-redo":
          trackWorkspace = {
            ...trackWorkspace,
            editor: redoEditor(trackWorkspace.editor),
            active: undefined,
          };
          render();
          return;
        case "editor-reset":
          trackWorkspace = {
            ...trackWorkspace,
            editor: resetEditor(trackWorkspace.editor),
            active: undefined,
            message: "Editor reset to the safe starter loop.",
          };
          render();
          return;
        case "editor-validate": {
          const response = await compileTrack(
            editorTrack(trackWorkspace.editor),
          );
          if (response.valid && response.compiled !== undefined) {
            useCompiled(response.compiled, "Edited track validated by Python.");
          } else {
            trackWorkspace = {
              ...trackWorkspace,
              active: undefined,
              message:
                response.errors[0]?.message ?? "The edited track is invalid.",
            };
            render();
          }
          return;
        }
        case "editor-assist": {
          const response = await assistTrackClosure(
            editorTrack(trackWorkspace.editor),
          );
          if (response.valid && response.compiled !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              editor: replaceEditorTrack(
                trackWorkspace.editor,
                response.compiled.track,
              ),
            };
            useCompiled(
              response.compiled,
              `Python added ${String(response.addedPieces?.length ?? 0)} piece(s) to close the loop.`,
            );
          } else {
            trackWorkspace = {
              ...trackWorkspace,
              message:
                response.errors[0]?.message ??
                "No safe assisted closure was found.",
            };
            render();
          }
          return;
        }
        case "generate": {
          const seed =
            root.querySelector<HTMLInputElement>("[data-generator-seed]")
              ?.valueAsNumber ?? 0;
          const length =
            root.querySelector<HTMLSelectElement>("[data-generator-length]")
              ?.value ?? "medium";
          const difficulty =
            root.querySelector<HTMLSelectElement>("[data-generator-difficulty]")
              ?.value ?? "technical";
          const response = await generateTrack({
            seed,
            length: length as "short" | "medium" | "long",
            difficulty: difficulty as "easy" | "technical" | "hard",
          });
          if (response.valid && response.compiled !== undefined) {
            useCompiled(
              response.compiled,
              "Generated track selected from deterministic Python output.",
            );
          } else {
            trackWorkspace = {
              ...trackWorkspace,
              message:
                response.errors[0]?.message ?? "Track generation failed.",
            };
            render();
          }
          return;
        }
        case "save-active":
          if (trackWorkspace.active !== undefined) {
            const result = await saveTrack(trackWorkspace.active.track);
            trackWorkspace = {
              ...trackWorkspace,
              message: result.saved
                ? "Track saved atomically to the local library."
                : (result.errors[0]?.message ?? "Track could not be saved."),
            };
            await refreshLibrary();
          }
          return;
        case "use-library": {
          const trackId = element.dataset.trackId;
          const compiled = trackWorkspace.library?.tracks.find(
            (candidate) => candidate.track.id === trackId,
          );
          if (compiled !== undefined) {
            useCompiled(compiled, "Local-library track selected.");
          }
          return;
        }
        case "delete-library": {
          const trackId = element.dataset.trackId;
          if (trackId !== undefined) {
            await deleteTrack(trackId);
            trackWorkspace = {
              ...trackWorkspace,
              message: "Local track deleted.",
            };
            await refreshLibrary();
          }
          return;
        }
        case "export-active":
          if (trackWorkspace.active !== undefined) {
            downloadTrack(trackWorkspace.active);
          }
          return;
      }
    } catch {
      trackWorkspace = {
        ...trackWorkspace,
        message: "The local Python track command could not be completed.",
      };
      render();
    }
  };

  const importTrack = async (file: File): Promise<void> => {
    try {
      const track = parseTrackDocument(await file.text());
      const response = await compileTrack(track);
      if (!response.valid || response.compiled === undefined) {
        trackWorkspace = {
          ...trackWorkspace,
          message:
            response.errors[0]?.message ?? "The imported track is invalid.",
        };
        render();
        return;
      }
      useCompiled(
        response.compiled,
        "Imported TrackV1 validated and selected by Python.",
      );
    } catch (error) {
      trackWorkspace = {
        ...trackWorkspace,
        message:
          error instanceof Error ? error.message : "Track import failed.",
      };
      render();
    }
  };

  const render = (focusHeading = false): void => {
    root.innerHTML = renderShell(state, presetGeometry, trackWorkspace);
    bindActions(
      root,
      state,
      dispatch,
      review,
      handleTrackAction,
      importTrack,
      (name, roadWidth) => {
        trackWorkspace = {
          ...trackWorkspace,
          editor: updateEditorDetails(trackWorkspace.editor, name, roadWidth),
          active: undefined,
          message: "Editor details changed. Validate the track again.",
        };
        render();
      },
    );

    if (focusHeading) {
      const pageTitle = root.querySelector<HTMLElement>("#page-title");
      pageTitle?.focus();
    }
  };

  render(true);
  void loadPresetTracks()
    .then((response) => {
      presetGeometry = { status: "ready", presets: response.presets };
      render();
    })
    .catch(() => {
      presetGeometry = { status: "unavailable" };
      render();
    });
  void refreshLibrary();

  return {
    getState: () => state,
    dispatch,
  };
}

function renderShell(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
): string {
  const activeIndex = ROUTE_ORDER.get(state.route) ?? 0;
  const steps = ROUTES.map((route, index) => {
    const locked =
      ((route.id === "training" || route.id === "results") &&
        !state.sessionStarted) ||
      (state.sessionStarted &&
        route.id !== "training" &&
        route.id !== "results");
    const stateClass =
      route.id === state.route
        ? "is-active"
        : index < activeIndex
          ? "is-complete"
          : "";
    const current = route.id === state.route ? ' aria-current="step"' : "";
    const disabled = locked ? " disabled" : "";

    return `
      <li class="progress-item ${stateClass}">
        <button type="button" data-route="${route.id}"${current}${disabled}>
          <span class="progress-index">${String(index + 1).padStart(2, "0")}</span>
          <span>${route.label}</span>
        </button>
      </li>
    `;
  }).join("");

  return `
    <a class="skip-link" href="#workspace">Skip to setup</a>
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-route="welcome" aria-label="EvoRacer AI Lab home">
          <span class="brand-mark" aria-hidden="true">ER</span>
          <span>
            <strong>EvoRacer</strong>
            <small>AI Lab</small>
          </span>
        </a>
        <p class="local-status">
          <span aria-hidden="true"></span>
          Local-only workspace
        </p>
      </header>

      <aside class="sidebar" aria-label="Experiment setup progress">
        <p class="sidebar-label">Experiment setup</p>
        <ol class="progress-list">${steps}</ol>
        <div class="offline-note">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Offline by design</strong>
            <p>All runtime traffic stays on this computer.</p>
          </div>
        </div>
      </aside>

      <main id="workspace" class="workspace">
        ${renderRoute(state, presetGeometry, trackWorkspace)}
      </main>
    </div>
  `;
}

function renderRoute(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
): string {
  switch (state.route) {
    case "welcome":
      return renderWelcome();
    case "track":
      return renderTrack(state, presetGeometry, trackWorkspace);
    case "settings":
      return renderSettings(state);
    case "review":
      return renderReview(state);
    case "training":
      return renderTraining(state);
    case "results":
      return renderResults(state);
  }
}

function pageHeader(
  eyebrow: string,
  title: string,
  description: string,
): string {
  return `
    <header class="page-header">
      <p class="eyebrow">${eyebrow}</p>
      <h1 id="page-title" tabindex="-1">${title}</h1>
      <p class="page-lead">${description}</p>
    </header>
  `;
}

function renderWelcome(): string {
  return `
    <section class="page welcome-page" aria-labelledby="page-title">
      ${pageHeader(
        "Welcome to your local evolution lab",
        "Watch intelligence find the racing line.",
        "Build a controlled experiment, then observe AI drivers improve without ever taking the wheel.",
      )}

      <div class="feature-grid" aria-label="Product principles">
        <article class="feature-card">
          <span class="feature-icon" aria-hidden="true">01</span>
          <h2>Choose the challenge</h2>
          <p>Select a track, algorithm, and experiment size with plain-language guidance.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon" aria-hidden="true">02</span>
          <h2>Review before Start</h2>
          <p>Nothing runs automatically. Start unlocks only after local validation succeeds.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon" aria-hidden="true">03</span>
          <h2>Observe, never drive</h2>
          <p>Controls belong to evolving neural networks; your input configures the lab UI.</p>
        </article>
      </div>

      <div class="welcome-action">
        <button class="button primary" type="button" data-action="begin-setup">
          Begin experiment setup
          <span aria-hidden="true">→</span>
        </button>
        <p>No account, cloud connection, or automatic training.</p>
      </div>
    </section>
  `;
}

function renderTrack(
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
          ${selected ? "checked" : ""}
        />
        <span class="track-preview">
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

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Step 1 of 3",
        "Choose a track",
        "Each bundled preset is validated and compiled by the local Python core before its geometry is drawn here.",
      )}
      <fieldset class="choice-grid">
        <legend class="sr-only">Track preset</legend>
        ${cards}
      </fieldset>
      ${renderTrackWorkbench(trackWorkspace)}
      ${renderActions(
        "welcome",
        "settings",
        "Continue to settings",
        state.draft.trackPreset === null,
      )}
    </section>
  `;
}

function renderTrackWorkbench(workspace: TrackWorkspaceState): string {
  const editor = workspace.editor.present;
  const sequence = editor.pieces
    .map(
      (piece, index) => `
        <li>
          <span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(piece.kind)}</span>
          <button
            type="button"
            data-track-action="editor-delete"
            data-piece-index="${String(index)}"
            ${piece.kind === "start-finish" ? "disabled" : ""}
            aria-label="Delete ${escapeHtml(piece.kind)} at position ${String(index + 1)}"
          >Delete</button>
        </li>
      `,
    )
    .join("");
  const catalogue = SEGMENT_CATALOGUE.filter((kind) => kind !== "start-finish")
    .map(
      (kind) => `
        <button
          type="button"
          data-track-action="editor-add"
          data-segment-kind="${kind}"
        >${kind}</button>
      `,
    )
    .join("");
  const activePreview =
    workspace.active === undefined
      ? '<p class="track-preview-status">No validated custom track selected.</p>'
      : renderTrackSvg(workspace.active);
  const library =
    workspace.library === null
      ? '<p class="track-tool-empty">Loading local library…</p>'
      : workspace.library.tracks.length === 0
        ? '<p class="track-tool-empty">No saved tracks yet.</p>'
        : `<ul class="library-list">${workspace.library.tracks
            .map(
              (compiled) => `
                <li>
                  <span><strong>${escapeHtml(compiled.track.name)}</strong><small>${String(compiled.track.pieces.length)} pieces</small></span>
                  <span class="compact-actions">
                    <button type="button" data-track-action="use-library" data-track-id="${escapeHtml(compiled.track.id)}">Use</button>
                    <button type="button" data-track-action="delete-library" data-track-id="${escapeHtml(compiled.track.id)}">Delete</button>
                  </span>
                </li>
              `,
            )
            .join("")}</ul>`;
  const isolatedCount = workspace.library?.isolated.length ?? 0;

  return `
    <section class="track-workbench" aria-labelledby="track-tools-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">Phase 3 track tools</p>
          <h2 id="track-tools-title">Build, generate, import, and reuse</h2>
        </div>
        <p>Canonical pieces go to the same Python compiler used by presets.</p>
      </div>

      <div class="track-tool-grid">
        <section class="track-tool-panel editor-panel" aria-labelledby="editor-title">
          <h3 id="editor-title">Sequential editor</h3>
          <div class="editor-fields">
            <label>Name <input data-editor-name value="${escapeHtml(editor.name)}" /></label>
            <label>Road width <input data-editor-width type="number" min="8" max="20" step="0.5" value="${String(editor.roadWidth)}" /></label>
          </div>
          <div class="catalogue-buttons" aria-label="Add a track piece">${catalogue}</div>
          <ol class="piece-sequence">${sequence}</ol>
          <div class="compact-actions">
            <button type="button" data-track-action="editor-undo" ${workspace.editor.past.length === 0 ? "disabled" : ""}>Undo</button>
            <button type="button" data-track-action="editor-redo" ${workspace.editor.future.length === 0 ? "disabled" : ""}>Redo</button>
            <button type="button" data-track-action="editor-reset">Reset</button>
            <button type="button" data-track-action="editor-assist">Assist closure</button>
            <button class="accent" type="button" data-track-action="editor-validate">Validate & use</button>
          </div>
        </section>

        <section class="track-tool-panel" aria-labelledby="generator-title">
          <h3 id="generator-title">Deterministic generator</h3>
          <div class="editor-fields">
            <label>Seed <input data-generator-seed type="number" min="0" max="2147483647" step="1" value="42" /></label>
            <label>Length
              <select data-generator-length>
                <option value="short">Short · 12</option>
                <option value="medium" selected>Medium · 18</option>
                <option value="long">Long · 24</option>
              </select>
            </label>
            <label>Difficulty
              <select data-generator-difficulty>
                <option value="easy">Easy</option>
                <option value="technical" selected>Technical</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          <button class="accent" type="button" data-track-action="generate">Generate & use</button>

          <h3>Import / export</h3>
          <label class="file-input">Import TrackV1 JSON <input type="file" accept="application/json,.json" data-track-import /></label>
          <div class="compact-actions">
            <button type="button" data-track-action="export-active" ${workspace.active === undefined ? "disabled" : ""}>Export selected</button>
            <button type="button" data-track-action="save-active" ${workspace.active === undefined ? "disabled" : ""}>Save locally</button>
          </div>
          <div class="active-track-preview">${activePreview}</div>
        </section>

        <section class="track-tool-panel" aria-labelledby="library-title">
          <h3 id="library-title">Local track library</h3>
          ${library}
          ${isolatedCount > 0 ? `<p class="track-warning">${String(isolatedCount)} corrupt record(s) were isolated.</p>` : ""}
        </section>
      </div>
      <p class="track-workbench-status" role="status" aria-live="polite">${escapeHtml(workspace.message)}</p>
    </section>
  `;
}

function renderSettings(state: AppState): string {
  const presets = TRAINING_PRESETS.map((preset) => {
    const matches = Object.entries(preset.settings).every(
      ([key, value]) =>
        state.draft.settings[key as keyof typeof state.draft.settings] ===
        value,
    );
    return `
      <button
        class="preset-button ${matches ? "is-selected" : ""}"
        type="button"
        data-training-preset="${preset.id}"
        aria-pressed="${String(matches)}"
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
        "Step 2 of 3",
        "Shape the experiment",
        "Use a preset or tune the values. Advanced controls stay out of the way until you need them.",
      )}

      <section aria-labelledby="preset-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Recommended starting points</p>
            <h2 id="preset-title">Training presets</h2>
          </div>
        </div>
        <div class="preset-grid">${presets}</div>
      </section>

      <section class="settings-panel" aria-labelledby="settings-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Core parameters</p>
            <h2 id="settings-title">Training settings</h2>
          </div>
          <p>Changes are checked locally before Start.</p>
        </div>

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
      </section>

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
      <select id="${id}" name="${id}" data-algorithm>
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

function renderReview(state: AppState): string {
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

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Step 3 of 3",
        "Review before Start",
        "Your setup remains editable until you deliberately begin. Starting freezes this configuration.",
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
        </section>
      </div>

      ${status}

      <div class="start-panel">
        <div>
          <p class="section-kicker">Explicit action required</p>
          <h2>Ready when you are</h2>
          <p>The lab never begins a run on page load, navigation, or validation.</p>
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
  const errorList = errors.map((error) => `<li>${error.message}</li>`).join("");

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

function renderTraining(state: AppState): string {
  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Training workspace",
        "The experiment is prepared.",
        "Phase 1 proves the safe application flow. Simulation and evolution engines connect in their dedicated phases.",
      )}
      <div class="training-stage">
        <div class="stage-orbit" aria-hidden="true"><span></span></div>
        <p class="section-kicker">Configuration frozen</p>
        <h2>Observer controls only</h2>
        <p>
          The selected ${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"}
          setup is now read-only. No steering, throttle, brake, or vehicle-driving input is exposed.
        </p>
      </div>
      <div class="page-actions">
        <button class="button secondary" type="button" data-action="view-results">
          View results shell
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  `;
}

function renderResults(state: AppState): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Track";
  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Results workspace",
        "A clear finish for every run.",
        "Charts, champion replay, and baseline comparisons arrive after the canonical evaluator is available.",
      )}
      <div class="empty-results">
        <span aria-hidden="true">◇</span>
        <h2>Results shell ready</h2>
        <p>${escapeHtml(trackName)} · ${String(state.draft.settings.populationSize)} candidates · seed ${String(state.draft.settings.seed)}</p>
      </div>
      <div class="page-actions">
        <button class="button primary" type="button" data-action="new-setup">
          Create another setup
        </button>
      </div>
    </section>
  `;
}

function renderActions(
  backRoute: RouteId,
  nextRoute: RouteId,
  nextLabel: string,
  nextDisabled: boolean,
  review = false,
): string {
  return `
    <div class="page-actions">
      <button class="button secondary" type="button" data-route="${backRoute}">
        <span aria-hidden="true">←</span>
        Back
      </button>
      <button
        class="button primary"
        type="button"
        ${review ? 'data-action="review"' : `data-route="${nextRoute}"`}
        ${nextDisabled ? "disabled" : ""}
      >
        ${nextLabel}
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

function bindActions(
  root: HTMLElement,
  state: AppState,
  dispatch: (action: AppAction) => void,
  review: () => Promise<void>,
  handleTrackAction: (action: string, element: HTMLElement) => Promise<void>,
  importTrack: (file: File) => Promise<void>,
  updateEditor: (name: string, roadWidth: number) => void,
): void {
  root.querySelectorAll<HTMLElement>("[data-route]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const route = element.dataset.route as RouteId | undefined;
      if (route !== undefined) {
        dispatch({ type: "navigate", route });
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      switch (element.dataset.action) {
        case "begin-setup":
          dispatch({ type: "begin-setup" });
          break;
        case "review":
          void review();
          break;
        case "start-session":
          dispatch({ type: "start-session" });
          break;
        case "view-results":
          dispatch({ type: "view-results" });
          break;
        case "new-setup":
          dispatch({ type: "new-setup" });
          break;
      }
    });
  });

  root
    .querySelectorAll<HTMLInputElement>('input[name="trackPreset"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        dispatch({
          type: "select-track",
          trackPreset: input.value,
        });
      });
    });

  root
    .querySelectorAll<HTMLElement>("[data-track-action]")
    .forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.dataset.trackAction;
        if (action !== undefined) {
          void handleTrackAction(action, element);
        }
      });
    });

  root
    .querySelector<HTMLInputElement>("[data-track-import]")
    ?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (file !== undefined) {
        void importTrack(file);
      }
    });

  const editorName = root.querySelector<HTMLInputElement>("[data-editor-name]");
  const editorWidth = root.querySelector<HTMLInputElement>(
    "[data-editor-width]",
  );
  const commitEditorDetails = (): void => {
    if (editorName !== null && editorWidth !== null) {
      updateEditor(editorName.value, editorWidth.valueAsNumber);
    }
  };
  editorName?.addEventListener("change", commitEditorDetails);
  editorWidth?.addEventListener("change", commitEditorDetails);

  root
    .querySelectorAll<HTMLButtonElement>("[data-training-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.trainingPreset as
          TrainingPresetId | undefined;
        if (preset !== undefined) {
          dispatch({ type: "apply-training-preset", preset });
        }
      });
    });

  root
    .querySelector<HTMLSelectElement>("[data-algorithm]")
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      dispatch({
        type: "set-algorithm",
        algorithm: select.value as AlgorithmId,
      });
    });

  root
    .querySelectorAll<HTMLInputElement>("[data-number-setting]")
    .forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.numberSetting as NumericSetting | undefined;
        if (field !== undefined) {
          dispatch({ type: "set-number", field, value: input.valueAsNumber });
        }
      });
    });

  if (state.route === "review" && state.validation.status === "not-checked") {
    void review();
  }
}

function downloadTrack(compiled: CompiledTrackV1): void {
  const blob = new Blob([serializeTrackDocument(compiled.track)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(compiled.track.name)}.track.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized || "track";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
