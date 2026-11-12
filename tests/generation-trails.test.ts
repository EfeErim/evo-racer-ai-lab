import { describe, expect, it } from "vitest";

import {
  priorGenerationTrails,
  updateGenerationTrails,
} from "../src/generation-trails";
import type {
  GenerationTrailV1,
  ObservationSnapshotV1,
} from "../src/contracts";

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

function snapshot(
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
        snapshot("run-a", [own, trail("run-b", "g0000-c0002")]),
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
