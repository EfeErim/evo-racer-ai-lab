import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const fixturePath = fileURLToPath(
  new URL("../contracts/phase5-fixed-ga.json", import.meta.url),
);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Record<string, unknown>;
}

function finiteNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected a finite-number array.");
  }
  const numbers: number[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error("Expected a finite-number array.");
    }
    numbers.push(item);
  }
  return numbers;
}

describe("Phase 5 fixed GA contract", () => {
  it("exposes a versioned runtime-neutral network and vehicle-gene fixture", () => {
    const genome = record(fixture);
    const network = record(genome.network);
    const topology = record(network.topology);
    const activations = record(network.activations);
    const vehicle = record(genome.vehicleGenes);

    expect(genome.contractVersion).toBe(1);
    expect(genome.algorithm).toBe("fixed-ga");
    expect(network.contractVersion).toBe(1);
    expect(topology).toEqual({
      inputCount: 10,
      hiddenCount: 6,
      outputCount: 3,
    });
    expect(activations).toEqual({
      hidden: "tanh",
      steering: "tanh",
      throttle: "sigmoid",
      brake: "sigmoid",
    });
    expect(finiteNumbers(network.parameters)).toHaveLength(87);
    expect(finiteNumbers(vehicle.performanceLogits)).toHaveLength(5);
    expect(vehicle.frontBrakeBias).toBe(0);
    expect(vehicle.frontDriveBias).toBe(1);
  });
});
