import type {
  AlgorithmId,
  AppAction,
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
  toggleReplay: () => void;
  seekReplay: (frameIndex: number) => void;
  setRaceSpeed: (speed: number) => void;
  reviewRecommended: () => void;
  reviseSetup: () => void;
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

/**
 * Installs delegated listeners on the application root once. The page is
 * patched in place, so listeners never need rebinding after a render.
 */
export function installActions(
  root: HTMLElement,
  handlers: ActionHandlers,
): void {
  const {
    dispatch,
    review,
    startSession,
    controlSession,
    moveReplay,
    toggleReplay,
    seekReplay,
    setRaceSpeed,
    reviewRecommended,
    reviseSetup,
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

  const closest = (event: Event, selector: string): HTMLElement | null => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return null;
    }
    const match = target.closest<HTMLElement>(selector);
    return match !== null && root.contains(match) ? match : null;
  };
  const isDisabled = (element: HTMLElement): boolean =>
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true";

  root.addEventListener("click", (event) => {
    const routeElement = closest(event, "[data-route]");
    if (routeElement !== null && !isDisabled(routeElement)) {
      event.preventDefault();
      const route = routeElement.dataset.route as RouteId | undefined;
      if (route !== undefined) {
        dispatch({ type: "navigate", route });
      }
      return;
    }
    const element = closest(event, "[data-action]");
    if (element === null || isDisabled(element)) {
      return;
    }
    {
      switch (element.dataset.action) {
        case "begin-setup":
          dispatch({ type: "begin-setup" });
          break;
        case "review":
          void review();
          break;
        case "review-recommended":
          reviewRecommended();
          break;
        case "revise-setup":
          reviseSetup();
          break;
        case "replay-toggle":
          toggleReplay();
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
        case "race-speed":
          setRaceSpeed(Number(element.dataset.speed));
          break;
        case "retry-preset-tracks":
          retryPresetTracks();
          break;
        case "retry-run-library":
          retryRunLibrary();
          break;
      }
    }
  });

  root.addEventListener("click", (event) => {
    const element = closest(event, "[data-run-action]");
    if (element === null || isDisabled(element)) {
      return;
    }
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

  root.addEventListener("click", (event) => {
    const element = closest(event, "[data-track-action]");
    if (element === null || isDisabled(element)) {
      return;
    }
    const action = element.dataset.trackAction;
    if (action !== undefined) {
      void handleTrackAction(action, element);
    }
  });

  root.addEventListener("click", (event) => {
    const button = closest(event, "[data-training-preset]");
    if (button === null || isDisabled(button)) {
      return;
    }
    const preset = button.dataset.trainingPreset as
      TrainingPresetId | undefined;
    if (preset !== undefined) {
      dispatch({ type: "apply-training-preset", preset });
    }
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

  root.addEventListener("dragstart", (event) => {
    const element = closest(
      event,
      "[data-editor-drag-kind], [data-editor-drag-index]",
    );
    if (element === null) {
      return;
    }
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
  root.addEventListener("dragend", clearEditorDrag);

  root.addEventListener("dragover", (event) => {
    const dropZone = closest(event, "[data-track-drop-index]");
    if (
      dropZone === null ||
      !(event instanceof DragEvent) ||
      dragPayload === null
    ) {
      return;
    }
    event.preventDefault();
    root
      .querySelectorAll<HTMLElement>(".sequence-drop-zone.is-drop-target")
      .forEach((element) => {
        if (element !== dropZone) {
          element.classList.remove("is-drop-target");
        }
      });
    dropZone.classList.add("is-drop-target");
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect =
        dragPayload.source === "palette" ? "copy" : "move";
    }
  });
  root.addEventListener("dragleave", (event) => {
    const dropZone = closest(event, "[data-track-drop-index]");
    if (dropZone === null) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !dropZone.contains(nextTarget)) {
      dropZone.classList.remove("is-drop-target");
    }
  });
  root.addEventListener("drop", (event) => {
    const dropZone = closest(event, "[data-track-drop-index]");
    if (
      dropZone === null ||
      !(event instanceof DragEvent) ||
      dragPayload === null
    ) {
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

  root.addEventListener("keydown", (event) => {
    const tab = closest(event, '[role="tab"][data-track-action="builder-tab"]');
    if (tab === null) {
      return;
    }
    {
      {
        const tabs = [
          ...root.querySelectorAll<HTMLElement>(
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
      }
    }
  });

  const commitEditorDetails = (): void => {
    const editorName =
      root.querySelector<HTMLInputElement>("[data-editor-name]");
    const editorWidth = root.querySelector<HTMLInputElement>(
      "[data-editor-width]",
    );
    if (editorName !== null && editorWidth !== null) {
      updateEditor(editorName.value, editorWidth.valueAsNumber);
    }
  };

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

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.matches("[data-replay-scrub]")) {
      seekReplay(target.valueAsNumber);
    } else if (target.matches("[data-editor-width]")) {
      const output = target.parentElement?.querySelector("output");
      if (output !== null && output !== undefined) {
        output.textContent = `${String(target.valueAsNumber)} m`;
      }
    } else if (target.matches("[data-generator-seed]")) {
      updateGeneratorDraft();
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement &&
      target.matches("[data-algorithm]")
    ) {
      dispatch({
        type: "set-algorithm",
        algorithm: target.value as AlgorithmId,
      });
      return;
    }
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.matches("[data-track-import]")) {
      const file = target.files?.[0];
      if (file !== undefined) {
        void importTrack(file);
      }
    } else if (target.matches('input[name="trackPreset"]')) {
      dispatch({ type: "select-track", trackPreset: target.value });
    } else if (target.matches("[data-editor-name], [data-editor-width]")) {
      commitEditorDetails();
    } else if (
      target.matches(
        'input[name="generator-length"], input[name="generator-difficulty"]',
      )
    ) {
      updateGeneratorDraft();
    } else if (target.matches("[data-number-setting]")) {
      const field = target.dataset.numberSetting as NumericSetting | undefined;
      if (field !== undefined) {
        dispatch({ type: "set-number", field, value: target.valueAsNumber });
      }
    }
  });
}
