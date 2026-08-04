import { describe, expect, it } from "vitest";

import {
  renderFitnessChart,
  renderTrainingCompletion,
  safeFileName,
  showsBackgroundEvaluation,
} from "../src/app";
import {
  clampReplayFrameIndex,
  replayFrameIndexAfterAction,
  runCompletion,
  runControls,
  runProgress,
} from "../src/run-presentation";
import type { ObservationSnapshotV1 } from "../src/simulation";

function snapshot(
  overrides: Partial<ObservationSnapshotV1> = {},
): ObservationSnapshotV1 {
  return {
    contractVersion: 1,
    runId: "run-presentation",
    status: "running",
    generation: 2,
    totalGenerations: 8,
    generationInProgress: true,
    activeCandidate: {
      candidateId: "g0002-c0004",
      index: 5,
      total: 10,
    },
    pendingCommand: null,
    generationReplay: null,
    generationReport: null,
    fitnessHistory: [],
    selectedCar: null,
    previousRuns: [],
    result: null,
    ...overrides,
  };
}

describe("training progress presentation", () => {
  it("creates Windows-safe local export filenames", () => {
    expect(safeFileName("Fast / Track")).toBe("fast-track");
    expect(safeFileName("CON")).toBe("con-export");
    expect(safeFileName("LPT9")).toBe("lpt9-export");
    expect(safeFileName("***")).toBe("local-export");
  });

  it("keeps live telemetry distinct from a single-frame champion replay", () => {
    expect(
      showsBackgroundEvaluation(true, {
        candidateId: "champion",
        frames: [
          {
            simulatedSeconds: 0.1,
            x: 1,
            y: 2,
            heading: 0,
            speed: 0,
            lateralSpeed: 0,
            steering: 0,
            throttle: 0,
            brake: 0,
            progress: 0,
          },
        ],
      }),
    ).toBe(true);
    expect(showsBackgroundEvaluation(true, null)).toBe(false);
  });

  it("renders visible markers for a single completed generation", () => {
    const chart = renderFitnessChart([
      { generation: 0, bestFitness: 12, medianFitness: 8 },
    ]);

    expect(chart).toContain('class="chart-point best-point"');
    expect(chart).toContain('class="chart-point median-point"');
  });

  it("combines completed generations with completed candidates", () => {
    expect(runProgress(snapshot())).toEqual({
      fraction: 0.3,
      percent: "30.0%",
      label: "Generation 3 of 8 · candidate 5 of 10.",
    });
  });

  it("reports terminal completion without depending on active telemetry", () => {
    expect(
      runProgress(
        snapshot({
          status: "completed",
          generation: 8,
          generationInProgress: false,
          activeCandidate: null,
        }),
      ),
    ).toEqual({
      fraction: 1,
      percent: "100.0%",
      label: "All 8 generations completed.",
    });
  });
});

describe("generation-boundary controls", () => {
  it("states the command boundary before a command is sent", () => {
    expect(runControls(snapshot())).toMatchObject({
      pauseLabel: "Pause after generation",
      stopLabel: "Stop after generation",
      note: "Run controls apply at deterministic generation boundaries.",
    });
  });

  it("makes a queued pause visible and prevents duplicate pause commands", () => {
    expect(runControls(snapshot({ pendingCommand: "pause" }))).toEqual({
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause queued",
      stopDisabled: false,
      stopLabel: "Stop after generation",
      note: "Pause is queued for the current generation boundary.",
    });
  });

  it("locks both controls while a command request awaits acknowledgement", () => {
    expect(runControls(snapshot(), "stop")).toEqual({
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause after generation",
      stopDisabled: true,
      stopLabel: "Sending stop…",
      note: "Waiting for the local core to acknowledge the stop command.",
    });
  });

  it("renders every pending command label without encoding artifacts", () => {
    expect(runControls(snapshot(), "pause").pauseLabel).toBe("Sending pause…");
    expect(
      runControls(snapshot({ status: "paused" }), "resume").pauseLabel,
    ).toBe("Sending resume…");
    expect(runControls(snapshot(), "stop").stopLabel).toBe("Sending stop…");
  });

  it("does not describe a stopped run as completed", () => {
    expect(runControls(snapshot({ status: "stopped" })).note).toBe(
      "This run was stopped. Its controls are read-only.",
    );
  });
});

describe("terminal training handoff", () => {
  it("surfaces completed results without requiring a page-length scroll", () => {
    expect(
      runCompletion(
        snapshot({
          status: "completed",
          generation: 8,
          generationInProgress: false,
          activeCandidate: null,
          result: {} as ObservationSnapshotV1["result"],
        }),
      ),
    ).toEqual({
      title: "Training complete",
      message:
        "All 8 generations finished. Results and the final champion replay are ready.",
    });
  });

  it("distinguishes a stopped run from full completion", () => {
    expect(
      runCompletion(
        snapshot({
          status: "stopped",
          generation: 3,
          generationInProgress: false,
          activeCandidate: null,
          result: {} as ObservationSnapshotV1["result"],
        }),
      ),
    ).toEqual({
      title: "Run stopped",
      message:
        "Stopped safely after 3 of 8 generations. Results for the completed work are ready.",
    });
  });

  it("offers a new setup when a stopped run has no completed generation", () => {
    const stopped = snapshot({
      status: "stopped",
      generation: 0,
      generationInProgress: false,
      activeCandidate: null,
      result: null,
    });

    expect(runCompletion(stopped)).toEqual({
      title: "Run stopped",
      message:
        "The run stopped before a generation completed, so no results were created.",
    });
    expect(renderTrainingCompletion(stopped)).toContain(
      'data-action="new-setup"',
    );
    expect(renderTrainingCompletion(stopped)).not.toContain(
      'data-action="view-results"',
    );
  });
});

describe("Results replay navigation", () => {
  it("never creates a negative index for an empty replay", () => {
    expect(replayFrameIndexAfterAction(0, 0, "next")).toBe(0);
    expect(replayFrameIndexAfterAction(4, 0, "previous")).toBe(0);
  });

  it("clamps stale indexes before moving through a bounded replay", () => {
    expect(clampReplayFrameIndex(-3, 5)).toBe(0);
    expect(clampReplayFrameIndex(12, 5)).toBe(4);
    expect(replayFrameIndexAfterAction(12, 5, "previous")).toBe(3);
    expect(replayFrameIndexAfterAction(-2, 5, "next")).toBe(1);
    expect(replayFrameIndexAfterAction(3, 5, "restart")).toBe(0);
  });

  it("keeps every action on the only available frame", () => {
    expect(replayFrameIndexAfterAction(0, 1, "previous")).toBe(0);
    expect(replayFrameIndexAfterAction(0, 1, "next")).toBe(0);
  });
});
