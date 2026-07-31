import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createTrackWorkspaceState,
  renderTrackBuilder,
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
      false,
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
    const html = renderTrackBuilder(state, false);

    expect(html).toContain('data-testid="track-builder"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Python-compiled preview");
    expect(html).toContain("Python verified");
    expect(html).toContain("Short straight");
    expect(html).toContain("Left hairpin");
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
    const html = renderTrackBuilder(state, false);

    expect(html).toContain("LOOP_NOT_CLOSED");
    expect(html).toContain("Close &lt;this&gt; loop.");
    expect(html).not.toContain("Close <this> loop.");
    expect(html).toContain('data-track-action="use-editor" disabled');
  });

  it("keeps generator inputs and library actions in dedicated tabs", () => {
    const state = createTrackWorkspaceState("custom-track-test");
    state.toolsOpen = true;
    state.tab = "generate";
    state.generator = { seed: 731, length: "long", difficulty: "hard" };
    state.generatedPreview = fixture.compiled;
    const generatorHtml = renderTrackBuilder(state, false);

    expect(generatorHtml).toContain('value="731"');
    expect(generatorHtml).toContain('value="long" checked');
    expect(generatorHtml).toContain('value="hard" checked');
    expect(generatorHtml).toContain('data-track-action="edit-generated"');

    state.tab = "library";
    state.library = {
      contractVersion: 1,
      tracks: [fixture.compiled],
      isolated: [],
    };
    const libraryHtml = renderTrackBuilder(state, false);
    expect(libraryHtml).toContain("Import TrackV1 JSON");
    expect(libraryHtml).toContain('data-track-action="edit-library"');
    expect(libraryHtml).toContain('data-track-action="delete-library"');
  });
});
