import { describe, expect, it } from "vitest";

import { renderTrainingCompletion } from "../src/views/training";
import {
  priorGenerationTrails,
  updateGenerationTrails,
  clampReplayFrameIndex,
  replayFrameIndexAfterAction,
  runCompletion,
  runControls,
  runProgress,
} from "../src/run-presentation";
import type {
  GenerationTrailV1,
  ObservationSnapshotV1,
} from "../src/contracts";

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
    generationTrails: [],
    previousRuns: [],
    result: null,
    ...overrides,
  };
}

describe("training progress presentation", () => {
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
  it("makes a queued pause visible and prevents duplicate pause commands", () => {
    expect(runControls(snapshot({ pendingCommand: "pause" }))).toEqual({
      pauseAction: "pause",
      pauseDisabled: true,
      pauseLabel: "Pause queued",
      stopDisabled: false,
      stopLabel: "Stop after generation",
      note: "Pause is queued. It takes effect when this generation finishes.",
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

  it("does not describe a stopped run as completed", () => {
    expect(runControls(snapshot({ status: "stopped" })).note).toBe(
      "This run was stopped. Its controls are read-only.",
    );
  });
});

describe("terminal training handoff", () => {
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
        "Stopped after 3 of 8 generations. Results cover the finished generations.",
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
  it("clamps stale indexes before moving through a bounded replay", () => {
    expect(clampReplayFrameIndex(-3, 5)).toBe(0);
    expect(clampReplayFrameIndex(12, 5)).toBe(4);
    expect(replayFrameIndexAfterAction(12, 5, "previous")).toBe(3);
    expect(replayFrameIndexAfterAction(-2, 5, "next")).toBe(1);
    expect(replayFrameIndexAfterAction(3, 5, "restart")).toBe(0);
  });
});

function trail(runId: string, candidateId: string): GenerationTrailV1 {
  return {
    runId,
    candidateId,
    generation: 0,
    points: [
      [1, 2],
      [3, 4],
    ],
  };
}

function trailSnapshot(
  runId: string,
  generationTrails: GenerationTrailV1[],
): ObservationSnapshotV1 {
  return {
    contractVersion: 1,
    runId,
    status: "running",
    generation: 1,
    totalGenerations: 10,
    generationReport: null,
    fitnessHistory: [],
    selectedCar: null,
    result: null,
    generationTrails,
    previousRuns: [],
  };
}

describe("previous generation champion trails", () => {
  it("uses the Python trails of the observed run only", () => {
    const own = trail("run-a", "g0000-c0001");
    expect(
      updateGenerationTrails(
        trailSnapshot("run-a", [own, trail("run-b", "g0000-c0002")]),
      ),
    ).toEqual([own]);
  });

  it("hides the displayed champion and keeps at most seven earlier paths", () => {
    const trails = Array.from({ length: 8 }, (_, index) =>
      trail("run-a", `g${String(index).padStart(4, "0")}-c0001`),
    );
    const prior = priorGenerationTrails(trails, "g0007-c0001");
    expect(prior).toHaveLength(7);
    expect(prior.map((item) => item.candidateId)).not.toContain("g0007-c0001");
  });
});
