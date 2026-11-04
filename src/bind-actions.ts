import type {
  AlgorithmId,
  AppAction,
  AppState,
  NumericSetting,
  RouteId,
  TrainingPresetId,
} from "./onboarding";
import type { SegmentKind } from "./track-workbench";

export type EditorDragPayload =
  | { source: "palette"; kind: SegmentKind }
  | { source: "sequence"; pieceIndex: number };

export interface ActionHandlers {
  dispatch: (action: AppAction) => void;
  review: () => Promise<void>;
  startSession: () => Promise<void>;
  controlSession: (command: "pause" | "resume" | "stop") => Promise<void>;
  moveReplay: (action: "previous" | "next" | "restart") => void;
  handleRunAction: (
    action: "resume" | "open" | "delete" | "export",
    runId: string,
  ) => Promise<void>;
  handleTrackAction: (action: string, element: HTMLElement) => Promise<void>;
  dropEditorPiece: (payload: EditorDragPayload, insertionIndex: number) => void;
  importTrack: (file: File) => Promise<void>;
  retryPresetTracks: () => void;
  retryRunLibrary: () => void;
  exitApplication: () => Promise<void>;
  toggleReducedMotion: () => void;
  updateEditor: (name: string, roadWidth: number) => void;
  updateGenerator: (
    seed: number,
    length: "short" | "medium" | "long",
    difficulty: "easy" | "technical" | "hard",
  ) => void;
}

export function bindActions(
  root: HTMLElement,
  state: AppState,
  handlers: ActionHandlers,
): void {
  const {
    dispatch,
    review,
    startSession,
    controlSession,
    moveReplay,
    handleRunAction,
    handleTrackAction,
    dropEditorPiece,
    importTrack,
    retryPresetTracks,
    retryRunLibrary,
    exitApplication,
    toggleReducedMotion,
    updateEditor,
    updateGenerator,
  } = handlers;

  root.querySelectorAll<HTMLElement>("[data-route]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const route = element.dataset.route as RouteId | undefined;
      if (route !== undefined) {
        dispatch({ type: "navigate", route });
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      switch (element.dataset.action) {
        case "begin-setup":
          dispatch({ type: "begin-setup" });
          break;
        case "review":
          void review();
          break;
        case "start-session":
          void startSession();
          break;
        case "pause-run":
          void controlSession("pause");
          break;
        case "resume-run":
          void controlSession("resume");
          break;
        case "stop-run":
          void controlSession("stop");
          break;
        case "view-results":
          dispatch({ type: "view-results" });
          break;
        case "new-setup":
          dispatch({ type: "new-setup" });
          break;
        case "replay-restart":
          moveReplay("restart");
          break;
        case "replay-previous":
          moveReplay("previous");
          break;
        case "replay-next":
          moveReplay("next");
          break;
        case "exit-application":
          void exitApplication();
          break;
        case "toggle-motion":
          toggleReducedMotion();
          break;
        case "retry-preset-tracks":
          retryPresetTracks();
          break;
        case "retry-run-library":
          retryRunLibrary();
          break;
      }
    });
  });

  root
    .querySelectorAll<HTMLInputElement>('input[name="trackPreset"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        dispatch({
          type: "select-track",
          trackPreset: input.value,
        });
      });
    });

  root.querySelectorAll<HTMLElement>("[data-run-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.dataset.runAction;
      const runId = element.dataset.runId;
      if (
        (action === "resume" ||
          action === "open" ||
          action === "delete" ||
          action === "export") &&
        runId !== undefined
      ) {
        void handleRunAction(action, runId);
      }
    });
  });

  root
    .querySelectorAll<HTMLElement>("[data-track-action]")
    .forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.dataset.trackAction;
        if (action !== undefined) {
          void handleTrackAction(action, element);
        }
      });
    });

  let dragPayload: EditorDragPayload | null = null;
  const clearEditorDrag = (): void => {
    dragPayload = null;
    root
      .querySelectorAll<HTMLElement>(
        ".is-dragging, .is-drop-target, .is-drag-active",
      )
      .forEach((element) => {
        element.classList.remove(
          "is-dragging",
          "is-drop-target",
          "is-drag-active",
        );
      });
  };

  root
    .querySelectorAll<HTMLElement>(
      "[data-editor-drag-kind], [data-editor-drag-index]",
    )
    .forEach((element) => {
      element.addEventListener("dragstart", (event) => {
        if (!(event instanceof DragEvent) || element.matches(":disabled")) {
          event.preventDefault();
          return;
        }
        const kind = element.dataset.editorDragKind as SegmentKind | undefined;
        const pieceIndex = Number(element.dataset.editorDragIndex);
        dragPayload =
          kind === undefined
            ? Number.isInteger(pieceIndex) && pieceIndex > 0
              ? { source: "sequence", pieceIndex }
              : null
            : { source: "palette", kind };
        if (dragPayload === null) {
          event.preventDefault();
          return;
        }
        element.classList.add("is-dragging");
        root
          .querySelector<HTMLElement>(".builder-sequence")
          ?.classList.add("is-drag-active");
        if (event.dataTransfer !== null) {
          event.dataTransfer.effectAllowed =
            dragPayload.source === "palette" ? "copy" : "move";
          event.dataTransfer.setData(
            "text/plain",
            dragPayload.source === "palette"
              ? dragPayload.kind
              : String(dragPayload.pieceIndex),
          );
        }
      });
      element.addEventListener("dragend", clearEditorDrag);
    });

  root
    .querySelectorAll<HTMLElement>("[data-track-drop-index]")
    .forEach((dropZone) => {
      dropZone.addEventListener("dragover", (event) => {
        if (!(event instanceof DragEvent) || dragPayload === null) {
          return;
        }
        event.preventDefault();
        root
          .querySelectorAll<HTMLElement>(".sequence-drop-zone.is-drop-target")
          .forEach((element) => {
            element.classList.remove("is-drop-target");
          });
        dropZone.classList.add("is-drop-target");
        if (event.dataTransfer !== null) {
          event.dataTransfer.dropEffect =
            dragPayload.source === "palette" ? "copy" : "move";
        }
      });
      dropZone.addEventListener("dragleave", (event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !dropZone.contains(nextTarget)) {
          dropZone.classList.remove("is-drop-target");
        }
      });
      dropZone.addEventListener("drop", (event) => {
        if (!(event instanceof DragEvent) || dragPayload === null) {
          return;
        }
        event.preventDefault();
        const payload = dragPayload;
        const insertionIndex = Number(dropZone.dataset.trackDropIndex);
        clearEditorDrag();
        if (Number.isInteger(insertionIndex)) {
          dropEditorPiece(payload, insertionIndex);
        }
      });
    });

  root
    .querySelectorAll<HTMLButtonElement>(
      '[role="tab"][data-track-action="builder-tab"]',
    )
    .forEach((tab) => {
      tab.addEventListener("keydown", (event) => {
        const tabs = [
          ...root.querySelectorAll<HTMLButtonElement>(
            '[role="tab"][data-track-action="builder-tab"]',
          ),
        ];
        const currentIndex = tabs.indexOf(tab);
        if (currentIndex < 0 || tabs.length === 0) {
          return;
        }
        let nextIndex: number | undefined;
        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }
        if (nextIndex === undefined) {
          return;
        }
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        nextTab?.focus();
        nextTab?.click();
      });
    });

  root
    .querySelector<HTMLInputElement>("[data-track-import]")
    ?.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (file !== undefined) {
        void importTrack(file);
      }
    });

  const editorName = root.querySelector<HTMLInputElement>("[data-editor-name]");
  const editorWidth = root.querySelector<HTMLInputElement>(
    "[data-editor-width]",
  );
  const commitEditorDetails = (): void => {
    if (editorName !== null && editorWidth !== null) {
      updateEditor(editorName.value, editorWidth.valueAsNumber);
    }
  };
  editorName?.addEventListener("change", commitEditorDetails);
  editorWidth?.addEventListener("input", () => {
    const output = editorWidth.parentElement?.querySelector("output");
    if (output !== null && output !== undefined) {
      output.textContent = `${String(editorWidth.valueAsNumber)} m`;
    }
  });
  editorWidth?.addEventListener("change", commitEditorDetails);

  const updateGeneratorDraft = (): void => {
    const seed =
      root.querySelector<HTMLInputElement>("[data-generator-seed]")
        ?.valueAsNumber ?? 0;
    const length = root.querySelector<HTMLInputElement>(
      'input[name="generator-length"]:checked',
    )?.value as "short" | "medium" | "long" | undefined;
    const difficulty = root.querySelector<HTMLInputElement>(
      'input[name="generator-difficulty"]:checked',
    )?.value as "easy" | "technical" | "hard" | undefined;
    if (length !== undefined && difficulty !== undefined) {
      updateGenerator(seed, length, difficulty);
    }
  };
  root
    .querySelector<HTMLInputElement>("[data-generator-seed]")
    ?.addEventListener("input", updateGeneratorDraft);
  root
    .querySelectorAll<HTMLInputElement>(
      'input[name="generator-length"], input[name="generator-difficulty"]',
    )
    .forEach((input) => {
      input.addEventListener("change", updateGeneratorDraft);
    });

  root
    .querySelectorAll<HTMLButtonElement>("[data-training-preset]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.trainingPreset as
          TrainingPresetId | undefined;
        if (preset !== undefined) {
          dispatch({ type: "apply-training-preset", preset });
        }
      });
    });

  root
    .querySelector<HTMLSelectElement>("[data-algorithm]")
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      dispatch({
        type: "set-algorithm",
        algorithm: select.value as AlgorithmId,
      });
    });

  root
    .querySelectorAll<HTMLInputElement>("[data-number-setting]")
    .forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.numberSetting as NumericSetting | undefined;
        if (field !== undefined) {
          dispatch({ type: "set-number", field, value: input.valueAsNumber });
        }
      });
    });

  if (state.route === "review" && state.validation.status === "not-checked") {
    void review();
  }
}
