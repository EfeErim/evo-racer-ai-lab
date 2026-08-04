import type { ObservationSnapshotV1 } from "./simulation";

export interface RunProgressPresentation {
  fraction: number;
  percent: string;
  label: string;
}

export interface RunControlPresentation {
  pauseAction: "pause" | "resume";
  pauseDisabled: boolean;
  pauseLabel: string;
  stopDisabled: boolean;
  stopLabel: string;
  note: string;
}

export interface RunCompletionPresentation {
  title: string;
  message: string;
}

export type RunCommand = "pause" | "resume" | "stop";
export type ReplayNavigationAction = "previous" | "next" | "restart";

export function clampReplayFrameIndex(
  frameIndex: number,
  frameCount: number,
): number {
  const boundedCount = Number.isFinite(frameCount)
    ? Math.max(0, Math.floor(frameCount))
    : 0;
  if (boundedCount === 0) {
    return 0;
  }
  const integerIndex = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0;
  return Math.min(boundedCount - 1, Math.max(0, integerIndex));
}

export function replayFrameIndexAfterAction(
  frameIndex: number,
  frameCount: number,
  action: ReplayNavigationAction,
): number {
  const current = clampReplayFrameIndex(frameIndex, frameCount);
  if (action === "restart") {
    return 0;
  }
  if (action === "previous") {
    return clampReplayFrameIndex(current - 1, frameCount);
  }
  return clampReplayFrameIndex(current + 1, frameCount);
}

export function runProgress(
  snapshot: ObservationSnapshotV1,
): RunProgressPresentation {
  const totalGenerations = Math.max(1, snapshot.totalGenerations);
  const completedGenerations = Math.min(snapshot.generation, totalGenerations);
  const active = snapshot.activeCandidate;
  let fraction = completedGenerations / totalGenerations;
  let label = `${String(completedGenerations)} of ${String(totalGenerations)} generations completed.`;

  if (
    snapshot.generationInProgress === true &&
    active !== null &&
    active !== undefined &&
    active.total > 0
  ) {
    const completedCandidates = Math.min(
      active.total,
      Math.max(0, active.index - 1),
    );
    fraction =
      (completedGenerations + completedCandidates / active.total) /
      totalGenerations;
    label = `Generation ${String(completedGenerations + 1)} of ${String(totalGenerations)} · candidate ${String(active.index)} of ${String(active.total)}.`;
  } else if (snapshot.status === "completed") {
    fraction = 1;
    label = `All ${String(totalGenerations)} generations completed.`;
  }

  const bounded = Math.min(1, Math.max(0, fraction));
  return {
    fraction: bounded,
    percent: `${(bounded * 100).toFixed(1)}%`,
    label,
  };
}

export function runControls(
  snapshot: ObservationSnapshotV1,
  requestCommand: RunCommand | null = null,
): RunControlPresentation {
  const terminal =
    snapshot.status === "completed" || snapshot.status === "stopped";
  const pending = snapshot.pendingCommand ?? null;

  if (terminal) {
    return {
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause",
      stopDisabled: true,
      stopLabel: "Stop",
      note:
        snapshot.status === "completed"
          ? "This run is complete. Its controls are read-only."
          : "This run was stopped. Its controls are read-only.",
    };
  }
  if (requestCommand !== null) {
    const pauseAction = snapshot.status === "paused" ? "resume" : "pause";
    return {
      pauseAction,
      pauseDisabled: true,
      pauseLabel:
        requestCommand === "pause"
          ? "Sending pause…"
          : requestCommand === "resume"
            ? "Sending resume…"
            : pauseAction === "resume"
              ? "Resume"
              : "Pause after generation",
      stopDisabled: true,
      stopLabel:
        requestCommand === "stop" ? "Sending stop…" : "Stop after generation",
      note: `Waiting for the local core to acknowledge the ${requestCommand} command.`,
    };
  }
  if (snapshot.status === "paused") {
    return {
      pauseAction: "resume",
      pauseDisabled: pending !== null,
      pauseLabel: "Resume",
      stopDisabled: pending === "stop",
      stopLabel: pending === "stop" ? "Stop queued" : "Stop",
      note: "Paused safely at a generation boundary.",
    };
  }
  if (pending === "pause") {
    return {
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause queued",
      stopDisabled: false,
      stopLabel: "Stop after generation",
      note: "Pause is queued for the current generation boundary.",
    };
  }
  if (pending === "stop") {
    return {
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause after generation",
      stopDisabled: true,
      stopLabel: "Stop queued",
      note: "Stop is queued for the current generation boundary.",
    };
  }
  return {
    pauseAction: "pause",
    pauseDisabled: false,
    pauseLabel: "Pause after generation",
    stopDisabled: false,
    stopLabel: "Stop after generation",
    note: "Run controls apply at deterministic generation boundaries.",
  };
}

export function runCompletion(
  snapshot: ObservationSnapshotV1,
): RunCompletionPresentation | null {
  if (snapshot.result === null) {
    return snapshot.status === "stopped"
      ? {
          title: "Run stopped",
          message:
            "The run stopped before a generation completed, so no results were created.",
        }
      : null;
  }
  if (snapshot.status === "completed") {
    return {
      title: "Training complete",
      message: `All ${String(snapshot.totalGenerations)} generations finished. Results and the final champion replay are ready.`,
    };
  }
  return {
    title: "Run stopped",
    message: `Stopped safely after ${String(snapshot.generation)} of ${String(snapshot.totalGenerations)} generations. Results for the completed work are ready.`,
  };
}
