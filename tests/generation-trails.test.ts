import { describe, expect, it } from "vitest";

import {
  MAX_RECORDED_GENERATION_TRAILS,
  MAX_TRAIL_POINTS,
  priorGenerationTrails,
  updateGenerationTrails,
} from "../src/generation-trails";
import type {
  GenerationReplayV1,
  ObservationSnapshotV1,
} from "../src/simulation";

function replay(candidateId: string, frameCount = 3): GenerationReplayV1 {
  return {
    candidateId,
    frames: Array.from({ length: frameCount }, (_, index) => ({
      simulatedSeconds: index / 60,
      x: index,
      y: index * 2,
      heading: index / 10,
      speed: 3,
      lateralSpeed: 0,
      steering: 0.1,
      throttle: 0.8,
      brake: 0,
      progress: index / Math.max(1, frameCount - 1),
    })),
  };
}

function snapshot(
  runId: string,
  generationReplay: GenerationReplayV1 | null | undefined,
): ObservationSnapshotV1 {
  return {
    contractVersion: 1,
    runId,
    status: "running",
    generation: 1,
    totalGenerations: 10,
    generationReplay,
    generationReport: null,
    fitnessHistory: [],
    selectedCar: null,
    result: null,
    previousRuns: [],
  };
}

describe("previous generation champion trails", () => {
  it("records each Python replay once and retains it across acknowledged deltas", () => {
    const first = updateGenerationTrails(
      [],
      snapshot("run-a", replay("g0000-c0001")),
    );
    const delta = updateGenerationTrails(first, snapshot("run-a", undefined));
    const second = updateGenerationTrails(
      delta,
      snapshot("run-a", replay("g0001-c0003")),
    );

    expect(delta).toEqual(first);
    expect(second.map((trail) => trail.candidateId)).toEqual([
      "g0000-c0001",
      "g0001-c0003",
    ]);
    expect(priorGenerationTrails(second, "g0001-c0003")).toEqual([first[0]]);
  });

  it("samples long paths, bounds history, and never crosses run identity", () => {
    let trails = updateGenerationTrails(
      [],
      snapshot("run-a", replay("g0000-c0001", 151)),
    );
    expect(trails[0]?.points).toHaveLength(MAX_TRAIL_POINTS);
    expect(trails[0]?.points.at(0)).toEqual([0, 0]);
    expect(trails[0]?.points.at(-1)).toEqual([150, 300]);

    for (
      let generation = 1;
      generation <= MAX_RECORDED_GENERATION_TRAILS;
      generation += 1
    ) {
      trails = updateGenerationTrails(
        trails,
        snapshot(
          "run-a",
          replay(`g${String(generation).padStart(4, "0")}-c0001`),
        ),
      );
    }
    expect(trails).toHaveLength(MAX_RECORDED_GENERATION_TRAILS);
    expect(trails[0]?.candidateId).toBe("g0001-c0001");

    const otherRun = updateGenerationTrails(
      trails,
      snapshot("run-b", replay("g0000-c0002")),
    );
    expect(otherRun.map((trail) => trail.runId)).toEqual(["run-b"]);
  });
});
