import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createTrackWorkspaceState,
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
      new URL("../contracts/easy-oval-geometry.json", import.meta.url),
    ),
    "utf8",
  ),
) as GeometryFixture;

describe("Track Builder workspace", () => {
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
    expect(html).not.toContain("Active for this race");
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
