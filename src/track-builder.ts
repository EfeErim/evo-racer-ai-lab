import { escapeHtml } from "./html";
import {
  renderTrackSvg,
  trackLengthMeters,
  type CompiledTrackV1,
  type TrackV1,
} from "./track-renderer";
import {
  SEGMENT_DEFINITIONS,
  createEditorState,
  segmentDefinition,
  type EditorState,
  type GeneratedTrackFeatures,
  type TrackLibraryResponse,
} from "./track-workbench";

export type TrackBuilderTab = "build" | "generate" | "library";
export type TrackBuilderPending =
  "validate" | "assist" | "generate" | "save" | "delete" | "import" | null;

export interface TrackBuilderIssue {
  code: string;
  field: string;
  message: string;
}

export type EditorValidationState =
  | { status: "unchecked"; errors: TrackBuilderIssue[] }
  | { status: "checking"; errors: TrackBuilderIssue[] }
  | { status: "valid"; errors: TrackBuilderIssue[] }
  | { status: "invalid"; errors: TrackBuilderIssue[] };

export interface TrackBuilderNotice {
  tone: "neutral" | "info" | "success" | "warning" | "error";
  message: string;
}

export interface TrackGeneratorDraft {
  seed: number;
  length: "short" | "medium" | "long";
  difficulty: "easy" | "technical" | "hard";
}

export interface TrackWorkspaceState {
  editor: EditorState;
  editorPreview?: CompiledTrackV1;
  generatedInputs?: TrackGeneratorDraft;
  generatedFeatures?: GeneratedTrackFeatures;
  generatedPreview?: CompiledTrackV1;
  selected?: CompiledTrackV1;
  selectedSeed?: number;
  library: TrackLibraryResponse | null;
  libraryStatus: "loading" | "ready" | "unavailable";
  libraryMessage?: string;
  toolsOpen: boolean;
  tab: TrackBuilderTab;
  pending: TrackBuilderPending;
  editorValidation: EditorValidationState;
  notice: TrackBuilderNotice;
  generator: TrackGeneratorDraft;
}

export function createTrackWorkspaceState(
  trackId: string,
): TrackWorkspaceState {
  return {
    editor: createEditorState(trackId),
    library: null,
    libraryStatus: "loading",
    toolsOpen: false,
    tab: "build",
    pending: null,
    editorValidation: { status: "unchecked", errors: [] },
    notice: {
      tone: "neutral",
      message: "Choose a tool to build, generate, or reuse a track.",
    },
    generator: { seed: 42, length: "medium", difficulty: "technical" },
  };
}

/**
 * Keep the builder's "active" track equal to the track the setup draft will
 * send at Start. When the draft falls back to a preset (New setup, the
 * recommended experiment, or a preset card), the builder must stop calling
 * its earlier custom track active.
 */
export function syncSelectedTrack(
  workspace: TrackWorkspaceState,
  draftTrack: TrackV1 | null,
): TrackWorkspaceState {
  if (workspace.selected === undefined) {
    return workspace;
  }
  if (
    draftTrack !== null &&
    JSON.stringify(draftTrack) === JSON.stringify(workspace.selected.track)
  ) {
    return workspace;
  }
  return { ...workspace, selected: undefined, selectedSeed: undefined };
}

function sameTrack(
  first: CompiledTrackV1 | undefined,
  second: CompiledTrackV1 | undefined,
): boolean {
  return (
    first !== undefined &&
    second !== undefined &&
    JSON.stringify(first.track) === JSON.stringify(second.track)
  );
}

export function renderTrackBuilder(workspace: TrackWorkspaceState): string {
  if (!workspace.toolsOpen) {
    return `
      <section class="track-builder-launcher" aria-labelledby="track-builder-launcher-title">
        <div>
          <h2 id="track-builder-launcher-title">Track Builder <span class="chip">Optional</span></h2>
          <p>Build a track piece by piece, generate one from a seed, or open a saved file.</p>
        </div>
        <button class="button secondary" type="button" data-track-action="open-builder">
          Open Track Builder <span aria-hidden="true">→</span>
        </button>
      </section>
    `;
  }

  return `
    <section class="track-builder" data-testid="track-builder" aria-labelledby="track-builder-title">
      <header class="track-builder-header">
        <h2 id="track-builder-title" tabindex="-1">Track Builder</h2>
        <button class="tool-button icon-button" type="button" data-track-action="close-builder" aria-label="Close Track Builder">×</button>
      </header>

      <div class="track-builder-tabs" role="tablist" aria-label="Track Builder tools">
        ${renderTabButton("build", "Editor", editorTabStatus(workspace), workspace.tab)}
        ${renderTabButton("generate", "Generate", generateTabStatus(workspace), workspace.tab)}
        ${renderTabButton("library", "Library", libraryTabStatus(workspace), workspace.tab)}
      </div>

      <div class="track-builder-body">
        ${workspace.tab === "build" ? renderBuildTab(workspace) : renderInactiveTabPanel("build")}
        ${workspace.tab === "generate" ? renderGenerateTab(workspace) : renderInactiveTabPanel("generate")}
        ${workspace.tab === "library" ? renderLibraryTab(workspace) : renderInactiveTabPanel("library")}
      </div>

      <footer class="track-builder-notice is-${workspace.notice.tone}" data-track-builder-notice role="${workspace.notice.tone === "error" ? "alert" : "status"}" aria-live="${workspace.notice.tone === "error" ? "assertive" : "polite"}">
        <span data-track-builder-notice-message>${escapeHtml(workspace.notice.message)}</span>
      </footer>
    </section>
  `;
}

function editorTabStatus(workspace: TrackWorkspaceState): string {
  if (sameTrack(workspace.editorPreview, workspace.selected)) {
    return "Active track";
  }
  return validationPresentation(workspace.editorValidation.status).label;
}

function generateTabStatus(workspace: TrackWorkspaceState): string {
  if (workspace.pending === "generate") {
    return "Generating…";
  }
  if (workspace.generatedPreview === undefined) {
    return "No candidate yet";
  }
  return sameTrack(workspace.generatedPreview, workspace.selected)
    ? "Active track"
    : "Candidate ready";
}

function libraryTabStatus(workspace: TrackWorkspaceState): string {
  if (workspace.libraryStatus === "unavailable") {
    return "No response yet";
  }
  if (workspace.libraryStatus === "loading" || workspace.library === null) {
    return "Loading…";
  }
  const count = workspace.library.tracks.length;
  return `${String(count)} saved`;
}

function renderInactiveTabPanel(tab: TrackBuilderTab): string {
  return `<div role="tabpanel" id="track-builder-panel-${tab}" aria-labelledby="track-builder-tab-${tab}" hidden></div>`;
}

function renderTabButton(
  tab: TrackBuilderTab,
  label: string,
  status: string,
  active: TrackBuilderTab,
): string {
  const selected = active === tab;
  return `
    <button
      type="button"
      role="tab"
      id="track-builder-tab-${tab}"
      aria-controls="track-builder-panel-${tab}"
      aria-selected="${String(selected)}"
      tabindex="${selected ? "0" : "-1"}"
      class="${selected ? "is-active" : ""}"
      data-track-action="builder-tab"
      data-builder-tab="${tab}"
    >
      <strong>${label}</strong>
      <span>${escapeHtml(status)}</span>
    </button>
  `;
}

function renderBuildTab(workspace: TrackWorkspaceState): string {
  const editor = workspace.editor.present;
  const preview = workspace.editorPreview;
  const valid =
    workspace.editorValidation.status === "valid" && preview !== undefined;
  const busy = workspace.pending !== null;
  const selectedMatches = sameTrack(preview, workspace.selected);
  const status = validationPresentation(workspace.editorValidation.status);
  const issues = renderIssues(workspace.editorValidation.errors);
  const sequence = `${editor.pieces
    .map((piece, index) =>
      index === 0
        ? renderSequencePiece(piece.kind, index, editor.pieces.length, busy)
        : `${renderSequenceDropZone(index)}${renderSequencePiece(piece.kind, index, editor.pieces.length, busy)}`,
    )
    .join("")}${renderSequenceDropZone(editor.pieces.length)}`;
  const pieceTray = SEGMENT_DEFINITIONS.filter(
    (definition) => definition.kind !== "start-finish",
  )
    .map(
      (definition) => `
        <button
          type="button"
          class="segment-palette-button"
          data-track-action="editor-add"
          data-segment-kind="${definition.kind}"
          data-editor-drag-kind="${definition.kind}"
          draggable="${String(!busy)}"
          title="${escapeHtml(`${definition.group}: ${definition.description}`)}"
          aria-describedby="builder-drag-help"
          ${busy ? "disabled" : ""}
        >
          <span aria-hidden="true">${definition.symbol}</span>
          <strong>${definition.label}</strong>
        </button>
      `,
    )
    .join("");

  return `
    <div class="builder-layout" role="tabpanel" id="track-builder-panel-build" aria-labelledby="track-builder-tab-build">
      <section class="builder-preview-panel" aria-labelledby="builder-preview-title">
        <header class="builder-panel-heading">
          <h3 id="builder-preview-title">${escapeHtml(editor.name.trim() || "Untitled track")}</h3>
          <span class="validation-badge is-${status.tone}"><span aria-hidden="true">${status.glyph}</span> ${status.label}</span>
        </header>
        <div class="builder-canvas ${preview === undefined ? "is-empty" : ""}">
          ${
            preview === undefined
              ? `<div class="builder-canvas-empty" aria-live="polite"><strong>No preview yet</strong><p>Edit the pieces, or use Close the loop.</p></div>`
              : renderTrackSvg(preview)
          }
        </div>
        <dl class="fact-grid">
          <div><dt>Pieces</dt><dd>${String(editor.pieces.length)}</dd></div>
          <div><dt>Road width</dt><dd>${formatNumber(editor.roadWidth)} m</dd></div>
          <div><dt>Length</dt><dd>${preview === undefined ? "Not measured" : `${String(Math.round(trackLengthMeters(preview)))} m`}</dd></div>
        </dl>
        ${issues}
        <div class="builder-primary-actions">
          ${
            selectedMatches
              ? renderActiveCallout()
              : `<button class="button primary" type="button" data-track-action="use-editor" ${!valid || busy ? "disabled" : ""}>Use this track</button>`
          }
          <button class="button secondary" type="button" data-track-action="save-editor" ${!valid || busy ? "disabled" : ""}>${workspace.pending === "save" ? "Saving…" : "Save locally"}</button>
          <button class="button secondary" type="button" data-track-action="export-editor" ${!valid || busy ? "disabled" : ""}>Export file</button>
        </div>
      </section>

      <section class="builder-editor-panel" aria-labelledby="builder-editor-title">
        <header class="builder-panel-heading">
          <h3 id="builder-editor-title">Track pieces</h3>
          <span class="chip">${String(editor.pieces.length)} pieces</span>
        </header>
        <div class="builder-fields">
          <div class="field">
            <label for="editor-name">Track name</label>
            <input id="editor-name" data-editor-name maxlength="80" value="${escapeHtml(editor.name)}" ${busy ? "disabled" : ""} />
          </div>
          <div class="field">
            <label for="editor-width">Road width</label>
            <div class="range-field">
              <input id="editor-width" data-editor-width type="range" min="8" max="20" step="0.5" value="${String(editor.roadWidth)}" ${busy ? "disabled" : ""} />
              <output>${formatNumber(editor.roadWidth)} m</output>
            </div>
          </div>
        </div>
        <div class="editor-toolbar" role="group" aria-label="Edit history and closure tools">
          <button class="button secondary compact" type="button" data-track-action="editor-undo" ${workspace.editor.past.length === 0 || busy ? "disabled" : ""}><span aria-hidden="true">↶</span> Undo</button>
          <button class="button secondary compact" type="button" data-track-action="editor-redo" ${workspace.editor.future.length === 0 || busy ? "disabled" : ""}><span aria-hidden="true">↷</span> Redo</button>
          <button class="button secondary compact" type="button" data-track-action="editor-reset" ${busy ? "disabled" : ""}>Reset</button>
          <button class="button secondary compact assist-button" type="button" data-track-action="editor-assist" ${busy ? "disabled" : ""}>${workspace.pending === "assist" ? "Closing…" : "Close the loop"}</button>
        </div>
        <div class="assembly-workspace">
          <section class="piece-tray-panel" aria-labelledby="piece-tray-title">
            <h4 id="piece-tray-title">Piece tray</h4>
            <div class="segment-palette" aria-label="Track piece tray">${pieceTray}</div>
            <p class="field-help" id="builder-drag-help">Drag a piece into a connector, or click it to add it at the end.</p>
          </section>
          <section class="connected-pieces-panel" aria-labelledby="connected-pieces-title">
            <h4 id="connected-pieces-title">Connected pieces</h4>
            <ol class="builder-sequence" aria-label="Connected track pieces">${sequence}</ol>
            <p class="field-help">Start / finish stays first. The track is checked after every change.</p>
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderActiveCallout(): string {
  return `
    <div class="active-track-callout" role="status">
      <span class="status-glyph is-success" aria-hidden="true">✓</span>
      <div>
        <strong>Active for this race</strong>
        <p>This exact track will be used.</p>
      </div>
    </div>
  `;
}

function renderSequencePiece(
  kind: string,
  index: number,
  total: number,
  busy: boolean,
): string {
  const definition = segmentDefinition(kind);
  const label = definition?.label ?? kind;
  const symbol = definition?.symbol ?? "?";
  const locked = kind === "start-finish";
  return `
    <li class="sequence-piece ${locked ? "is-locked" : ""}" data-editor-drag-index="${String(index)}" draggable="${String(!busy && !locked)}">
      <span class="sequence-index">${String(index + 1)}</span>
      <span class="sequence-symbol" aria-hidden="true">${symbol}</span>
      <strong class="sequence-label">${escapeHtml(label)}</strong>
      <span class="sequence-actions">
        <button type="button" data-track-action="editor-move" data-piece-index="${String(index)}" data-direction="-1" aria-label="Move ${escapeHtml(label)} up" ${busy || locked || index <= 1 ? "disabled" : ""}>↑</button>
        <button type="button" data-track-action="editor-move" data-piece-index="${String(index)}" data-direction="1" aria-label="Move ${escapeHtml(label)} down" ${busy || locked || index === total - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-track-action="editor-duplicate" data-piece-index="${String(index)}" aria-label="Duplicate ${escapeHtml(label)}" ${busy || locked ? "disabled" : ""}>＋</button>
        <button class="is-danger" type="button" data-track-action="editor-delete" data-piece-index="${String(index)}" aria-label="Delete ${escapeHtml(label)}" ${busy || locked ? "disabled" : ""}>×</button>
      </span>
    </li>
  `;
}

function renderSequenceDropZone(insertionIndex: number): string {
  return `
    <li class="sequence-drop-zone" data-track-drop-index="${String(insertionIndex)}" role="presentation" aria-hidden="true">
      <span>Snap here</span>
    </li>
  `;
}

function renderGenerateTab(workspace: TrackWorkspaceState): string {
  const generated = workspace.generatedPreview;
  const generatedInputs = workspace.generatedInputs ?? workspace.generator;
  const inputsChanged = generatorInputsChanged(workspace);
  const busy = workspace.pending !== null;
  const selectedMatches = sameTrack(generated, workspace.selected);
  const generatedStatus =
    generated === undefined
      ? ""
      : inputsChanged
        ? '<span class="validation-badge is-warning"><span aria-hidden="true">!</span> Inputs changed</span>'
        : selectedMatches
          ? '<span class="validation-badge is-success"><span aria-hidden="true">✓</span> Active track</span>'
          : '<span class="validation-badge is-info"><span aria-hidden="true">○</span> Candidate, not active</span>';
  return `
    <div class="builder-layout builder-layout-generator" role="tabpanel" id="track-builder-panel-generate" aria-labelledby="track-builder-tab-generate">
      <section class="generator-controls" aria-labelledby="generator-title">
        <h3 id="generator-title">Generate from a seed</h3>
        <p class="field-help">The same seed, length, and difficulty always give the same track.</p>
        <div class="generator-form">
          <div class="field">
            <label for="generator-seed">Seed</label>
            <input id="generator-seed" data-generator-seed type="number" min="0" max="2147483647" step="1" value="${String(workspace.generator.seed)}" ${busy ? "disabled" : ""} />
          </div>
          <fieldset>
            <legend>Length</legend>
            ${renderGeneratorChoices(
              "length",
              [
                ["short", "Short", "12 pieces"],
                ["medium", "Medium", "18 pieces"],
                ["long", "Long", "24 pieces"],
              ],
              workspace.generator.length,
              busy,
            )}
          </fieldset>
          <fieldset>
            <legend>Difficulty</legend>
            ${renderGeneratorChoices(
              "difficulty",
              [
                ["easy", "Easy", "12 m wide"],
                ["technical", "Technical", "10 m wide"],
                ["hard", "Hard", "8.5 m wide"],
              ],
              workspace.generator.difficulty,
              busy,
            )}
          </fieldset>
        </div>
        <button class="button ${generated === undefined ? "primary" : "secondary"} generator-submit" type="button" data-track-action="generate" ${busy ? "disabled" : ""}>${workspace.pending === "generate" ? "Generating…" : "Generate track"}</button>
      </section>
      <section class="builder-preview-panel generated-preview" aria-labelledby="generated-preview-title">
        <header class="builder-panel-heading">
          <h3 id="generated-preview-title">${generated === undefined ? "No candidate yet" : escapeHtml(generated.track.name)}</h3>
          ${generatedStatus}
        </header>
        <div class="builder-canvas ${generated === undefined ? "is-empty" : ""}">
          ${generated === undefined ? '<div class="builder-canvas-empty"><strong>Nothing generated yet</strong><p>Choose a seed and press Generate track. Your active track will not change.</p></div>' : renderTrackSvg(generated)}
        </div>
        ${
          generated === undefined
            ? ""
            : `<dl class="fact-grid generated-stats"><div><dt>Seed</dt><dd>${String(generatedInputs.seed)}</dd></div><div><dt>Pieces</dt><dd>${String(generated.track.pieces.length)}</dd></div><div><dt>Length</dt><dd>${String(Math.round(trackLengthMeters(generated)))} m</dd></div><div><dt>Road width</dt><dd>${formatNumber(generated.track.roadWidth)} m</dd></div></dl>
               ${renderGeneratedFeatureSummary(workspace.generatedFeatures)}
               <div class="builder-primary-actions">
                 ${selectedMatches ? renderActiveCallout() : `<button class="button primary" type="button" data-track-action="use-generated" ${busy ? "disabled" : ""}>Use this track</button>`}
                 <button class="button secondary" type="button" data-track-action="regenerate" ${busy ? "disabled" : ""}>${workspace.pending === "generate" ? "Generating…" : `Regenerate seed ${String(generatedInputs.seed)}`}</button>
                 <button class="button secondary" type="button" data-track-action="edit-generated" ${busy ? "disabled" : ""}>Edit pieces</button>
                 <button class="button secondary" type="button" data-track-action="save-generated" ${busy ? "disabled" : ""}>${workspace.pending === "save" ? "Saving…" : "Save locally"}</button>
                 <button class="button secondary" type="button" data-track-action="export-generated" ${busy ? "disabled" : ""}>Export file</button>
               </div>`
        }
      </section>
    </div>
  `;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function renderGeneratedFeatureSummary(
  features: GeneratedTrackFeatures | undefined,
): string {
  if (features === undefined) {
    return "";
  }
  const details = [
    features.layout === "asymmetric" ? "Asymmetric" : "Balanced",
    plural(features.straightCount, "straight"),
    plural(features.cornerCount, "corner"),
    plural(features.chicaneCount, "chicane"),
    plural(features.hairpinCount, "hairpin"),
    plural(features.directionChanges, "direction change"),
  ];
  return `<p class="generated-feature-summary">${details.join(" · ")}</p>`;
}

export function generatorInputsChanged(
  workspace: TrackWorkspaceState,
): boolean {
  return (
    workspace.generatedPreview !== undefined &&
    workspace.generatedInputs !== undefined &&
    (workspace.generator.seed !== workspace.generatedInputs.seed ||
      workspace.generator.length !== workspace.generatedInputs.length ||
      workspace.generator.difficulty !== workspace.generatedInputs.difficulty)
  );
}

function renderGeneratorChoices(
  name: "length" | "difficulty",
  choices: readonly (readonly [string, string, string])[],
  selected: string,
  disabled: boolean,
): string {
  return `<div class="generator-choice-grid">${choices
    .map(
      ([value, label, detail]) => `
        <label class="generator-choice ${selected === value ? "is-selected" : ""}">
          <input type="radio" name="generator-${name}" value="${value}" ${selected === value ? "checked" : ""} ${disabled ? "disabled" : ""} />
          <strong>${label}</strong><small>${detail}</small>
        </label>
      `,
    )
    .join("")}</div>`;
}

function renderLibraryTab(workspace: TrackWorkspaceState): string {
  const busy = workspace.pending !== null;
  const isolated = workspace.library?.isolated.length ?? 0;
  const cards =
    workspace.libraryStatus === "unavailable"
      ? `<div class="library-empty" role="alert"><strong>Local track library unavailable</strong><p>${escapeHtml(workspace.libraryMessage ?? "No response yet from the local track library.")}</p><button class="button secondary compact" type="button" data-track-action="refresh-library" ${busy ? "disabled" : ""}>Retry local library</button></div>`
      : workspace.libraryStatus === "loading" || workspace.library === null
        ? '<div class="library-empty"><strong>Loading local library…</strong></div>'
        : workspace.library.tracks.length === 0
          ? '<div class="library-empty"><strong>No saved tracks yet</strong><p>Save a built or generated track, or import a track file.</p></div>'
          : `<div class="track-library-grid">${workspace.library.tracks
              .map((compiled) => renderLibraryCard(compiled, workspace, busy))
              .join("")}</div>`;
  return `
    <div class="builder-library" role="tabpanel" id="track-builder-panel-library" aria-labelledby="track-builder-tab-library">
      <section class="track-import-panel" aria-labelledby="track-import-title">
        <div><h3 id="track-import-title">Import a track file</h3><p class="field-help">The file is checked before it opens in the Editor. It does not become active by itself.</p></div>
        <label class="button secondary file-button">${workspace.pending === "import" ? "Importing…" : "Choose JSON file"}<input type="file" accept="application/json,.json" data-track-import ${busy ? "disabled" : ""} /></label>
      </section>
      ${isolated > 0 ? `<p class="notice is-warning"><strong>${plural(isolated, "damaged record")} set aside.</strong> Valid tracks remain available.</p>` : ""}
      ${cards}
    </div>
  `;
}

function renderLibraryCard(
  compiled: CompiledTrackV1,
  workspace: TrackWorkspaceState,
  busy: boolean,
): string {
  const selected = sameTrack(workspace.selected, compiled);
  return `
    <article class="track-library-card ${selected ? "is-selected" : ""}">
      <div class="library-card-preview">${renderTrackSvg(compiled)}</div>
      <div class="library-card-copy">
        <h3>${escapeHtml(compiled.track.name)}</h3>
        <p>${selected ? '<span aria-hidden="true">✓ </span>Active track · ' : ""}${String(compiled.track.pieces.length)} pieces · ${String(Math.round(trackLengthMeters(compiled)))} m</p>
      </div>
      <div class="library-card-actions">
        <button class="button primary compact" type="button" data-track-action="use-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy || selected ? "disabled" : ""}>${selected ? "Active" : "Use this track"}</button>
        <button class="button secondary compact" type="button" data-track-action="edit-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Edit</button>
        <button class="button secondary compact" type="button" data-track-action="export-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Export</button>
        <button class="button danger compact" type="button" data-track-action="delete-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Delete</button>
      </div>
    </article>
  `;
}

function renderIssues(issues: readonly TrackBuilderIssue[]): string {
  if (issues.length === 0) {
    return "";
  }
  return `
    <div class="builder-issues" role="alert">
      <strong>${issues.length === 1 ? "1 issue needs attention" : `${String(issues.length)} issues need attention`}</strong>
      <ul>${issues
        .map(
          (issue) =>
            `<li><span>${escapeHtml(issue.message)}</span><code>${escapeHtml(issue.code)}</code></li>`,
        )
        .join("")}</ul>
    </div>
  `;
}

function validationPresentation(status: EditorValidationState["status"]): {
  label: string;
  tone: string;
  glyph: string;
} {
  switch (status) {
    case "checking":
      return { label: "Checking…", tone: "info", glyph: "…" };
    case "valid":
      return { label: "Valid", tone: "success", glyph: "✓" };
    case "invalid":
      return { label: "Needs changes", tone: "warning", glyph: "!" };
    case "unchecked":
      return { label: "Not checked", tone: "neutral", glyph: "○" };
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
