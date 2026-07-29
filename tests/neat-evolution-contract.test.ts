import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture: unknown = JSON.parse(
  readFileSync(resolve("contracts/phase6-neat.json"), "utf8"),
);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Record<string, unknown>;
}

function finiteNumbers(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    throw new Error("Expected a finite-number array.");
  }
  return value as number[];
}

describe("Phase 6 NEAT contract", () => {
  it("exposes a runtime-neutral feed-forward DAG and common vehicle genes", () => {
    const genome = record(fixture);
    const network = record(genome.network);
    const vehicle = record(genome.vehicleGenes);
    const nodes = network.nodes;

    expect(genome.contractVersion).toBe(1);
    expect(genome.algorithm).toBe("neat");
    expect(network.contractVersion).toBe(1);
    expect(network.kind).toBe("feed-forward-dag");
    expect(finiteNumbers(network.inputKeys)).toHaveLength(10);
    expect(finiteNumbers(network.outputKeys)).toEqual([0, 1, 2]);
    expect(network.outputTransforms).toEqual(["tanh", "sigmoid", "sigmoid"]);
    expect(Array.isArray(nodes)).toBe(true);
    expect((nodes as unknown[]).map(record)).toHaveLength(3);
    expect(finiteNumbers(vehicle.performanceLogits)).toHaveLength(5);
    expect(vehicle.frontBrakeBias).toBe(0);
    expect(vehicle.frontDriveBias).toBe(1);
  });
});
