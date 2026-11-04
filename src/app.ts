import type {
  ApplicationLifecycle,
  ChampionReplayMotion,
  LiveMarkerMotion,
  PresetGeometryState,
  RunLibraryAction,
  RunLibraryNotice,
  RunLibraryState,
  SimulationState,
} from "./app-store";
import { type EditorDragPayload, bindActions } from "./bind-actions";
import { downloadRunDocument, downloadTrack } from "./downloads";
import {
  type GenerationTrail,
  updateGenerationTrails,
} from "./generation-trails";
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
  CHAMPION_REPLAY_RATE,
  RESULTS_REPLAY_RATE,
  interpolateTrackMarker,
  liveTrackMarker,
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
  type AppAction,
  type AppState,
  canRequestReview,
  canStartSession,
  createInitialState,
  transition,
} from "./onboarding";
import {
  type FocusSnapshot,
  captureRenderState,
  restoreDisclosures,
  restoreFocus,
} from "./render-state";
import {
  type RunCommand,
  replayFrameIndexAfterAction,
} from "./run-presentation";
import type { GenerationReplayV1 } from "./simulation";
import {
  type TrackBuilderPending,
  type TrackBuilderTab,
  type TrackWorkspaceState,
  createTrackWorkspaceState,
  generatorInputsChanged,
} from "./track-builder";
import type { CompiledTrackV1, TrackMarker } from "./track-renderer";
import {
  type EditorState,
  type SegmentKind,
  type TrackCommandResponse,
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
  undoEditor,
  updateEditorDetails,
} from "./track-workbench";
import { renderShell } from "./views/shell";

const MIN_MARKER_TWEEN_MS = 100;
const MAX_MARKER_TWEEN_MS = 240;
const MARKER_TWEEN_SCALE = 1.25;
export const TRACK_LIBRARY_REFRESHED_NOTICE: TrackWorkspaceState["notice"] = {
  tone: "success",
  message: "Local track library refreshed.",
};

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
