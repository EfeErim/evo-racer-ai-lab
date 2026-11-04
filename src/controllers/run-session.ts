import type { AppContext, RunLibraryNotice } from "../app-store";
import { updateGenerationTrails } from "../generation-trails";
import {
  commandRun,
  observeRun,
  serviceUnavailableResponse,
  startRun,
  validateSetup,
} from "../ipc";
import {
  mergeObservationSnapshot,
  observationPollDelay,
} from "../observer-refresh";
import { canRequestReview, canStartSession } from "../onboarding";
import {
  replayFrameIndexAfterAction,
  type RunCommand,
} from "../run-presentation";

export function createRunSession(
  context: AppContext,
  refreshRuns: (notice?: RunLibraryNotice) => Promise<void>,
) {
  const { store, render, dispatch } = context;

  const review = async (): Promise<void> => {
    if (!canRequestReview(store.state)) {
      store.state = { ...store.state, route: "settings" };
      render(true);
      return;
    }

    const reviewedDraft = store.state.draft;
    const requestVersion = ++store.setupValidationRequestVersion;
    dispatch({ type: "validation-started", draft: reviewedDraft });
    try {
      const response = await validateSetup(reviewedDraft);
      if (requestVersion !== store.setupValidationRequestVersion) {
        return;
      }
      dispatch({
        type: "validation-received",
        draft: reviewedDraft,
        response,
      });
    } catch (error) {
      if (requestVersion !== store.setupValidationRequestVersion) {
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
      store.applicationLifecycle !== "active" ||
      store.simulation.status !== "ready" ||
      store.simulation.snapshot.status !== "running" ||
      store.simulation.commandRequest !== undefined ||
      store.observationPending ||
      store.observationTimer !== undefined
    ) {
      return;
    }
    store.observationTimer = window.setTimeout(() => {
      void observeSession();
    }, observationPollDelay(document.visibilityState));
  };

  const isCurrentRun = (runId: string): boolean =>
    store.simulation.status === "ready" &&
    store.simulation.snapshot.runId === runId;

  const isLatestRunRequest = (runId: string, requestVersion: number): boolean =>
    requestVersion === store.runRequestVersion && isCurrentRun(runId);

  const setRunFailure = (message: string): void => {
    store.simulation =
      store.simulation.status === "ready"
        ? {
            status: "ready",
            snapshot: store.simulation.snapshot,
            error: message,
          }
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
        store.simulation.status === "ready"
          ? store.simulation.snapshot
          : undefined;
      const snapshot = mergeObservationSnapshot(
        previousSnapshot,
        response.snapshot,
      );
      store.generationTrails = updateGenerationTrails(
        store.generationTrails,
        snapshot,
      );
      store.simulation = { status: "ready", snapshot };
      if (snapshot.status === "completed" || snapshot.status === "stopped") {
        void refreshRuns();
      }
    }
    render();
    scheduleObservation();
  };

  const observeSession = async (): Promise<void> => {
    if (
      store.simulation.status !== "ready" ||
      store.simulation.snapshot.status !== "running" ||
      store.simulation.commandRequest !== undefined
    ) {
      return;
    }
    store.observationTimer = undefined;
    if (store.observationPending) {
      return;
    }
    store.observationPending = true;
    const runId = store.simulation.snapshot.runId;
    const requestVersion = ++store.runRequestVersion;
    const knownReplayCandidateId =
      store.simulation.snapshot.generationReplay?.candidateId;
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
      store.observationPending = false;
      scheduleObservation();
    }
  };

  const handleVisibilityChange = (): void => {
    if (store.applicationLifecycle !== "active") {
      return;
    }
    if (store.observationTimer !== undefined) {
      window.clearTimeout(store.observationTimer);
      store.observationTimer = undefined;
    }
    if (document.visibilityState === "visible") {
      void observeSession();
    } else {
      scheduleObservation();
    }
  };

  const controlSession = async (command: RunCommand): Promise<void> => {
    if (
      store.simulation.status !== "ready" ||
      store.simulation.commandRequest !== undefined
    ) {
      return;
    }
    const runId = store.simulation.snapshot.runId;
    const requestVersion = ++store.runRequestVersion;
    if (store.observationTimer !== undefined) {
      window.clearTimeout(store.observationTimer);
      store.observationTimer = undefined;
    }
    store.simulation = {
      ...store.simulation,
      commandRequest: command,
      error: undefined,
    };
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
    if (
      store.simulation.status !== "ready" ||
      store.simulation.snapshot.result === null
    ) {
      return;
    }
    store.replayFrameIndex = replayFrameIndexAfterAction(
      store.replayFrameIndex,
      store.simulation.snapshot.result.replay.frames.length,
      action,
    );
    render();
  };

  const startSession = async (): Promise<void> => {
    if (!canStartSession(store.state)) {
      return;
    }
    const frozenDraft = store.state.draft;
    const requestVersion = ++store.runRequestVersion;
    store.simulation = { status: "loading" };
    store.generationTrails = [];
    store.replayFrameIndex = 0;
    dispatch({ type: "start-session" });
    try {
      const response = await startRun(frozenDraft);
      if (requestVersion !== store.runRequestVersion) {
        return;
      }
      if (!response.valid) {
        store.simulation = { status: "idle" };
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
      if (requestVersion !== store.runRequestVersion) {
        return;
      }
      store.simulation = { status: "idle" };
      dispatch({
        type: "start-session-unconfirmed",
        message:
          error instanceof Error
            ? error.message
            : "The local core could not confirm whether the reviewed run started.",
      });
    }
  };

  return {
    applyRunResponse,
    controlSession,
    handleVisibilityChange,
    moveReplay,
    review,
    scheduleObservation,
    startSession,
  };
}
