import { describe, expect, it } from "vitest";

import {
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
});
