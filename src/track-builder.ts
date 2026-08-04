import { renderTrackSvg, type CompiledTrackV1 } from "./track-renderer";
import {
  SEGMENT_DEFINITIONS,
  createEditorState,
  segmentDefinition,
  type EditorState,
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
  generatedPreview?: CompiledTrackV1;
  selected?: CompiledTrackV1;
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
      message:
        "Open Track Builder to create, generate, import, or reuse a track.",
    },
    generator: { seed: 42, length: "medium", difficulty: "technical" },
  };
}

export function renderTrackBuilder(
  workspace: TrackWorkspaceState,
  customTrackSelected: boolean,
): string {
  const selected = renderSelectedTrack(workspace, customTrackSelected);
  if (!workspace.toolsOpen) {
    return `
      ${selected}
      <section class="track-builder-launcher" aria-labelledby="track-builder-launcher-title">
        <div class="track-builder-launcher-icon" aria-hidden="true">＋</div>
        <div>
          <p class="section-kicker">Create your own</p>
          <h2 id="track-builder-launcher-title">Track Builder</h2>
          <p>Build a piece-by-piece circuit, generate one from a seed, or open a local TrackV1 file.</p>
        </div>
        <button class="button secondary" type="button" data-track-action="open-builder">
          Open Track Builder <span aria-hidden="true">→</span>
        </button>
      </section>
    `;
  }

  return `
    ${selected}
    <section class="track-builder" data-testid="track-builder" aria-labelledby="track-builder-title">
      <header class="track-builder-header">
        <div>
          <p class="section-kicker">Local design workspace</p>
          <h2 id="track-builder-title" tabindex="-1">Track Builder</h2>
          <p>Geometry and safety checks run in the local Python core. The browser edits only canonical pieces.</p>
        </div>
        <button class="icon-button" type="button" data-track-action="close-builder" aria-label="Close Track Builder">×</button>
      </header>

      <div class="track-builder-tabs" role="tablist" aria-label="Track Builder tools">
        ${renderTabButton("build", "Build", "Piece editor", workspace.tab)}
        ${renderTabButton("generate", "Generate", "Seeded layouts", workspace.tab)}
        ${renderTabButton("library", "Library", "Saved & imported", workspace.tab)}
      </div>

      <div class="track-builder-body">
        ${workspace.tab === "build" ? renderBuildTab(workspace) : renderInactiveTabPanel("build")}
        ${workspace.tab === "generate" ? renderGenerateTab(workspace) : renderInactiveTabPanel("generate")}
        ${workspace.tab === "library" ? renderLibraryTab(workspace) : renderInactiveTabPanel("library")}
      </div>

      <footer class="track-builder-notice is-${workspace.notice.tone}" data-track-builder-notice role="${workspace.notice.tone === "error" ? "alert" : "status"}" aria-live="${workspace.notice.tone === "error" ? "assertive" : "polite"}">
        <span class="notice-dot" aria-hidden="true"></span>
        <span data-track-builder-notice-message>${escapeHtml(workspace.notice.message)}</span>
      </footer>
    </section>
  `;
}

function renderInactiveTabPanel(tab: TrackBuilderTab): string {
  return `<div role="tabpanel" id="track-builder-panel-${tab}" aria-labelledby="track-builder-tab-${tab}" hidden></div>`;
}

function renderSelectedTrack(
  workspace: TrackWorkspaceState,
  customTrackSelected: boolean,
): string {
  if (!customTrackSelected || workspace.selected === undefined) {
    return "";
  }
  const selected = workspace.selected;
  return `
    <section class="selected-custom-track" aria-label="Selected custom track">
      <div class="selected-custom-preview">${renderTrackSvg(selected)}</div>
      <div>
        <p class="section-kicker">Selected for this experiment</p>
        <h2>${escapeHtml(selected.track.name)}</h2>
        <p>${String(selected.track.pieces.length)} pieces · ${formatNumber(selected.track.roadWidth)} m road width · Python verified</p>
      </div>
      <button class="button secondary" type="button" data-track-action="open-selected-builder">Edit or manage</button>
    </section>
  `;
}

function renderTabButton(
  tab: TrackBuilderTab,
  label: string,
  description: string,
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
      <span>${description}</span>
    </button>
  `;
}

function renderBuildTab(workspace: TrackWorkspaceState): string {
  const editor = workspace.editor.present;
  const preview = workspace.editorPreview;
  const valid =
    workspace.editorValidation.status === "valid" && preview !== undefined;
  const busy = workspace.pending !== null;
  const selectedMatches =
    preview !== undefined &&
    workspace.selected !== undefined &&
    JSON.stringify(preview.track) === JSON.stringify(workspace.selected.track);
  const status = validationPresentation(workspace.editorValidation.status);
  const issues = renderIssues(workspace.editorValidation.errors);
  const sequence = editor.pieces
    .map((piece, index) =>
      renderSequencePiece(piece.kind, index, editor.pieces.length, busy),
    )
    .join("");
  const groups = (["Straight", "Corner", "Technical"] as const)
    .map((group) => {
      const buttons = SEGMENT_DEFINITIONS.filter(
        (definition) =>
          definition.group === group && definition.kind !== "start-finish",
      )
        .map(
          (definition) => `
            <button
              type="button"
              class="segment-palette-button"
              data-track-action="editor-add"
              data-segment-kind="${definition.kind}"
              title="${escapeHtml(definition.description)}"
              ${busy ? "disabled" : ""}
            >
              <span aria-hidden="true">${definition.symbol}</span>
              <strong>${definition.label}</strong>
            </button>
          `,
        )
        .join("");
      return `
        <section class="segment-palette-group" aria-labelledby="palette-${group.toLowerCase()}">
          <h4 id="palette-${group.toLowerCase()}">${group}</h4>
          <div>${buttons}</div>
        </section>
      `;
    })
    .join("");

  return `
    <div class="builder-layout builder-layout-editor" role="tabpanel" id="track-builder-panel-build" aria-labelledby="track-builder-tab-build">
      <section class="builder-preview-panel" aria-labelledby="builder-preview-title">
        <header class="builder-panel-heading">
          <div>
            <p class="section-kicker">Python-compiled preview</p>
            <h3 id="builder-preview-title">${escapeHtml(editor.name.trim() || "Untitled track")}</h3>
          </div>
          <span class="validation-badge is-${status.tone}">${status.label}</span>
        </header>
        <div class="builder-canvas ${preview === undefined ? "is-empty" : ""}">
          ${
            preview === undefined
              ? `<div class="builder-canvas-empty" aria-live="polite"><span aria-hidden="true">⌁</span><strong>No valid geometry yet</strong><p>Edit the sequence or ask Python to close the loop.</p></div>`
              : renderTrackSvg(preview)
          }
        </div>
        <dl class="builder-stats">
          <div><dt>Pieces</dt><dd>${String(editor.pieces.length)}</dd></div>
          <div><dt>Road width</dt><dd>${formatNumber(editor.roadWidth)} m</dd></div>
          <div><dt>Authority</dt><dd>Python core</dd></div>
        </dl>
        ${issues}
        <div class="builder-primary-actions">
          <button class="button primary" type="button" data-track-action="use-editor" ${!valid || busy || selectedMatches ? "disabled" : ""}>
            ${selectedMatches ? "Selected for experiment" : "Use this track"}
          </button>
          <button class="button secondary" type="button" data-track-action="save-editor" ${!valid || busy ? "disabled" : ""}>${workspace.pending === "save" ? "Saving…" : "Save locally"}</button>
          <button class="button ghost" type="button" data-track-action="export-editor" ${!valid || busy ? "disabled" : ""}>Export JSON</button>
        </div>
      </section>

      <section class="builder-editor-panel" aria-labelledby="builder-editor-title">
        <header class="builder-panel-heading">
          <div>
            <p class="section-kicker">Canonical TrackV1 draft</p>
            <h3 id="builder-editor-title">Circuit sequence</h3>
          </div>
          <span class="piece-count">${String(editor.pieces.length)} pieces</span>
        </header>
        <div class="builder-fields">
          <label>Track name <input data-editor-name maxlength="80" value="${escapeHtml(editor.name)}" ${busy ? "disabled" : ""} /></label>
          <label>Road width <span><input data-editor-width type="range" min="8" max="20" step="0.5" value="${String(editor.roadWidth)}" ${busy ? "disabled" : ""} /><output>${formatNumber(editor.roadWidth)} m</output></span></label>
        </div>
        <div class="editor-toolbar" aria-label="Edit history and closure tools">
          <button type="button" data-track-action="editor-undo" ${workspace.editor.past.length === 0 || busy ? "disabled" : ""}>↶ Undo</button>
          <button type="button" data-track-action="editor-redo" ${workspace.editor.future.length === 0 || busy ? "disabled" : ""}>↷ Redo</button>
          <button type="button" data-track-action="editor-reset" ${busy ? "disabled" : ""}>Reset</button>
          <button class="assist-button" type="button" data-track-action="editor-assist" ${busy ? "disabled" : ""}>${workspace.pending === "assist" ? "Closing…" : "Assist closure"}</button>
        </div>
        <div class="segment-palette" aria-label="Add a track piece">${groups}</div>
        <div class="sequence-heading"><h4>Piece order</h4><span>Start / finish stays locked at 01</span></div>
        <ol class="builder-sequence">${sequence}</ol>
      </section>
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
    <li>
      <span class="sequence-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="sequence-symbol" aria-hidden="true">${symbol}</span>
      <span class="sequence-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(kind)}</small></span>
      <span class="sequence-actions">
        <button type="button" data-track-action="editor-move" data-piece-index="${String(index)}" data-direction="-1" aria-label="Move ${escapeHtml(label)} up" ${busy || locked || index <= 1 ? "disabled" : ""}>↑</button>
        <button type="button" data-track-action="editor-move" data-piece-index="${String(index)}" data-direction="1" aria-label="Move ${escapeHtml(label)} down" ${busy || locked || index === total - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-track-action="editor-duplicate" data-piece-index="${String(index)}" aria-label="Duplicate ${escapeHtml(label)}" ${busy || locked ? "disabled" : ""}>＋</button>
        <button class="danger" type="button" data-track-action="editor-delete" data-piece-index="${String(index)}" aria-label="Delete ${escapeHtml(label)}" ${busy || locked ? "disabled" : ""}>×</button>
      </span>
    </li>
  `;
}

function renderGenerateTab(workspace: TrackWorkspaceState): string {
  const generated = workspace.generatedPreview;
  const generatedInputs = workspace.generatedInputs ?? workspace.generator;
  const inputsChanged = generatorInputsChanged(workspace);
  const busy = workspace.pending !== null;
  const selectedMatches =
    generated !== undefined &&
    workspace.selected !== undefined &&
    JSON.stringify(generated.track) ===
      JSON.stringify(workspace.selected.track);
  return `
    <div class="builder-layout builder-layout-generator" role="tabpanel" id="track-builder-panel-generate" aria-labelledby="track-builder-tab-generate">
      <section class="generator-controls" aria-labelledby="generator-title">
        <p class="section-kicker">Deterministic Python generator</p>
        <h3 id="generator-title">Generate from a seed</h3>
        <p class="builder-panel-copy">The same seed, length, difficulty, and generator version always return the same canonical track.</p>
        <div class="generator-form">
          <label>Seed <input data-generator-seed type="number" min="0" max="2147483647" step="1" value="${String(workspace.generator.seed)}" ${busy ? "disabled" : ""} /></label>
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
        <button class="button primary generator-submit" type="button" data-track-action="generate" ${busy ? "disabled" : ""}>${workspace.pending === "generate" ? "Generating…" : "Generate track"}</button>
      </section>
      <section class="builder-preview-panel generated-preview" aria-labelledby="generated-preview-title">
        <header class="builder-panel-heading">
          <div><p class="section-kicker">Generated result</p><h3 id="generated-preview-title">${generated === undefined ? "Waiting for inputs" : escapeHtml(generated.track.name)}</h3></div>
          ${generated === undefined ? "" : inputsChanged ? '<span class="validation-badge is-warning">Inputs changed</span>' : '<span class="validation-badge is-success">Python verified</span>'}
        </header>
        <div class="builder-canvas ${generated === undefined ? "is-empty" : ""}">
          ${generated === undefined ? '<div class="builder-canvas-empty"><span aria-hidden="true">#</span><strong>No generated track yet</strong><p>Choose the inputs and generate a deterministic layout.</p></div>' : renderTrackSvg(generated)}
        </div>
        ${
          generated === undefined
            ? ""
            : `<dl class="builder-stats"><div><dt>Pieces</dt><dd>${String(generated.track.pieces.length)}</dd></div><div><dt>Road width</dt><dd>${formatNumber(generated.track.roadWidth)} m</dd></div><div><dt>Seed</dt><dd>${String(generatedInputs.seed)}</dd></div></dl>
               <div class="builder-primary-actions">
                 <button class="button primary" type="button" data-track-action="use-generated" ${busy || selectedMatches ? "disabled" : ""}>${selectedMatches ? "Selected for experiment" : "Use this track"}</button>
                 <button class="button secondary" type="button" data-track-action="edit-generated" ${busy ? "disabled" : ""}>Edit pieces</button>
                 <button class="button secondary" type="button" data-track-action="save-generated" ${busy ? "disabled" : ""}>${workspace.pending === "save" ? "Saving…" : "Save locally"}</button>
                 <button class="button ghost" type="button" data-track-action="export-generated" ${busy ? "disabled" : ""}>Export JSON</button>
               </div>`
        }
      </section>
    </div>
  `;
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
      ? `<div class="library-empty" role="alert"><span aria-hidden="true">!</span><strong>Local track library unavailable</strong><p>${escapeHtml(workspace.libraryMessage ?? "The local track library is unavailable.")}</p><button class="button secondary" type="button" data-track-action="refresh-library" ${busy ? "disabled" : ""}>Retry local library</button></div>`
      : workspace.libraryStatus === "loading" || workspace.library === null
        ? '<div class="library-empty"><span class="loading-ring" aria-hidden="true"></span><strong>Loading local library…</strong></div>'
        : workspace.library.tracks.length === 0
          ? '<div class="library-empty"><span aria-hidden="true">□</span><strong>No saved tracks yet</strong><p>Save a built or generated track, or import a TrackV1 JSON file.</p></div>'
          : `<div class="track-library-grid">${workspace.library.tracks
              .map((compiled) => renderLibraryCard(compiled, workspace, busy))
              .join("")}</div>`;
  return `
    <div class="builder-library" role="tabpanel" id="track-builder-panel-library" aria-labelledby="track-builder-tab-library">
      <section class="track-import-panel" aria-labelledby="track-import-title">
        <div><p class="section-kicker">Versioned local file</p><h3 id="track-import-title">Import TrackV1 JSON</h3><p>The file is parsed in the browser, then compiled and validated by Python before it enters the editor.</p></div>
        <label class="button secondary file-button">${workspace.pending === "import" ? "Importing…" : "Choose JSON file"}<input type="file" accept="application/json,.json" data-track-import ${busy ? "disabled" : ""} /></label>
      </section>
      ${isolated > 0 ? `<p class="library-warning"><strong>${String(isolated)} corrupt record${isolated === 1 ? "" : "s"} isolated.</strong> Valid tracks remain available.</p>` : ""}
      ${cards}
    </div>
  `;
}

function renderLibraryCard(
  compiled: CompiledTrackV1,
  workspace: TrackWorkspaceState,
  busy: boolean,
): string {
  const selected =
    workspace.selected !== undefined &&
    JSON.stringify(workspace.selected.track) === JSON.stringify(compiled.track);
  return `
    <article class="track-library-card ${selected ? "is-selected" : ""}">
      <div class="library-card-preview">${renderTrackSvg(compiled)}</div>
      <div class="library-card-copy">
        <span>${selected ? "Selected" : "Local TrackV1"}</span>
        <h3>${escapeHtml(compiled.track.name)}</h3>
        <p>${String(compiled.track.pieces.length)} pieces · ${formatNumber(compiled.track.roadWidth)} m road</p>
      </div>
      <div class="library-card-actions">
        <button class="button primary" type="button" data-track-action="use-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy || selected ? "disabled" : ""}>${selected ? "Selected" : "Use"}</button>
        <button class="button secondary" type="button" data-track-action="edit-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Edit</button>
        <button class="button ghost" type="button" data-track-action="export-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Export</button>
        <button class="button danger" type="button" data-track-action="delete-library" data-track-id="${escapeHtml(compiled.track.id)}" ${busy ? "disabled" : ""}>Delete</button>
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
            `<li><code>${escapeHtml(issue.code)}</code><span>${escapeHtml(issue.message)}</span></li>`,
        )
        .join("")}</ul>
    </div>
  `;
}

function validationPresentation(status: EditorValidationState["status"]): {
  label: string;
  tone: string;
} {
  switch (status) {
    case "checking":
      return { label: "Checking…", tone: "info" };
    case "valid":
      return { label: "Python verified", tone: "success" };
    case "invalid":
      return { label: "Needs changes", tone: "warning" };
    case "unchecked":
      return { label: "Not checked", tone: "neutral" };
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
