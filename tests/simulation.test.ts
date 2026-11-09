import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseObservationSnapshot,
  parseRunDocument,
  parseRunLibraryResponse,
  parseRunResponse,
  parseSelectedCarTelemetry,
} from "../src/simulation";

const fixturePath = fileURLToPath(
  new URL("../contracts/telemetry.json", import.meta.url),
);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
const observationFixturePath = fileURLToPath(
  new URL("../contracts/observation.json", import.meta.url),
);
const observationFixture: unknown = JSON.parse(
  readFileSync(observationFixturePath, "utf8"),
);
const runDocumentFixturePath = fileURLToPath(
  new URL("../contracts/run-document.json", import.meta.url),
);
const runDocumentFixture: unknown = JSON.parse(
  readFileSync(runDocumentFixturePath, "utf8"),
);

describe("Selected-car telemetry contract", () => {
  it("parses the shared Python telemetry fixture without domain logic", () => {
    expect(parseSelectedCarTelemetry(fixture)).toEqual(fixture);
  });

  it("fails closed when a sensor or continuous control is invalid", () => {
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        steering: Number.NaN,
      }),
    ).toThrow("finite");
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        sensorDistances: [1, 2],
      }),
    ).toThrow("seven sensor distances");
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        heading: undefined,
      }),
    ).toThrow("requires x, y, and heading together");
  });

  it("rejects an empty selected car id", () => {
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        selectedCarId: "   ",
      }),
    ).toThrow("non-empty string");
  });
});

describe("Run response envelope", () => {
  const issue = { code: "FAILED", field: "run", message: "Invalid." };

  it("rejects contradictory response validity and errors", () => {
    expect(() =>
      parseRunResponse({ contractVersion: 1, valid: true, errors: [issue] }),
    ).toThrow("inconsistent validity and errors");
    expect(() =>
      parseRunResponse({ contractVersion: 1, valid: false, errors: [] }),
    ).toThrow("inconsistent validity and errors");
  });
});

describe("Run file contract", () => {
  it("parses the shared versioned checkpoint without domain rules", () => {
    expect(parseRunDocument(runDocumentFixture)).toEqual(runDocumentFixture);
  });

  it("fails closed when checkpoint identity differs from the snapshot", () => {
    expect(() =>
      parseRunDocument({
        ...(runDocumentFixture as object),
        runId: "run-other",
      }),
    ).toThrow("identity does not match");
  });
});

describe("Run library contract", () => {
  const completedRun = {
    runId: "run-completed",
    status: "completed",
    algorithm: "fixed-ga",
    trackId: "easy-oval",
    trackName: "Easy Oval",
    seed: 42,
    generation: 8,
    totalGenerations: 8,
    resumable: false,
    championFitness: 12.5,
    championProgress: 0.75,
  };

  const library = (run: object) => ({
    contractVersion: 1,
    runSchemaVersion: 1,
    trackSchemaVersion: 1,
    runs: [run],
    isolated: [],
  });

  it("parses a saved run entry as Python sent it", () => {
    expect(parseRunLibraryResponse(library(completedRun)).runs[0]).toEqual(
      completedRun,
    );
  });
});

describe("Observation and results contract", () => {
  it("parses the shared Python observation fixture without simulation rules", () => {
    const parsed = parseObservationSnapshot(observationFixture);
    expect({
      ...parsed,
      generationRace: parsed.generationRace && {
        ...parsed.generationRace,
        cars: parsed.generationRace.cars.map((car) => ({
          ...car,
          poses: Array.from(car.poses),
        })),
      },
    }).toEqual(observationFixture);
  });

  it("fails closed on invalid status and replay controls", () => {
    expect(() =>
      parseObservationSnapshot({
        ...(observationFixture as object),
        status: "unknown",
      }),
    ).toThrow("unknown status");

    const invalid = structuredClone(observationFixture) as {
      result: { replay: { frames: { throttle: number }[] } };
    };
    const firstFrame = invalid.result.replay.frames[0];
    if (firstFrame === undefined) {
      throw new Error("Fixture replay frame is missing.");
    }
    firstFrame.throttle = Number.NaN;
    expect(() => parseObservationSnapshot(invalid)).toThrow("finite");
  });

  it("fails closed on empty or unordered authoritative replay frames", () => {
    const emptyResultReplay = structuredClone(observationFixture) as {
      result: { replay: { frames: unknown[] } };
    };
    emptyResultReplay.result.replay.frames = [];
    expect(() => parseObservationSnapshot(emptyResultReplay)).toThrow(
      "Run replay must contain at least one frame.",
    );

    const unorderedResultReplay = structuredClone(observationFixture) as {
      result: {
        replay: { frames: { simulatedSeconds: number }[] };
      };
    };
    const resultFrames = unorderedResultReplay.result.replay.frames;
    const secondResultFrame = resultFrames[1];
    const firstResultFrame = resultFrames[0];
    if (firstResultFrame === undefined || secondResultFrame === undefined) {
      throw new Error("Fixture requires at least two replay frames.");
    }
    secondResultFrame.simulatedSeconds = firstResultFrame.simulatedSeconds;
    expect(() => parseObservationSnapshot(unorderedResultReplay)).toThrow(
      "Run replay frame times must be strictly increasing.",
    );
  });

  it("rejects invalid replay sampling and live replay timing", () => {
    const invalidSampling = structuredClone(observationFixture) as {
      result: { replay: { sampleEverySteps: number } };
    };
    invalidSampling.result.replay.sampleEverySteps = 0;
    expect(() => parseObservationSnapshot(invalidSampling)).toThrow(
      "Replay sampleEverySteps must be a positive integer.",
    );

    const invalidLiveReplay = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    invalidLiveReplay.status = "running";
    invalidLiveReplay.generation = 0;
    invalidLiveReplay.result = null;
    invalidLiveReplay.generationReplay = {
      candidateId: "g0000-c0003",
      frames: [],
    };
    expect(() => parseObservationSnapshot(invalidLiveReplay)).toThrow(
      "Generation replay must contain at least one frame.",
    );
  });

  it("rejects impossible result counters", () => {
    const invalidCollisions = structuredClone(observationFixture) as {
      generationReport: { results: { collisionCount: number }[] };
    };
    const firstResult = invalidCollisions.generationReport.results[0];
    if (firstResult === undefined) {
      throw new Error("Fixture requires a generation result.");
    }
    firstResult.collisionCount = -1;
    expect(() => parseObservationSnapshot(invalidCollisions)).toThrow(
      "collisionCount cannot be negative",
    );

    const invalidPopulation = structuredClone(observationFixture) as {
      result: { metadata: { populationSize: number } };
    };
    invalidPopulation.result.metadata.populationSize = 0;
    expect(() => parseObservationSnapshot(invalidPopulation)).toThrow(
      "populationSize must be a positive integer",
    );
  });

  it("parses the Python-owned ideal racing-line comparison", () => {
    const withRacingLine = structuredClone(observationFixture) as {
      result: {
        baselineComparisons: { finished: boolean }[];
        racingLineComparison?: Record<string, unknown>;
      };
    };
    const championFinished =
      withRacingLine.result.baselineComparisons[0]?.finished ?? false;
    withRacingLine.result.racingLineComparison = {
      contractVersion: 1,
      method: "minimum-curvature-v1",
      referenceLine: [
        [0, 0],
        [10, 4],
        [0, 0],
      ],
      championFinished,
      meanDeviationMeters: 0.5,
      p95DeviationMeters: 1.2,
      meanToleranceMeters: 1.2,
      p95ToleranceMeters: 2.64,
      matched: false,
    };

    expect(
      parseObservationSnapshot(withRacingLine).result?.racingLineComparison
        ?.matched,
    ).toBe(false);
  });

  it("accepts versioned live candidate progress and position", () => {
    const live = structuredClone(observationFixture) as Record<string, unknown>;
    live.status = "running";
    live.generation = 0;
    live.generationReport = null;
    live.fitnessHistory = [];
    live.generationInProgress = true;
    live.activeCandidate = {
      candidateId: "g0000-c0004",
      index: 5,
      total: 10,
    };
    live.pendingCommand = null;
    live.result = null;
    live.previousRuns = [];
    live.generationReplay = {
      candidateId: "g0000-c0003",
      frames: [
        {
          simulatedSeconds: 0.5,
          x: 1,
          y: 2,
          heading: 0.25,
          speed: 3,
          lateralSpeed: 0,
          steering: 0.1,
          throttle: 0.8,
          brake: 0,
          progress: 0.02,
        },
      ],
    };

    const parsed = parseObservationSnapshot(live);

    expect(parsed.generationInProgress).toBe(true);
    expect(parsed.activeCandidate).toEqual({
      candidateId: "g0000-c0004",
      index: 5,
      total: 10,
    });
    expect(parsed.selectedCar).toMatchObject({
      x: 5.024937,
      y: 0.000135,
      heading: 6.279074,
    });
    expect(parsed.generationReplay?.candidateId).toBe("g0000-c0003");
  });

  it("parses bounded persisted generation trails", () => {
    const value = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    value.generationTrails = [
      {
        runId: "run-observation-fixture",
        candidateId: "g0000-c0002",
        generation: 0,
        points: [
          [1, 2],
          [3.5, 4.5],
        ],
      },
    ];

    expect(parseObservationSnapshot(value).generationTrails).toEqual(
      value.generationTrails,
    );
  });
});
