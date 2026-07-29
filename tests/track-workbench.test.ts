import { describe, expect, it } from "vitest";

import {
  addEditorPiece,
  createEditorState,
  deleteEditorPiece,
  editorTrack,
  parseTrackDocument,
  redoEditor,
  resetEditor,
  serializeTrackDocument,
  undoEditor,
} from "../src/track-workbench";

describe("Phase 3 sequential editor and JSON document UI", () => {
  it("supports add, delete, undo, redo, and reset without deriving geometry", () => {
    const initial = createEditorState();
    const added = addEditorPiece(initial, "chicane-left");
    const deleted = deleteEditorPiece(added, added.present.pieces.length - 1);

    expect(editorTrack(added).pieces.at(-1)?.kind).toBe("chicane-left");
    expect(editorTrack(deleted).pieces).toEqual(editorTrack(initial).pieces);
    expect(editorTrack(undoEditor(deleted)).pieces).toEqual(
      editorTrack(added).pieces,
    );
    expect(editorTrack(redoEditor(undoEditor(deleted))).pieces).toEqual(
      editorTrack(deleted).pieces,
    );
    expect(editorTrack(resetEditor(added)).pieces).toEqual(
      editorTrack(initial).pieces,
    );
  });

  it("does not allow the only start-finish piece to be deleted", () => {
    const state = createEditorState();
    expect(deleteEditorPiece(state, 0)).toBe(state);
  });

  it("round-trips versioned canonical JSON and fails safely on unknown shapes", () => {
    const track = editorTrack(createEditorState());
    expect(parseTrackDocument(serializeTrackDocument(track))).toEqual(track);
    expect(() => parseTrackDocument('{"schemaVersion":2}')).toThrow(
      "not a TrackV1",
    );
    expect(() => parseTrackDocument("{")).toThrow("not valid JSON");
  });

  it("accepts the shared Python-compiled TrackV1 document fixture", () => {
    const fixturePath = fileURLToPath(
      new URL("../contracts/phase3-track-document.json", import.meta.url),
    );
    const source = readFileSync(fixturePath, "utf8");
    expect(parseTrackDocument(source).id).toBe("phase3-shared-oval");
  });
});
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
