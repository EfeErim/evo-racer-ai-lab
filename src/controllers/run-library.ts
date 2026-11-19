import type {
  AppContext,
  RunLibraryAction,
  RunLibraryNotice,
} from "../app-store";
import { downloadRunDocument } from "../downloads";
import { updateGenerationTrails } from "../run-presentation";
import type { CompiledTrackV1 } from "../track-renderer";
import type { TrackCommandResponse } from "../track-workbench";
import {
  compileTrack,
  deleteRecord,
  exportRun,
  loadRunLibrary,
  openRun,
  resumeRun,
  startRun,
} from "../ipc";

const RUN_ACTION_LABELS: Record<RunLibraryAction, string> = {
  resume: "Restoring the selected local run.",
  open: "Opening the selected saved results.",
  delete: "Deleting the selected local run.",
  export: "Preparing the selected run JSON.",
};

function compiledTrackOrThrow(
  response: TrackCommandResponse,
  fallbackMessage: string,
): CompiledTrackV1 {
  if (!response.valid || response.compiled === undefined) {
    throw new Error(response.errors[0]?.message ?? fallbackMessage);
  }
  return response.compiled;
}

export function createRunLibraryController(
  context: AppContext,
  applyRunResponse: (response: Awaited<ReturnType<typeof startRun>>) => void,
) {
  const { store, render, dispatch } = context;

  async function refreshRuns(
    notice: RunLibraryNotice = {
      tone: "neutral",
      message: "Run files are stored atomically by the local Python core.",
    },
  ): Promise<void> {
    const isCurrentRequest = store.requests.runLibrary.begin();
    try {
      const value = await loadRunLibrary();
      if (!isCurrentRequest()) {
        return;
      }
      store.runLibrary = {
        status: "ready",
        value,
        notice,
      };
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The local run library is unavailable.";
      store.runLibrary =
        store.runLibrary.status === "ready"
          ? {
              ...store.runLibrary,
              pending: undefined,
              notice: { tone: "error", message },
            }
          : { status: "unavailable", message };
    }
    render();
  }

  /** Ends the pending action with `notice` while Saved runs is shown. */
  const finishRunAction = (notice: RunLibraryNotice): void => {
    if (store.runLibrary.status === "ready") {
      store.runLibrary = { ...store.runLibrary, pending: undefined, notice };
    }
  };

  const deleteRun = async (
    runId: string,
    isCurrentAction: () => boolean,
  ): Promise<void> => {
    await deleteRecord("run", runId);
    await refreshRuns(
      isCurrentAction()
        ? {
            tone: "success",
            message: "The selected run was deleted from local storage.",
          }
        : {
            tone: "neutral",
            message:
              "Run library refreshed after a background delete response.",
          },
    );
  };

  const exportSavedRun = async (
    runId: string,
    isCurrentAction: () => boolean,
  ): Promise<void> => {
    const document = await exportRun(runId);
    if (!isCurrentAction()) {
      return;
    }
    downloadRunDocument(document);
    finishRunAction({
      tone: "success",
      message: "The selected run JSON was exported.",
    });
    render();
  };

  const openSavedResults = async (
    runId: string,
    isCurrentAction: () => boolean,
  ): Promise<void> => {
    const isCurrentRequest = store.requests.run.begin();
    store.simulation = { status: "loading" };
    const document = await openRun(runId);
    if (!isCurrentAction() || !isCurrentRequest()) {
      return;
    }
    const snapshot = document.checkpoint.snapshot;
    if (
      snapshot.result === null ||
      (snapshot.status !== "completed" && snapshot.status !== "stopped")
    ) {
      throw new Error("The selected run does not contain terminal results.");
    }
    const compiled = await compileTrack(document.track);
    if (!isCurrentAction() || !isCurrentRequest()) {
      return;
    }
    const track = compiledTrackOrThrow(
      compiled,
      "The saved result track could not be compiled.",
    );
    if (store.state.route !== "welcome") {
      return;
    }
    // Use Python's canonical track so the draft and the compiled
    // selection compare equal, whatever key order the saved file used.
    const restoredDraft = {
      contractVersion: 1 as const,
      trackPreset: track.track.id,
      track: track.track,
      settings: document.settings,
    };
    store.trackWorkspace = { ...store.trackWorkspace, selected: track };
    store.generationTrails = updateGenerationTrails(snapshot);
    store.replayFrameIndex = 0;
    store.simulation = { status: "ready", snapshot };
    finishRunAction({ tone: "success", message: "Saved results opened." });
    dispatch({ type: "restore-results", draft: restoredDraft });
  };

  const resumeSavedRun = async (
    runId: string,
    isCurrentAction: () => boolean,
  ): Promise<void> => {
    const isCurrentRequest = store.requests.run.begin();
    store.simulation = { status: "loading" };
    const response = await resumeRun(runId);
    if (!isCurrentAction()) {
      await refreshRuns({
        tone: "neutral",
        message: "Run library refreshed after a dismissed Resume response.",
      });
      return;
    }
    if (!isCurrentRequest()) {
      return;
    }
    if (!response.valid || response.setup === undefined) {
      store.simulation = { status: "idle" };
      finishRunAction({
        tone: "error",
        message: response.valid
          ? "The restored run did not include its frozen setup."
          : (response.errors[0]?.message ?? "The run could not be resumed."),
      });
      render();
      return;
    }
    let restoredSetup = response.setup;
    if (response.setup.track !== null) {
      const compiled = await compileTrack(response.setup.track);
      if (!isCurrentAction() || !isCurrentRequest()) {
        return;
      }
      const track = compiledTrackOrThrow(
        compiled,
        "The restored custom track could not be compiled.",
      );
      store.trackWorkspace = { ...store.trackWorkspace, selected: track };
      restoredSetup = { ...response.setup, track: track.track };
    }
    if (store.state.route !== "welcome") {
      return;
    }
    finishRunAction({ tone: "success", message: "Local run restored." });
    store.generationTrails = [];
    dispatch({ type: "restore-session", draft: restoredSetup });
    applyRunResponse(response);
  };

  const runActionHandlers: Record<
    RunLibraryAction,
    (runId: string, isCurrentAction: () => boolean) => Promise<void>
  > = {
    delete: deleteRun,
    export: exportSavedRun,
    open: openSavedResults,
    resume: resumeSavedRun,
  };

  const handleRunAction = async (
    action: RunLibraryAction,
    runId: string,
  ): Promise<void> => {
    if (
      store.runLibrary.status !== "ready" ||
      store.runLibrary.pending !== undefined
    ) {
      return;
    }
    if (
      action === "delete" &&
      !window.confirm(`Delete local run “${runId}”?`)
    ) {
      return;
    }
    const isCurrentActionRequest = store.requests.runLibraryAction.begin();
    const isCurrentAction = (): boolean =>
      isCurrentActionRequest() &&
      store.runLibrary.status === "ready" &&
      store.runLibrary.pending?.action === action &&
      store.runLibrary.pending.runId === runId;
    store.runLibrary = {
      ...store.runLibrary,
      pending: { action, runId },
      notice: { tone: "info", message: RUN_ACTION_LABELS[action] },
    };
    render();
    try {
      await runActionHandlers[action](runId, isCurrentAction);
    } catch (error) {
      if (!isCurrentAction()) {
        return;
      }
      if (store.simulation.status === "loading") {
        store.simulation = { status: "idle" };
      }
      finishRunAction({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The local run command could not be completed.",
      });
      render();
    }
  };

  const retryRunLibrary = (): void => {
    if (store.runLibrary.status === "loading") {
      return;
    }
    const notice: RunLibraryNotice =
      store.runLibrary.status === "ready" &&
      store.runLibrary.notice.tone !== "error"
        ? store.runLibrary.notice
        : {
            tone: "neutral",
            message: "Saved runs refreshed from local storage.",
          };
    store.runLibrary = { status: "loading" };
    render();
    void refreshRuns(notice);
  };

  return { handleRunAction, refreshRuns, retryRunLibrary };
}
