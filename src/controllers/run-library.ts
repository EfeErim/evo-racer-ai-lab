import type {
  AppContext,
  RunLibraryAction,
  RunLibraryNotice,
} from "../app-store";
import { downloadRunDocument } from "../downloads";
import { updateGenerationTrails } from "../generation-trails";
import {
  compileTrack,
  deleteRun,
  exportRun,
  loadRunLibrary,
  openRun,
  resumeRun,
  startRun,
} from "../ipc";

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
    const requestVersion = ++store.runLibraryRequestVersion;
    try {
      const value = await loadRunLibrary();
      if (requestVersion !== store.runLibraryRequestVersion) {
        return;
      }
      store.runLibrary = {
        status: "ready",
        value,
        notice,
      };
    } catch (error) {
      if (requestVersion !== store.runLibraryRequestVersion) {
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
    const actionLabels: Record<RunLibraryAction, string> = {
      resume: "Restoring the selected local run.",
      open: "Opening the selected saved results.",
      delete: "Deleting the selected local run.",
      export: "Preparing the selected run JSON.",
    };
    const actionVersion = ++store.runLibraryActionVersion;
    const isCurrentAction = (): boolean =>
      actionVersion === store.runLibraryActionVersion &&
      store.runLibrary.status === "ready" &&
      store.runLibrary.pending?.action === action &&
      store.runLibrary.pending.runId === runId;
    store.runLibrary = {
      ...store.runLibrary,
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
        store.runLibrary = {
          ...store.runLibrary,
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
        const requestVersion = ++store.runRequestVersion;
        store.simulation = { status: "loading" };
        const document = await openRun(runId);
        if (!isCurrentAction() || requestVersion !== store.runRequestVersion) {
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
        if (!isCurrentAction() || requestVersion !== store.runRequestVersion) {
          return;
        }
        if (!compiled.valid || compiled.compiled === undefined) {
          throw new Error(
            compiled.errors[0]?.message ??
              "The saved result track could not be compiled.",
          );
        }
        if (store.state.route !== "welcome") {
          return;
        }
        const restoredDraft = {
          contractVersion: 1 as const,
          trackPreset: document.track.id,
          track: document.track,
          settings: document.settings,
        };
        store.trackWorkspace = {
          ...store.trackWorkspace,
          selected: compiled.compiled,
        };
        store.generationTrails = updateGenerationTrails([], snapshot);
        store.replayFrameIndex = 0;
        store.simulation = { status: "ready", snapshot };
        store.runLibrary = {
          ...store.runLibrary,
          pending: undefined,
          notice: { tone: "success", message: "Saved results opened." },
        };
        dispatch({ type: "restore-results", draft: restoredDraft });
        return;
      }
      const requestVersion = ++store.runRequestVersion;
      store.simulation = { status: "loading" };
      const response = await resumeRun(runId);
      if (!isCurrentAction()) {
        await refreshRuns({
          tone: "neutral",
          message: "Run library refreshed after a dismissed Resume response.",
        });
        return;
      }
      if (requestVersion !== store.runRequestVersion) {
        return;
      }
      if (!response.valid || response.setup === undefined) {
        store.simulation = { status: "idle" };
        store.runLibrary = {
          ...store.runLibrary,
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
        if (!isCurrentAction() || requestVersion !== store.runRequestVersion) {
          return;
        }
        if (!compiled.valid || compiled.compiled === undefined) {
          throw new Error(
            compiled.errors[0]?.message ??
              "The restored custom track could not be compiled.",
          );
        }
        store.trackWorkspace = {
          ...store.trackWorkspace,
          selected: compiled.compiled,
        };
      }
      if (store.state.route !== "welcome") {
        return;
      }
      store.runLibrary = {
        ...store.runLibrary,
        pending: undefined,
        notice: { tone: "success", message: "Local run restored." },
      };
      store.generationTrails = [];
      dispatch({ type: "restore-session", draft: response.setup });
      applyRunResponse(response);
    } catch (error) {
      if (!isCurrentAction()) {
        return;
      }
      if (store.simulation.status === "loading") {
        store.simulation = { status: "idle" };
      }
      store.runLibrary = {
        ...store.runLibrary,
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
