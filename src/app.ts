import {
  type AppContext,
  type ApplicationLifecycle,
  createAppStore,
  motionIsReduced,
  type RunLibraryNotice,
} from "./app-store";
import { installActions } from "./bind-actions";
import { patchHtml } from "./dom-patch";
import { createRacePlayback } from "./controllers/race-playback";
import { attachRaceCanvases } from "./race-canvas";
import { createRunLibraryController } from "./controllers/run-library";
import { createRunSession } from "./controllers/run-session";
import {
  createTrackCommands,
  dismissedTrackResponseMessage,
  syncGeneratorDraftPresentation,
  TRACK_LIBRARY_REFRESHED_NOTICE,
} from "./controllers/track-commands";
import { shutdownApplication } from "./ipc";
import {
  type AppAction,
  type AppState,
  canRequestReview,
  transition,
} from "./onboarding";
import { syncSelectedTrack } from "./track-builder";
import { captureRenderState, restoreFocus } from "./render-state";
import { updateEditorDetails } from "./track-workbench";
import { renderShell } from "./views/shell";

export interface AppController {
  getState(): AppState;
  dispatch(action: AppAction): void;
}

export function mountApp(root: HTMLElement): AppController {
  const store = createAppStore();
  const context: AppContext = {
    root,
    store,
    render: (focusHeading) => {
      render(focusHeading);
    },
    dispatch: (action) => {
      dispatch(action);
    },
  };
  const racePlayback = createRacePlayback(context);
  const { resetRacePlayback, syncRacePlayback, trainingStageInfo } =
    racePlayback;
  const {
    dropEditorPiece,
    handleTrackAction,
    importTrack,
    refreshLibrary,
    refreshPresetGeometry,
    retryPresetTracks,
    setEditorDraft,
  } = createTrackCommands(context);
  const {
    applyRunResponse,
    controlSession,
    handleVisibilityChange,
    moveReplay,
    seekReplay,
    toggleReplay,
    review,
    scheduleObservation,
    startSession,
  } = createRunSession(context, (notice) => refreshRuns(notice), racePlayback);
  const { handleRunAction, refreshRuns, retryRunLibrary } =
    createRunLibraryController(context, applyRunResponse);

  const resetRunPresentation = (): void => {
    store.runRequestVersion += 1;
    if (store.observationTimer !== undefined) {
      window.clearTimeout(store.observationTimer);
      store.observationTimer = undefined;
    }
    store.simulation = { status: "idle" };
    store.generationTrails = [];
    store.replayFrameIndex = 0;
    store.replayPaused = false;
    resetRacePlayback();
    store.trackWorkspace = { ...store.trackWorkspace, toolsOpen: false };
  };

  const dispatch = (action: AppAction): void => {
    const previousRoute = store.state.route;
    const validationWasChecking = store.state.validation.status === "checking";
    store.state = transition(store.state, action);
    store.trackWorkspace = syncSelectedTrack(
      store.trackWorkspace,
      store.state.draft.track,
    );
    const routeChanged = store.state.route !== previousRoute;
    const enteredWelcome = routeChanged && store.state.route === "welcome";
    const enteredTrack = routeChanged && store.state.route === "track";
    const retryPresetGeometry =
      routeChanged &&
      (store.state.route === "track" || store.state.route === "setup") &&
      store.presetGeometry.status === "unavailable";
    const retryTrackLibrary =
      enteredTrack && store.trackWorkspace.libraryStatus === "unavailable";
    const welcomeRefreshNotice: RunLibraryNotice =
      store.runLibrary.status === "ready" &&
      store.runLibrary.notice.tone !== "error"
        ? store.runLibrary.notice
        : {
            tone: "neutral",
            message: "Saved runs refreshed from local storage.",
          };
    if (
      previousRoute === "setup" &&
      store.state.route !== "setup" &&
      validationWasChecking
    ) {
      store.setupValidationRequestVersion += 1;
    }
    if (
      previousRoute === "track" &&
      store.state.route !== "track" &&
      store.trackWorkspace.pending !== null
    ) {
      const canceledTrackCommand = store.trackWorkspace.pending;
      store.trackCommandRequestVersion += 1;
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
      store.runLibrary.status === "ready" &&
      store.runLibrary.pending !== undefined
    ) {
      const canceledAction = store.runLibrary.pending.action;
      store.runLibraryActionVersion += 1;
      store.runLibrary = {
        ...store.runLibrary,
        pending: undefined,
        notice: {
          tone: "neutral",
          message: "Saved run response ignored after leaving Home.",
        },
      };
      if (
        (canceledAction === "open" || canceledAction === "resume") &&
        store.simulation.status === "loading"
      ) {
        store.simulation = { status: "idle" };
      }
    }
    if (action.type === "new-setup") {
      resetRunPresentation();
    }
    if (routeChanged && store.state.route === "results") {
      store.replayFrameIndex = 0;
      store.replayPaused = false;
    }
    if (enteredWelcome) {
      if (store.runLibrary.status === "ready") {
        store.runLibrary = {
          ...store.runLibrary,
          notice: {
            tone: "info",
            message: "Refreshing Saved runs from local storage.",
          },
        };
      } else if (store.runLibrary.status === "unavailable") {
        store.runLibrary = { status: "loading" };
      }
    }
    if (retryPresetGeometry) {
      store.presetGeometry = { status: "loading" };
    }
    if (retryTrackLibrary) {
      store.trackWorkspace = {
        ...store.trackWorkspace,
        libraryStatus: "loading",
        libraryMessage: undefined,
        notice: {
          tone: "info",
          message: "Refreshing the local track library.",
        },
      };
    }
    // The Track Builder is open exactly while its page is shown.
    if (store.trackWorkspace.toolsOpen !== (store.state.route === "track")) {
      store.trackWorkspace = {
        ...store.trackWorkspace,
        toolsOpen: store.state.route === "track",
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

  const exitApplication = async (): Promise<void> => {
    if (
      store.applicationLifecycle !== "active" ||
      !window.confirm("Exit EvoRacer and stop the local core?")
    ) {
      return;
    }

    store.applicationLifecycle = "shutting-down";
    if (store.observationTimer !== undefined) {
      window.clearTimeout(store.observationTimer);
      store.observationTimer = undefined;
    }
    resetRacePlayback();
    showShutdownScreen("shutting-down");

    try {
      await shutdownApplication();
      store.applicationLifecycle = "stopped";
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      showShutdownScreen("stopped");
    } catch (error) {
      store.applicationLifecycle = "active";
      render(true);
      window.alert(
        error instanceof Error
          ? error.message
          : "The local application shutdown could not be completed.",
      );
      scheduleObservation();
    }
  };

  let autoReviewedState: AppState | undefined;

  const render = (focusHeading = false): void => {
    if (store.applicationLifecycle !== "active") {
      return;
    }
    const focusSnapshot = focusHeading
      ? undefined
      : (captureRenderState(root).focus ?? store.deferredFocus);
    patchHtml(
      root,
      renderShell(
        store.state,
        store.presetGeometry,
        store.trackWorkspace,
        store.simulation,
        store.runLibrary,
        {
          frameIndex: store.replayFrameIndex,
          paused: store.replayPaused,
        },
        motionIsReduced(store),
        trainingStageInfo(),
        store.raceSpeed,
      ),
    );
    attachRaceCanvases(root);
    syncRacePlayback();

    if (focusHeading) {
      store.deferredFocus = undefined;
      const pageTitle = root.querySelector<HTMLElement>("#page-title");
      pageTitle?.focus();
    } else if (
      focusSnapshot !== undefined &&
      (document.activeElement === null ||
        document.activeElement === document.body ||
        !root.contains(document.activeElement))
    ) {
      // Focus survives patching unless its element left the page.
      const result = restoreFocus(root, focusSnapshot);
      store.deferredFocus = result === "disabled" ? focusSnapshot : undefined;
    }

    if (
      store.state.route === "setup" &&
      store.state.validation.status === "not-checked" &&
      canRequestReview(store.state) &&
      autoReviewedState !== store.state
    ) {
      autoReviewedState = store.state;
      void review();
    }
  };

  installActions(root, {
    dispatch,
    review,
    startSession,
    controlSession,
    moveReplay,
    toggleReplay,
    seekReplay,
    setRaceSpeed: (speed) => {
      if (speed === 1 || speed === 2 || speed === 4) {
        const now = window.performance.now();
        const showing = store.showingRace;
        if (showing !== undefined) {
          // Keep the cars where they are while the clock changes speed.
          const elapsed = ((now - showing.startedAt) / 1000) * store.raceSpeed;
          store.showingRace = {
            ...showing,
            startedAt: now - (elapsed / speed) * 1000,
          };
        }
        store.raceSpeed = speed;
        render();
      }
    },
    reviewRecommended: () => {
      dispatch({ type: "use-recommended" });
      void review();
    },
    reviseSetup: () => {
      resetRunPresentation();
      dispatch({ type: "revise-setup" });
    },
    handleRunAction,
    handleTrackAction,
    dropEditorPiece,
    importTrack,
    retryPresetTracks,
    retryRunLibrary,
    exitApplication,
    toggleReducedMotion: () => {
      store.reducedMotionOverride = !store.reducedMotionOverride;
      render();
    },
    updateEditor: (name, roadWidth) => {
      setEditorDraft(
        updateEditorDetails(store.trackWorkspace.editor, name, roadWidth),
        "Track details changed. Python is checking the draft.",
      );
    },
    updateGenerator: (seed, length, difficulty) => {
      store.trackWorkspace = {
        ...store.trackWorkspace,
        generator: { seed, length, difficulty },
      };
      syncGeneratorDraftPresentation(root, store.trackWorkspace);
    },
  });

  render(true);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void refreshPresetGeometry();
  void refreshLibrary();
  void refreshRuns();

  return {
    getState: () => store.state,
    dispatch,
  };
}
