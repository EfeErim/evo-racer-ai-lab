import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture: unknown = JSON.parse(
  readFileSync(resolve("contracts/phase10-regression.json"), "utf8"),
);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Record<string, unknown>;
}

describe("Phase 10 deterministic regression contract", () => {
  it("covers three seeds, three presets, and both algorithms", () => {
    const matrix = record(fixture);
    const configuration = record(matrix.configuration);
    const cases = (matrix.cases as unknown[]).map(record);

    expect(matrix.contractVersion).toBe(1);
    expect(matrix.kind).toBe("phase10-deterministic-regression");
    expect(configuration.seeds).toEqual([19, 73, 211]);
    expect(configuration.presets).toEqual([
      "easy-oval",
      "technical-circuit",
      "chicane-challenge",
    ]);
    expect(configuration.algorithms).toEqual(["fixed-ga", "neat"]);
    expect(configuration.populationSize).toBe(10);
    expect(configuration.episodeSeconds).toBe(15);
    expect(cases).toHaveLength(18);
    expect(
      new Set(
        cases.map(
          (item) =>
            `${String(item.presetId)}:${String(item.algorithm)}:${String(item.seed)}`,
        ),
      ).size,
    ).toBe(18);
    for (const item of cases) {
      expect(item.trackSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(item.resultSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(item.replayFrameCount).toBeGreaterThan(0);
      expect(Number.isFinite(item.championFitness)).toBe(true);
      expect(Number.isFinite(item.randomFitness)).toBe(true);
      expect(Number.isFinite(item.pursuitFitness)).toBe(true);
    }
  });
});
