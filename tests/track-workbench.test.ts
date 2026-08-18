import { describe, expect, it } from "vitest";

import {
  addEditorPiece,
  createEditorState,
  deleteEditorPiece,
  duplicateEditorPiece,
  editorTrack,
  insertEditorPiece,
  moveEditorPiece,
  moveEditorPieceToIndex,
  parseTrackCommandResponse,
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

  it("reorders and duplicates editable pieces without moving the start line", () => {
    const initial = createEditorState("track-draft-7");
    const moved = moveEditorPiece(initial, 1, 1);
    const duplicated = duplicateEditorPiece(moved, 1);

    expect(editorTrack(moved).pieces[1]?.kind).toBe("turn-left-90");
    expect(editorTrack(moved).pieces[2]?.kind).toBe("straight-long");
    expect(editorTrack(duplicated).pieces[1]).toEqual(
      editorTrack(duplicated).pieces[2],
    );
    expect(moveEditorPiece(initial, 1, -1)).toBe(initial);
    expect(duplicateEditorPiece(initial, 0)).toBe(initial);
    expect(editorTrack(resetEditor(duplicated)).id).toBe("track-draft-7");
  });

  it("inserts and snaps pieces at arbitrary connector positions", () => {
    const initial = createEditorState("snap-draft");
    const inserted = insertEditorPiece(initial, "chicane-right", 2);
    const snappedToEnd = moveEditorPieceToIndex(
      inserted,
      2,
      inserted.present.pieces.length,
    );

    expect(editorTrack(inserted).pieces[2]?.kind).toBe("chicane-right");
    expect(editorTrack(snappedToEnd).pieces.at(-1)?.kind).toBe("chicane-right");
    expect(moveEditorPieceToIndex(initial, 0, 3)).toBe(initial);
    expect(insertEditorPiece(initial, "straight-short", 0)).toBe(initial);
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

  it("rejects contradictory Python command validity and errors", () => {
    const issue = { code: "FAILED", field: "track", message: "Invalid." };
    expect(() =>
      parseTrackCommandResponse(
        { contractVersion: 1, valid: true, errors: [issue] },
        "Track command",
      ),
    ).toThrow("inconsistent response");
    expect(() =>
      parseTrackCommandResponse(
        { contractVersion: 1, valid: false, errors: [] },
        "Track command",
      ),
    ).toThrow("inconsistent response");
  });

  it("parses Python-owned generated-track feature evidence", () => {
    const compiledFixture = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../contracts/phase2-easy-oval-geometry.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { compiled: unknown };
    const response = parseTrackCommandResponse(
      {
        contractVersion: 1,
        valid: true,
        errors: [],
        compiled: compiledFixture.compiled,
        generatorVersion: 4,
        candidateCount: 1,
        features: {
          layout: "asymmetric",
          straightCount: 7,
          cornerCount: 10,
          chicaneCount: 2,
          hairpinCount: 1,
          directionChanges: 6,
        },
      },
      "Track generation",
    );

    expect(response.generatorVersion).toBe(4);
    expect(response.features).toEqual({
      layout: "asymmetric",
      straightCount: 7,
      cornerCount: 10,
      chicaneCount: 2,
      hairpinCount: 1,
      directionChanges: 6,
    });
  });
});
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
