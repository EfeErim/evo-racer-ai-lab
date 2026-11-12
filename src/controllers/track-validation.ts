import type { AppContext } from "../app-store";
import { assistTrackClosure, compileTrack } from "../ipc";
import type { TrackBuilderPending } from "../track-builder";
import {
  editorTrack,
  parseTrackDocument,
  replaceEditorTrack,
  type TrackCommandResponse,
} from "../track-workbench";

/** Whether a Track Builder response still belongs to the request on screen. */
export type TrackCommandGuard = (
  requestVersion: number,
  pending: Exclude<TrackBuilderPending, null>,
) => boolean;

export function closureRepairMessage(response: TrackCommandResponse): string {
  const added = response.addedPieces?.length ?? 0;
  const removed = response.removedPieces ?? 0;
  if (removed > 0 && added > 0) {
    return `Removed ${String(removed)} trailing piece(s), added ${String(added)}, and checked the repaired loop.`;
  }
  if (removed > 0) {
    return `Removed ${String(removed)} trailing piece(s) and restored the last valid loop.`;
  }
  if (added > 0) {
    return `Added ${String(added)} piece(s) and checked the closed loop.`;
  }
  return "The loop was already valid; no repair was needed.";
}

/**
 * Asks the local core whether a track is valid: the editor draft after every
 * change, an assisted loop closure, and an imported track file.
 */
export function createTrackValidation(
  context: AppContext,
  isCurrentTrackCommand: TrackCommandGuard,
) {
  const { store, render } = context;

  const validateEditorDraft = async (): Promise<void> => {
    const requestId = ++store.trackValidationRequest;
    const draft = editorTrack(store.trackWorkspace.editor);
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: "validate",
      editorValidation: { status: "checking", errors: [] },
    };
    render();
    try {
      const response = await compileTrack(draft);
      if (requestId !== store.trackValidationRequest) {
        return;
      }
      if (response.valid && response.compiled !== undefined) {
        store.trackWorkspace = {
          ...store.trackWorkspace,
          pending: null,
          editorPreview: response.compiled,
          editorValidation: { status: "valid", errors: [] },
          notice: {
            tone: "success",
            message: "Draft geometry is valid and ready to use.",
          },
        };
      } else {
        store.trackWorkspace = {
          ...store.trackWorkspace,
          pending: null,
          editorPreview: response.preview,
          editorValidation: {
            status: "invalid",
            errors: response.errors,
          },
          notice: {
            tone: "warning",
            message:
              response.errors[0]?.message ??
              "The draft needs changes before it can be used.",
          },
        };
      }
    } catch (error) {
      if (requestId !== store.trackValidationRequest) {
        return;
      }
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        editorPreview: undefined,
        editorValidation: { status: "invalid", errors: [] },
        notice: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "No response yet while checking this draft. Try again.",
        },
      };
    }
    render();
  };

  /** Closes the editor's loop; errors propagate to the command handler. */
  const assistEditorClosure = async (requestVersion: number): Promise<void> => {
    const requestId = ++store.trackValidationRequest;
    const draft = editorTrack(store.trackWorkspace.editor);
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: "assist",
      notice: {
        tone: "info",
        message: "Searching for a safe closing sequence.",
      },
    };
    render();
    const stillCurrent = (): boolean =>
      requestId === store.trackValidationRequest &&
      isCurrentTrackCommand(requestVersion, "assist");
    let response: TrackCommandResponse;
    try {
      response = await assistTrackClosure(draft);
    } catch (error) {
      if (!stillCurrent()) {
        return;
      }
      throw error;
    }
    if (!stillCurrent()) {
      return;
    }
    if (response.valid && response.compiled !== undefined) {
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        editor: replaceEditorTrack(
          store.trackWorkspace.editor,
          response.compiled.track,
        ),
        editorPreview: response.compiled,
        editorValidation: { status: "valid", errors: [] },
        notice: {
          tone: "success",
          message: closureRepairMessage(response),
        },
      };
    } else {
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        editorPreview: undefined,
        editorValidation: {
          status: "invalid",
          errors: response.errors,
        },
        notice: {
          tone: "warning",
          message:
            response.errors[0]?.message ??
            "No safe assisted closure was found.",
        },
      };
    }
    render();
  };

  const importTrack = async (file: File): Promise<void> => {
    const requestId = ++store.trackImportRequestVersion;
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: "import",
      notice: {
        tone: "info",
        message: "Reading the track file and checking it.",
      },
    };
    render();
    try {
      const content = await file.text();
      if (requestId !== store.trackImportRequestVersion) {
        return;
      }
      const track = parseTrackDocument(content);
      const response = await compileTrack(track);
      if (requestId !== store.trackImportRequestVersion) {
        return;
      }
      if (!response.valid || response.compiled === undefined) {
        store.trackWorkspace = {
          ...store.trackWorkspace,
          pending: null,
          notice: {
            tone: "error",
            message:
              response.errors[0]?.message ?? "The imported track is invalid.",
          },
        };
        render();
        return;
      }
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        toolsOpen: true,
        tab: "build",
        editor: replaceEditorTrack(
          store.trackWorkspace.editor,
          response.compiled.track,
        ),
        editorPreview: response.compiled,
        editorValidation: { status: "valid", errors: [] },
        notice: {
          tone: "success",
          message: "Imported track checked and loaded into the editor.",
        },
      };
      render();
    } catch (error) {
      if (requestId !== store.trackImportRequestVersion) {
        return;
      }
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        notice: {
          tone: "error",
          message:
            error instanceof Error ? error.message : "Track import failed.",
        },
      };
      render();
    }
  };

  return { assistEditorClosure, importTrack, validateEditorDraft };
}
