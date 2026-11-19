import type { AppContext } from "../app-store";
import { downloadTrack } from "../downloads";
import {
  deleteRecord,
  generateTrack,
  loadPresetTracks,
  loadTrackLibrary,
  saveTrack,
} from "../ipc";
import {
  generatedBadge,
  withEditorTrack,
  type TrackBuilderPending,
  type TrackBuilderTab,
  type TrackWorkspaceState,
} from "../track-builder";
import type { CompiledTrackV1 } from "../track-renderer";
import type { TrackCommandResponse } from "../track-workbench";
import { createTrackEditing } from "./track-editing";
import { createTrackValidation } from "./track-validation";

export const TRACK_LIBRARY_REFRESHED_NOTICE: TrackWorkspaceState["notice"] = {
  tone: "success",
  message: "Local track library refreshed.",
};

/** Drops the response of a validation, assist or import still in flight. */
export function cancelTrackRequests(
  requests: AppContext["store"]["requests"],
  pending: TrackBuilderPending,
): void {
  if (pending === "import") {
    requests.trackImport.cancel();
  }
  if (pending === "validate" || pending === "assist") {
    requests.trackValidation.cancel();
  }
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

  const { tone, glyph, label } = generatedBadge(workspace);
  const inputsChanged = tone === "warning";
  badge.className = `validation-badge is-${tone}`;
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

type TrackActionHandler = (
  element: HTMLElement,
  isCurrentRequest: () => boolean,
) => Promise<void> | void;

const BUILDER_TAB_MESSAGES: Record<TrackBuilderTab, string> = {
  build: "Edit the pieces. Every change is previewed and checked.",
  generate:
    "Choose a seed, length, and difficulty to create a verified layout.",
  library: "Saved and imported tracks stay on this computer.",
};

/** Actions that may have written the library before they failed or were dropped. */
const LIBRARY_WRITE_ACTIONS: ReadonlySet<string> = new Set([
  "save-editor",
  "save-generated",
  "delete-library",
]);

function generatedNotice(
  response: TrackCommandResponse,
  compiled: CompiledTrackV1,
  seed: number,
  previousCandidate: CompiledTrackV1 | undefined,
): string {
  if (previousCandidate === undefined) {
    return `Candidate ready: ${String(compiled.track.pieces.length)} pieces from seed ${String(seed)} (generator v${String(response.generatorVersion ?? "?")}, ${String(response.candidateCount ?? 1)} layout(s) checked). It is not active until you choose Use this track.`;
  }
  return JSON.stringify(previousCandidate.track) ===
    JSON.stringify(compiled.track)
    ? `Same seed ${String(seed)} returned the identical track.`
    : `Same seed ${String(seed)} returned a different track. Treat earlier results from this seed as not comparable.`;
}

export function createTrackCommands(context: AppContext) {
  const { root, store, render, dispatch } = context;

  const isCurrentTrackCommand = (
    isCurrentRequest: () => boolean,
    pending: Exclude<TrackBuilderPending, null>,
  ): boolean =>
    isCurrentRequest() &&
    store.state.route === "track" &&
    store.trackWorkspace.toolsOpen &&
    store.trackWorkspace.pending === pending;

  async function refreshPresetGeometry(): Promise<void> {
    const isCurrentRequest = store.requests.presetGeometry.begin();
    try {
      const response = await loadPresetTracks();
      if (!isCurrentRequest()) {
        return;
      }
      store.presetGeometry = { status: "ready", presets: response.presets };
    } catch (error) {
      if (!isCurrentRequest()) {
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
    const isCurrentRequest = store.requests.trackLibrary.begin();
    try {
      const library = await loadTrackLibrary();
      if (!isCurrentRequest()) {
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
      if (!isCurrentRequest()) {
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

  const { assistEditorClosure, importTrack, validateEditorDraft } =
    createTrackValidation(context, isCurrentTrackCommand);
  const { dropEditorPiece, handleEditorAction, setEditorDraft } =
    createTrackEditing(context, validateEditorDraft);

  const saveCompiledTrack = async (
    compiled: CompiledTrackV1,
    isCurrentRequest: () => boolean,
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
    if (!isCurrentTrackCommand(isCurrentRequest, "save")) {
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

  const editInBuilder = (compiled: CompiledTrackV1, message: string): void => {
    store.trackWorkspace = withEditorTrack(
      store.trackWorkspace,
      compiled,
      message,
    );
    render();
    root
      .querySelector<HTMLElement>('[data-builder-tab="build"]')
      ?.focus({ preventScroll: true });
  };

  const focusBuilderTitle = (): void => {
    root
      .querySelector<HTMLElement>("#track-builder-title")
      ?.focus({ preventScroll: true });
  };

  /** The editor draft once it passed validation, or undefined. */
  const validEditorPreview = (): CompiledTrackV1 | undefined =>
    store.trackWorkspace.editorValidation.status === "valid"
      ? store.trackWorkspace.editorPreview
      : undefined;

  const generatedPreview = (): CompiledTrackV1 | undefined =>
    store.trackWorkspace.generatedPreview;

  const refreshLibraryAction = async (): Promise<void> => {
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
  };

  const openBuilder = (): void => {
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
    focusBuilderTitle();
    if (shouldValidate) {
      void validateEditorDraft();
    }
  };

  const openSelectedBuilder = (): void => {
    if (store.trackWorkspace.selected === undefined) {
      return;
    }
    store.trackWorkspace = {
      ...withEditorTrack(
        store.trackWorkspace,
        store.trackWorkspace.selected,
        "Selected track loaded into the piece editor.",
      ),
      toolsOpen: true,
    };
    dispatch({ type: "navigate", route: "track" });
    focusBuilderTitle();
  };

  const closeBuilder = (): void => {
    const canceledTrackCommand = store.trackWorkspace.pending;
    cancelTrackRequests(store.requests, canceledTrackCommand);
    store.trackWorkspace = {
      ...store.trackWorkspace,
      toolsOpen: false,
      pending: null,
    };
    dispatch({ type: "navigate", route: "setup" });
    root
      .querySelector<HTMLElement>('[data-track-action="open-builder"]')
      ?.focus({ preventScroll: true });
  };

  const switchBuilderTab = (element: HTMLElement): void => {
    const tab = element.dataset.builderTab as TrackBuilderTab | undefined;
    if (tab !== "build" && tab !== "generate" && tab !== "library") {
      return;
    }
    const canceledTrackCommand =
      tab === store.trackWorkspace.tab ? null : store.trackWorkspace.pending;
    cancelTrackRequests(store.requests, canceledTrackCommand);
    store.trackWorkspace = {
      ...store.trackWorkspace,
      tab,
      pending:
        canceledTrackCommand === null ? store.trackWorkspace.pending : null,
      editorValidation:
        canceledTrackCommand === "validate"
          ? { status: "unchecked", errors: [] }
          : store.trackWorkspace.editorValidation,
      notice: {
        tone: "neutral",
        message: BUILDER_TAB_MESSAGES[tab],
      },
    };
    render();
    if (
      tab === "build" &&
      store.trackWorkspace.editorValidation.status === "unchecked"
    ) {
      void validateEditorDraft();
    }
  };

  /** Generator inputs from the form, or the last generated inputs for a same-seed rerun. */
  const generatorRequest = (
    sameSeedInputs: TrackWorkspaceState["generatedInputs"],
  ): TrackWorkspaceState["generator"] => {
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
    return {
      seed,
      length: length ?? store.trackWorkspace.generator.length,
      difficulty: difficulty ?? store.trackWorkspace.generator.difficulty,
    };
  };

  const generateCandidate = async (
    sameSeed: boolean,
    isCurrentRequest: () => boolean,
  ): Promise<void> => {
    const sameSeedInputs = sameSeed
      ? store.trackWorkspace.generatedInputs
      : undefined;
    const previousCandidate = sameSeedInputs
      ? store.trackWorkspace.generatedPreview
      : undefined;
    const generator = generatorRequest(sameSeedInputs);
    const { seed } = generator;
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
    const response = await generateTrack(generator);
    if (!isCurrentTrackCommand(isCurrentRequest, "generate")) {
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
          message: generatedNotice(
            response,
            response.compiled,
            seed,
            previousCandidate,
          ),
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
          message: response.errors[0]?.message ?? "Track generation failed.",
        },
      };
    }
    render();
  };

  const deleteLibraryTrack = async (
    element: HTMLElement,
    isCurrentRequest: () => boolean,
  ): Promise<void> => {
    const trackId = element.dataset.trackId;
    const compiled = libraryTrack(trackId);
    if (
      trackId === undefined ||
      compiled === undefined ||
      !window.confirm(
        `Delete “${compiled.track.name}” from the local track library?`,
      )
    ) {
      return;
    }
    store.trackWorkspace = {
      ...store.trackWorkspace,
      pending: "delete",
      notice: {
        tone: "info",
        message: `Deleting ${compiled.track.name} from the local track library.`,
      },
    };
    render();
    await deleteRecord("track", trackId);
    if (!isCurrentTrackCommand(isCurrentRequest, "delete")) {
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
  };

  /** Runs `use` with the track `track()` returns, when there is one. */
  const withTrack =
    (
      track: () => CompiledTrackV1 | undefined,
      use: (compiled: CompiledTrackV1) => void,
    ) =>
    (): void => {
      const compiled = track();
      if (compiled !== undefined) {
        use(compiled);
      }
    };

  /** Runs `use` with the library track the clicked element names, if it still exists. */
  const withLibraryTrack =
    (use: (compiled: CompiledTrackV1) => void) =>
    (element: HTMLElement): void => {
      const compiled = libraryTrack(element.dataset.trackId);
      if (compiled !== undefined) {
        use(compiled);
      }
    };

  const saveTrackFrom =
    (track: () => CompiledTrackV1 | undefined): TrackActionHandler =>
    async (_element, isCurrentRequest) => {
      const compiled = track();
      if (compiled !== undefined) {
        await saveCompiledTrack(compiled, isCurrentRequest);
      }
    };

  const trackActionHandlers: Record<string, TrackActionHandler> = {
    "refresh-library": refreshLibraryAction,
    "open-builder": openBuilder,
    "open-selected-builder": openSelectedBuilder,
    "close-builder": closeBuilder,
    "builder-tab": switchBuilderTab,
    "editor-assist": (_element, isCurrentRequest) =>
      assistEditorClosure(isCurrentRequest),
    "use-editor": withTrack(validEditorPreview, (compiled) => {
      useCompiled(compiled, "This draft is now the active track.");
    }),
    generate: (_element, isCurrentRequest) =>
      generateCandidate(false, isCurrentRequest),
    regenerate: (_element, isCurrentRequest) =>
      generateCandidate(true, isCurrentRequest),
    "use-generated": withTrack(generatedPreview, (compiled) => {
      useCompiled(
        compiled,
        "This candidate is now the active track.",
        store.trackWorkspace.generatedInputs?.seed,
      );
    }),
    "edit-generated": withTrack(generatedPreview, (compiled) => {
      editInBuilder(compiled, "Generated track loaded into the piece editor.");
    }),
    "save-editor": saveTrackFrom(validEditorPreview),
    "save-generated": saveTrackFrom(generatedPreview),
    "export-editor": withTrack(validEditorPreview, downloadTrack),
    "export-generated": withTrack(generatedPreview, downloadTrack),
    "use-library": withLibraryTrack((compiled) => {
      useCompiled(compiled, "Saved track selected for this experiment.");
    }),
    "edit-library": withLibraryTrack((compiled) => {
      editInBuilder(compiled, "Saved track loaded into the piece editor.");
    }),
    "export-library": withLibraryTrack(downloadTrack),
    "delete-library": deleteLibraryTrack,
  };

  const showTrackCommandError = async (
    action: string,
    error: unknown,
    isCurrentRequest: () => boolean,
  ): Promise<void> => {
    if (
      !isCurrentRequest() ||
      store.state.route !== "track" ||
      !store.trackWorkspace.toolsOpen
    ) {
      if (LIBRARY_WRITE_ACTIONS.has(action)) {
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
  };

  const handleTrackAction = async (
    action: string,
    element: HTMLElement,
  ): Promise<void> => {
    const repeatsActiveTab =
      action === "builder-tab" &&
      element.dataset.builderTab === store.trackWorkspace.tab;
    // Re-selecting the open tab keeps the command already in flight.
    const isCurrentRequest = repeatsActiveTab
      ? store.requests.trackCommand.current()
      : store.requests.trackCommand.begin();
    try {
      if (handleEditorAction(action, element)) {
        return;
      }
      if (Object.hasOwn(trackActionHandlers, action)) {
        await trackActionHandlers[action]?.(element, isCurrentRequest);
      }
    } catch (error) {
      await showTrackCommandError(action, error, isCurrentRequest);
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
