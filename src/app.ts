import {
  ROUTES,
  TRACK_PRESETS,
  TRAINING_PRESETS,
  canRequestReview,
  canStartSession,
  createInitialState,
  getPresentationIssues,
  maximumCandidateEpisodes,
  startFailurePresentation,
  transition,
  type AlgorithmId,
  type AppAction,
  type AppState,
  type NumericSetting,
  type RouteId,
  type TrainingPresetId,
} from "./onboarding";
import {
  assistTrackClosure,
  commandRun,
  compileTrack,
  deleteRun,
  deleteTrack,
  exportRun,
  generateTrack,
  loadPresetTracks,
  loadRunLibrary,
  loadTrackLibrary,
  observeRun,
  openRun,
  resumeRun,
  saveTrack,
  serviceUnavailableResponse,
  shutdownApplication,
  startRun,
  validateSetup,
} from "./ipc";
import {
  interpolateTrackMarker,
  loopingReplayTrackMarker,
  sameTrackMarker,
  shouldAnimateReplay,
  trackMarkerTransform,
} from "./live-motion";
import {
  mergeObservationSnapshot,
  observationPollDelay,
} from "./observer-refresh";
import {
  priorGenerationTrails,
  replayTrackTrail,
  updateGenerationTrails,
  type GenerationTrail,
} from "./generation-trails";
import type {
  ObservationSnapshotV1,
  GenerationReplayV1,
  ReplayFrameV1,
  RunResultV1,
  RunDocumentV1,
  RunLibraryResponseV1,
  SelectedCarTelemetryV1,
} from "./simulation";
import {
  replayFrameIndexAfterAction,
  runCompletion,
  runControls,
  runProgress,
  type RunCommand,
} from "./run-presentation";
import {
  renderTrackSvg,
  type CompiledTrackV1,
  type TrackMarker,
} from "./track-renderer";
import {
  addEditorPiece,
  deleteEditorPiece,
  duplicateEditorPiece,
  editorTrack,
  insertEditorPiece,
  moveEditorPiece,
  moveEditorPieceToIndex,
  parseTrackDocument,
  redoEditor,
  replaceEditorTrack,
  resetEditor,
  serializeTrackDocument,
  undoEditor,
  updateEditorDetails,
  type EditorState,
  type SegmentKind,
  type TrackCommandResponse,
} from "./track-workbench";
import {
  createTrackWorkspaceState,
  generatorInputsChanged,
  renderTrackBuilder,
  type TrackBuilderTab,
  type TrackBuilderPending,
  type TrackWorkspaceState,
} from "./track-builder";

const ROUTE_ORDER = new Map<RouteId, number>(
  ROUTES.map((route, index) => [route.id, index]),
);
const MIN_MARKER_TWEEN_MS = 100;
const MAX_MARKER_TWEEN_MS = 240;
const MARKER_TWEEN_SCALE = 1.25;
const CHAMPION_REPLAY_RATE = 2;
const RESULTS_REPLAY_RATE = 1;
const TRACK_LIBRARY_REFRESHED_NOTICE: TrackWorkspaceState["notice"] = {
  tone: "success",
  message: "Local track library refreshed.",
};

type EditorDragPayload =
  | { source: "palette"; kind: SegmentKind }
  | { source: "sequence"; pieceIndex: number };

interface LiveMarkerMotion {
  candidateId: string;
  from: TrackMarker;
  to: TrackMarker;
  startedAt: number;
  durationMs: number;
  targetReceivedAt: number;
}

interface ChampionReplayMotion {
  key: string;
  frames: ReplayFrameV1[];
  startedAt: number;
  rate: number;
}

function closureRepairMessage(response: TrackCommandResponse): string {
  const added = response.addedPieces?.length ?? 0;
  const removed = response.removedPieces ?? 0;
  if (removed > 0 && added > 0) {
    return `Python removed ${String(removed)} trailing piece(s), added ${String(added)}, and verified the repaired loop.`;
  }
  if (removed > 0) {
    return `Python removed ${String(removed)} trailing piece(s) and restored the last valid loop.`;
  }
  if (added > 0) {
    return `Python added ${String(added)} piece(s) and verified the closed loop.`;
  }
  return "The loop was already valid; no repair was needed.";
}

function dismissedTrackResponseMessage(
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

export interface AppController {
  getState(): AppState;
  dispatch(action: AppAction): void;
}

export function showsBackgroundEvaluation(
  live: boolean,
  replay: GenerationReplayV1 | null | undefined,
): boolean {
  return (
    live && replay !== null && replay !== undefined && replay.frames.length > 0
  );
}

type PresetGeometryState =
  | { status: "loading" }
  | { status: "ready"; presets: CompiledTrackV1[] }
  | { status: "unavailable"; message: string };

type SimulationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      snapshot: ObservationSnapshotV1;
      commandRequest?: RunCommand;
      error?: string;
    }
  | { status: "unavailable"; message: string };

type ApplicationLifecycle = "active" | "shutting-down" | "stopped";

type RunLibraryState =
  | { status: "loading" }
  | {
      status: "ready";
      value: RunLibraryResponseV1;
      notice: RunLibraryNotice;
      pending?: { action: RunLibraryAction; runId: string };
    }
  | { status: "unavailable"; message: string };

type RunLibraryAction = "resume" | "open" | "delete" | "export";

interface RunLibraryNotice {
  tone: "neutral" | "info" | "success" | "error";
  message: string;
}

interface FocusSnapshot {
  identity: string;
  occurrence: number;
  selectionStart?: number;
  selectionEnd?: number;
}

interface DisclosureSnapshot {
  identity: string;
  open: boolean;
}

interface RenderStateSnapshot {
  focus?: FocusSnapshot;
  disclosures: DisclosureSnapshot[];
}

const FOCUSABLE_SELECTOR =
  "a[href], button, input, select, summary, [tabindex]";

function stableElementIdentity(element: HTMLElement): string | undefined {
  const focusKey = element.dataset.focusKey;
  if (focusKey !== undefined) {
    return `focus:${focusKey}`;
  }
  if (element.id !== "") {
    return `id:${element.id}`;
  }
  if (element.tagName === "SUMMARY") {
    const disclosure = element.closest<HTMLDetailsElement>("details");
    const disclosureIdentity =
      disclosure === null ? undefined : stableElementIdentity(disclosure);
    return disclosureIdentity === undefined
      ? undefined
      : `${disclosureIdentity}:summary`;
  }
  if (element.tagName === "DETAILS") {
    const classes = [...element.classList].sort().join(".");
    return classes === "" ? undefined : `details:${classes}`;
  }

  const dataAttributes = [...element.attributes]
    .filter(({ name }) => name.startsWith("data-"))
    .map(({ name, value }) => `${name}=${value}`)
    .sort();
  if (dataAttributes.length > 0) {
    return `${element.tagName.toLowerCase()}:${dataAttributes.join("|")}`;
  }
  const attributes = [...element.attributes]
    .filter(
      ({ name }) =>
        name === "name" ||
        name === "type" ||
        name === "value" ||
        name === "href",
    )
    .map(({ name, value }) => `${name}=${value}`)
    .sort();
  return attributes.length === 0
    ? undefined
    : `${element.tagName.toLowerCase()}:${attributes.join("|")}`;
}

function captureFocus(root: HTMLElement): FocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    return undefined;
  }
  const identity = stableElementIdentity(active);
  if (identity === undefined) {
    return undefined;
  }
  const occurrence = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => stableElementIdentity(element) === identity)
    .indexOf(active);
  if (occurrence < 0) {
    return undefined;
  }
  if (active instanceof HTMLInputElement && active.selectionStart !== null) {
    return {
      identity,
      occurrence,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd ?? active.selectionStart,
    };
  }
  return { identity, occurrence };
}

function findElementByIdentity(
  root: HTMLElement,
  identity: string,
  selector: string,
  occurrence = 0,
): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => stableElementIdentity(element) === identity,
  )[occurrence];
}

function captureRenderState(root: HTMLElement): RenderStateSnapshot {
  return {
    focus: captureFocus(root),
    disclosures: [...root.querySelectorAll<HTMLDetailsElement>("details")]
      .map((details) => {
        const identity = stableElementIdentity(details);
        return identity === undefined
          ? undefined
          : { identity, open: details.open };
      })
      .filter(
        (snapshot): snapshot is DisclosureSnapshot => snapshot !== undefined,
      ),
  };
}

function restoreDisclosures(
  root: HTMLElement,
  disclosures: readonly DisclosureSnapshot[],
): void {
  const details = [...root.querySelectorAll<HTMLDetailsElement>("details")];
  disclosures.forEach((snapshot) => {
    const match = details.find(
      (candidate) => stableElementIdentity(candidate) === snapshot.identity,
    );
    if (match !== undefined && match.dataset.forceOpen === undefined) {
      match.open = snapshot.open;
    }
  });
}

function restoreFocus(
  root: HTMLElement,
  snapshot: FocusSnapshot,
): "restored" | "disabled" | "missing" {
  const target = findElementByIdentity(
    root,
    snapshot.identity,
    FOCUSABLE_SELECTOR,
    snapshot.occurrence,
  );
  if (target === undefined) {
    return "missing";
  }
  if (
    (target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement) &&
    target.disabled
  ) {
    return "disabled";
  }
  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement &&
    snapshot.selectionStart !== undefined &&
    snapshot.selectionEnd !== undefined
  ) {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Number and range inputs do not expose a text selection range.
    }
  }
  return document.activeElement === target ? "restored" : "missing";
}

export function mountApp(root: HTMLElement): AppController {
  let applicationLifecycle: ApplicationLifecycle = "active";
  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  let reducedMotionOverride = false;
  let state = createInitialState();
  let presetGeometry: PresetGeometryState = { status: "loading" };
  let simulation: SimulationState = { status: "idle" };
  let observationTimer: number | undefined;
  let observationPending = false;
  let liveMarkerFrame: number | undefined;
  let liveMarkerMotion: LiveMarkerMotion | undefined;
  let championReplayMotion: ChampionReplayMotion | undefined;
  let generationTrails: GenerationTrail[] = [];
  let replayFrameIndex = 0;
  let runLibrary: RunLibraryState = { status: "loading" };
  let trackValidationRequest = 0;
  let presetGeometryRequestVersion = 0;
  let trackImportRequestVersion = 0;
  let trackCommandRequestVersion = 0;
  let setupValidationRequestVersion = 0;
  let trackLibraryRequestVersion = 0;
  let runLibraryRequestVersion = 0;
  let runLibraryActionVersion = 0;
  let runRequestVersion = 0;
  let deferredFocus: FocusSnapshot | undefined;
  let trackWorkspace = createTrackWorkspaceState(
    `custom-${Date.now().toString(36)}`,
  );

  const isCurrentTrackCommand = (
    requestVersion: number,
    pending: Exclude<TrackBuilderPending, null>,
  ): boolean =>
    requestVersion === trackCommandRequestVersion &&
    state.route === "track" &&
    trackWorkspace.toolsOpen &&
    trackWorkspace.pending === pending;

  const cancelLiveMarkerFrame = (): void => {
    if (liveMarkerFrame !== undefined) {
      window.cancelAnimationFrame(liveMarkerFrame);
      liveMarkerFrame = undefined;
    }
  };

  const resolvedLiveMarker = (
    motion: LiveMarkerMotion,
    now: number,
  ): TrackMarker => {
    if (motion.durationMs <= 0) {
      return motion.to;
    }
    return interpolateTrackMarker(
      motion.from,
      motion.to,
      (now - motion.startedAt) / motion.durationMs,
    );
  };

  const paintLiveMarker = (marker: TrackMarker): void => {
    const selector =
      state.route === "results"
        ? ".replay-stage .track-replay-marker"
        : ".live-race-stage .track-replay-marker";
    root
      .querySelector<SVGGElement>(selector)
      ?.setAttribute("transform", trackMarkerTransform(marker));
  };

  const animateLiveMarker = (now: number): void => {
    liveMarkerFrame = undefined;
    if (championReplayMotion !== undefined) {
      const firstFrame = championReplayMotion.frames[0];
      const lastFrame = championReplayMotion.frames.at(-1);
      if (firstFrame === undefined || lastFrame === undefined) {
        championReplayMotion = undefined;
        return;
      }
      const replaySeconds = Math.max(
        0.1,
        lastFrame.simulatedSeconds - firstFrame.simulatedSeconds,
      );
      const elapsedSeconds =
        ((now - championReplayMotion.startedAt) / 1000) *
        championReplayMotion.rate;
      if (elapsedSeconds >= replaySeconds) {
        championReplayMotion = {
          ...championReplayMotion,
          startedAt: now,
        };
      }
      const activeFirst = championReplayMotion.frames[0];
      const activeLast = championReplayMotion.frames.at(-1);
      if (activeFirst !== undefined && activeLast !== undefined) {
        const activeElapsed =
          ((now - championReplayMotion.startedAt) / 1000) *
          championReplayMotion.rate;
        const marker = loopingReplayTrackMarker(
          championReplayMotion.frames,
          activeElapsed,
        );
        if (marker !== undefined) {
          paintLiveMarker(marker);
        }
      }
      liveMarkerFrame = window.requestAnimationFrame(animateLiveMarker);
      return;
    }
    if (liveMarkerMotion === undefined) {
      return;
    }
    paintLiveMarker(resolvedLiveMarker(liveMarkerMotion, now));
    if (now < liveMarkerMotion.startedAt + liveMarkerMotion.durationMs) {
      liveMarkerFrame = window.requestAnimationFrame(animateLiveMarker);
    } else {
      liveMarkerMotion = {
        ...liveMarkerMotion,
        from: liveMarkerMotion.to,
        startedAt: now,
        durationMs: 0,
      };
    }
  };

  const requestLiveMarkerFrame = (): void => {
    liveMarkerFrame ??= window.requestAnimationFrame(animateLiveMarker);
  };

  const resetLiveMarkerMotion = (): void => {
    cancelLiveMarkerFrame();
    liveMarkerMotion = undefined;
    championReplayMotion = undefined;
  };

  const availableChampionReplay = (): {
    key: string;
    replay: GenerationReplayV1;
  } | null => {
    if (simulation.status !== "ready") {
      return null;
    }
    const snapshot = simulation.snapshot;
    if (snapshot.result !== null && snapshot.result.replay.frames.length > 1) {
      return {
        key: `${snapshot.runId}:final:${snapshot.result.replay.candidateId}`,
        replay: snapshot.result.replay,
      };
    }
    if (
      snapshot.generationReplay !== null &&
      snapshot.generationReplay !== undefined &&
      snapshot.generationReplay.frames.length > 1
    ) {
      return {
        key: `${snapshot.runId}:generation:${String(snapshot.generation)}:${snapshot.generationReplay.candidateId}`,
        replay: snapshot.generationReplay,
      };
    }
    return null;
  };

  const syncLiveMarkerMotion = (): void => {
    if (
      (state.route !== "training" && state.route !== "results") ||
      simulation.status !== "ready"
    ) {
      resetLiveMarkerMotion();
      return;
    }
    const reducedMotion = reducedMotionQuery.matches || reducedMotionOverride;
    const replay = availableChampionReplay();
    if (replay !== null) {
      if (!shouldAnimateReplay(reducedMotion, replay.replay.frames.length)) {
        cancelLiveMarkerFrame();
        liveMarkerMotion = undefined;
        championReplayMotion = undefined;
        return;
      }
      const nextReplay = {
        key: `${state.route}:${replay.key}`,
        frames: replay.replay.frames,
        startedAt: window.performance.now(),
        rate:
          state.route === "results"
            ? RESULTS_REPLAY_RATE
            : CHAMPION_REPLAY_RATE,
      };
      if (championReplayMotion?.key !== nextReplay.key) {
        championReplayMotion = nextReplay;
      } else {
        const marker = loopingReplayTrackMarker(
          championReplayMotion.frames,
          ((window.performance.now() - championReplayMotion.startedAt) / 1000) *
            CHAMPION_REPLAY_RATE,
        );
        if (marker !== undefined) {
          paintLiveMarker(marker);
        }
      }
      liveMarkerMotion = undefined;
      requestLiveMarkerFrame();
      return;
    }
    if (
      simulation.snapshot.generationInProgress !== true ||
      simulation.snapshot.activeCandidate === null ||
      simulation.snapshot.activeCandidate === undefined ||
      simulation.snapshot.selectedCar === null
    ) {
      resetLiveMarkerMotion();
      return;
    }
    const target = liveTrackMarker(simulation.snapshot.selectedCar);
    if (target === undefined) {
      resetLiveMarkerMotion();
      return;
    }

    const now = window.performance.now();
    const candidateId = simulation.snapshot.activeCandidate.candidateId;
    if (reducedMotion || liveMarkerMotion?.candidateId !== candidateId) {
      cancelLiveMarkerFrame();
      liveMarkerMotion = {
        candidateId,
        from: target,
        to: target,
        startedAt: now,
        durationMs: 0,
        targetReceivedAt: now,
      };
      paintLiveMarker(target);
      return;
    }

    const current = resolvedLiveMarker(liveMarkerMotion, now);
    if (!sameTrackMarker(liveMarkerMotion.to, target)) {
      const observedInterval = now - liveMarkerMotion.targetReceivedAt;
      const durationMs = Math.min(
        MAX_MARKER_TWEEN_MS,
        Math.max(MIN_MARKER_TWEEN_MS, observedInterval * MARKER_TWEEN_SCALE),
      );
      liveMarkerMotion = {
        candidateId,
        from: current,
        to: target,
        startedAt: now,
        durationMs,
        targetReceivedAt: now,
      };
    }
    paintLiveMarker(current);
    requestLiveMarkerFrame();
  };

  const dispatch = (action: AppAction): void => {
    const previousRoute = state.route;
    const validationWasChecking = state.validation.status === "checking";
    state = transition(state, action);
    const routeChanged = state.route !== previousRoute;
    const enteredWelcome = routeChanged && state.route === "welcome";
    const enteredTrack = routeChanged && state.route === "track";
    const retryPresetGeometry =
      enteredTrack && presetGeometry.status === "unavailable";
    const retryTrackLibrary =
      enteredTrack && trackWorkspace.libraryStatus === "unavailable";
    const welcomeRefreshNotice: RunLibraryNotice =
      runLibrary.status === "ready" && runLibrary.notice.tone !== "error"
        ? runLibrary.notice
        : {
            tone: "neutral",
            message: "Saved runs refreshed from local storage.",
          };
    if (
      previousRoute === "review" &&
      state.route !== "review" &&
      validationWasChecking
    ) {
      setupValidationRequestVersion += 1;
    }
    if (
      previousRoute === "track" &&
      state.route !== "track" &&
      trackWorkspace.pending !== null
    ) {
      const canceledTrackCommand = trackWorkspace.pending;
      trackCommandRequestVersion += 1;
      if (canceledTrackCommand === "import") {
        trackImportRequestVersion += 1;
      }
      if (
        canceledTrackCommand === "validate" ||
        canceledTrackCommand === "assist"
      ) {
        trackValidationRequest += 1;
      }
      trackWorkspace = {
        ...trackWorkspace,
        pending: null,
        notice: {
          tone: "neutral",
          message: dismissedTrackResponseMessage(
            canceledTrackCommand,
            "leaving Track",
          ),
        },
      };
    }
    if (
      routeChanged &&
      runLibrary.status === "ready" &&
      runLibrary.pending !== undefined
    ) {
      const canceledAction = runLibrary.pending.action;
      runLibraryActionVersion += 1;
      runLibrary = {
        ...runLibrary,
        pending: undefined,
        notice: {
          tone: "neutral",
          message: "Saved run response ignored after leaving Welcome.",
        },
      };
      if (
        (canceledAction === "open" || canceledAction === "resume") &&
        simulation.status === "loading"
      ) {
        simulation = { status: "idle" };
      }
    }
    if (action.type === "new-setup") {
      runRequestVersion += 1;
      if (observationTimer !== undefined) {
        window.clearTimeout(observationTimer);
        observationTimer = undefined;
      }
      simulation = { status: "idle" };
      generationTrails = [];
      replayFrameIndex = 0;
      trackWorkspace = { ...trackWorkspace, toolsOpen: false };
    }
    if (enteredWelcome) {
      if (runLibrary.status === "ready") {
        runLibrary = {
          ...runLibrary,
          notice: {
            tone: "info",
            message: "Refreshing Saved runs from local storage.",
          },
        };
      } else if (runLibrary.status === "unavailable") {
        runLibrary = { status: "loading" };
      }
    }
    if (retryPresetGeometry) {
      presetGeometry = { status: "loading" };
    }
    if (retryTrackLibrary) {
      trackWorkspace = {
        ...trackWorkspace,
        libraryStatus: "loading",
        libraryMessage: undefined,
        notice: {
          tone: "info",
          message: "Refreshing the local track library.",
        },
      };
    }
    render(routeChanged);
    if (enteredWelcome) {
      void refreshRuns(welcomeRefreshNotice);
    }
    if (retryPresetGeometry) {
      void refreshPresetGeometry();
    }
    if (retryTrackLibrary) {
      void refreshLibrary(TRACK_LIBRARY_REFRESHED_NOTICE);
    }
  };

  const review = async (): Promise<void> => {
    if (!canRequestReview(state)) {
      state = { ...state, route: "settings" };
      render(true);
      return;
    }

    const reviewedDraft = state.draft;
    const requestVersion = ++setupValidationRequestVersion;
    dispatch({ type: "validation-started", draft: reviewedDraft });
    try {
      const response = await validateSetup(reviewedDraft);
      if (requestVersion !== setupValidationRequestVersion) {
        return;
      }
      dispatch({
        type: "validation-received",
        draft: reviewedDraft,
        response,
      });
    } catch (error) {
      if (requestVersion !== setupValidationRequestVersion) {
        return;
      }
      dispatch({
        type: "validation-received",
        draft: reviewedDraft,
        response: serviceUnavailableResponse(error),
      });
    }
  };

  const scheduleObservation = (): void => {
    if (
      applicationLifecycle !== "active" ||
      simulation.status !== "ready" ||
      simulation.snapshot.status !== "running" ||
      simulation.commandRequest !== undefined ||
      observationPending ||
      observationTimer !== undefined
    ) {
      return;
    }
    observationTimer = window.setTimeout(() => {
      void observeSession();
    }, observationPollDelay(document.visibilityState));
  };

  const isCurrentRun = (runId: string): boolean =>
    simulation.status === "ready" && simulation.snapshot.runId === runId;

  const isLatestRunRequest = (runId: string, requestVersion: number): boolean =>
    requestVersion === runRequestVersion && isCurrentRun(runId);

  const setRunFailure = (message: string): void => {
    simulation =
      simulation.status === "ready"
        ? { status: "ready", snapshot: simulation.snapshot, error: message }
        : { status: "unavailable", message };
  };

  const applyRunResponse = (
    response: Awaited<ReturnType<typeof startRun>>,
  ): void => {
    if (!response.valid) {
      setRunFailure(
        response.errors[0]?.message ?? "The run command was rejected.",
      );
    } else {
      const previousSnapshot =
        simulation.status === "ready" ? simulation.snapshot : undefined;
      const snapshot = mergeObservationSnapshot(
        previousSnapshot,
        response.snapshot,
      );
      generationTrails = updateGenerationTrails(generationTrails, snapshot);
      simulation = { status: "ready", snapshot };
      if (snapshot.status === "completed" || snapshot.status === "stopped") {
        void refreshRuns();
      }
    }
    render();
    scheduleObservation();
  };

  const observeSession = async (): Promise<void> => {
    if (
      simulation.status !== "ready" ||
      simulation.snapshot.status !== "running" ||
      simulation.commandRequest !== undefined
    ) {
      return;
    }
    observationTimer = undefined;
    if (observationPending) {
      return;
    }
    observationPending = true;
    const runId = simulation.snapshot.runId;
    const requestVersion = ++runRequestVersion;
    const knownReplayCandidateId =
      simulation.snapshot.generationReplay?.candidateId;
    try {
      const response = await observeRun(runId, knownReplayCandidateId);
      if (!isLatestRunRequest(runId, requestVersion)) {
        return;
      }
      applyRunResponse(response);
    } catch (error) {
      if (!isLatestRunRequest(runId, requestVersion)) {
        return;
      }
      setRunFailure(
        error instanceof Error
          ? `Telemetry update failed: ${error.message}`
          : "The local core could not advance the training run.",
      );
      render();
    } finally {
      observationPending = false;
      scheduleObservation();
    }
  };

  const handleVisibilityChange = (): void => {
    if (applicationLifecycle !== "active") {
      return;
    }
    if (observationTimer !== undefined) {
      window.clearTimeout(observationTimer);
      observationTimer = undefined;
    }
    if (document.visibilityState === "visible") {
      void observeSession();
    } else {
      scheduleObservation();
    }
  };

  const controlSession = async (command: RunCommand): Promise<void> => {
    if (
      simulation.status !== "ready" ||
      simulation.commandRequest !== undefined
    ) {
      return;
    }
    const runId = simulation.snapshot.runId;
    const requestVersion = ++runRequestVersion;
    if (observationTimer !== undefined) {
      window.clearTimeout(observationTimer);
      observationTimer = undefined;
    }
    simulation = { ...simulation, commandRequest: command, error: undefined };
    render();
    try {
      const response = await commandRun(runId, command);
      if (!isLatestRunRequest(runId, requestVersion)) {
        return;
      }
      applyRunResponse(response);
    } catch (error) {
      if (!isLatestRunRequest(runId, requestVersion)) {
        return;
      }
      setRunFailure(
        error instanceof Error
          ? error.message
          : "The local core could not apply the run command.",
      );
      render();
      scheduleObservation();
    }
  };

  const moveReplay = (action: "previous" | "next" | "restart"): void => {
    if (simulation.status !== "ready" || simulation.snapshot.result === null) {
      return;
    }
    replayFrameIndex = replayFrameIndexAfterAction(
      replayFrameIndex,
      simulation.snapshot.result.replay.frames.length,
      action,
    );
    render();
  };

  const startSession = async (): Promise<void> => {
    if (!canStartSession(state)) {
      return;
    }
    const frozenDraft = state.draft;
    const requestVersion = ++runRequestVersion;
    simulation = { status: "loading" };
    generationTrails = [];
    replayFrameIndex = 0;
    dispatch({ type: "start-session" });
    try {
      const response = await startRun(frozenDraft);
      if (requestVersion !== runRequestVersion) {
        return;
      }
      if (!response.valid) {
        simulation = { status: "idle" };
        dispatch({
          type: "start-session-rejected",
          response: {
            contractVersion: 1,
            valid: false,
            errors: response.errors,
          },
        });
        return;
      }
      applyRunResponse(response);
    } catch (error) {
      if (requestVersion !== runRequestVersion) {
        return;
      }
      simulation = { status: "idle" };
      dispatch({
        type: "start-session-unconfirmed",
        message:
          error instanceof Error
            ? error.message
            : "The local core could not confirm whether the reviewed run started.",
      });
    }
  };

  async function refreshPresetGeometry(): Promise<void> {
    const requestVersion = ++presetGeometryRequestVersion;
    try {
      const response = await loadPresetTracks();
      if (requestVersion !== presetGeometryRequestVersion) {
        return;
      }
      presetGeometry = { status: "ready", presets: response.presets };
    } catch (error) {
      if (requestVersion !== presetGeometryRequestVersion) {
        return;
      }
      presetGeometry = {
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
    const requestVersion = ++trackLibraryRequestVersion;
    try {
      const library = await loadTrackLibrary();
      if (requestVersion !== trackLibraryRequestVersion) {
        return;
      }
      trackWorkspace = {
        ...trackWorkspace,
        library,
        libraryStatus: "ready",
        libraryMessage: undefined,
        notice: successNotice ?? trackWorkspace.notice,
      };
    } catch (error) {
      if (requestVersion !== trackLibraryRequestVersion) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The local track library is unavailable.";
      const hasLibrary = trackWorkspace.library !== null;
      trackWorkspace = {
        ...trackWorkspace,
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

  async function refreshRuns(
    notice: RunLibraryNotice = {
      tone: "neutral",
      message: "Run files are stored atomically by the local Python core.",
    },
  ): Promise<void> {
    const requestVersion = ++runLibraryRequestVersion;
    try {
      const value = await loadRunLibrary();
      if (requestVersion !== runLibraryRequestVersion) {
        return;
      }
      runLibrary = {
        status: "ready",
        value,
        notice,
      };
    } catch (error) {
      if (requestVersion !== runLibraryRequestVersion) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The local run library is unavailable.";
      runLibrary =
        runLibrary.status === "ready"
          ? {
              ...runLibrary,
              pending: undefined,
              notice: { tone: "error", message },
            }
          : { status: "unavailable", message };
    }
    render();
  }

  const handleRunAction = async (
    action: RunLibraryAction,
    runId: string,
  ): Promise<void> => {
    if (runLibrary.status !== "ready" || runLibrary.pending !== undefined) {
      return;
    }
    if (
      action === "delete" &&
      !window.confirm(`Delete local run “${runId}”?`)
    ) {
      return;
    }
    const actionLabels: Record<RunLibraryAction, string> = {
      resume: "Restoring the selected local run.",
      open: "Opening the selected saved results.",
      delete: "Deleting the selected local run.",
      export: "Preparing the selected run JSON.",
    };
    const actionVersion = ++runLibraryActionVersion;
    const isCurrentAction = (): boolean =>
      actionVersion === runLibraryActionVersion &&
      runLibrary.status === "ready" &&
      runLibrary.pending?.action === action &&
      runLibrary.pending.runId === runId;
    runLibrary = {
      ...runLibrary,
      pending: { action, runId },
      notice: { tone: "info", message: actionLabels[action] },
    };
    render();
    try {
      if (action === "delete") {
        await deleteRun(runId);
        if (!isCurrentAction()) {
          await refreshRuns({
            tone: "neutral",
            message:
              "Run library refreshed after a background delete response.",
          });
          return;
        }
        await refreshRuns({
          tone: "success",
          message: "The selected run was deleted from local storage.",
        });
        return;
      }
      if (action === "export") {
        const document = await exportRun(runId);
        if (!isCurrentAction()) {
          return;
        }
        downloadRunDocument(document);
        runLibrary = {
          ...runLibrary,
          pending: undefined,
          notice: {
            tone: "success",
            message: "The selected run JSON was exported.",
          },
        };
        render();
        return;
      }
      if (action === "open") {
        const requestVersion = ++runRequestVersion;
        simulation = { status: "loading" };
        const document = await openRun(runId);
        if (!isCurrentAction() || requestVersion !== runRequestVersion) {
          return;
        }
        const snapshot = document.checkpoint.snapshot;
        if (
          snapshot.result === null ||
          (snapshot.status !== "completed" && snapshot.status !== "stopped")
        ) {
          throw new Error(
            "The selected run does not contain terminal results.",
          );
        }
        const compiled = await compileTrack(document.track);
        if (!isCurrentAction() || requestVersion !== runRequestVersion) {
          return;
        }
        if (!compiled.valid || compiled.compiled === undefined) {
          throw new Error(
            compiled.errors[0]?.message ??
              "The saved result track could not be compiled.",
          );
        }
        if (state.route !== "welcome") {
          return;
        }
        const restoredDraft = {
          contractVersion: 1 as const,
          trackPreset: document.track.id,
          track: document.track,
          settings: document.settings,
        };
        trackWorkspace = { ...trackWorkspace, selected: compiled.compiled };
        generationTrails = updateGenerationTrails([], snapshot);
        replayFrameIndex = 0;
        simulation = { status: "ready", snapshot };
        runLibrary = {
          ...runLibrary,
          pending: undefined,
          notice: { tone: "success", message: "Saved results opened." },
        };
        dispatch({ type: "restore-results", draft: restoredDraft });
        return;
      }
      const requestVersion = ++runRequestVersion;
      simulation = { status: "loading" };
      const response = await resumeRun(runId);
      if (!isCurrentAction()) {
        await refreshRuns({
          tone: "neutral",
          message: "Run library refreshed after a dismissed Resume response.",
        });
        return;
      }
      if (requestVersion !== runRequestVersion) {
        return;
      }
      if (!response.valid || response.setup === undefined) {
        simulation = { status: "idle" };
        runLibrary = {
          ...runLibrary,
          pending: undefined,
          notice: {
            tone: "error",
            message: response.valid
              ? "The restored run did not include its frozen setup."
              : (response.errors[0]?.message ??
                "The run could not be resumed."),
          },
        };
        render();
        return;
      }
      if (response.setup.track !== null) {
        const compiled = await compileTrack(response.setup.track);
        if (!isCurrentAction() || requestVersion !== runRequestVersion) {
          return;
        }
        if (!compiled.valid || compiled.compiled === undefined) {
          throw new Error(
            compiled.errors[0]?.message ??
              "The restored custom track could not be compiled.",
          );
        }
        trackWorkspace = { ...trackWorkspace, selected: compiled.compiled };
      }
      if (state.route !== "welcome") {
        return;
      }
      runLibrary = {
        ...runLibrary,
        pending: undefined,
        notice: { tone: "success", message: "Local run restored." },
      };
      generationTrails = [];
      dispatch({ type: "restore-session", draft: response.setup });
      applyRunResponse(response);
    } catch (error) {
      if (!isCurrentAction()) {
        return;
      }
      if (simulation.status === "loading") {
        simulation = { status: "idle" };
      }
      runLibrary = {
        ...runLibrary,
        pending: undefined,
        notice: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "The local run command could not be completed.",
        },
      };
      render();
    }
  };

  const useCompiled = (compiled: CompiledTrackV1, message: string): void => {
    trackWorkspace = {
      ...trackWorkspace,
      selected: compiled,
      notice: { tone: "success", message },
    };
    dispatch({ type: "select-custom-track", track: compiled.track });
  };

  const setEditorDraft = (editor: EditorState, message: string): void => {
    trackWorkspace = {
      ...trackWorkspace,
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
    if (trackWorkspace.pending !== null) {
      return;
    }
    const editor =
      payload.source === "palette"
        ? insertEditorPiece(trackWorkspace.editor, payload.kind, insertionIndex)
        : moveEditorPieceToIndex(
            trackWorkspace.editor,
            payload.pieceIndex,
            insertionIndex,
          );
    if (editor === trackWorkspace.editor) {
      return;
    }
    setEditorDraft(
      editor,
      payload.source === "palette"
        ? "Piece snapped into the circuit. Python is checking the new sequence."
        : "Pieces reconnected. Python is checking the new sequence.",
    );
  };

  const validateEditorDraft = async (): Promise<void> => {
    const requestId = ++trackValidationRequest;
    const draft = editorTrack(trackWorkspace.editor);
    trackWorkspace = {
      ...trackWorkspace,
      pending: "validate",
      editorValidation: { status: "checking", errors: [] },
    };
    render();
    try {
      const response = await compileTrack(draft);
      if (requestId !== trackValidationRequest) {
        return;
      }
      if (response.valid && response.compiled !== undefined) {
        trackWorkspace = {
          ...trackWorkspace,
          pending: null,
          editorPreview: response.compiled,
          editorValidation: { status: "valid", errors: [] },
          notice: {
            tone: "success",
            message: "Draft geometry is valid and ready to use.",
          },
        };
      } else {
        trackWorkspace = {
          ...trackWorkspace,
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
      if (requestId !== trackValidationRequest) {
        return;
      }
      trackWorkspace = {
        ...trackWorkspace,
        pending: null,
        editorPreview: undefined,
        editorValidation: { status: "invalid", errors: [] },
        notice: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "The local Python core could not validate this draft.",
        },
      };
    }
    render();
  };

  const saveCompiledTrack = async (
    compiled: CompiledTrackV1,
    requestVersion: number,
  ): Promise<void> => {
    trackWorkspace = {
      ...trackWorkspace,
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
    trackWorkspace = {
      ...trackWorkspace,
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
    trackWorkspace.library?.tracks.find(
      (candidate) => candidate.track.id === trackId,
    );

  const handleTrackAction = async (
    action: string,
    element: HTMLElement,
  ): Promise<void> => {
    const repeatsActiveTab =
      action === "builder-tab" &&
      element.dataset.builderTab === trackWorkspace.tab;
    const requestVersion = repeatsActiveTab
      ? trackCommandRequestVersion
      : ++trackCommandRequestVersion;
    try {
      switch (action) {
        case "refresh-library":
          trackWorkspace = {
            ...trackWorkspace,
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
            trackWorkspace.editorValidation.status === "unchecked";
          trackWorkspace = {
            ...trackWorkspace,
            toolsOpen: true,
            notice: shouldValidate
              ? {
                  tone: "info",
                  message:
                    "Checking the starter draft with the local Python core.",
                }
              : trackWorkspace.notice,
          };
          render();
          root
            .querySelector<HTMLElement>("#track-builder-title")
            ?.focus({ preventScroll: true });
          if (shouldValidate) {
            void validateEditorDraft();
          }
          return;
        }
        case "open-selected-builder":
          if (trackWorkspace.selected !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              toolsOpen: true,
              tab: "build",
              editor: replaceEditorTrack(
                trackWorkspace.editor,
                trackWorkspace.selected.track,
              ),
              editorPreview: trackWorkspace.selected,
              editorValidation: { status: "valid", errors: [] },
              notice: {
                tone: "success",
                message: "Selected track loaded into the piece editor.",
              },
            };
            render();
            root
              .querySelector<HTMLElement>("#track-builder-title")
              ?.focus({ preventScroll: true });
          }
          return;
        case "close-builder": {
          const canceledTrackCommand = trackWorkspace.pending;
          if (canceledTrackCommand === "import") {
            trackImportRequestVersion += 1;
          }
          if (
            canceledTrackCommand === "validate" ||
            canceledTrackCommand === "assist"
          ) {
            trackValidationRequest += 1;
          }
          trackWorkspace = {
            ...trackWorkspace,
            toolsOpen: false,
            pending: null,
            notice:
              canceledTrackCommand === null
                ? trackWorkspace.notice
                : {
                    tone: "neutral",
                    message: dismissedTrackResponseMessage(
                      canceledTrackCommand,
                      "Track Builder closed",
                    ),
                  },
          };
          render();
          root
            .querySelector<HTMLElement>('[data-track-action="open-builder"]')
            ?.focus({ preventScroll: true });
          return;
        }
        case "builder-tab": {
          const tab = element.dataset.builderTab as TrackBuilderTab | undefined;
          if (tab === "build" || tab === "generate" || tab === "library") {
            const canceledTrackCommand =
              tab === trackWorkspace.tab ? null : trackWorkspace.pending;
            if (
              canceledTrackCommand === "validate" ||
              canceledTrackCommand === "assist"
            ) {
              ++trackValidationRequest;
            }
            if (canceledTrackCommand === "import") {
              ++trackImportRequestVersion;
            }
            const messages: Record<TrackBuilderTab, string> = {
              build:
                "Edit canonical pieces; Python previews and validates every draft.",
              generate:
                "Choose a seed, length, and difficulty to create a verified layout.",
              library: "Saved and imported tracks stay on this computer.",
            };
            trackWorkspace = {
              ...trackWorkspace,
              tab,
              pending:
                canceledTrackCommand === null ? trackWorkspace.pending : null,
              editorValidation:
                canceledTrackCommand === "validate"
                  ? { status: "unchecked", errors: [] }
                  : trackWorkspace.editorValidation,
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
              trackWorkspace.editorValidation.status === "unchecked"
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
              addEditorPiece(trackWorkspace.editor, kind),
              "Piece added. Python is checking the new sequence.",
            );
          }
          return;
        }
        case "editor-delete": {
          const index = Number(element.dataset.pieceIndex);
          setEditorDraft(
            deleteEditorPiece(trackWorkspace.editor, index),
            "Piece removed. Python is checking the new sequence.",
          );
          return;
        }
        case "editor-duplicate": {
          const index = Number(element.dataset.pieceIndex);
          setEditorDraft(
            duplicateEditorPiece(trackWorkspace.editor, index),
            "Piece duplicated. Python is checking the new sequence.",
          );
          return;
        }
        case "editor-move": {
          const index = Number(element.dataset.pieceIndex);
          const direction = Number(element.dataset.direction) === -1 ? -1 : 1;
          setEditorDraft(
            moveEditorPiece(trackWorkspace.editor, index, direction),
            "Piece order changed. Python is checking the new sequence.",
          );
          return;
        }
        case "editor-undo":
          setEditorDraft(
            undoEditor(trackWorkspace.editor),
            "Change undone. Python is checking the restored sequence.",
          );
          return;
        case "editor-redo":
          setEditorDraft(
            redoEditor(trackWorkspace.editor),
            "Change restored. Python is checking the sequence.",
          );
          return;
        case "editor-reset":
          setEditorDraft(
            resetEditor(trackWorkspace.editor),
            "Editor reset to the safe starter loop. Python is checking it.",
          );
          return;
        case "editor-assist": {
          const requestId = ++trackValidationRequest;
          const draft = editorTrack(trackWorkspace.editor);
          trackWorkspace = {
            ...trackWorkspace,
            pending: "assist",
            notice: {
              tone: "info",
              message: "Python is searching for a safe closing sequence.",
            },
          };
          render();
          let response: TrackCommandResponse;
          try {
            response = await assistTrackClosure(draft);
          } catch (error) {
            if (
              requestId !== trackValidationRequest ||
              !isCurrentTrackCommand(requestVersion, "assist")
            ) {
              return;
            }
            throw error;
          }
          if (
            requestId !== trackValidationRequest ||
            !isCurrentTrackCommand(requestVersion, "assist")
          ) {
            return;
          }
          if (response.valid && response.compiled !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              pending: null,
              editor: replaceEditorTrack(
                trackWorkspace.editor,
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
            trackWorkspace = {
              ...trackWorkspace,
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
            trackWorkspace.editorValidation.status === "valid" &&
            trackWorkspace.editorPreview !== undefined
          ) {
            useCompiled(
              trackWorkspace.editorPreview,
              "Custom track selected for this experiment.",
            );
          }
          return;
        case "generate": {
          const seed =
            root.querySelector<HTMLInputElement>("[data-generator-seed]")
              ?.valueAsNumber ?? 0;
          const length = root.querySelector<HTMLInputElement>(
            'input[name="generator-length"]:checked',
          )?.value as "short" | "medium" | "long" | undefined;
          const difficulty = root.querySelector<HTMLInputElement>(
            'input[name="generator-difficulty"]:checked',
          )?.value as "easy" | "technical" | "hard" | undefined;
          const generator = {
            seed,
            length: length ?? trackWorkspace.generator.length,
            difficulty: difficulty ?? trackWorkspace.generator.difficulty,
          };
          if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) {
            trackWorkspace = {
              ...trackWorkspace,
              notice: {
                tone: "error",
                message: "Seed must be a whole number from 0 to 2147483647.",
              },
            };
            render();
            return;
          }
          trackWorkspace = {
            ...trackWorkspace,
            generator,
            pending: "generate",
            notice: {
              tone: "info",
              message: "Python is searching the bounded deterministic space.",
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
            trackWorkspace = {
              ...trackWorkspace,
              pending: null,
              generatedInputs: generator,
              generatedFeatures: response.features,
              generatedPreview: response.compiled,
              selected: response.compiled,
              notice: {
                tone: "success",
                message: `Generated, verified, and selected ${String(response.compiled.track.pieces.length)} canonical pieces with generator v${String(response.generatorVersion ?? "?")} after ${String(response.candidateCount ?? 1)} candidate(s).`,
              },
            };
            dispatch({
              type: "select-custom-track",
              track: response.compiled.track,
            });
            return;
          } else {
            trackWorkspace = {
              ...trackWorkspace,
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
          if (trackWorkspace.generatedPreview !== undefined) {
            useCompiled(
              trackWorkspace.generatedPreview,
              "Generated track selected for this experiment.",
            );
          }
          return;
        case "edit-generated":
          if (trackWorkspace.generatedPreview !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              tab: "build",
              editor: replaceEditorTrack(
                trackWorkspace.editor,
                trackWorkspace.generatedPreview.track,
              ),
              editorPreview: trackWorkspace.generatedPreview,
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
            trackWorkspace.editorValidation.status === "valid" &&
            trackWorkspace.editorPreview !== undefined
          ) {
            await saveCompiledTrack(
              trackWorkspace.editorPreview,
              requestVersion,
            );
          }
          return;
        case "save-generated":
          if (trackWorkspace.generatedPreview !== undefined) {
            await saveCompiledTrack(
              trackWorkspace.generatedPreview,
              requestVersion,
            );
          }
          return;
        case "export-editor":
          if (
            trackWorkspace.editorValidation.status === "valid" &&
            trackWorkspace.editorPreview !== undefined
          ) {
            downloadTrack(trackWorkspace.editorPreview);
          }
          return;
        case "export-generated":
          if (trackWorkspace.generatedPreview !== undefined) {
            downloadTrack(trackWorkspace.generatedPreview);
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
            trackWorkspace = {
              ...trackWorkspace,
              tab: "build",
              editor: replaceEditorTrack(trackWorkspace.editor, compiled.track),
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
            trackWorkspace = {
              ...trackWorkspace,
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
            trackWorkspace = {
              ...trackWorkspace,
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
        requestVersion !== trackCommandRequestVersion ||
        state.route !== "track" ||
        !trackWorkspace.toolsOpen
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
      trackWorkspace = {
        ...trackWorkspace,
        pending: null,
        notice: {
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "The local Python track command could not be completed.",
        },
      };
      render();
    }
  };

  const importTrack = async (file: File): Promise<void> => {
    const requestId = ++trackImportRequestVersion;
    trackWorkspace = {
      ...trackWorkspace,
      pending: "import",
      notice: {
        tone: "info",
        message: "Reading TrackV1 and waiting for Python validation.",
      },
    };
    render();
    try {
      const content = await file.text();
      if (requestId !== trackImportRequestVersion) {
        return;
      }
      const track = parseTrackDocument(content);
      const response = await compileTrack(track);
      if (requestId !== trackImportRequestVersion) {
        return;
      }
      if (!response.valid || response.compiled === undefined) {
        trackWorkspace = {
          ...trackWorkspace,
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
      trackWorkspace = {
        ...trackWorkspace,
        pending: null,
        toolsOpen: true,
        tab: "build",
        editor: replaceEditorTrack(
          trackWorkspace.editor,
          response.compiled.track,
        ),
        editorPreview: response.compiled,
        editorValidation: { status: "valid", errors: [] },
        notice: {
          tone: "success",
          message:
            "Imported TrackV1 loaded into the editor after Python validation.",
        },
      };
      render();
    } catch (error) {
      if (requestId !== trackImportRequestVersion) {
        return;
      }
      trackWorkspace = {
        ...trackWorkspace,
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

  const showShutdownScreen = (
    lifecycle: Exclude<ApplicationLifecycle, "active">,
  ): void => {
    root.innerHTML =
      lifecycle === "shutting-down"
        ? `
            <main class="shutdown-screen" aria-labelledby="shutdown-title">
              <p class="eyebrow">Local shutdown</p>
              <h1 id="shutdown-title" tabindex="-1">Shutting down EvoRacer…</h1>
              <p role="status">Stopping the loopback core and finishing this local session.</p>
            </main>
          `
        : `
            <main class="shutdown-screen" aria-labelledby="shutdown-title">
              <p class="eyebrow">Local session ended</p>
              <h1 id="shutdown-title" tabindex="-1">EvoRacer has shut down.</h1>
              <p>You can close this browser tab. Run EvoRacer.exe to start a new session.</p>
            </main>
          `;
    root.querySelector<HTMLElement>("#shutdown-title")?.focus();
  };

  const retryPresetTracks = (): void => {
    if (presetGeometry.status === "loading") {
      return;
    }
    presetGeometry = { status: "loading" };
    render();
    void refreshPresetGeometry();
  };

  const retryRunLibrary = (): void => {
    if (runLibrary.status === "loading") {
      return;
    }
    const notice: RunLibraryNotice =
      runLibrary.status === "ready" && runLibrary.notice.tone !== "error"
        ? runLibrary.notice
        : {
            tone: "neutral",
            message: "Saved runs refreshed from local storage.",
          };
    runLibrary = { status: "loading" };
    render();
    void refreshRuns(notice);
  };

  const exitApplication = async (): Promise<void> => {
    if (
      applicationLifecycle !== "active" ||
      !window.confirm("Exit EvoRacer and stop the local core?")
    ) {
      return;
    }

    applicationLifecycle = "shutting-down";
    if (observationTimer !== undefined) {
      window.clearTimeout(observationTimer);
      observationTimer = undefined;
    }
    resetLiveMarkerMotion();
    showShutdownScreen("shutting-down");

    try {
      await shutdownApplication();
      applicationLifecycle = "stopped";
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener(
        "change",
        handleReducedMotionChange,
      );
      showShutdownScreen("stopped");
    } catch (error) {
      applicationLifecycle = "active";
      render(true);
      window.alert(
        error instanceof Error
          ? error.message
          : "The local application shutdown could not be completed.",
      );
      scheduleObservation();
    }
  };

  const render = (focusHeading = false): void => {
    if (applicationLifecycle !== "active") {
      return;
    }
    const renderState = focusHeading ? undefined : captureRenderState(root);
    const focusSnapshot = renderState?.focus ?? deferredFocus;
    root.innerHTML = renderShell(
      state,
      presetGeometry,
      trackWorkspace,
      simulation,
      runLibrary,
      replayFrameIndex,
      generationTrails,
      reducedMotionQuery.matches || reducedMotionOverride,
      reducedMotionQuery.matches,
    );
    syncLiveMarkerMotion();
    bindActions(
      root,
      state,
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
      () => {
        reducedMotionOverride = !reducedMotionOverride;
        render();
      },
      (name, roadWidth) => {
        setEditorDraft(
          updateEditorDetails(trackWorkspace.editor, name, roadWidth),
          "Track details changed. Python is checking the draft.",
        );
      },
      (seed, length, difficulty) => {
        trackWorkspace = {
          ...trackWorkspace,
          generator: { seed, length, difficulty },
        };
        syncGeneratorDraftPresentation(root, trackWorkspace);
      },
    );

    if (renderState !== undefined) {
      restoreDisclosures(root, renderState.disclosures);
    }

    const progressRail = root.querySelector<HTMLElement>(".sidebar");
    const activeProgress = root.querySelector<HTMLElement>(
      ".progress-item.is-active",
    );
    if (progressRail !== null && activeProgress !== null) {
      progressRail.scrollLeft = Math.max(
        0,
        activeProgress.offsetLeft -
          (progressRail.clientWidth - activeProgress.clientWidth) / 2,
      );
    }

    if (focusHeading) {
      deferredFocus = undefined;
      const pageTitle = root.querySelector<HTMLElement>("#page-title");
      pageTitle?.focus();
    } else if (focusSnapshot !== undefined) {
      const result = restoreFocus(root, focusSnapshot);
      deferredFocus = result === "disabled" ? focusSnapshot : undefined;
    }
  };

  const handleReducedMotionChange = (): void => {
    render();
  };

  render(true);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
  void refreshPresetGeometry();
  void refreshLibrary();
  void refreshRuns();

  return {
    getState: () => state,
    dispatch,
  };
}

function renderShell(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replayFrameIndex: number,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
  systemReducedMotion: boolean,
): string {
  const activeIndex = ROUTE_ORDER.get(state.route) ?? 0;
  const steps = ROUTES.map((route, index) => {
    const locked =
      ((route.id === "training" || route.id === "results") &&
        !state.sessionStarted) ||
      (state.sessionStarted &&
        route.id !== "training" &&
        route.id !== "results");
    const stateClass =
      route.id === state.route
        ? "is-active"
        : index < activeIndex
          ? "is-complete"
          : "";
    const current = route.id === state.route ? ' aria-current="step"' : "";
    const disabled = locked ? " disabled" : "";

    return `
      <li class="progress-item ${stateClass}">
        <button type="button" data-route="${route.id}"${current}${disabled}>
          <span class="progress-index">${String(index + 1).padStart(2, "0")}</span>
          <span>${route.label}</span>
        </button>
      </li>
    `;
  }).join("");

  return `
    <a class="skip-link" href="#workspace">Skip to setup</a>
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-route="welcome" aria-label="EvoRacer AI Lab home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>
            <strong>EvoRacer</strong>
            <small>Offline evolution lab</small>
          </span>
        </a>
        <div class="topbar-actions">
          <p class="local-status">
            <span aria-hidden="true"></span>
            Local core
          </p>
          <button
            class="motion-button"
            type="button"
            data-action="toggle-motion"
            aria-pressed="${String(reducedMotion)}"
            title="${systemReducedMotion ? "Windows motion preference is active" : reducedMotion ? "Restore interface motion" : "Reduce interface motion"}"
            ${systemReducedMotion ? "disabled" : ""}
          >
            ${systemReducedMotion ? "Motion reduced by Windows" : reducedMotion ? "Motion reduced" : "Reduce motion"}
          </button>
          <button class="exit-button" type="button" data-action="exit-application" title="Exit application">
            Exit application
          </button>
        </div>
      </header>

      <aside class="sidebar" aria-label="Experiment setup progress">
        <p class="sidebar-label">Experiment setup</p>
        <ol class="progress-list">${steps}</ol>
        <div class="offline-note">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Local session</strong>
            <p>Data and processing stay on this computer.</p>
          </div>
        </div>
      </aside>

      <main id="workspace" class="workspace">
        ${renderRoute(
          state,
          presetGeometry,
          trackWorkspace,
          simulation,
          runLibrary,
          replayFrameIndex,
          generationTrails,
          reducedMotion,
        )}
      </main>
    </div>
  `;
}

function renderRoute(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
  simulation: SimulationState,
  runLibrary: RunLibraryState,
  replayFrameIndex: number,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const activeTrack =
    state.draft.track === null
      ? presetGeometry.status === "ready"
        ? presetGeometry.presets.find(
            (candidate) => candidate.track.id === state.draft.trackPreset,
          )
        : undefined
      : trackWorkspace.selected;
  switch (state.route) {
    case "welcome":
      return renderWelcome(runLibrary);
    case "track":
      return renderTrack(state, presetGeometry, trackWorkspace);
    case "settings":
      return renderSettings(state);
    case "review":
      return renderReview(state);
    case "training":
      return renderTraining(
        state,
        simulation,
        activeTrack,
        generationTrails,
        reducedMotion,
      );
    case "results":
      return renderResults(
        state,
        simulation,
        replayFrameIndex,
        activeTrack,
        generationTrails,
        reducedMotion,
      );
  }
}

function pageHeader(
  eyebrow: string,
  title: string,
  description: string,
): string {
  return `
    <header class="page-header">
      <p class="eyebrow">${eyebrow}</p>
      <h1 id="page-title" tabindex="-1">${title}</h1>
      <p class="page-lead">${description}</p>
    </header>
  `;
}

function renderWelcome(runLibrary: RunLibraryState): string {
  const pending =
    runLibrary.status === "ready" ? runLibrary.pending : undefined;
  const libraryNotice =
    runLibrary.status === "ready"
      ? runLibrary.notice.tone === "error"
        ? `
            <div class="run-library-notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.notice.message)}</p>
              <button class="button secondary" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : `<p class="run-library-notice is-${runLibrary.notice.tone}" role="status">${escapeHtml(runLibrary.notice.message)}</p>`
      : "";
  const forceSavedRunsOpen =
    runLibrary.status === "unavailable" ||
    (runLibrary.status === "ready" && runLibrary.notice.tone === "error");
  const savedRuns =
    runLibrary.status === "loading"
      ? "<p>Loading local run files…</p>"
      : runLibrary.status === "unavailable"
        ? `
            <div class="run-library-notice is-error" role="alert">
              <p>${escapeHtml(runLibrary.message)}</p>
              <button class="button secondary" type="button" data-action="retry-run-library">Retry saved runs</button>
            </div>
          `
        : runLibrary.value.runs.length === 0
          ? `${libraryNotice}<p>No saved runs yet. Every started run will appear here.</p>`
          : `
            ${libraryNotice}
            <div class="table-scroll">
              <table>
              <thead><tr><th>Run</th><th>Track</th><th>Progress</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${runLibrary.value.runs
                  .map(
                    (run) => `
                      <tr>
                        <th scope="row">${escapeHtml(run.runId.slice(0, 18))}</th>
                        <td>${escapeHtml(run.trackName)} · ${escapeHtml(run.algorithm)}</td>
                        <td>${String(run.generation)} / ${String(run.totalGenerations)}</td>
                        <td>${escapeHtml(run.status)}</td>
                        <td>
                          <div class="library-actions">
                            ${
                              run.resumable
                                ? `<button class="button secondary" type="button" data-run-action="resume" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "resume" && pending.runId === run.runId ? "Restoring…" : "Resume"}</button>`
                                : run.championFitness !== null
                                  ? `<button class="button secondary" type="button" data-run-action="open" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "open" && pending.runId === run.runId ? "Opening…" : "Open results"}</button>`
                                  : `<button class="button secondary" type="button" disabled>No results</button>`
                            }
                            <button class="button secondary" type="button" data-run-action="export" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "export" && pending.runId === run.runId ? "Exporting…" : "Export"}</button>
                            <button class="button secondary" type="button" data-run-action="delete" data-run-id="${escapeHtml(run.runId)}" ${pending === undefined ? "" : "disabled"}>${pending?.action === "delete" && pending.runId === run.runId ? "Deleting…" : "Delete"}</button>
                          </div>
                        </td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
              </table>
            </div>
            ${
              runLibrary.value.isolated.length === 0
                ? ""
                : `<p role="status">${String(runLibrary.value.isolated.length)} corrupt run record(s) were isolated without blocking this library.</p>`
            }
          `;
  return `
    <section class="page welcome-page" aria-labelledby="page-title">
      ${pageHeader(
        "EvoRacer / New experiment",
        "Start an AI racing experiment.",
        "Choose a circuit, watch a population learn the racing line, and compare the champion. Nothing runs until you review the setup and press Start.",
      )}

      <div class="welcome-journey" aria-label="How EvoRacer works">
        <div>
          <span aria-hidden="true">01</span>
          <p><strong>Choose a track</strong>Start with the forgiving oval or build your own circuit.</p>
        </div>
        <div>
          <span aria-hidden="true">02</span>
          <p><strong>Watch evolution</strong>See each candidate race with Python-owned physics and telemetry.</p>
        </div>
        <div>
          <span aria-hidden="true">03</span>
          <p><strong>Compare the champion</strong>Replay the best car and inspect real generation progress.</p>
        </div>
      </div>

      <div class="welcome-panel">
        <div class="welcome-summary" aria-label="Experiment setup summary">
          <div class="summary-row">
            <span>Track</span>
            <strong>Easy Oval</strong>
          </div>
          <div class="summary-row">
            <span>Training</span>
            <strong>Quick start · Fixed GA · 80 candidate episodes</strong>
          </div>
          <div class="summary-row">
            <span>Run policy</span>
            <strong>Manual start after local validation</strong>
          </div>
        </div>
        <div class="welcome-aside">
          <span class="data-chip">Local only</span>
          <p>No account, cloud connection, telemetry, or automatic training.</p>
          <div class="welcome-actions">
            <button class="button primary" type="button" data-action="review" ${pending?.action === "resume" ? "disabled" : ""}>
              Review recommended setup
            </button>
            <button class="button secondary" type="button" data-action="begin-setup" ${pending?.action === "resume" ? "disabled" : ""}>
              Customize setup
            </button>
          </div>
        </div>
      </div>
      <details class="comparison-panel saved-runs-panel" ${forceSavedRunsOpen ? 'open data-force-open="true"' : ""}>
        <summary class="chart-heading">
          <div>
            <p class="section-kicker">Versioned local recovery</p>
            <h2 id="saved-runs-title">Saved runs</h2>
          </div>
          <span class="data-chip">Open library</span>
        </summary>
        <div class="saved-runs-content">${savedRuns}</div>
      </details>
    </section>
  `;
}

function renderTrack(
  state: AppState,
  presetGeometry: PresetGeometryState,
  trackWorkspace: TrackWorkspaceState,
): string {
  const cards = TRACK_PRESETS.map((track) => {
    const selected = state.draft.trackPreset === track.id;
    const compiled =
      presetGeometry.status === "ready"
        ? presetGeometry.presets.find(
            (candidate) => candidate.track.id === track.id,
          )
        : undefined;
    const preview =
      compiled === undefined
        ? `<span class="track-preview-status">${
            presetGeometry.status === "unavailable"
              ? "Local preview unavailable"
              : "Compiling local geometry..."
          }</span>`
        : renderTrackSvg(compiled);
    return `
      <label class="choice-card ${selected ? "is-selected" : ""}">
        <input
          type="radio"
          name="trackPreset"
          value="${track.id}"
          aria-label="${escapeHtml(`${track.name}. ${track.difficulty}. ${track.description}`)}"
          ${selected ? "checked" : ""}
        />
        <span class="track-preview" aria-hidden="true">
          ${preview}
        </span>
        <span class="choice-copy">
          <span class="choice-kicker">${track.difficulty}</span>
          <strong>${track.name}</strong>
          <small>${track.description}</small>
        </span>
        <span class="choice-check" aria-hidden="true">✓</span>
      </label>
    `;
  }).join("");
  const presetStatus =
    presetGeometry.status === "unavailable"
      ? `<div class="library-warning" role="alert"><strong>Preset previews unavailable.</strong><p>${escapeHtml(presetGeometry.message)}</p><button class="button secondary" type="button" data-action="retry-preset-tracks">Retry preset previews</button></div>`
      : "";

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Track",
        "Choose a track.",
        "Start from a verified preset or open Track Builder for a custom circuit.",
      )}
      ${presetStatus}
      <fieldset class="choice-grid">
        <legend class="sr-only">Track preset</legend>
        ${cards}
      </fieldset>
      ${renderTrackBuilder(trackWorkspace, state.draft.track !== null)}
      ${renderActions(
        "welcome",
        "settings",
        "Continue to settings",
        state.draft.trackPreset === null,
      )}
    </section>
  `;
}

function renderSettings(state: AppState): string {
  const maximumEpisodes = maximumCandidateEpisodes(state.draft.settings);
  const selectedPreset = TRAINING_PRESETS.find(
    (preset) =>
      preset.settings.algorithm === state.draft.settings.algorithm &&
      preset.settings.populationSize === state.draft.settings.populationSize &&
      preset.settings.generations === state.draft.settings.generations &&
      preset.settings.episodeSeconds === state.draft.settings.episodeSeconds &&
      preset.settings.seed === state.draft.settings.seed,
  );
  const presets = TRAINING_PRESETS.map((preset) => {
    const selected = preset.id === selectedPreset?.id;
    return `
      <button
        class="preset-button ${selected ? "is-selected" : ""}"
        type="button"
        data-training-preset="${preset.id}"
        aria-pressed="${String(selected)}"
      >
        <strong>${preset.name}</strong>
        <span>${preset.description}</span>
      </button>
    `;
  }).join("");

  const issues = getPresentationIssues(state.draft);
  const invalidFields = new Set(issues.map((issue) => issue.field));

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Training",
        "Choose a training plan.",
        "Quick start is recommended for a first run. Pick a preset and continue, or open Customize only when you need exact controls.",
      )}

      <section aria-labelledby="preset-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Pick one</p>
            <h2 id="preset-title">Training plan</h2>
          </div>
        </div>
        <div class="preset-grid">${presets}</div>
      </section>

      <p class="workload-note plan-summary">
        Selected: <strong>${selectedPreset?.name ?? "Custom settings"}</strong> ·
        maximum <strong>${String(maximumEpisodes)} candidate episodes</strong>.
        Episodes can end early after a collision or completed lap.
      </p>

      <details class="settings-panel settings-customizer" ${selectedPreset === undefined ? "open" : ""}>
        <summary>
          <span>
            <strong>Customize training</strong>
            <small>Optional algorithm and compute controls</small>
          </span>
          <span aria-hidden="true">＋</span>
        </summary>
        <div class="settings-customizer-content">
          <div class="field-grid">
          ${renderSelectField(
            "algorithm",
            "Algorithm",
            "The evolution strategy used to create each new generation.",
            state.draft.settings.algorithm,
          )}
          ${renderNumberField(
            "populationSize",
            "Population",
            "Candidates evaluated in every generation.",
            state.draft.settings.populationSize,
            10,
            500,
            invalidFields.has("populationSize"),
          )}
          ${renderNumberField(
            "generations",
            "Generations",
            "Maximum number of evolution cycles.",
            state.draft.settings.generations,
            1,
            1000,
            invalidFields.has("generations"),
          )}
          ${renderNumberField(
            "episodeSeconds",
            "Episode length",
            "Maximum simulated seconds available to each candidate.",
            state.draft.settings.episodeSeconds,
            15,
            300,
            invalidFields.has("episodeSeconds"),
          )}
          </div>

          <details class="advanced-settings">
          <summary>
            <span>
              <strong>Advanced controls</strong>
              <small>Optional reproducibility settings</small>
            </span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="advanced-content">
            ${renderNumberField(
              "seed",
              "Random seed",
              "Repeating a seed helps reproduce deterministic work in later phases.",
              state.draft.settings.seed,
              0,
              2_147_483_647,
              invalidFields.has("seed"),
            )}
          </div>
          </details>
        </div>
      </details>

      ${renderActions(
        "track",
        "review",
        "Review experiment",
        !canRequestReview(state),
        true,
      )}
    </section>
  `;
}

function renderSelectField(
  id: string,
  label: string,
  help: string,
  value: AlgorithmId,
): string {
  return `
    <div class="field">
      <div class="field-label">
        <label for="${id}">${label}</label>
        <span class="help-marker" aria-hidden="true">?</span>
      </div>
      <select id="${id}" name="${id}" data-algorithm aria-describedby="${id}-help">
        <option value="fixed-ga" ${value === "fixed-ga" ? "selected" : ""}>Fixed GA</option>
        <option value="neat" ${value === "neat" ? "selected" : ""}>NEAT</option>
      </select>
      <p id="${id}-help" class="field-help">${help}</p>
    </div>
  `;
}

function renderNumberField(
  id: NumericSetting,
  label: string,
  help: string,
  value: number,
  minimum: number,
  maximum: number,
  invalid: boolean,
): string {
  return `
    <div class="field">
      <div class="field-label">
        <label for="${id}">${label}</label>
        <span class="help-marker" aria-hidden="true">?</span>
      </div>
      <input
        id="${id}"
        name="${id}"
        type="number"
        min="${String(minimum)}"
        max="${String(maximum)}"
        step="1"
        value="${String(value)}"
        data-number-setting="${id}"
        aria-describedby="${id}-help"
        ${invalid ? 'aria-invalid="true"' : ""}
      />
      <p id="${id}-help" class="field-help">${help} Range: ${String(minimum)}–${String(maximum)}.</p>
    </div>
  `;
}

function renderReview(state: AppState): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Not selected";
  const trackDescription =
    state.draft.track === null
      ? (preset?.description ?? "Choose a track to continue.")
      : `${String(state.draft.track.pieces.length)} canonical pieces · local TrackV1`;
  const status = renderValidationStatus(state);
  const startDisabled = !canStartSession(state);
  const maximumEpisodes = maximumCandidateEpisodes(state.draft.settings);

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Review",
        "Review the setup.",
        "Confirm the track and training parameters. Starting makes this configuration read-only.",
      )}

      <div class="review-grid">
        <section class="review-card" aria-labelledby="track-review-title">
          <div class="review-heading">
            <div>
              <p class="section-kicker">Track</p>
              <h2 id="track-review-title">${escapeHtml(trackName)}</h2>
            </div>
            <button type="button" data-route="track">Edit</button>
          </div>
          <p>${escapeHtml(trackDescription)}</p>
        </section>

        <section class="review-card" aria-labelledby="training-review-title">
          <div class="review-heading">
            <div>
              <p class="section-kicker">Training</p>
              <h2 id="training-review-title">${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"}</h2>
            </div>
            <button type="button" data-route="settings">Edit</button>
          </div>
          <dl class="review-values">
            <div><dt>Population</dt><dd>${String(state.draft.settings.populationSize)}</dd></div>
            <div><dt>Generations</dt><dd>${String(state.draft.settings.generations)}</dd></div>
            <div><dt>Episode</dt><dd>${String(state.draft.settings.episodeSeconds)}s</dd></div>
            <div><dt>Seed</dt><dd>${String(state.draft.settings.seed)}</dd></div>
          </dl>
          <p class="workload-note">
            Maximum workload: <strong>${String(maximumEpisodes)} candidate episodes</strong>.
            This is a compute budget, not a wall-clock estimate.
          </p>
        </section>
      </div>

      ${status}
      ${renderStartFailure(state)}

      <div class="start-panel">
        <div>
          <p class="section-kicker">Manual start</p>
          <h2>Start this experiment</h2>
          <p>No run begins from navigation or validation alone.</p>
        </div>
        <button
          class="button primary start-button"
          type="button"
          data-action="start-session"
          ${startDisabled ? "disabled" : ""}
          aria-describedby="start-condition"
        >
          Start training
          <span aria-hidden="true">→</span>
        </button>
        <p id="start-condition" class="sr-only">
          ${startDisabled ? "Start requires successful local validation." : "Configuration is valid. Start is available."}
        </p>
      </div>

      <div class="page-actions">
        <button class="button secondary" type="button" data-route="settings">
          <span aria-hidden="true">←</span>
          Back to settings
        </button>
        <button class="button text-button" type="button" data-action="review">
          Validate again
        </button>
      </div>
    </section>
  `;
}

function renderStartFailure(state: AppState): string {
  if (state.startFailure === null) {
    return "";
  }
  const presentation = startFailurePresentation(state.startFailure);
  return `
    <section class="start-failure-notice" role="alert" aria-labelledby="start-failure-title">
      <span class="data-chip">${presentation.badge}</span>
      <div>
        <h2 id="start-failure-title">Training did not open</h2>
        <p>${escapeHtml(state.startFailure.message)}</p>
        <p>${presentation.guidance}</p>
        <button class="button secondary" type="button" data-route="welcome">
          Open Welcome and Saved runs
        </button>
      </div>
    </section>
  `;
}

function renderValidationStatus(state: AppState): string {
  if (state.validation.status === "checking") {
    return `
      <div class="validation-status is-checking" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <div><strong>Checking with the local core</strong><p>Start stays locked during validation.</p></div>
      </div>
    `;
  }

  if (
    state.validation.status === "checked" &&
    state.validation.response.valid
  ) {
    return `
      <div class="validation-status is-valid" role="status" aria-live="polite">
        <span class="status-icon" aria-hidden="true">✓</span>
        <div><strong>Configuration valid</strong><p>The local core accepted contract version 1.</p></div>
      </div>
    `;
  }

  const errors =
    state.validation.status === "checked"
      ? state.validation.response.errors
      : getPresentationIssues(state.draft);
  const errorList = errors
    .map((error) => `<li>${escapeHtml(error.message)}</li>`)
    .join("");

  return `
    <div class="validation-status is-invalid" role="alert">
      <span class="status-icon" aria-hidden="true">!</span>
      <div>
        <strong>Start is locked</strong>
        <ul>${errorList || "<li>Validate the setup with the local core.</li>"}</ul>
      </div>
    </div>
  `;
}

function renderTraining(
  state: AppState,
  simulation: SimulationState,
  activeTrack: CompiledTrackV1 | undefined,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  let observerContent: string;
  if (simulation.status === "loading") {
    observerContent = `
      <div class="training-stage" role="status" aria-live="polite">
        <span class="data-chip">Python simulation</span>
        <h2>Creating the local run</h2>
        <p>Python is freezing the reviewed configuration before the first generation is requested.</p>
      </div>
    `;
  } else if (simulation.status === "ready") {
    const snapshot = simulation.snapshot;
    const activeCandidate = snapshot.activeCandidate;
    const live =
      snapshot.generationInProgress === true &&
      activeCandidate !== null &&
      activeCandidate !== undefined;
    const replay = snapshot.result?.replay ?? snapshot.generationReplay;
    const priorTrails = priorGenerationTrails(
      generationTrails,
      replay?.candidateId,
    );
    const backgroundEvaluation = showsBackgroundEvaluation(live, replay);
    const algorithm =
      state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT";
    const telemetry =
      snapshot.selectedCar === null
        ? `
          <div class="training-stage" role="status" aria-live="polite">
            <span class="data-chip">Run ${escapeHtml(snapshot.status)}</span>
            <h2>${snapshot.generationInProgress === true ? "Starting" : "Preparing"} generation ${String(snapshot.generation + 1)}</h2>
            <p>Python is evaluating the next candidate. Live track telemetry will appear here.</p>
          </div>
        `
        : `
          ${renderLiveRace(
            snapshot.selectedCar,
            activeCandidate,
            activeTrack,
            live,
            replay,
            priorTrails,
            reducedMotion,
          )}
          ${renderSelectedCarTelemetry(
            snapshot.selectedCar,
            backgroundEvaluation
              ? `${algorithm} background candidate (not the replay above)`
              : live
                ? `${algorithm} candidate in evaluation`
                : `${algorithm} generation champion`,
            backgroundEvaluation
              ? "background live"
              : live
                ? "live"
                : snapshot.status,
          )}
        `;
    observerContent = `
      ${renderRunRecoveryNotice(simulation.error)}
      ${renderRunOverview(snapshot)}
      ${renderTrainingCompletion(snapshot)}
      ${telemetry}
      ${renderFitnessChart(snapshot.fitnessHistory)}
    `;
  } else if (simulation.status === "unavailable") {
    observerContent = `
      <div class="training-stage" role="alert">
        <span class="data-chip">Local core unavailable</span>
        <h2>Telemetry could not be loaded</h2>
        <p>${escapeHtml(simulation.message)}</p>
      </div>
    `;
  } else {
    observerContent = `
      <div class="training-stage">
        <span class="data-chip">Configuration locked</span>
        <h2>Waiting for the versioned run snapshot</h2>
        <p>The selected ${state.draft.settings.algorithm === "fixed-ga" ? "Fixed GA" : "NEAT"} setup is read-only.</p>
      </div>
    `;
  }

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Training",
        "Training workspace",
        "The reviewed configuration is locked. Python owns physics, sensing, and episode evaluation.",
      )}
      ${observerContent}
      ${renderRunControls(simulation)}
    </section>
  `;
}

function renderRunRecoveryNotice(message: string | undefined): string {
  if (message === undefined) {
    return "";
  }
  return `
    <section class="training-recovery-notice" role="alert" aria-labelledby="training-recovery-title">
      <span class="data-chip">Update delayed</span>
      <div>
        <h2 id="training-recovery-title">Keeping the last verified run state</h2>
        <p>${escapeHtml(message)}</p>
        <p>EvoRacer will retry telemetry automatically. Run controls remain available after the current request finishes.</p>
      </div>
    </section>
  `;
}

function renderLiveRace(
  telemetry: SelectedCarTelemetryV1,
  activeCandidate: ObservationSnapshotV1["activeCandidate"],
  activeTrack: CompiledTrackV1 | undefined,
  live: boolean,
  replay: GenerationReplayV1 | undefined | null,
  priorTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const staticReplayFrame =
    reducedMotion && replay !== null && replay !== undefined
      ? replay.frames.at(-1)
      : replay?.frames[0];
  const marker =
    staticReplayFrame === undefined
      ? liveTrackMarker(telemetry)
      : {
          x: staticReplayFrame.x,
          y: staticReplayFrame.y,
          heading: staticReplayFrame.heading,
        };
  const replaying = replay !== null && replay !== undefined;
  const currentTrail = replaying ? replayTrackTrail(replay) : undefined;
  const animatedReplay =
    replaying && shouldAnimateReplay(reducedMotion, replay.frames.length);
  const candidateLabel = replaying
    ? animatedReplay
      ? `Champion replay · ${String(CHAMPION_REPLAY_RATE)}×`
      : reducedMotion
        ? "Champion replay · reduced motion"
        : "Champion replay · single frame"
    : live && activeCandidate !== null && activeCandidate !== undefined
      ? `Candidate ${String(activeCandidate.index)} / ${String(activeCandidate.total)}`
      : "Latest generation champion";
  const displayId = replaying ? replay.candidateId : telemetry.selectedCarId;
  return `
    <section class="live-race-panel" aria-labelledby="live-race-title">
      <div class="chart-heading">
        <div>
          <p class="section-kicker">${animatedReplay ? "Smooth Python champion replay" : replaying ? "Static Python champion frame" : live ? "Live Python simulation" : "Latest Python telemetry"}</p>
          <h2 id="live-race-title">${escapeHtml(displayId)}</h2>
        </div>
        <span class="data-chip ${live ? "is-live" : ""}">${candidateLabel}</span>
      </div>
      <div
        class="live-race-stage"
        role="img"
        aria-label="${animatedReplay ? "Smooth champion replay" : replaying ? "Static champion replay" : live ? "Live" : "Latest"} car position${currentTrail === undefined ? "" : " with its complete recorded path"}${priorTrails.length === 0 ? "" : ` and ${String(priorTrails.length)} earlier generation champion path${priorTrails.length === 1 ? "" : "s"}`}"
      >
        ${
          activeTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : marker !== undefined
              ? renderTrackSvg(activeTrack, marker, priorTrails, currentTrail)
              : renderTrackSvg(
                  activeTrack,
                  undefined,
                  priorTrails,
                  currentTrail,
                )
        }
      </div>
      ${renderGenerationTrailSummary(currentTrail !== undefined, priorTrails.length)}
      <div class="live-race-footer">
        <span>${animatedReplay ? "Full authoritative path · buffered replay at 60 FPS" : replaying ? (reducedMotion ? "Full authoritative path · final frame held for reduced motion" : "Full authoritative path · single recorded frame") : live ? "Accelerated live evaluation" : "Generation boundary"}</span>
        <strong>${replaying ? `${String(replay.frames.length)} Python frames` : `${telemetry.simulatedSeconds.toFixed(2)} simulated seconds · ${(telemetry.progress * 100).toFixed(1)}%`}</strong>
      </div>
    </section>
  `;
}

function renderGenerationTrailSummary(
  hasCurrentPath: boolean,
  priorCount: number,
): string {
  if (!hasCurrentPath && priorCount === 0) {
    return "";
  }
  return `
    <div class="generation-trail-summary" aria-live="polite">
      <span class="current-path-label"><i aria-hidden="true"></i> Displayed champion</span>
      ${priorCount === 0 ? "" : `<span class="prior-path-label"><i aria-hidden="true"></i> ${String(priorCount)} earlier champion${priorCount === 1 ? "" : "s"}</span>`}
      <strong>Python-recorded driving path${priorCount === 0 ? "" : " · older paths fade"}</strong>
    </div>
  `;
}

function liveTrackMarker(
  telemetry: SelectedCarTelemetryV1,
): { x: number; y: number; heading: number } | undefined {
  if (
    telemetry.x === undefined ||
    telemetry.y === undefined ||
    telemetry.heading === undefined
  ) {
    return undefined;
  }
  return {
    x: telemetry.x,
    y: telemetry.y,
    heading: telemetry.heading,
  };
}

function renderSelectedCarTelemetry(
  telemetry: SelectedCarTelemetryV1,
  title: string,
  status: string,
): string {
  const metricValues: [string, string][] = [
    ["Speed", `${telemetry.speed.toFixed(2)} m/s`],
    ["Lateral speed", `${telemetry.lateralSpeed.toFixed(2)} m/s`],
    ["Steering", telemetry.steering.toFixed(3)],
    ["Throttle", telemetry.throttle.toFixed(3)],
    ["Brake", telemetry.brake.toFixed(3)],
    ["Progress", `${(telemetry.progress * 100).toFixed(1)}%`],
  ];
  const metrics = metricValues
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
  const sensors = telemetry.sensorDistances
    .map(
      (distance, index) => `
        <li>
          <span>Ray ${String(index + 1)}</span>
          <meter min="0" max="36" value="${String(distance)}">${distance.toFixed(1)} m</meter>
          <strong>${distance.toFixed(1)} m</strong>
        </li>
      `,
    )
    .join("");

  return `
    <details class="telemetry-panel telemetry-disclosure">
      <summary class="telemetry-heading">
        <div>
          <p class="section-kicker">Selected car · ${escapeHtml(telemetry.selectedCarId)}</p>
          <h2 id="telemetry-title">${escapeHtml(title)}</h2>
        </div>
        <span class="data-chip">${escapeHtml(status)}</span>
      </summary>
      <div class="telemetry-content">
        <dl class="telemetry-metrics">${metrics}</dl>
        <div class="sensor-panel">
          <div>
            <h3>Road-edge sensors</h3>
            <p>Seven Python-derived rays · ${telemetry.simulatedSeconds.toFixed(2)} simulated seconds</p>
          </div>
          <ul>${sensors}</ul>
        </div>
        <p class="telemetry-note">
          Vehicle setup and controller parameters stayed fixed during this episode.
          Controls are observer telemetry only; there are no driving inputs.
        </p>
      </div>
    </details>
  `;
}

function renderRunOverview(snapshot: ObservationSnapshotV1): string {
  const report = snapshot.generationReport;
  const progress = runProgress(snapshot);
  return `
    <section class="run-overview" aria-label="Live run status">
      <div>
        <span class="data-chip">${escapeHtml(snapshot.status)}</span>
        <p>Run ${escapeHtml(snapshot.runId.slice(0, 16))}</p>
      </div>
      <dl>
        <div><dt>Generation</dt><dd>${String(snapshot.generation)} / ${String(snapshot.totalGenerations)}</dd></div>
        <div><dt>Best fitness</dt><dd>${report === null ? "—" : report.bestFitness.toFixed(3)}</dd></div>
        <div><dt>Median fitness</dt><dd>${report === null ? "—" : report.medianFitness.toFixed(3)}</dd></div>
        <div><dt>Champion</dt><dd>${report === null ? "—" : escapeHtml(report.championId)}</dd></div>
      </dl>
      <div class="run-progress">
        <div><span>Overall evaluation progress</span><strong>${progress.percent}</strong></div>
        <progress max="1" value="${String(progress.fraction)}">${progress.percent}</progress>
        <p>${escapeHtml(progress.label)}</p>
      </div>
    </section>
  `;
}

export function renderTrainingCompletion(
  snapshot: ObservationSnapshotV1,
): string {
  const completion = runCompletion(snapshot);
  if (completion === null) {
    return "";
  }
  const resultsAvailable = snapshot.result !== null;
  return `
    <section class="training-completion" role="status" aria-labelledby="training-completion-title">
      <p class="section-kicker">${resultsAvailable ? "Results ready" : "No results"}</p>
      <div class="training-completion-heading">
        <h2 id="training-completion-title">${completion.title}</h2>
        <button class="button primary" type="button" data-action="${resultsAvailable ? "view-results" : "new-setup"}">
          ${resultsAvailable ? "Open results" : "Create another setup"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p>${completion.message}</p>
    </section>
  `;
}

function renderRunControls(simulation: SimulationState): string {
  if (simulation.status !== "ready") {
    return "";
  }
  const controls = runControls(
    simulation.snapshot,
    simulation.commandRequest ?? null,
  );
  if (
    simulation.snapshot.status === "completed" ||
    simulation.snapshot.status === "stopped"
  ) {
    return "";
  }
  return `
    <div class="page-actions run-controls" aria-label="Run controls">
      <div>
        <button class="button secondary" type="button" data-focus-key="run-pause-toggle" data-action="${controls.pauseAction === "resume" ? "resume-run" : "pause-run"}" ${controls.pauseDisabled ? "disabled" : ""}>
          ${controls.pauseLabel}
        </button>
        <button class="button secondary" type="button" data-action="stop-run" ${controls.stopDisabled ? "disabled" : ""}>
          ${controls.stopLabel}
        </button>
        <p class="run-control-note" role="status">${controls.note}</p>
      </div>
      <button class="button primary" type="button" data-action="view-results" ${simulation.snapshot.result === null ? "disabled" : ""}>
        View results
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

export function renderFitnessChart(
  history: ObservationSnapshotV1["fitnessHistory"],
): string {
  if (history.length === 0) {
    return `
      <section class="fitness-chart" aria-labelledby="fitness-chart-title">
        <h2 id="fitness-chart-title">Fitness history</h2>
        <p>No completed generation yet.</p>
      </section>
    `;
  }
  const values = history.flatMap((point) => [
    point.bestFitness,
    point.medianFitness,
  ]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const x = (index: number): number =>
    history.length === 1 ? 50 : 4 + (index / (history.length - 1)) * 92;
  const y = (value: number): number => 92 - ((value - minimum) / span) * 84;
  const best = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.bestFitness).toFixed(2)}`,
    )
    .join(" ");
  const median = history
    .map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.medianFitness).toFixed(2)}`,
    )
    .join(" ");
  const singlePointMarkers =
    history.length === 1 && history[0] !== undefined
      ? `
        <circle class="chart-point median-point" cx="${x(0).toFixed(2)}" cy="${y(history[0].medianFitness).toFixed(2)}" r="2"></circle>
        <circle class="chart-point best-point" cx="${x(0).toFixed(2)}" cy="${y(history[0].bestFitness).toFixed(2)}" r="2"></circle>
      `
      : "";
  return `
    <section class="fitness-chart" aria-labelledby="fitness-chart-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Python generation reports</p><h2 id="fitness-chart-title">Fitness history</h2></div>
        <p><span class="legend best"></span> Best <span class="legend median"></span> Median</p>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Best and median fitness by generation" preserveAspectRatio="none">
        <polyline class="chart-line median-line" points="${median}"></polyline>
        <polyline class="chart-line best-line" points="${best}"></polyline>
        ${singlePointMarkers}
      </svg>
      <p>Generation ${String(history[0]?.generation ?? 0)} to ${String(history.at(-1)?.generation ?? 0)} · range ${minimum.toFixed(2)} to ${maximum.toFixed(2)}</p>
    </section>
  `;
}

function renderResults(
  state: AppState,
  simulation: SimulationState,
  replayFrameIndex: number,
  replayTrack: CompiledTrackV1 | undefined,
  generationTrails: readonly GenerationTrail[],
  reducedMotion: boolean,
): string {
  const preset = TRACK_PRESETS.find(
    (candidate) => candidate.id === state.draft.trackPreset,
  );
  const trackName = state.draft.track?.name ?? preset?.name ?? "Track";
  const result =
    simulation.status === "ready" ? simulation.snapshot.result : null;
  if (result === null) {
    return `
      <section class="page" aria-labelledby="page-title">
        ${pageHeader(
          "Experiment / Results",
          "Results",
          "A terminal Python result is required before replay and comparison.",
        )}
        <div class="empty-results">
          <span class="data-chip">No terminal result</span>
          <h2>Return to Training</h2>
          <p>${escapeHtml(trackName)} · the reviewed configuration remains locked.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-route="training">Back to Training</button>
        </div>
      </section>
    `;
  }
  if (simulation.status !== "ready") {
    return "";
  }
  const snapshot = simulation.snapshot;
  void replayFrameIndex;
  void generationTrails;
  const championComparison = result.baselineComparisons[0];
  const firstBest =
    result.fitnessHistory[0]?.bestFitness ?? result.champion.fitness;
  const fitnessGain = result.champion.fitness - firstBest;
  const improvement = fitnessGain > 1e-6;
  const racingLine = result.racingLineComparison;
  const lineHeadline =
    racingLine === undefined
      ? "Ideal-line comparison unavailable"
      : racingLine.matched
        ? "Yes — the champion matched the ideal-line benchmark"
        : racingLine.championFinished
          ? "Not yet — the champion finished, but used a different line"
          : "Not yet — the champion did not complete the lap";
  const lineEvidence =
    racingLine === undefined
      ? "This result predates the geometric racing-line benchmark."
      : `Average deviation ${racingLine.meanDeviationMeters.toFixed(2)} m (target ≤ ${racingLine.meanToleranceMeters.toFixed(2)} m); 95th percentile ${racingLine.p95DeviationMeters.toFixed(2)} m (target ≤ ${racingLine.p95ToleranceMeters.toFixed(2)} m).`;
  const comparisons = result.baselineComparisons
    .map(
      (item) => `
        <tr>
          <th scope="row">${escapeHtml(item.label)}</th>
          <td>${item.fitness.toFixed(3)}</td>
          <td>${(item.progress * 100).toFixed(1)}%</td>
          <td>${item.finished ? "Finished" : escapeHtml(item.controller.replaceAll("_", " "))}</td>
        </tr>
      `,
    )
    .join("");
  const previous =
    snapshot.previousRuns.length === 0
      ? "<p>No earlier run has the same track and evaluation budget.</p>"
      : `
        <p class="comparison-note">Only runs with the same track, population, generation count, and episode duration are shown.</p>
        <div class="table-scroll">
          <table>
          <thead><tr><th>Run</th><th>Algorithm</th><th>Seed</th><th>Generations</th><th>Champion</th><th>Progress</th></tr></thead>
          <tbody>
            ${snapshot.previousRuns
              .map(
                (run) => `
                  <tr>
                    <th scope="row">${escapeHtml(run.runId.slice(0, 16))}</th>
                    <td>${escapeHtml(run.algorithm)}</td>
                    <td>${String(run.seed)}</td>
                    <td>${String(run.generationsCompleted)}</td>
                    <td>${run.championFitness.toFixed(3)}</td>
                    <td>${(run.championProgress * 100).toFixed(1)}%</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
          </table>
        </div>
      `;
  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Results",
        "What did the AI achieve?",
        "Read the verdict first, then inspect the champion against the same Python-owned track and reference.",
      )}
      <section class="result-verdict" aria-labelledby="result-verdict-title">
        <div class="result-verdict-copy">
          <p class="section-kicker">Ideal racing line · geometric reference</p>
          <h2 id="result-verdict-title">${lineHeadline}</h2>
          <p>${lineEvidence}</p>
          <p class="comparison-note">The dashed cyan line minimizes geometric curvature inside the road corridor. It is a benchmark, not proof of the globally fastest lap.</p>
        </div>
        <div class="verdict-grid" aria-label="Result summary">
          <article><span>Learning</span><strong>${improvement ? "Improved" : "No measured gain"}</strong><p>${fitnessGain >= 0 ? "+" : ""}${fitnessGain.toFixed(3)} fitness from generation 1 best</p></article>
          <article><span>Lap outcome</span><strong>${championComparison?.finished === true ? "Finished" : "Incomplete"}</strong><p>${(result.champion.progress * 100).toFixed(1)}% progress · ${String(championComparison?.collisionCount ?? 0)} collision(s)</p></article>
          <article><span>Ideal-line match</span><strong>${racingLine === undefined ? "Unavailable" : racingLine.matched ? "Matched" : "Not matched"}</strong><p>${racingLine === undefined ? "Older result contract" : `${racingLine.meanDeviationMeters.toFixed(2)} m average deviation`}</p></article>
          <article><span>Training</span><strong>${String(result.metadata.generationsCompleted)} / ${String(result.metadata.generationsRequested)}</strong><p>${escapeHtml(result.metadata.algorithm)} · seed ${String(result.metadata.seed)}</p></article>
        </div>
      </section>
      ${renderReplay(
        result.replay.frames,
        result.replay.candidateId,
        replayTrack,
        racingLine,
        reducedMotion,
      )}
      <div class="result-analysis-grid">
        ${renderFitnessChart(result.fitnessHistory)}
        <section class="comparison-panel" aria-labelledby="baseline-title">
          <div class="chart-heading"><div><p class="section-kicker">Same track and vehicle setup</p><h2 id="baseline-title">Champion vs baselines</h2></div></div>
          <p class="comparison-note">Higher fitness and progress are better. Compare these values only inside this run.</p>
          <div class="table-scroll"><table><thead><tr><th>Controller</th><th>Fitness</th><th>Progress</th><th>Outcome</th></tr></thead><tbody>${comparisons}</tbody></table></div>
        </section>
      </div>
      <details class="result-details"><summary>Previous comparable runs</summary><div class="result-details-body" id="run-comparison-title">${previous}</div></details>
      <details class="result-details">
        <summary>Run details</summary>
        <dl class="result-metadata">
          <div><dt>Track</dt><dd>${escapeHtml(result.metadata.trackName)}</dd></div>
          <div><dt>Run</dt><dd>${escapeHtml(result.metadata.runId)}</dd></div>
          <div><dt>Champion</dt><dd>${escapeHtml(result.champion.candidateId)}</dd></div>
          <div><dt>Track SHA-256</dt><dd>${escapeHtml(result.metadata.trackSha256.slice(0, 12))}…</dd></div>
        </dl>
      </details>
      <div class="page-actions">
        <button class="button primary" type="button" data-action="new-setup">
          Create another setup
        </button>
      </div>
    </section>
  `;
}

function renderReplay(
  frames: ReplayFrameV1[],
  candidateId: string,
  replayTrack: CompiledTrackV1 | undefined,
  racingLine: RunResultV1["racingLineComparison"],
  reducedMotion: boolean,
): string {
  const frame = reducedMotion ? frames.at(-1) : frames[0];
  if (frame === undefined) {
    return `
      <section class="replay-panel" aria-labelledby="replay-title">
        <h2 id="replay-title">Champion replay</h2>
        <p>No replay frames were produced.</p>
      </section>
    `;
  }
  const currentTrail = replayTrackTrail({ candidateId, frames });
  const referenceTrail =
    racingLine === undefined
      ? undefined
      : { candidateId: racingLine.method, points: racingLine.referenceLine };
  return `
    <section class="replay-panel" aria-labelledby="replay-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Actual route vs geometric benchmark</p><h2 id="replay-title">Champion and ideal racing line</h2></div>
        <span class="data-chip">${reducedMotion ? "Final frame · motion reduced" : "Smooth replay · 1×"}</span>
      </div>
      <div class="replay-stage" role="img" aria-label="Champion path overlaid with the minimum-curvature ideal racing-line reference">
        ${
          replayTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : renderTrackSvg(
                replayTrack,
                frame,
                [],
                currentTrail,
                referenceTrail,
              )
        }
      </div>
      <div class="racing-line-legend" aria-label="Racing-line legend">
        <span><i class="actual-line-key" aria-hidden="true"></i>Champion path</span>
        <span><i class="ideal-line-key" aria-hidden="true"></i>Ideal line · minimum curvature</span>
        <span>${escapeHtml(candidateId)} · ${String(frames.length)} recorded Python frames</span>
      </div>
    </section>
  `;
}

function renderActions(
  backRoute: RouteId,
  nextRoute: RouteId,
  nextLabel: string,
  nextDisabled: boolean,
  review = false,
): string {
  return `
    <div class="page-actions">
      <button class="button secondary" type="button" data-route="${backRoute}">
        <span aria-hidden="true">←</span>
        Back
      </button>
      <button
        class="button primary"
        type="button"
        ${review ? 'data-action="review"' : `data-route="${nextRoute}"`}
        ${nextDisabled ? "disabled" : ""}
      >
        ${nextLabel}
        <span aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

function bindActions(
  root: HTMLElement,
  state: AppState,
  dispatch: (action: AppAction) => void,
  review: () => Promise<void>,
  startSession: () => Promise<void>,
  controlSession: (command: "pause" | "resume" | "stop") => Promise<void>,
  moveReplay: (action: "previous" | "next" | "restart") => void,
  handleRunAction: (
    action: "resume" | "open" | "delete" | "export",
    runId: string,
  ) => Promise<void>,
  handleTrackAction: (action: string, element: HTMLElement) => Promise<void>,
  dropEditorPiece: (payload: EditorDragPayload, insertionIndex: number) => void,
  importTrack: (file: File) => Promise<void>,
  retryPresetTracks: () => void,
  retryRunLibrary: () => void,
  exitApplication: () => Promise<void>,
  toggleReducedMotion: () => void,
  updateEditor: (name: string, roadWidth: number) => void,
  updateGenerator: (
    seed: number,
    length: "short" | "medium" | "long",
    difficulty: "easy" | "technical" | "hard",
  ) => void,
): void {
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

function syncGeneratorDraftPresentation(
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
  badge.textContent = inputsChanged
    ? "Inputs changed"
    : selectedMatches
      ? "Active experiment track"
      : "Verified candidate";

  const notice = root.querySelector<HTMLElement>("[data-track-builder-notice]");
  const noticeMessage = root.querySelector<HTMLElement>(
    "[data-track-builder-notice-message]",
  );
  if (notice === null || noticeMessage === null) {
    return;
  }
  notice.className = `track-builder-notice is-${inputsChanged ? "warning" : workspace.notice.tone}`;
  noticeMessage.textContent = inputsChanged
    ? "Generator inputs changed. Generate again to apply them; the preview still shows the last Python-verified result."
    : workspace.notice.message;
}

function downloadTrack(compiled: CompiledTrackV1): void {
  downloadJson(
    serializeTrackDocument(compiled.track),
    `${safeFileName(compiled.track.name)}.track.json`,
  );
}

function downloadRunDocument(run: RunDocumentV1): void {
  downloadJson(
    `${JSON.stringify(run, null, 2)}\n`,
    `${safeFileName(run.runId)}.run.json`,
  );
}

function downloadJson(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const candidate = normalized || "local-export";
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate)
    ? `${candidate}-export`
    : candidate;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
