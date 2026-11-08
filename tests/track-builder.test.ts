import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createTrackWorkspaceState,
  generatorInputsChanged,
  renderTrackBuilder,
  syncSelectedTrack,
} from "../src/track-builder";
import type { CompiledTrackV1 } from "../src/track-renderer";

interface GeometryFixture {
  compiled: CompiledTrackV1;
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../contracts/phase2-easy-oval-geometry.json", import.meta.url),
    ),
    "utf8",
  ),
) as GeometryFixture;

describe("Track Builder workspace", () => {
  it("keeps the full workspace closed by default behind a visible launcher", () => {
    const html = renderTrackBuilder(
      createTrackWorkspaceState("custom-track-test"),
    );

    expect(html).toContain("Track Builder");
    expect(html).toContain('data-track-action="open-builder"');
    expect(html).not.toContain('data-testid="track-builder"');
  });

  it("renders a Python-verified build workspace with complete edit controls", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.editorPreview = fixture.compiled;
    state.editorValidation = { status: "valid", errors: [] };
    const html = renderTrackBuilder(state);

    expect(html).toContain('data-testid="track-builder"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="track-builder-tab-build"');
    expect(html).toContain('aria-controls="track-builder-panel-build"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-labelledby="track-builder-tab-build"');
    expect(html).toContain('id="track-builder-panel-build"');
    expect(html).toContain(
      'id="track-builder-panel-generate" aria-labelledby="track-builder-tab-generate" hidden',
    );
    expect(html).toContain(
      'id="track-builder-panel-library" aria-labelledby="track-builder-tab-library" hidden',
    );
    expect(html).toContain("Valid");
    expect(html).toContain("Short straight");
    expect(html).toContain("Left hairpin");
    expect(html).toContain('aria-label="Track piece tray"');
    expect(html).toContain('data-editor-drag-kind="straight-short"');
    expect(html).toContain('data-editor-drag-index="1" draggable="true"');
    expect(html).toContain('data-track-drop-index="1"');
    expect(html).toContain("Drag a piece into a connector");
    expect(html).toContain('data-track-action="editor-move"');
    expect(html).toContain('data-track-action="editor-duplicate"');
    expect(html).toContain('data-track-action="use-editor"');
  });

  it("surfaces stable Python issue codes and escapes untrusted messages", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.editorValidation = {
      status: "invalid",
      errors: [
        {
          code: "LOOP_NOT_CLOSED",
          field: "pieces",
          message: "Close <this> loop.",
        },
      ],
    };
    state.editorPreview = fixture.compiled;
    const html = renderTrackBuilder(state);

    expect(html).toContain("LOOP_NOT_CLOSED");
    expect(html).toContain("Close &lt;this&gt; loop.");
    expect(html).not.toContain("Close <this> loop.");
    expect(html).toContain('data-track-action="use-editor" disabled');
    expect(html).toContain("track-geometry");
    expect(html).not.toContain("No preview yet");
  });

  it("locks every editor mutation while a Python command is pending", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.pending = "assist";

    const html = renderTrackBuilder(state);

    expect(html).toMatch(/data-editor-name[^>]*disabled/);
    expect(html).toMatch(/data-editor-width[^>]*disabled/);
    expect(html).toMatch(/data-segment-kind="straight-short"[^>]*disabled/);
    expect(html).toMatch(
      /data-editor-drag-kind="straight-short"[^>]*draggable="false"/,
    );
    expect(html).toMatch(/data-editor-drag-index="1"[^>]*draggable="false"/);
    expect(html).toMatch(/data-track-action="editor-move"[^>]*disabled/);
    expect(html).toMatch(/data-track-action="editor-delete"[^>]*disabled/);
  });

  it("locks every generator input while Python is generating", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.pending = "generate";

    const html = renderTrackBuilder(state);

    expect(html).toMatch(/data-generator-seed[^>]*disabled/);
    expect(html).toMatch(/name="generator-length"[^>]*disabled/);
    expect(html).toMatch(/name="generator-difficulty"[^>]*disabled/);
    expect(html).toContain("Generating…");
  });

  it("announces Python command errors as alerts", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.notice = { tone: "error", message: "Python command failed." };

    const html = renderTrackBuilder(state);

    expect(html).toContain('role="alert" aria-live="assertive"');
    expect(html).toContain("Python command failed.");
  });

  it("labels a pending local save instead of leaving a disabled static action", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.pending = "save";
    state.editorPreview = fixture.compiled;
    state.editorValidation = { status: "valid", errors: [] };

    const html = renderTrackBuilder(state);

    expect(html).toMatch(
      /data-track-action="save-editor"[^>]*disabled[^>]*>Saving…<\/button>/,
    );
  });

  it("keeps generator inputs and library actions in dedicated tabs", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.generator = { seed: 731, length: "long", difficulty: "hard" };
    state.generatedInputs = { ...state.generator };
    state.generatedFeatures = {
      layout: "asymmetric",
      straightCount: 7,
      cornerCount: 10,
      chicaneCount: 3,
      hairpinCount: 1,
      directionChanges: 5,
    };
    state.generatedPreview = fixture.compiled;
    const generatorHtml = renderTrackBuilder(state);

    expect(generatorHtml).toContain('value="731"');
    expect(generatorHtml).toContain('value="long" checked');
    expect(generatorHtml).toContain('value="hard" checked');
    expect(generatorHtml).toContain('data-track-action="edit-generated"');
    expect(generatorHtml).toContain("Asymmetric");
    expect(generatorHtml).toContain("5 direction changes");

    state.tab = "library";
    state.library = {
      contractVersion: 1,
      tracks: [fixture.compiled],
      isolated: [],
    };
    state.libraryStatus = "ready";
    const libraryHtml = renderTrackBuilder(state);
    expect(libraryHtml).toContain("Import a track file");
    expect(libraryHtml).toContain('data-track-action="edit-library"');
    expect(libraryHtml).toContain('data-track-action="delete-library"');
  });

  it("locks the file picker and exposes progress while import validation is pending", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "library";
    state.pending = "import";

    const html = renderTrackBuilder(state);

    expect(html).toContain("Importing…");
    expect(html).toMatch(/data-track-import[^>]*disabled/);
  });

  it("distinguishes a failed local library read from loading and offers retry", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "library";
    state.libraryStatus = "unavailable";
    state.libraryMessage = "Track library <failed>.";

    const html = renderTrackBuilder(state);

    expect(html).toContain("Local track library unavailable");
    expect(html).toContain("Track library &lt;failed&gt;.");
    expect(html).toContain('data-track-action="refresh-library"');
    expect(html).not.toContain("Loading local library…");
  });

  it("keeps generated-result metadata tied to the inputs Python verified", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.generator = { seed: 99, length: "long", difficulty: "hard" };
    state.generatedInputs = {
      seed: 42,
      length: "medium",
      difficulty: "technical",
    };
    state.generatedPreview = fixture.compiled;

    const html = renderTrackBuilder(state);

    expect(generatorInputsChanged(state)).toBe(true);
    expect(html).toContain("Inputs changed");
    expect(html).toContain("<dt>Seed</dt><dd>42</dd>");
    expect(html).not.toContain("<dt>Seed</dt><dd>99</dd>");
  });

  it("makes the generated active TrackV1 unmistakable", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.generatedInputs = { ...state.generator };
    state.generatedFeatures = {
      layout: "asymmetric",
      straightCount: 6,
      cornerCount: 8,
      chicaneCount: 2,
      hairpinCount: 0,
      directionChanges: 4,
    };
    state.generatedPreview = fixture.compiled;
    state.selected = fixture.compiled;

    const html = renderTrackBuilder(state);

    expect(html).toContain("Active track");
    expect(html).toContain("Active for Review and Start");
    expect(html).toContain("This exact track will be used.");
    expect(html).not.toContain('data-track-action="use-generated"');
  });

  it("treats a generated track as a candidate until it is applied", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.generatedInputs = { ...state.generator, seed: 731 };
    state.generator = { ...state.generatedInputs };
    state.generatedFeatures = {
      layout: "asymmetric",
      straightCount: 1,
      cornerCount: 8,
      chicaneCount: 2,
      hairpinCount: 0,
      directionChanges: 4,
    };
    state.generatedPreview = fixture.compiled;

    const html = renderTrackBuilder(state);

    expect(html).toContain("Candidate, not active");
    expect(html).toContain('data-track-action="use-generated"');
    expect(html).toContain('data-track-action="regenerate"');
    expect(html).toContain("Regenerate seed 731");
    expect(html).toContain("<dt>Seed</dt><dd>731</dd>");
    expect(html).toContain("1 straight · 8 corners · 2 chicanes");
    expect(html).not.toContain("Active for Review and Start");
  });

  it("shows each tool's status on its tab", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.editorValidation = { status: "invalid", errors: [] };
    state.library = {
      contractVersion: 1,
      tracks: [fixture.compiled],
      isolated: [],
    };
    state.libraryStatus = "ready";

    const html = renderTrackBuilder(state);

    expect(html).toContain(
      "<strong>Editor</strong>\n      <span>Needs changes</span>",
    );
    expect(html).toContain(
      "<strong>Generate</strong>\n      <span>No candidate yet</span>",
    );
    expect(html).toContain(
      "<strong>Library</strong>\n      <span>1 saved</span>",
    );
  });
});

describe("Track Builder active selection", () => {
  const generated: CompiledTrackV1 = {
    ...fixture.compiled,
    track: {
      ...fixture.compiled.track,
      id: "generated-test",
      name: "Generated",
    },
  };
  const selectedWorkspace = {
    ...createTrackWorkspaceState("custom-track-test"),
    toolsOpen: true,
    tab: "generate" as const,
    generatedPreview: generated,
    selected: generated,
    selectedSeed: 42,
  };

  it("stops calling a custom track active once the draft falls back to a preset", () => {
    const synced = syncSelectedTrack(selectedWorkspace, null);

    expect(synced.selected).toBeUndefined();
    expect(synced.selectedSeed).toBeUndefined();
    const html = renderTrackBuilder(synced);
    expect(html).toContain("Candidate, not active");
    expect(html).not.toContain("✓</span> Active track");
  });

  it("keeps the selection while the draft still sends that track", () => {
    expect(syncSelectedTrack(selectedWorkspace, generated.track)).toBe(
      selectedWorkspace,
    );
  });
});
