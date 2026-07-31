import {
  ROUTES,
  TRACK_PRESETS,
  TRAINING_PRESETS,
  canRequestReview,
  canStartSession,
  createInitialState,
  getPresentationIssues,
  maximumCandidateEpisodes,
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
  resumeRun,
  saveTrack,
  serviceUnavailableResponse,
  shutdownApplication,
  startRun,
  validateSetup,
} from "./ipc";
import {
  interpolateTrackMarker,
  replayTrackMarkerAt,
  sameTrackMarker,
  trackMarkerTransform,
} from "./live-motion";
import {
  mergeObservationSnapshot,
  observationPollDelay,
} from "./observer-refresh";
import {
  priorGenerationTrails,
  updateGenerationTrails,
  type GenerationTrail,
} from "./generation-trails";
import type {
  ObservationSnapshotV1,
  GenerationReplayV1,
  ReplayFrameV1,
  RunDocumentV1,
  RunLibraryResponseV1,
  SelectedCarTelemetryV1,
} from "./simulation";
import { runCompletion, runControls, runProgress } from "./run-presentation";
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
  moveEditorPiece,
  parseTrackDocument,
  redoEditor,
  replaceEditorTrack,
  resetEditor,
  serializeTrackDocument,
  undoEditor,
  updateEditorDetails,
  type EditorState,
  type SegmentKind,
} from "./track-workbench";
import {
  createTrackWorkspaceState,
  renderTrackBuilder,
  type TrackBuilderTab,
  type TrackWorkspaceState,
} from "./track-builder";

const ROUTE_ORDER = new Map<RouteId, number>(
  ROUTES.map((route, index) => [route.id, index]),
);
const MIN_MARKER_TWEEN_MS = 100;
const MAX_MARKER_TWEEN_MS = 240;
const MARKER_TWEEN_SCALE = 1.25;
const CHAMPION_REPLAY_RATE = 2;
const LIVE_MARKER_SELECTOR = ".live-race-stage .track-replay-marker";

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
}

export interface AppController {
  getState(): AppState;
  dispatch(action: AppAction): void;
}

type PresetGeometryState =
  | { status: "loading" }
  | { status: "ready"; presets: CompiledTrackV1[] }
  | { status: "unavailable" };

type SimulationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: ObservationSnapshotV1 }
  | { status: "unavailable"; message: string };

type RunLibraryState =
  | { status: "loading" }
  | { status: "ready"; value: RunLibraryResponseV1; message: string }
  | { status: "unavailable"; message: string };

export function mountApp(root: HTMLElement): AppController {
  let state = createInitialState();
  let presetGeometry: PresetGeometryState = { status: "loading" };
  let simulation: SimulationState = { status: "idle" };
  let observationTimer: number | undefined;
  let observationPending = false;
  let liveMarkerFrame: number | undefined;
  let liveMarkerMotion: LiveMarkerMotion | undefined;
  let championReplayMotion: ChampionReplayMotion | undefined;
  let queuedChampionReplay: ChampionReplayMotion | undefined;
  let generationTrails: GenerationTrail[] = [];
  let replayFrameIndex = 0;
  let runLibrary: RunLibraryState = { status: "loading" };
  let trackValidationRequest = 0;
  let trackWorkspace = createTrackWorkspaceState(
    `custom-${Date.now().toString(36)}`,
  );

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
    root
      .querySelector<SVGGElement>(LIVE_MARKER_SELECTOR)
      ?.setAttribute("transform", trackMarkerTransform(marker));
  };

  const animateLiveMarker = (now: number): void => {
    liveMarkerFrame = undefined;
    if (championReplayMotion !== undefined) {
      const firstFrame = championReplayMotion.frames[0];
      const lastFrame = championReplayMotion.frames.at(-1);
      if (firstFrame === undefined || lastFrame === undefined) {
        championReplayMotion = undefined;
        queuedChampionReplay = undefined;
        return;
      }
      const replaySeconds = Math.max(
        0.1,
        lastFrame.simulatedSeconds - firstFrame.simulatedSeconds,
      );
      const elapsedSeconds =
        ((now - championReplayMotion.startedAt) / 1000) * CHAMPION_REPLAY_RATE;
      if (elapsedSeconds >= replaySeconds) {
        championReplayMotion = queuedChampionReplay ?? {
          ...championReplayMotion,
          startedAt: now,
        };
        championReplayMotion.startedAt = now;
        queuedChampionReplay = undefined;
      }
      const activeFirst = championReplayMotion.frames[0];
      const activeLast = championReplayMotion.frames.at(-1);
      if (activeFirst !== undefined && activeLast !== undefined) {
        const activeDuration = Math.max(
          0.1,
          activeLast.simulatedSeconds - activeFirst.simulatedSeconds,
        );
        const activeElapsed =
          (((now - championReplayMotion.startedAt) / 1000) *
            CHAMPION_REPLAY_RATE) %
          activeDuration;
        const marker = replayTrackMarkerAt(
          championReplayMotion.frames,
          activeFirst.simulatedSeconds + activeElapsed,
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
    queuedChampionReplay = undefined;
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
    if (state.route !== "training" || simulation.status !== "ready") {
      resetLiveMarkerMotion();
      return;
    }
    const replay = availableChampionReplay();
    if (replay !== null) {
      const nextReplay = {
        key: replay.key,
        frames: replay.replay.frames,
        startedAt: window.performance.now(),
      };
      if (championReplayMotion === undefined) {
        championReplayMotion = nextReplay;
      } else if (
        championReplayMotion.key !== replay.key &&
        queuedChampionReplay?.key !== replay.key
      ) {
        queuedChampionReplay = nextReplay;
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
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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
    state = transition(state, action);
    if (action.type === "new-setup") {
      if (observationTimer !== undefined) {
        window.clearTimeout(observationTimer);
        observationTimer = undefined;
      }
      simulation = { status: "idle" };
      generationTrails = [];
      replayFrameIndex = 0;
      trackWorkspace = { ...trackWorkspace, toolsOpen: false };
    }
    render(state.route !== previousRoute);
  };

  const review = async (): Promise<void> => {
    if (!canRequestReview(state)) {
      state = { ...state, route: "settings" };
      render(true);
      return;
    }

    dispatch({ type: "validation-started" });
    try {
      const response = await validateSetup(state.draft);
      dispatch({ type: "validation-received", response });
    } catch (error) {
      dispatch({
        type: "validation-received",
        response: serviceUnavailableResponse(error),
      });
    }
  };

  const scheduleObservation = (): void => {
    if (
      simulation.status !== "ready" ||
      simulation.snapshot.status !== "running" ||
      observationPending ||
      observationTimer !== undefined
    ) {
      return;
    }
    observationTimer = window.setTimeout(() => {
      void observeSession();
    }, observationPollDelay(document.visibilityState));
  };

  const applyRunResponse = (
    response: Awaited<ReturnType<typeof startRun>>,
  ): void => {
    if (!response.valid) {
      simulation = {
        status: "unavailable",
        message: response.errors[0]?.message ?? "The run command was rejected.",
      };
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
      simulation.snapshot.status !== "running"
    ) {
      return;
    }
    observationTimer = undefined;
    if (observationPending) {
      return;
    }
    observationPending = true;
    try {
      applyRunResponse(
        await observeRun(
          simulation.snapshot.runId,
          simulation.snapshot.generationReplay?.candidateId,
        ),
      );
    } catch (error) {
      simulation = {
        status: "unavailable",
        message:
          error instanceof Error
            ? `Telemetry update failed: ${error.message}`
            : "The local core could not advance the training run.",
      };
      render();
    } finally {
      observationPending = false;
      scheduleObservation();
    }
  };

  const handleVisibilityChange = (): void => {
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

  const controlSession = async (
    command: "pause" | "resume" | "stop",
  ): Promise<void> => {
    if (simulation.status !== "ready") {
      return;
    }
    if (observationTimer !== undefined) {
      window.clearTimeout(observationTimer);
      observationTimer = undefined;
    }
    try {
      applyRunResponse(await commandRun(simulation.snapshot.runId, command));
    } catch {
      simulation = {
        status: "unavailable",
        message: "The local core could not apply the run command.",
      };
      render();
    }
  };

  const moveReplay = (action: "previous" | "next" | "restart"): void => {
    if (simulation.status !== "ready" || simulation.snapshot.result === null) {
      return;
    }
    const lastIndex = simulation.snapshot.result.replay.frames.length - 1;
    if (action === "restart") {
      replayFrameIndex = 0;
    } else if (action === "previous") {
      replayFrameIndex = Math.max(0, replayFrameIndex - 1);
    } else {
      replayFrameIndex = Math.min(lastIndex, replayFrameIndex + 1);
    }
    render();
  };

  const startSession = async (): Promise<void> => {
    if (!canStartSession(state)) {
      return;
    }
    const frozenDraft = state.draft;
    simulation = { status: "loading" };
    generationTrails = [];
    replayFrameIndex = 0;
    dispatch({ type: "start-session" });
    try {
      applyRunResponse(await startRun(frozenDraft));
    } catch {
      simulation = {
        status: "unavailable",
        message: "The local core could not start the reviewed run.",
      };
      render();
    }
  };

  const refreshLibrary = async (): Promise<void> => {
    try {
      trackWorkspace = {
        ...trackWorkspace,
        library: await loadTrackLibrary(),
      };
    } catch {
      trackWorkspace = {
        ...trackWorkspace,
        notice: {
          tone: "error",
          message: "The local track library is unavailable.",
        },
      };
    }
    render();
  };

  const refreshRuns = async (): Promise<void> => {
    try {
      runLibrary = {
        status: "ready",
        value: await loadRunLibrary(),
        message: "Run files are stored atomically by the local Python core.",
      };
    } catch {
      runLibrary = {
        status: "unavailable",
        message: "The local run library is unavailable.",
      };
    }
    render();
  };

  const handleRunAction = async (
    action: "resume" | "delete" | "export",
    runId: string,
  ): Promise<void> => {
    try {
      if (action === "delete") {
        await deleteRun(runId);
        await refreshRuns();
        return;
      }
      if (action === "export") {
        downloadRunDocument(await exportRun(runId));
        return;
      }
      simulation = { status: "loading" };
      const response = await resumeRun(runId);
      if (!response.valid || response.setup === undefined) {
        runLibrary = {
          status: "unavailable",
          message: response.valid
            ? "The restored run did not include its frozen setup."
            : (response.errors[0]?.message ?? "The run could not be resumed."),
        };
        render();
        return;
      }
      if (response.setup.track !== null) {
        const compiled = await compileTrack(response.setup.track);
        if (compiled.valid && compiled.compiled !== undefined) {
          trackWorkspace = { ...trackWorkspace, selected: compiled.compiled };
        }
      }
      generationTrails = [];
      dispatch({ type: "restore-session", draft: response.setup });
      applyRunResponse(response);
    } catch {
      runLibrary = {
        status: "unavailable",
        message: "The local run command could not be completed.",
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
          editorPreview: undefined,
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
    } catch {
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
          message: "The local Python core could not validate this draft.",
        },
      };
    }
    render();
  };

  const saveCompiledTrack = async (
    compiled: CompiledTrackV1,
  ): Promise<void> => {
    trackWorkspace = { ...trackWorkspace, pending: "save" };
    render();
    const result = await saveTrack(compiled.track);
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
    try {
      switch (action) {
        case "open-builder":
          trackWorkspace = {
            ...trackWorkspace,
            toolsOpen: true,
            tab: "build",
            notice: {
              tone: "info",
              message: "Checking the starter draft with the local Python core.",
            },
          };
          render();
          if (trackWorkspace.editorValidation.status === "unchecked") {
            void validateEditorDraft();
          }
          return;
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
          }
          return;
        case "close-builder":
          trackWorkspace = { ...trackWorkspace, toolsOpen: false };
          render();
          return;
        case "builder-tab": {
          const tab = element.dataset.builderTab as TrackBuilderTab | undefined;
          if (tab === "build" || tab === "generate" || tab === "library") {
            trackWorkspace = { ...trackWorkspace, tab };
            render();
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
          ++trackValidationRequest;
          trackWorkspace = {
            ...trackWorkspace,
            pending: "assist",
            notice: {
              tone: "info",
              message: "Python is searching for a safe closing sequence.",
            },
          };
          render();
          const response = await assistTrackClosure(
            editorTrack(trackWorkspace.editor),
          );
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
                message: `Python added ${String(response.addedPieces?.length ?? 0)} piece(s) and verified the closed loop.`,
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
          if (trackWorkspace.editorPreview !== undefined) {
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
          if (response.valid && response.compiled !== undefined) {
            trackWorkspace = {
              ...trackWorkspace,
              pending: null,
              generatedPreview: response.compiled,
              notice: {
                tone: "success",
                message: `Generated and verified ${String(response.compiled.track.pieces.length)} canonical pieces.`,
              },
            };
          } else {
            trackWorkspace = {
              ...trackWorkspace,
              pending: null,
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
          }
          return;
        case "save-editor":
          if (trackWorkspace.editorPreview !== undefined) {
            await saveCompiledTrack(trackWorkspace.editorPreview);
          }
          return;
        case "save-generated":
          if (trackWorkspace.generatedPreview !== undefined) {
            await saveCompiledTrack(trackWorkspace.generatedPreview);
          }
          return;
        case "export-editor":
          if (trackWorkspace.editorPreview !== undefined) {
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
            trackWorkspace = { ...trackWorkspace, pending: "delete" };
            render();
            await deleteTrack(trackId);
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
    } catch {
      trackWorkspace = {
        ...trackWorkspace,
        pending: null,
        notice: {
          tone: "error",
          message: "The local Python track command could not be completed.",
        },
      };
      render();
    }
  };

  const importTrack = async (file: File): Promise<void> => {
    try {
      const track = parseTrackDocument(await file.text());
      const response = await compileTrack(track);
      if (!response.valid || response.compiled === undefined) {
        trackWorkspace = {
          ...trackWorkspace,
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
      trackWorkspace = {
        ...trackWorkspace,
        notice: {
          tone: "error",
          message:
            error instanceof Error ? error.message : "Track import failed.",
        },
      };
      render();
    }
  };

  const render = (focusHeading = false): void => {
    root.innerHTML = renderShell(
      state,
      presetGeometry,
      trackWorkspace,
      simulation,
      runLibrary,
      replayFrameIndex,
      generationTrails,
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
      importTrack,
      async () => {
        if (!window.confirm("Exit EvoRacer and stop the local core?")) {
          return;
        }
        try {
          await shutdownApplication();
          root.innerHTML = `
            <main class="shutdown-screen">
              <p class="eyebrow">Local session ended</p>
              <h1>EvoRacer has shut down.</h1>
              <p>You can close this browser tab. Run EvoRacer.exe to start a new session.</p>
            </main>
          `;
        } catch {
          window.alert("EvoRacer could not stop the local core.");
        }
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
      },
    );

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
      const pageTitle = root.querySelector<HTMLElement>("#page-title");
      pageTitle?.focus();
    }
  };

  render(true);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void loadPresetTracks()
    .then((response) => {
      presetGeometry = { status: "ready", presets: response.presets };
      render();
    })
    .catch(() => {
      presetGeometry = { status: "unavailable" };
      render();
    });
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
            <small>Simulation workspace</small>
          </span>
        </a>
        <div class="topbar-actions">
          <p class="local-status">
            <span aria-hidden="true"></span>
            Offline
          </p>
          <button class="exit-button" type="button" data-action="exit-application">
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
      return renderTraining(state, simulation, activeTrack, generationTrails);
    case "results":
      return renderResults(
        state,
        simulation,
        replayFrameIndex,
        activeTrack,
        generationTrails,
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
  const savedRuns =
    runLibrary.status === "loading"
      ? "<p>Loading local run files…</p>"
      : runLibrary.status === "unavailable"
        ? `<p>${escapeHtml(runLibrary.message)}</p>`
        : runLibrary.value.runs.length === 0
          ? "<p>No saved runs yet. Every started run will appear here.</p>"
          : `
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
                            <button class="button secondary" type="button" data-run-action="resume" data-run-id="${escapeHtml(run.runId)}" ${run.resumable ? "" : "disabled"}>Resume</button>
                            <button class="button secondary" type="button" data-run-action="export" data-run-id="${escapeHtml(run.runId)}">Export</button>
                            <button class="button secondary" type="button" data-run-action="delete" data-run-id="${escapeHtml(run.runId)}">Delete</button>
                          </div>
                        </td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
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
        "Use the recommended first run or customize it. Nothing runs until you review the setup and press Start.",
      )}

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
            <button class="button primary" type="button" data-action="review">
              Review recommended setup
            </button>
            <button class="button secondary" type="button" data-action="begin-setup">
              Customize setup
            </button>
          </div>
        </div>
      </div>
      <details class="comparison-panel saved-runs-panel">
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
          ${selected ? "checked" : ""}
        />
        <span class="track-preview">
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

  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Setup / Track",
        "Choose a track.",
        "Start from a verified preset or open Track Builder for a custom circuit.",
      )}
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
      <select id="${id}" name="${id}" data-algorithm>
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
    const replaying =
      replay !== null && replay !== undefined && replay.frames.length > 1;
    const priorTrails = priorGenerationTrails(
      generationTrails,
      replay?.candidateId,
    );
    const backgroundEvaluation = replaying && live;
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

function renderLiveRace(
  telemetry: SelectedCarTelemetryV1,
  activeCandidate: ObservationSnapshotV1["activeCandidate"],
  activeTrack: CompiledTrackV1 | undefined,
  live: boolean,
  replay: GenerationReplayV1 | undefined | null,
  priorTrails: readonly GenerationTrail[],
): string {
  const firstReplayFrame = replay?.frames[0];
  const marker =
    firstReplayFrame === undefined
      ? liveTrackMarker(telemetry)
      : {
          x: firstReplayFrame.x,
          y: firstReplayFrame.y,
          heading: firstReplayFrame.heading,
        };
  const replaying = replay !== null && replay !== undefined;
  const candidateLabel = replaying
    ? `Champion replay · ${String(CHAMPION_REPLAY_RATE)}×`
    : live && activeCandidate !== null && activeCandidate !== undefined
      ? `Candidate ${String(activeCandidate.index)} / ${String(activeCandidate.total)}`
      : "Latest generation champion";
  const displayId = replaying ? replay.candidateId : telemetry.selectedCarId;
  return `
    <section class="live-race-panel" aria-labelledby="live-race-title">
      <div class="chart-heading">
        <div>
          <p class="section-kicker">${replaying ? "Smooth Python champion replay" : live ? "Live Python simulation" : "Latest Python telemetry"}</p>
          <h2 id="live-race-title">${escapeHtml(displayId)}</h2>
        </div>
        <span class="data-chip ${live ? "is-live" : ""}">${candidateLabel}</span>
      </div>
      <div
        class="live-race-stage"
        role="img"
        aria-label="${replaying ? "Smooth champion replay" : live ? "Live" : "Latest"} car position${priorTrails.length === 0 ? "" : ` with ${String(priorTrails.length)} previous generation champion path${priorTrails.length === 1 ? "" : "s"}`}"
      >
        ${
          activeTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : marker !== undefined
              ? renderTrackSvg(activeTrack, marker, priorTrails)
              : renderTrackSvg(activeTrack, undefined, priorTrails)
        }
      </div>
      ${renderGenerationTrailSummary(priorTrails.length)}
      <div class="live-race-footer">
        <span>${replaying ? "Buffered authoritative frames at 60 FPS" : live ? "Accelerated live evaluation" : "Generation boundary"}</span>
        <strong>${replaying ? `${String(replay.frames.length)} Python frames` : `${telemetry.simulatedSeconds.toFixed(2)} simulated seconds · ${(telemetry.progress * 100).toFixed(1)}%`}</strong>
      </div>
    </section>
  `;
}

function renderGenerationTrailSummary(count: number): string {
  if (count === 0) {
    return "";
  }
  return `
    <div class="generation-trail-summary" aria-live="polite">
      <span><i aria-hidden="true"></i> Evolution trail</span>
      <strong>${String(count)} previous champion path${count === 1 ? "" : "s"} · older paths fade</strong>
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
    <section class="telemetry-panel" aria-labelledby="telemetry-title">
      <div class="telemetry-heading">
        <div>
          <p class="section-kicker">Selected car · ${escapeHtml(telemetry.selectedCarId)}</p>
          <h2 id="telemetry-title">${escapeHtml(title)}</h2>
        </div>
        <span class="data-chip">${escapeHtml(status)}</span>
      </div>
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
    </section>
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

function renderTrainingCompletion(snapshot: ObservationSnapshotV1): string {
  const completion = runCompletion(snapshot);
  if (completion === null) {
    return "";
  }
  return `
    <section class="training-completion" role="status" aria-labelledby="training-completion-title">
      <p class="section-kicker">Results ready</p>
      <div class="training-completion-heading">
        <h2 id="training-completion-title">${completion.title}</h2>
        <button class="button primary" type="button" data-action="view-results">
          Open results
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
  const controls = runControls(simulation.snapshot);
  if (
    simulation.snapshot.status === "completed" ||
    simulation.snapshot.status === "stopped"
  ) {
    return "";
  }
  return `
    <div class="page-actions run-controls" aria-label="Run controls">
      <div>
        <button class="button secondary" type="button" data-action="${controls.pauseAction === "resume" ? "resume-run" : "pause-run"}" ${controls.pauseDisabled ? "disabled" : ""}>
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

function renderFitnessChart(
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
  return `
    <section class="fitness-chart" aria-labelledby="fitness-chart-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Python generation reports</p><h2 id="fitness-chart-title">Fitness history</h2></div>
        <p><span class="legend best"></span> Best <span class="legend median"></span> Median</p>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Best and median fitness by generation" preserveAspectRatio="none">
        <polyline class="chart-line median-line" points="${median}"></polyline>
        <polyline class="chart-line best-line" points="${best}"></polyline>
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
  const priorTrails = priorGenerationTrails(
    generationTrails,
    result.replay.candidateId,
  );
  const frame =
    result.replay.frames[
      Math.min(replayFrameIndex, result.replay.frames.length - 1)
    ];
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
      `;
  return `
    <section class="page" aria-labelledby="page-title">
      ${pageHeader(
        "Experiment / Results",
        "Results",
        "Python-owned metadata, champion replay, and comparable baselines from the same track and vehicle setup.",
      )}
      <section class="result-summary" aria-labelledby="result-summary-title">
        <div>
          <p class="section-kicker">${escapeHtml(result.metadata.status)} run</p>
          <h2 id="result-summary-title">${escapeHtml(result.metadata.trackName)}</h2>
          <p>${escapeHtml(result.metadata.runId)} · ${escapeHtml(result.metadata.algorithm)} · seed ${String(result.metadata.seed)}</p>
        </div>
        <dl>
          <div><dt>Champion fitness</dt><dd>${result.champion.fitness.toFixed(3)}</dd></div>
          <div><dt>Progress</dt><dd>${(result.champion.progress * 100).toFixed(1)}%</dd></div>
          <div><dt>Generations</dt><dd>${String(result.metadata.generationsCompleted)} / ${String(result.metadata.generationsRequested)}</dd></div>
          <div><dt>Track SHA-256</dt><dd>${escapeHtml(result.metadata.trackSha256.slice(0, 12))}…</dd></div>
        </dl>
      </section>
      ${renderFitnessChart(result.fitnessHistory)}
      <section class="comparison-panel" aria-labelledby="baseline-title">
        <h2 id="baseline-title">Champion and baselines</h2>
        <table>
          <thead><tr><th>Controller</th><th>Fitness</th><th>Progress</th><th>Outcome</th></tr></thead>
          <tbody>${comparisons}</tbody>
        </table>
      </section>
      ${renderReplay(
        result.replay.frames,
        frame,
        replayFrameIndex,
        result.replay.vehicleSetup.frontDriveBias,
        result.replay.vehicleSetup.frontBrakeBias,
        replayTrack,
        priorTrails,
      )}
      <section class="comparison-panel" aria-labelledby="run-comparison-title">
        <h2 id="run-comparison-title">Previous saved runs</h2>
        ${previous}
      </section>
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
  frame: ReplayFrameV1 | undefined,
  replayFrameIndex: number,
  frontDriveBias: number,
  frontBrakeBias: number,
  replayTrack: CompiledTrackV1 | undefined,
  priorTrails: readonly GenerationTrail[],
): string {
  if (frame === undefined) {
    return `
      <section class="replay-panel" aria-labelledby="replay-title">
        <h2 id="replay-title">Champion replay</h2>
        <p>No replay frames were produced.</p>
      </section>
    `;
  }
  return `
    <section class="replay-panel" aria-labelledby="replay-title">
      <div class="chart-heading">
        <div><p class="section-kicker">Recorded Python motion and controls</p><h2 id="replay-title">Champion replay</h2></div>
        <span class="data-chip">Frame ${String(replayFrameIndex + 1)} / ${String(frames.length)}</span>
      </div>
      <div class="replay-stage" role="img" aria-label="Champion position and heading at ${frame.simulatedSeconds.toFixed(2)} simulated seconds">
        ${
          replayTrack === undefined
            ? '<p class="track-preview-status">Validated track geometry is unavailable.</p>'
            : renderTrackSvg(replayTrack, frame, priorTrails)
        }
        <p>x ${frame.x.toFixed(2)} · y ${frame.y.toFixed(2)} · ${(frame.progress * 100).toFixed(1)}%</p>
      </div>
      ${renderGenerationTrailSummary(priorTrails.length)}
      <dl class="telemetry-metrics">
        <div><dt>Steering</dt><dd>${frame.steering.toFixed(3)}</dd></div>
        <div><dt>Throttle</dt><dd>${frame.throttle.toFixed(3)}</dd></div>
        <div><dt>Brake</dt><dd>${frame.brake.toFixed(3)}</dd></div>
        <div><dt>Front drive bias</dt><dd>${frontDriveBias.toFixed(3)}</dd></div>
        <div><dt>Front brake bias</dt><dd>${frontBrakeBias.toFixed(3)}</dd></div>
        <div><dt>Simulated time</dt><dd>${frame.simulatedSeconds.toFixed(2)} s</dd></div>
      </dl>
      <div class="replay-controls">
        <button class="button secondary" type="button" data-action="replay-restart">Restart</button>
        <button class="button secondary" type="button" data-action="replay-previous" ${replayFrameIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="button secondary" type="button" data-action="replay-next" ${replayFrameIndex >= frames.length - 1 ? "disabled" : ""}>Next</button>
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
    action: "resume" | "delete" | "export",
    runId: string,
  ) => Promise<void>,
  handleTrackAction: (action: string, element: HTMLElement) => Promise<void>,
  importTrack: (file: File) => Promise<void>,
  exitApplication: () => Promise<void>,
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
        (action === "resume" || action === "delete" || action === "export") &&
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
    .querySelectorAll<HTMLInputElement>(
      '[data-generator-seed], input[name="generator-length"], input[name="generator-difficulty"]',
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

function downloadTrack(compiled: CompiledTrackV1): void {
  const blob = new Blob([serializeTrackDocument(compiled.track)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(compiled.track.name)}.track.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadRunDocument(run: RunDocumentV1): void {
  const blob = new Blob([`${JSON.stringify(run, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(run.runId)}.run.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized || "track";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
