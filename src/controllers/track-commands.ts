import type { AppContext } from "../app-store";
import type { EditorDragPayload } from "../bind-actions";
import { downloadTrack } from "../downloads";
import {
  assistTrackClosure,
  compileTrack,
  deleteTrack,
  generateTrack,
  loadPresetTracks,
  loadTrackLibrary,
  saveTrack,
} from "../ipc";
import {
  generatorInputsChanged,
  type TrackBuilderPending,
  type TrackBuilderTab,
  type TrackWorkspaceState,
} from "../track-builder";
import type { CompiledTrackV1 } from "../track-renderer";
import {
  addEditorPiece,
  deleteEditorPiece,
  duplicateEditorPiece,
  type EditorState,
  editorTrack,
  insertEditorPiece,
  moveEditorPiece,
  moveEditorPieceToIndex,
  parseTrackDocument,
  redoEditor,
  replaceEditorTrack,
  resetEditor,
  type SegmentKind,
  type TrackCommandResponse,
  undoEditor,
} from "../track-workbench";

export const TRACK_LIBRARY_REFRESHED_NOTICE: TrackWorkspaceState["notice"] = {
  tone: "success",
  message: "Local track library refreshed.",
};

function closureRepairMessage(response: TrackCommandResponse): string {
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

export function dismissedTrackResponseMessage(
  pending: Exclude<TrackBuilderPending, null>,
  context: "leaving Track" | "Track Builder closed" | "switching tools",
): string {
  const operations: Record<Exclude<TrackBuilderPending, null>, string> = {
    validate: "validation",
    assist: "closure assistance",
    generate: "generation",
    save: "save",
    delete: "deletion",
    import: "import",
  };
  return `Track ${operations[pending]} response ignored after ${context}.`;
}

export function syncGeneratorDraftPresentation(
  root: HTMLElement,
  workspace: TrackWorkspaceState,
): void {
  root
    .querySelectorAll<HTMLInputElement>(".generator-choice input")
    .forEach((input) => {
      input
        .closest<HTMLElement>(".generator-choice")
        ?.classList.toggle("is-selected", input.checked);
    });

  const badge = root.querySelector<HTMLElement>(
    ".generated-preview .validation-badge",
  );
  if (badge === null) {
    return;
  }

  const inputsChanged = generatorInputsChanged(workspace);
  const selectedMatches =
    workspace.generatedPreview !== undefined &&
    workspace.selected !== undefined &&
    JSON.stringify(workspace.generatedPreview.track) ===
      JSON.stringify(workspace.selected.track);
  badge.classList.toggle("is-warning", inputsChanged);
  badge.classList.toggle("is-success", !inputsChanged && selectedMatches);
  badge.classList.toggle("is-info", !inputsChanged && !selectedMatches);
  // Update glyph and label together so state never relies on color alone.
  const [glyph, label] = inputsChanged
    ? ["!", "Inputs changed"]
    : selectedMatches
      ? ["✓", "Active track"]
      : ["○", "Candidate, not active"];
  const glyphElement = document.createElement("span");
  glyphElement.setAttribute("aria-hidden", "true");
  glyphElement.textContent = glyph;
  badge.replaceChildren(glyphElement, ` ${label}`);

  const notice = root.querySelector<HTMLElement>("[data-track-builder-notice]");
  const noticeMessage = root.querySelector<HTMLElement>(
    "[data-track-builder-notice-message]",
  );
  if (notice === null || noticeMessage === null) {
    return;
  }
  notice.className = `track-builder-notice is-${inputsChanged ? "warning" : workspace.notice.tone}`;
  noticeMessage.textContent = inputsChanged
    ? "Generator inputs changed. Generate again to apply them. The preview still shows the last checked candidate."
    : workspace.notice.message;
}

export function createTrackCommands(context: AppContext) {
  const { root, store, render, dispatch } = context;

  const isCurrentTrackCommand = (
    requestVersion: number,
    pending: Exclude<TrackBuilderPending, null>,
  ): boolean =>
    requestVersion === store.trackCommandRequestVersion &&
    store.state.route === "track" &&
    store.trackWorkspace.toolsOpen &&
    store.trackWorkspace.pending === pending;

  async function refreshPresetGeometry(): Promise<void> {
    const requestVersion = ++store.presetGeometryRequestVersion;
    try {
      const response = await loadPresetTracks();
      if (requestVersion !== store.presetGeometryRequestVersion) {
        return;
      }
      store.presetGeometry = { status: "ready", presets: response.presets };
    } catch (error) {
      if (requestVersion !== store.presetGeometryRequestVersion) {
        return;
      }
      store.presetGeometry = {
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Preset track geometry is unavailable.",
      };
    }
    render();
  }

  async function refreshLibrary(
    successNotice?: TrackWorkspaceState["notice"],
  ): Promise<void> {
    const requestVersion = ++store.trackLibraryRequestVersion;
    try {
      const library = await loadTrackLibrary();
      if (requestVersion !== store.trackLibraryRequestVersion) {
        return;
      }
      store.trackWorkspace = {
        ...store.trackWorkspace,
        library,
        libraryStatus: "ready",
        libraryMessage: undefined,
        notice: successNotice ?? store.trackWorkspace.notice,
      };
    } catch (error) {
      if (requestVersion !== store.trackLibraryRequestVersion) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The local track library is unavailable.";
      const hasLibrary = store.trackWorkspace.library !== null;
      store.trackWorkspace = {
        ...store.trackWorkspace,
        libraryStatus: hasLibrary ? "ready" : "unavailable",
        libraryMessage: hasLibrary ? undefined : message,
        notice: {
          tone: "error",
          message,
        },
      };
    }
    render();
  }

  const useCompiled = (
    compiled: CompiledTrackV1,
    message: string,
    seed?: number,
  ): void => {
    store.trackWorkspace = {
      ...store.trackWorkspace,
      selected: compiled,
      selectedSeed: seed,
      notice: { tone: "success", message },
    };
    dispatch({ type: "select-custom-track", track: compiled.track });
  };

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

  const saveCompiledTrack = async (
    compiled: CompiledTrackV1,
    requestVersion: number,
  ): Promise<void> => {
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: "save",
      notice: {
        tone: "info",
        message: "Saving the selected track to local storage.",
      },
    };
    render();
    const result = await saveTrack(compiled.track);
    if (!isCurrentTrackCommand(requestVersion, "save")) {
      await refreshLibrary();
      return;
    }
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: null,
      notice: {
        tone: result.saved ? "success" : "error",
        message: result.saved
          ? "Track saved atomically to the local library."
          : (result.errors[0]?.message ?? "Track could not be saved."),
      },
    };
    await refreshLibrary();
  };

  const libraryTrack = (
    trackId: string | undefined,
  ): CompiledTrackV1 | undefined =>
    store.trackWorkspace.library?.tracks.find(
      (candidate) => candidate.track.id === trackId,
    );

  const handleTrackAction = async (
    action: string,
    element: HTMLElement,
  ): Promise<void> => {
    const repeatsActiveTab =
      action === "builder-tab" &&
      element.dataset.builderTab === store.trackWorkspace.tab;
    const requestVersion = repeatsActiveTab
      ? store.trackCommandRequestVersion
      : ++store.trackCommandRequestVersion;
    try {
      switch (action) {
        case "refresh-library":
          store.trackWorkspace = {
            ...store.trackWorkspace,
            libraryStatus: "loading",
            libraryMessage: undefined,
            notice: {
              tone: "info",
              message: "Refreshing the local track library.",
            },
          };
          render();
          await refreshLibrary(TRACK_LIBRARY_REFRESHED_NOTICE);
          return;
        case "open-builder": {
          const shouldValidate =
            store.trackWorkspace.editorValidation.status === "unchecked";
          store.trackWorkspace = {
            ...store.trackWorkspace,
            notice: shouldValidate
              ? {
                  tone: "info",
                  message: "Checking the starter draft.",
                }
              : store.trackWorkspace.notice,
          };
          dispatch({ type: "navigate", route: "track" });
          root
            .querySelector<HTMLElement>("#track-builder-title")
            ?.focus({ preventScroll: true });
          if (shouldValidate) {
            void validateEditorDraft();
          }
          return;
        }
        case "open-selected-builder":
          if (store.trackWorkspace.selected !== undefined) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              toolsOpen: true,
              tab: "build",
              editor: replaceEditorTrack(
                store.trackWorkspace.editor,
                store.trackWorkspace.selected.track,
              ),
              editorPreview: store.trackWorkspace.selected,
              editorValidation: { status: "valid", errors: [] },
              notice: {
                tone: "success",
                message: "Selected track loaded into the piece editor.",
              },
            };
            dispatch({ type: "navigate", route: "track" });
            root
              .querySelector<HTMLElement>("#track-builder-title")
              ?.focus({ preventScroll: true });
          }
          return;
        case "close-builder": {
          const canceledTrackCommand = store.trackWorkspace.pending;
          if (canceledTrackCommand === "import") {
            store.trackImportRequestVersion += 1;
          }
          if (
            canceledTrackCommand === "validate" ||
            canceledTrackCommand === "assist"
          ) {
            store.trackValidationRequest += 1;
          }
          store.trackWorkspace = {
            ...store.trackWorkspace,
            toolsOpen: false,
            pending: null,
            notice:
              canceledTrackCommand === null
                ? store.trackWorkspace.notice
                : {
                    tone: "neutral",
                    message: dismissedTrackResponseMessage(
                      canceledTrackCommand,
                      "Track Builder closed",
                    ),
                  },
          };
          dispatch({ type: "navigate", route: "setup" });
          root
            .querySelector<HTMLElement>('[data-track-action="open-builder"]')
            ?.focus({ preventScroll: true });
          return;
        }
        case "builder-tab": {
          const tab = element.dataset.builderTab as TrackBuilderTab | undefined;
          if (tab === "build" || tab === "generate" || tab === "library") {
            const canceledTrackCommand =
              tab === store.trackWorkspace.tab
                ? null
                : store.trackWorkspace.pending;
            if (
              canceledTrackCommand === "validate" ||
              canceledTrackCommand === "assist"
            ) {
              ++store.trackValidationRequest;
            }
            if (canceledTrackCommand === "import") {
              ++store.trackImportRequestVersion;
            }
            const messages: Record<TrackBuilderTab, string> = {
              build: "Edit the pieces. Every change is previewed and checked.",
              generate:
                "Choose a seed, length, and difficulty to create a verified layout.",
              library: "Saved and imported tracks stay on this computer.",
            };
            store.trackWorkspace = {
              ...store.trackWorkspace,
              tab,
              pending:
                canceledTrackCommand === null
                  ? store.trackWorkspace.pending
                  : null,
              editorValidation:
                canceledTrackCommand === "validate"
                  ? { status: "unchecked", errors: [] }
                  : store.trackWorkspace.editorValidation,
              notice: {
                tone: "neutral",
                message:
                  canceledTrackCommand === null
                    ? messages[tab]
                    : `${dismissedTrackResponseMessage(canceledTrackCommand, "switching tools")} ${messages[tab]}`,
              },
            };
            render();
            if (
              tab === "build" &&
              store.trackWorkspace.editorValidation.status === "unchecked"
            ) {
              void validateEditorDraft();
            }
          }
          return;
        }
        case "editor-add": {
          const kind = element.dataset.segmentKind as SegmentKind | undefined;
          if (kind !== undefined) {
            setEditorDraft(
              addEditorPiece(store.trackWorkspace.editor, kind),
              "Piece added. Checking the new sequence.",
            );
          }
          return;
        }
        case "editor-delete": {
          const index = Number(element.dataset.pieceIndex);
          setEditorDraft(
            deleteEditorPiece(store.trackWorkspace.editor, index),
            "Piece removed. Checking the new sequence.",
          );
          return;
        }
        case "editor-duplicate": {
          const index = Number(element.dataset.pieceIndex);
          setEditorDraft(
            duplicateEditorPiece(store.trackWorkspace.editor, index),
            "Piece duplicated. Checking the new sequence.",
          );
          return;
        }
        case "editor-move": {
          const index = Number(element.dataset.pieceIndex);
          const direction = Number(element.dataset.direction) === -1 ? -1 : 1;
          setEditorDraft(
            moveEditorPiece(store.trackWorkspace.editor, index, direction),
            "Piece order changed. Checking the new sequence.",
          );
          return;
        }
        case "editor-undo":
          setEditorDraft(
            undoEditor(store.trackWorkspace.editor),
            "Change undone. Checking the restored sequence.",
          );
          return;
        case "editor-redo":
          setEditorDraft(
            redoEditor(store.trackWorkspace.editor),
            "Change restored. Checking the sequence.",
          );
          return;
        case "editor-reset":
          setEditorDraft(
            resetEditor(store.trackWorkspace.editor),
            "Editor reset to the starter loop. Checking it.",
          );
          return;
        case "editor-assist": {
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
          let response: TrackCommandResponse;
          try {
            response = await assistTrackClosure(draft);
          } catch (error) {
            if (
              requestId !== store.trackValidationRequest ||
              !isCurrentTrackCommand(requestVersion, "assist")
            ) {
              return;
            }
            throw error;
          }
          if (
            requestId !== store.trackValidationRequest ||
            !isCurrentTrackCommand(requestVersion, "assist")
          ) {
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
          return;
        }
        case "use-editor":
          if (
            store.trackWorkspace.editorValidation.status === "valid" &&
            store.trackWorkspace.editorPreview !== undefined
          ) {
            useCompiled(
              store.trackWorkspace.editorPreview,
              "This draft is now the active track.",
            );
          }
          return;
        case "regenerate":
        case "generate": {
          const sameSeedInputs =
            action === "regenerate"
              ? store.trackWorkspace.generatedInputs
              : undefined;
          const previousCandidate = sameSeedInputs
            ? store.trackWorkspace.generatedPreview
            : undefined;
          const seed =
            sameSeedInputs?.seed ??
            root.querySelector<HTMLInputElement>("[data-generator-seed]")
              ?.valueAsNumber ??
            0;
          const length =
            sameSeedInputs?.length ??
            (root.querySelector<HTMLInputElement>(
              'input[name="generator-length"]:checked',
            )?.value as "short" | "medium" | "long" | undefined);
          const difficulty =
            sameSeedInputs?.difficulty ??
            (root.querySelector<HTMLInputElement>(
              'input[name="generator-difficulty"]:checked',
            )?.value as "easy" | "technical" | "hard" | undefined);
          const generator = {
            seed,
            length: length ?? store.trackWorkspace.generator.length,
            difficulty: difficulty ?? store.trackWorkspace.generator.difficulty,
          };
          if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              notice: {
                tone: "error",
                message: "Seed must be a whole number from 0 to 2147483647.",
              },
            };
            render();
            return;
          }
          store.trackWorkspace = {
            ...store.trackWorkspace,
            generator,
            pending: "generate",
            notice: {
              tone: "info",
              message: "Searching for a valid layout from this seed.",
            },
          };
          render();
          const response = await generateTrack({
            ...generator,
          });
          if (!isCurrentTrackCommand(requestVersion, "generate")) {
            return;
          }
          if (response.valid && response.compiled !== undefined) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              pending: null,
              generatedInputs: generator,
              generatedFeatures: response.features,
              generatedPreview: response.compiled,
              notice: {
                tone: "success",
                message:
                  previousCandidate === undefined
                    ? `Candidate ready: ${String(response.compiled.track.pieces.length)} pieces from seed ${String(generator.seed)} (generator v${String(response.generatorVersion ?? "?")}, ${String(response.candidateCount ?? 1)} layout(s) checked). It is not active until you choose Use this track.`
                    : JSON.stringify(previousCandidate.track) ===
                        JSON.stringify(response.compiled.track)
                      ? `Same seed ${String(generator.seed)} returned the identical track.`
                      : `Same seed ${String(generator.seed)} returned a different track. Treat earlier results from this seed as not comparable.`,
              },
            };
          } else {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              pending: null,
              generatedInputs: undefined,
              generatedFeatures: undefined,
              generatedPreview: undefined,
              notice: {
                tone: "error",
                message:
                  response.errors[0]?.message ?? "Track generation failed.",
              },
            };
          }
          render();
          return;
        }
        case "use-generated":
          if (store.trackWorkspace.generatedPreview !== undefined) {
            useCompiled(
              store.trackWorkspace.generatedPreview,
              "This candidate is now the active track.",
              store.trackWorkspace.generatedInputs?.seed,
            );
          }
          return;
        case "edit-generated":
          if (store.trackWorkspace.generatedPreview !== undefined) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              tab: "build",
              editor: replaceEditorTrack(
                store.trackWorkspace.editor,
                store.trackWorkspace.generatedPreview.track,
              ),
              editorPreview: store.trackWorkspace.generatedPreview,
              editorValidation: { status: "valid", errors: [] },
              notice: {
                tone: "success",
                message: "Generated track loaded into the piece editor.",
              },
            };
            render();
            root
              .querySelector<HTMLElement>('[data-builder-tab="build"]')
              ?.focus({ preventScroll: true });
          }
          return;
        case "save-editor":
          if (
            store.trackWorkspace.editorValidation.status === "valid" &&
            store.trackWorkspace.editorPreview !== undefined
          ) {
            await saveCompiledTrack(
              store.trackWorkspace.editorPreview,
              requestVersion,
            );
          }
          return;
        case "save-generated":
          if (store.trackWorkspace.generatedPreview !== undefined) {
            await saveCompiledTrack(
              store.trackWorkspace.generatedPreview,
              requestVersion,
            );
          }
          return;
        case "export-editor":
          if (
            store.trackWorkspace.editorValidation.status === "valid" &&
            store.trackWorkspace.editorPreview !== undefined
          ) {
            downloadTrack(store.trackWorkspace.editorPreview);
          }
          return;
        case "export-generated":
          if (store.trackWorkspace.generatedPreview !== undefined) {
            downloadTrack(store.trackWorkspace.generatedPreview);
          }
          return;
        case "use-library": {
          const compiled = libraryTrack(element.dataset.trackId);
          if (compiled !== undefined) {
            useCompiled(compiled, "Saved track selected for this experiment.");
          }
          return;
        }
        case "edit-library": {
          const compiled = libraryTrack(element.dataset.trackId);
          if (compiled !== undefined) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              tab: "build",
              editor: replaceEditorTrack(
                store.trackWorkspace.editor,
                compiled.track,
              ),
              editorPreview: compiled,
              editorValidation: { status: "valid", errors: [] },
              notice: {
                tone: "success",
                message: "Saved track loaded into the piece editor.",
              },
            };
            render();
            root
              .querySelector<HTMLElement>('[data-builder-tab="build"]')
              ?.focus({ preventScroll: true });
          }
          return;
        }
        case "export-library": {
          const compiled = libraryTrack(element.dataset.trackId);
          if (compiled !== undefined) {
            downloadTrack(compiled);
          }
          return;
        }
        case "delete-library": {
          const trackId = element.dataset.trackId;
          const compiled = libraryTrack(trackId);
          if (
            trackId !== undefined &&
            compiled !== undefined &&
            window.confirm(
              `Delete “${compiled.track.name}” from the local track library?`,
            )
          ) {
            store.trackWorkspace = {
              ...store.trackWorkspace,
              pending: "delete",
              notice: {
                tone: "info",
                message: `Deleting ${compiled.track.name} from the local track library.`,
              },
            };
            render();
            await deleteTrack(trackId);
            if (!isCurrentTrackCommand(requestVersion, "delete")) {
              await refreshLibrary();
              return;
            }
            store.trackWorkspace = {
              ...store.trackWorkspace,
              pending: null,
              notice: {
                tone: "success",
                message: "Track deleted from the local library.",
              },
            };
            await refreshLibrary();
          }
          return;
        }
      }
    } catch (error) {
      if (
        requestVersion !== store.trackCommandRequestVersion ||
        store.state.route !== "track" ||
        !store.trackWorkspace.toolsOpen
      ) {
        if (
          action === "save-editor" ||
          action === "save-generated" ||
          action === "delete-library"
        ) {
          await refreshLibrary();
        }
        return;
      }
      store.trackWorkspace = {
        ...store.trackWorkspace,
        pending: null,
        notice: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "No response yet from the local core. Try again.",
        },
      };
      render();
    }
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

  const retryPresetTracks = (): void => {
    if (store.presetGeometry.status === "loading") {
      return;
    }
    store.presetGeometry = { status: "loading" };
    render();
    void refreshPresetGeometry();
  };

  return {
    dropEditorPiece,
    handleTrackAction,
    importTrack,
    refreshLibrary,
    refreshPresetGeometry,
    retryPresetTracks,
    setEditorDraft,
  };
}
