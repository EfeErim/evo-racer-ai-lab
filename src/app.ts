import {
  type AppContext,
  type ApplicationLifecycle,
  createAppStore,
  motionIsReduced,
  type RunLibraryNotice,
} from "./app-store";
import { bindActions } from "./bind-actions";
import { createMarkerMotion } from "./controllers/marker-motion";
import { createRunLibraryController } from "./controllers/run-library";
import { createRunSession } from "./controllers/run-session";
import {
  createTrackCommands,
  dismissedTrackResponseMessage,
  syncGeneratorDraftPresentation,
  TRACK_LIBRARY_REFRESHED_NOTICE,
} from "./controllers/track-commands";
import { shutdownApplication } from "./ipc";
import { type AppAction, type AppState, transition } from "./onboarding";
import { raceStage } from "./race-buffer";
import {
  captureRenderState,
  restoreDisclosures,
  restoreFocus,
} from "./render-state";
import { updateEditorDetails } from "./track-workbench";
import { renderShell } from "./views/shell";

export interface AppController {
  getState(): AppState;
  dispatch(action: AppAction): void;
}

export function mountApp(root: HTMLElement): AppController {
  const store = createAppStore();
  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const context: AppContext = {
    root,
    store,
    reducedMotionQuery,
    render: (focusHeading) => {
      render(focusHeading);
    },
    dispatch: (action) => {
      dispatch(action);
    },
  };
  const { resetLiveMarkerMotion, syncLiveMarkerMotion } =
    createMarkerMotion(context);
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
    toggleReplay,
    review,
    scheduleObservation,
    startSession,
  } = createRunSession(context, (notice) => refreshRuns(notice));
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
    store.trackWorkspace = { ...store.trackWorkspace, toolsOpen: false };
  };

  const dispatch = (action: AppAction): void => {
    const previousRoute = store.state.route;
    const validationWasChecking = store.state.validation.status === "checking";
    store.state = transition(store.state, action);
    const routeChanged = store.state.route !== previousRoute;
    const enteredWelcome = routeChanged && store.state.route === "welcome";
    const enteredTrack = routeChanged && store.state.route === "track";
    const retryPresetGeometry =
      enteredTrack && store.presetGeometry.status === "unavailable";
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
      previousRoute === "review" &&
      store.state.route !== "review" &&
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
          message: "Saved run response ignored after leaving Welcome.",
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
    resetLiveMarkerMotion();
    showShutdownScreen("shutting-down");

    try {
      await shutdownApplication();
      store.applicationLifecycle = "stopped";
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener(
        "change",
        handleReducedMotionChange,
      );
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

  let pointerPressed = false;
  let renderDeferred = false;
  const releasePointer = (): void => {
    pointerPressed = false;
    if (renderDeferred) {
      // The click from this release fires first, then the waiting render runs.
      window.setTimeout(() => {
        render();
      }, 0);
    }
  };
  root.addEventListener("pointerdown", () => {
    pointerPressed = true;
  });
  window.addEventListener("pointerup", releasePointer);
  window.addEventListener("pointercancel", releasePointer);

  const render = (focusHeading = false): void => {
    if (store.applicationLifecycle !== "active") {
      return;
    }
    // Replacing a pressed button would lose its click, so a poll waits for release.
    if (pointerPressed && !focusHeading) {
      renderDeferred = true;
      return;
    }
    renderDeferred = false;
    const renderState = focusHeading ? undefined : captureRenderState(root);
    const focusSnapshot = renderState?.focus ?? store.deferredFocus;
    root.innerHTML = renderShell(
      store.state,
      store.presetGeometry,
      store.trackWorkspace,
      store.simulation,
      store.runLibrary,
      {
        frameIndex: store.replayFrameIndex,
        paused: store.replayPaused,
      },
      store.generationTrails,
      motionIsReduced(store, reducedMotionQuery),
      reducedMotionQuery.matches,
      store.simulation.status === "ready"
        ? raceStage(
            store.raceBuffer,
            store.simulation.snapshot,
            motionIsReduced(store, reducedMotionQuery),
            window.performance.now(),
          )
        : { mode: "none" },
    );
    syncLiveMarkerMotion();
    bindActions(root, store.state, {
      dispatch,
      review,
      startSession,
      controlSession,
      moveReplay,
      toggleReplay,
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
        if (reducedMotionQuery.matches) {
          store.systemMotionOptIn = !store.systemMotionOptIn;
        } else {
          store.reducedMotionOverride = !store.reducedMotionOverride;
        }
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

    if (renderState !== undefined) {
      restoreDisclosures(root, renderState.disclosures);
    }

    if (focusHeading) {
      store.deferredFocus = undefined;
      const pageTitle = root.querySelector<HTMLElement>("#page-title");
      pageTitle?.focus();
    } else if (focusSnapshot !== undefined) {
      const result = restoreFocus(root, focusSnapshot);
      store.deferredFocus = result === "disabled" ? focusSnapshot : undefined;
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
    getState: () => store.state,
    dispatch,
  };
}
