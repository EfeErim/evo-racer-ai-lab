import type { AppContext } from "../app-store";
import type { EditorDragPayload } from "../bind-actions";
import {
  addEditorPiece,
  deleteEditorPiece,
  duplicateEditorPiece,
  type EditorState,
  insertEditorPiece,
  moveEditorPiece,
  moveEditorPieceToIndex,
  redoEditor,
  resetEditor,
  type SegmentKind,
  undoEditor,
} from "../track-workbench";

/**
 * Piece editing in the Track Builder. Every change replaces the draft and
 * asks `validateEditorDraft` to check the new sequence.
 */
export function createTrackEditing(
  context: AppContext,
  validateEditorDraft: () => Promise<void>,
) {
  const { store, render } = context;

  const setEditorDraft = (editor: EditorState, message: string): void => {
    store.trackWorkspace = {
      ...store.trackWorkspace,
      editor,
      editorPreview: undefined,
      editorValidation: { status: "checking", errors: [] },
      notice: { tone: "info", message },
    };
    render();
    void validateEditorDraft();
  };

  const dropEditorPiece = (
    payload: EditorDragPayload,
    insertionIndex: number,
  ): void => {
    if (store.trackWorkspace.pending !== null) {
      return;
    }
    const editor =
      payload.source === "palette"
        ? insertEditorPiece(
            store.trackWorkspace.editor,
            payload.kind,
            insertionIndex,
          )
        : moveEditorPieceToIndex(
            store.trackWorkspace.editor,
            payload.pieceIndex,
            insertionIndex,
          );
    if (editor === store.trackWorkspace.editor) {
      return;
    }
    setEditorDraft(
      editor,
      payload.source === "palette"
        ? "Piece snapped into the circuit. Checking the new sequence."
        : "Pieces reconnected. Checking the new sequence.",
    );
  };

  /** Applies one `editor-*` action; false when the action is not an edit. */
  const handleEditorAction = (
    action: string,
    element: HTMLElement,
  ): boolean => {
    const editor = store.trackWorkspace.editor;
    const index = Number(element.dataset.pieceIndex);
    switch (action) {
      case "editor-add": {
        const kind = element.dataset.segmentKind as SegmentKind | undefined;
        if (kind !== undefined) {
          setEditorDraft(
            addEditorPiece(editor, kind),
            "Piece added. Checking the new sequence.",
          );
        }
        return true;
      }
      case "editor-delete":
        setEditorDraft(
          deleteEditorPiece(editor, index),
          "Piece removed. Checking the new sequence.",
        );
        return true;
      case "editor-duplicate":
        setEditorDraft(
          duplicateEditorPiece(editor, index),
          "Piece duplicated. Checking the new sequence.",
        );
        return true;
      case "editor-move": {
        const direction = Number(element.dataset.direction) === -1 ? -1 : 1;
        setEditorDraft(
          moveEditorPiece(editor, index, direction),
          "Piece order changed. Checking the new sequence.",
        );
        return true;
      }
      case "editor-undo":
        setEditorDraft(
          undoEditor(editor),
          "Change undone. Checking the restored sequence.",
        );
        return true;
      case "editor-redo":
        setEditorDraft(
          redoEditor(editor),
          "Change restored. Checking the sequence.",
        );
        return true;
      case "editor-reset":
        setEditorDraft(
          resetEditor(editor),
          "Editor reset to the starter loop. Checking it.",
        );
        return true;
      default:
        return false;
    }
  };

  return { dropEditorPiece, handleEditorAction, setEditorDraft };
}
