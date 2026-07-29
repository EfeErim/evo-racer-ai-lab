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
  commandRun,
  compileTrack,
  deleteTrack,
  generateTrack,
  loadPresetTracks,
  loadTrackLibrary,
  observeRun,
  saveTrack,
  serviceUnavailableResponse,
  startRun,
  validateSetup,
} from "./ipc";
import type {
  ObservationSnapshotV1,
  ReplayFrameV1,
  SelectedCarTelemetryV1,
} from "./simulation";
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

type SimulationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: ObservationSnapshotV1 }
  | { status: "unavailable"; message: string };

export function mountApp(root: HTMLElement): AppController {
  let state = createInitialState();
  let presetGeometry: PresetGeometryState = { status: "loading" };
  let simulation: SimulationState = { status: "idle" };
  let observationTimer: number | undefined;
  let replayFrameIndex = 0;
  let trackWorkspace: TrackWorkspaceState = {
    editor: createEditorState(),
    library: null,
    message: "Editor geometry is checked by Python when you validate it.",
  };

  const dispatch = (action: AppAction): void => {
    const previousRoute = state.route;
    state = transition(state, action);
    if (action.type === "new-setup") {
      if (observationTimer !== undefined) {
        window.clearTimeout(observationTimer);
        observationTimer = undefined;
      }
      simulation = { status: "idle" };
      replayFrameIndex = 0;
    }
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

  const scheduleObservation = (): void => {
    if (
      simulation.status !== "ready" ||
      simulation.snapshot.status !== "running"
    ) {
      return;
    }
    observationTimer = window.setTimeout(() => {
      void observeSession();
    }, 600);
  };

  const applyRunResponse = (
    response: Awaited<ReturnType<typeof startRun>>,
  ): void => {
    if (!response.valid) {
      simulation = {
        status: "unavailable",
        message: response.errors[0]?.message ?? "The run command was rejected.",
      };
    } else {
      simulation = { status: "ready", snapshot: response.snapshot };
    }
    render();
    scheduleObservation();
  };

  const observeSession = async (): Promise<void> => {
    if (
      simulation.status !== "ready" ||
      simulation.snapshot.status !== "running"
    ) {
      return;
    }
    observationTimer = undefined;
    try {
      applyRunResponse(await observeRun(simulation.snapshot.runId));
    } catch {
      simulation = {
        status: "unavailable",
        message: "The local core could not advance the training run.",
      };
      render();
    }
  };

  const controlSession = async (
    command: "pause" | "resume" | "stop",
  ): Promise<void> => {
    if (simulation.status !== "ready") {
      return;
    }
    if (observationTimer !== undefined) {
      window.clearTimeout(observationTimer);
      observationTimer = undefined;
    }
    try {
      applyRunResponse(await commandRun(simulation.snapshot.runId, command));
    } catch {
      simulation = {
        status: "unavailable",
        message: "The local core could not apply the run command.",
      };
      render();
    }
  };

  const moveReplay = (action: "previous" | "next" | "restart"): void => {
    if (simulation.status !== "ready" || simulation.snapshot.result === null) {
      return;
    }
    const lastIndex = simulation.snapshot.result.replay.frames.length - 1;
    if (action === "restart") {
      replayFrameIndex = 0;
    } else if (action === "previous") {
      replayFrameIndex = Math.max(0, replayFrameIndex - 1);
    } else {
      replayFrameIndex = Math.min(lastIndex, replayFrameIndex + 1);
    }
    render();
  };

  const startSession = async (): Promise<void> => {
    if (!canStartSession(state)) {
      return;
    }
    const frozenDraft = state.draft;
    simulation = { status: "loading" };
    replayFrameIndex = 0;
    dispatch({ type: "start-session" });
    try {
      applyRunResponse(await startRun(frozenDraft));
    } catch {
      simulation = {
        status: "unavailable",
        message: "The local core could not start the reviewed run.",
      };
      render();
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
    root.innerHTML = renderShell(
      state,
      presetGeometry,
      trackWorkspace,
      simulation,
      replayFrameIndex,
    );
    bindActions(
      root,
      state,
      dispatch,
      review,
      startSession,
      controlSession,
      moveReplay,
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
  simulation: SimulationState,
  replayFrameIndex: number,
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
          <span class="brand-mark" aria-hidden="true"></span>
          <span>
            <strong>EvoRacer</strong>
            <small>Simulation workspace</small>
          </span>
        </a>
        <p class="local-status">
          <span aria-hidden="true"></span>
          Offline
        </p>
      </header>

      <aside class="sidebar" aria-label="Experiment setup progress">
        <p class="sidebar-label">Experiment setup</p>
        <ol class="progress-list">${steps}</ol>
        <div class="offline-note">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Local session</strong>
            <p>Data and processing stay on this computer.</p>
          </div>
        </div>
      </aside>

      <main id="workspace" class="workspace">
        ${renderRoute(
          state,
          presetGeometry,
          trackWorkspace,
          simulation,
          replayFrameIndex,
        )}
      </main>
    </div>
  `;
}

function renderRoute(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  replayFrameIndex: number,
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
      return renderTraining(state, simulation);
    case "results": {
      const replayTrack =
        state.draft.track === null
          ? presetGeometry.status === "ready"
            ? presetGeometry.presets.find(
                (candidate) => candidate.track.id === state.draft.trackPreset,
              )
            : undefined
          : trackWorkspace.active;
      return renderResults(state, simulation, replayFrameIndex, replayTrack);
    }
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
        "EvoRacer / New experiment",
        "Set up a racing experiment.",
        "Choose a track and training configuration. Nothing runs until you review the setup and press Start.",
      )}

      <div class="welcome-panel">
        <div class="welcome-summary" aria-label="Experiment setup summary">
          <div class="summary-row">
            <span>Track</span>
            <strong>Preset, editor, generator, or local file</strong>
          </div>
          <div class="summary-row">
            <span>Training</span>
            <strong>Fixed GA or NEAT</strong>
          </div>
          <div class="summary-row">
            <span>Run policy</span>
            <strong>Manual start after local validation</strong>
          </div>
        </div>
        <div class="welcome-aside">
          <span class="data-chip">Local only</span>
          <p>No account, cloud connection, telemetry, or automatic training.</p>
          <button class="button primary" type="button" data-action="begin-setup">
            Begin experiment setup
          </button>
        </div>
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
        "Setup / Track",
        "Select a track.",
        "Use a bundled preset or open the custom-track tools. Every option is validated by the local Python core.",
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
          <p class="section-kicker">Custom tracks</p>
          <h2 id="track-tools-title">Edit, generate, or load a track</h2>
        </div>
        <p>All sources use the same local validation and geometry pipeline.</p>
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
        "Setup / Training",
        "Configure training.",
        "Start with a preset or adjust the core parameters. Advanced settings remain optional.",
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
        "Setup / Review",
        "Review the setup.",
        "Confirm the track and training parameters. Starting makes this configuration read-only.",
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
          <p class="section-kicker">Manual start</p>
          <h2>Start this experiment</h2>
          <p>No run begins from navigation or validation alone.</p>
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

function renderTraining(state: AppState, simulation: SimulationState): string {
  let observerContent: string;
  if (simulation.status === "loading") {
    observerContent = `
      <div class="training-stage" role="status" aria-live="polite">
        <span class="data-chip">Python simulation</span>
        <h2>Creating the local run</h2>
        <p>Python is freezing the reviewed configuration before the first generation is requested.</p>
      </div>
    `;
  } else if (simulation.status === "ready") {
    const snapshot = simulation.snapshot;
    const telemetry =
      snapshot.selectedCar === null
        ? `
          <div class="training-stage" role="status" aria-live="polite">
            <span class="data-chip">Run ${escapeHtml(snapshot.status)}</span>
            <h2>Generation ${String(snapshot.generation + 1)} is ready</h2>
            <p>The next explicit batch command advances one complete generation in Python.</p>
          </div>
        `
        : renderSelectedCarTelemetry(
            snapshot.selectedCar,
            `${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"} generation champion`,
            snapshot.status,
          );
    observerContent = `
      ${renderRunOverview(snapshot)}
      ${telemetry}
      ${renderFitnessChart(snapshot.fitnessHistory)}
    `;
  } else if (simulation.status === "unavailable") {
    observerContent = `
      <div class="training-stage" role="alert">
        <span class="data-chip">Local core unavailable</span>
        <h2>Telemetry could not be loaded</h2>
        <p>${escapeHtml(simulation.message)}</p>
      </div>
    `;
  } else {
    observerContent = `
      <div class="training-stage">
        <span class="data-chip">Configuration locked</span>
        <h2>Waiting for the versioned run snapshot</h2>
        <p>The selected ${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"} setup is read-only.</p>
      </div>
    `;
  }

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Training",
        "Training workspace",
        "The reviewed configuration is locked. Python owns physics, sensing, and episode evaluation.",
      )}
      ${observerContent}
      ${renderRunControls(simulation)}
    </section>
  `;
}

function renderSelectedCarTelemetry(
  telemetry: SelectedCarTelemetryV1,
  title: string,
  status: string,
): string {
  const metricValues: [string, string][] = [
    ["Speed", `${telemetry.speed.toFixed(2)} m/s`],
    ["Lateral speed", `${telemetry.lateralSpeed.toFixed(2)} m/s`],
    ["Steering", telemetry.steering.toFixed(3)],
    ["Throttle", telemetry.throttle.toFixed(3)],
    ["Brake", telemetry.brake.toFixed(3)],
    ["Progress", `${(telemetry.progress * 100).toFixed(1)}%`],
  ];
  const metrics = metricValues
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
  const sensors = telemetry.sensorDistances
    .map(
      (distance, index) => `
        <li>
          <span>Ray ${String(index + 1)}</span>
          <meter min="0" max="36" value="${String(distance)}">${distance.toFixed(1)} m</meter>
          <strong>${distance.toFixed(1)} m</strong>
        </li>
      `,
    )
    .join("");

  return `
    <section class="telemetry-panel" aria-labelledby="telemetry-title">
      <div class="telemetry-heading">
        <div>
          <p class="section-kicker">Selected car · ${escapeHtml(telemetry.selectedCarId)}</p>
          <h2 id="telemetry-title">${escapeHtml(title)}</h2>
        </div>
        <span class="data-chip">${escapeHtml(status)}</span>
      </div>
      <dl class="telemetry-metrics">${metrics}</dl>
      <div class="sensor-panel">
        <div>
          <h3>Road-edge sensors</h3>
          <p>Seven Python-derived rays · ${telemetry.simulatedSeconds.toFixed(2)} simulated seconds</p>
        </div>
        <ul>${sensors}</ul>
      </div>
      <p class="telemetry-note">
        Vehicle setup and controller parameters stayed fixed during this episode.
        Controls are observer telemetry only; there are no driving inputs.
      </p>
    </section>
  `;
}

function renderRunOverview(snapshot: ObservationSnapshotV1): string {
  const report = snapshot.generationReport;
  return `
    <section class="run-overview" aria-label="Live run status">
      <div>
        <span class="data-chip">${escapeHtml(snapshot.status)}</span>
        <p>Run ${escapeHtml(snapshot.runId.slice(0, 16))}</p>
      </div>
      <dl>
        <div><dt>Generation</dt><dd>${String(snapshot.generation)} / ${String(snapshot.totalGenerations)}</dd></div>
        <div><dt>Best fitness</dt><dd>${report === null ? "—" : report.bestFitness.toFixed(3)}</dd></div>
        <div><dt>Median fitness</dt><dd>${report === null ? "—" : report.medianFitness.toFixed(3)}</dd></div>
        <div><dt>Champion</dt><dd>${report === null ? "—" : escapeHtml(report.championId)}</dd></div>
      </dl>
    </section>
  `;
}

function renderRunControls(simulation: SimulationState): string {
  if (simulation.status !== "ready") {
    return "";
  }
  const status = simulation.snapshot.status;
  const terminal = status === "completed" || status === "stopped";
  return `
    <div class="page-actions run-controls" aria-label="Run controls">
      <div>
        <button class="button secondary" type="button" data-action="${status === "paused" ? "resume-run" : "pause-run"}" ${terminal ? "disabled" : ""}>
          ${status === "paused" ? "Resume" : "Pause"}
        </button>
        <button class="button secondary" type="button" data-action="stop-run" ${terminal ? "disabled" : ""}>
          Stop
        </button>
      </div>
      <button class="button primary" type="button" data-action="view-results" ${simulation.snapshot.result === null ? "disabled" : ""}>
        View results
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

function renderFitnessChart(
  history: ObservationSnapshotV1["fitnessHistory"],
): string {
  if (history.length === 0) {
    return `
      <section class="fitness-chart" aria-labelledby="fitness-chart-title">
        <h2 id="fitness-chart-title">Fitness history</h2>
        <p>No completed generation yet.</p>
      </section>
    `;
  }
  const values = history.flatMap((point) => [
    point.bestFitness,
    point.medianFitness,
  ]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number): number =>
    history.length === 1 ? 50 : 4 + (index / (history.length - 1)) * 92;
  const y = (value: number): number => 92 - ((value - minimum) / span) * 84;
  const best = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.bestFitness).toFixed(2)}`,
    )
    .join(" ");
  const median = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.medianFitness).toFixed(2)}`,
    )
    .join(" ");
  return `
    <section class="fitness-chart" aria-labelledby="fitness-chart-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Python generation reports</p><h2 id="fitness-chart-title">Fitness history</h2></div>
        <p><span class="legend best"></span> Best <span class="legend median"></span> Median</p>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Best and median fitness by generation" preserveAspectRatio="none">
        <polyline class="chart-line median-line" points="${median}"></polyline>
        <polyline class="chart-line best-line" points="${best}"></polyline>
      </svg>
      <p>Generation ${String(history[0]?.generation ?? 0)} to ${String(history.at(-1)?.generation ?? 0)} · range ${minimum.toFixed(2)} to ${maximum.toFixed(2)}</p>
    </section>
  `;
}

function renderResults(
  state: AppState,
  simulation: SimulationState,
  replayFrameIndex: number,
  replayTrack: CompiledTrackV1 | undefined,
): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Track";
  const result =
    simulation.status === "ready" ? simulation.snapshot.result : null;
  if (result === null) {
    return `
      <section class="page" aria-labelledby="page-title">
        ${pageHeader(
          "Experiment / Results",
          "Results",
          "A terminal Python result is required before replay and comparison.",
        )}
        <div class="empty-results">
          <span class="data-chip">No terminal result</span>
          <h2>Return to Training</h2>
          <p>${escapeHtml(trackName)} · the reviewed configuration remains locked.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-route="training">Back to Training</button>
        </div>
      </section>
    `;
  }
  if (simulation.status !== "ready") {
    return "";
  }
  const snapshot = simulation.snapshot;
  const frame =
    result.replay.frames[
      Math.min(replayFrameIndex, result.replay.frames.length - 1)
    ];
  const comparisons = result.baselineComparisons
    .map(
      (item) => `
        <tr>
          <th scope="row">${escapeHtml(item.label)}</th>
          <td>${item.fitness.toFixed(3)}</td>
          <td>${(item.progress * 100).toFixed(1)}%</td>
          <td>${item.finished ? "Finished" : escapeHtml(item.controller.replaceAll("_", " "))}</td>
        </tr>
      `,
    )
    .join("");
  const previous =
    snapshot.previousRuns.length === 0
      ? "<p>No earlier in-memory run is available for comparison.</p>"
      : `
        <table>
          <thead><tr><th>Run</th><th>Algorithm</th><th>Seed</th><th>Champion</th></tr></thead>
          <tbody>
            ${snapshot.previousRuns
              .map(
                (run) => `
                  <tr>
                    <th scope="row">${escapeHtml(run.runId.slice(0, 16))}</th>
                    <td>${escapeHtml(run.algorithm)}</td>
                    <td>${String(run.seed)}</td>
                    <td>${run.championFitness.toFixed(3)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      `;
  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Results",
        "Results",
        "Python-owned metadata, champion replay, and comparable baselines from the same track and vehicle setup.",
      )}
      <section class="result-summary" aria-labelledby="result-summary-title">
        <div>
          <p class="section-kicker">${escapeHtml(result.metadata.status)} run</p>
          <h2 id="result-summary-title">${escapeHtml(result.metadata.trackName)}</h2>
          <p>${escapeHtml(result.metadata.runId)} · ${escapeHtml(result.metadata.algorithm)} · seed ${String(result.metadata.seed)}</p>
        </div>
        <dl>
          <div><dt>Champion fitness</dt><dd>${result.champion.fitness.toFixed(3)}</dd></div>
          <div><dt>Progress</dt><dd>${(result.champion.progress * 100).toFixed(1)}%</dd></div>
          <div><dt>Generations</dt><dd>${String(result.metadata.generationsCompleted)} / ${String(result.metadata.generationsRequested)}</dd></div>
          <div><dt>Track SHA-256</dt><dd>${escapeHtml(result.metadata.trackSha256.slice(0, 12))}…</dd></div>
        </dl>
      </section>
      ${renderFitnessChart(result.fitnessHistory)}
      <section class="comparison-panel" aria-labelledby="baseline-title">
        <h2 id="baseline-title">Champion and baselines</h2>
        <table>
          <thead><tr><th>Controller</th><th>Fitness</th><th>Progress</th><th>Outcome</th></tr></thead>
          <tbody>${comparisons}</tbody>
        </table>
      </section>
      ${renderReplay(
        result.replay.frames,
        frame,
        replayFrameIndex,
        result.replay.vehicleSetup.frontDriveBias,
        result.replay.vehicleSetup.frontBrakeBias,
        replayTrack,
      )}
      <section class="comparison-panel" aria-labelledby="run-comparison-title">
        <h2 id="run-comparison-title">Previous runs this session</h2>
        ${previous}
      </section>
      <div class="page-actions">
        <button class="button primary" type="button" data-action="new-setup">
          Create another setup
        </button>
      </div>
    </section>
  `;
}

function renderReplay(
  frames: ReplayFrameV1[],
  frame: ReplayFrameV1 | undefined,
  replayFrameIndex: number,
  frontDriveBias: number,
  frontBrakeBias: number,
  replayTrack: CompiledTrackV1 | undefined,
): string {
  if (frame === undefined) {
    return `
      <section class="replay-panel" aria-labelledby="replay-title">
        <h2 id="replay-title">Champion replay</h2>
        <p>No replay frames were produced.</p>
      </section>
    `;
  }
  return `
    <section class="replay-panel" aria-labelledby="replay-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Recorded Python motion and controls</p><h2 id="replay-title">Champion replay</h2></div>
        <span class="data-chip">Frame ${String(replayFrameIndex + 1)} / ${String(frames.length)}</span>
      </div>
      <div class="replay-stage" role="img" aria-label="Champion position and heading at ${frame.simulatedSeconds.toFixed(2)} simulated seconds">
        ${
          replayTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : renderTrackSvg(replayTrack, frame)
        }
        <p>x ${frame.x.toFixed(2)} · y ${frame.y.toFixed(2)} · ${(frame.progress * 100).toFixed(1)}%</p>
      </div>
      <dl class="telemetry-metrics">
        <div><dt>Steering</dt><dd>${frame.steering.toFixed(3)}</dd></div>
        <div><dt>Throttle</dt><dd>${frame.throttle.toFixed(3)}</dd></div>
        <div><dt>Brake</dt><dd>${frame.brake.toFixed(3)}</dd></div>
        <div><dt>Front drive bias</dt><dd>${frontDriveBias.toFixed(3)}</dd></div>
        <div><dt>Front brake bias</dt><dd>${frontBrakeBias.toFixed(3)}</dd></div>
        <div><dt>Simulated time</dt><dd>${frame.simulatedSeconds.toFixed(2)} s</dd></div>
      </dl>
      <div class="replay-controls">
        <button class="button secondary" type="button" data-action="replay-restart">Restart</button>
        <button class="button secondary" type="button" data-action="replay-previous" ${replayFrameIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="button secondary" type="button" data-action="replay-next" ${replayFrameIndex >= frames.length - 1 ? "disabled" : ""}>Next</button>
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
  startSession: () => Promise<void>,
  controlSession: (command: "pause" | "resume" | "stop") => Promise<void>,
  moveReplay: (action: "previous" | "next" | "restart") => void,
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
          void startSession();
          break;
        case "pause-run":
          void controlSession("pause");
          break;
        case "resume-run":
          void controlSession("resume");
          break;
        case "stop-run":
          void controlSession("stop");
          break;
        case "view-results":
          dispatch({ type: "view-results" });
          break;
        case "new-setup":
          dispatch({ type: "new-setup" });
          break;
        case "replay-restart":
          moveReplay("restart");
          break;
        case "replay-previous":
          moveReplay("previous");
          break;
        case "replay-next":
          moveReplay("next");
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
