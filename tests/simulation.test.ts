import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseObservationSnapshot,
  parseRunDocument,
  parseRunLibraryResponse,
  parseRunResponse,
  parseSelectedCarTelemetry,
  parseSimulationPreviewResponse,
} from "../src/simulation";

const fixturePath = fileURLToPath(
  new URL("../contracts/phase4-telemetry.json", import.meta.url),
);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
const observationFixturePath = fileURLToPath(
  new URL("../contracts/phase7-observation.json", import.meta.url),
);
const observationFixture: unknown = JSON.parse(
  readFileSync(observationFixturePath, "utf8"),
);
const runDocumentFixturePath = fileURLToPath(
  new URL("../contracts/phase8-run-document.json", import.meta.url),
);
const runDocumentFixture: unknown = JSON.parse(
  readFileSync(runDocumentFixturePath, "utf8"),
);

describe("Phase 4 selected-car telemetry contract", () => {
  it("parses the shared Python telemetry fixture without domain logic", () => {
    expect(parseSelectedCarTelemetry(fixture)).toEqual(fixture);
  });

  it("fails closed when a sensor or continuous control is invalid", () => {
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        steering: 1.1,
      }),
    ).toThrow("outside its contract range");
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

  it("rejects physically impossible telemetry values", () => {
    for (const invalid of [
      { simulatedSeconds: -0.01 },
      { speed: -0.01 },
      { progress: -0.01 },
      { progress: 1.01 },
      { sensorDistances: [-0.01, 2, 3, 4, 5, 6, 7] },
      { sensorDistances: [1, 2, 3, 4, 5, 6, 36.01] },
    ]) {
      expect(() =>
        parseSelectedCarTelemetry({ ...(fixture as object), ...invalid }),
      ).toThrow();
    }
    expect(() =>
      parseSelectedCarTelemetry({
        ...(fixture as object),
        selectedCarId: "   ",
      }),
    ).toThrow("non-empty string");
  });
});

describe("Phase 4 preview result contract", () => {
  const preview = {
    contractVersion: 1,
    valid: true,
    errors: [],
    episode: {
      controller: "pure-pursuit",
      termination: "timeout",
      finished: false,
      steps: 30,
      simulatedSeconds: 0.5,
      progress: 0.01,
      collisionCount: 0,
      vehicleSetup: {
        maxSpeed: 34,
        acceleration: 8,
        brakeStrength: 12,
        steeringAgility: 1.35,
        gripRecovery: 5,
        frontBrakeBias: 0.58,
        frontDriveBias: 0.5,
      },
      selectedCar: fixture,
    },
  };

  it("requires non-negative integer counters and time", () => {
    expect(parseSimulationPreviewResponse(preview)).toMatchObject({
      valid: true,
    });
    for (const invalidEpisode of [
      { steps: 1.5 },
      { steps: -1 },
      { simulatedSeconds: -0.01 },
      { collisionCount: 0.5 },
      { collisionCount: -1 },
    ]) {
      expect(() =>
        parseSimulationPreviewResponse({
          ...preview,
          episode: { ...preview.episode, ...invalidEpisode },
        }),
      ).toThrow();
    }
  });

  it("rejects contradictory preview validity and errors", () => {
    const issue = { code: "FAILED", field: "track", message: "Invalid." };
    expect(() =>
      parseSimulationPreviewResponse({ ...preview, errors: [issue] }),
    ).toThrow("inconsistent validity and errors");
    expect(() =>
      parseSimulationPreviewResponse({
        contractVersion: 1,
        valid: false,
        errors: [],
      }),
    ).toThrow("inconsistent validity and errors");
  });
});

describe("Phase 7 run response envelope", () => {
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

describe("Phase 8 run file contract", () => {
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

describe("Phase 8 run library contract", () => {
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

  it("rejects state combinations that would expose the wrong Saved Runs action", () => {
    expect(parseRunLibraryResponse(library(completedRun)).runs[0]).toEqual(
      completedRun,
    );
    for (const patch of [
      { resumable: true },
      { generation: 9 },
      { generation: 7 },
      { championProgress: null },
      { championFitness: null },
      { status: "running", resumable: true },
    ]) {
      expect(() =>
        parseRunLibraryResponse(library({ ...completedRun, ...patch })),
      ).toThrow("inconsistent state");
    }

    const resumableRun = {
      ...completedRun,
      status: "paused",
      generation: 7,
      resumable: true,
      championFitness: null,
      championProgress: null,
    };
    expect(parseRunLibraryResponse(library(resumableRun)).runs[0]).toEqual(
      resumableRun,
    );
    expect(() =>
      parseRunLibraryResponse(
        library({ ...resumableRun, generation: resumableRun.totalGenerations }),
      ),
    ).toThrow("inconsistent state");
  });
});

describe("Phase 7 observation and results contract", () => {
  it("parses the shared Python observation fixture without simulation rules", () => {
    expect(parseObservationSnapshot(observationFixture)).toEqual(
      observationFixture,
    );
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
    firstFrame.throttle = 1.1;
    expect(() => parseObservationSnapshot(invalid)).toThrow(
      "outside its contract range",
    );
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

    const negativeSpeedReplay = structuredClone(observationFixture) as {
      result: { replay: { frames: { speed: number }[] } };
    };
    const firstNegativeSpeedFrame = negativeSpeedReplay.result.replay.frames[0];
    if (firstNegativeSpeedFrame === undefined) {
      throw new Error("Fixture requires at least one replay frame.");
    }
    firstNegativeSpeedFrame.speed = -0.01;
    expect(() => parseObservationSnapshot(negativeSpeedReplay)).toThrow(
      "speed cannot be negative",
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

  it("rejects impossible result counters, timing, and vehicle performance", () => {
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

    const invalidTimeStep = structuredClone(observationFixture) as {
      result: { metadata: { fixedTimeStep: number } };
    };
    invalidTimeStep.result.metadata.fixedTimeStep = 0;
    expect(() => parseObservationSnapshot(invalidTimeStep)).toThrow(
      "fixedTimeStep must be positive",
    );

    const invalidSetup = structuredClone(observationFixture) as {
      result: { champion: { vehicleSetup: { maxSpeed: number } } };
    };
    invalidSetup.result.champion.vehicleSetup.maxSpeed = 0;
    expect(() => parseObservationSnapshot(invalidSetup)).toThrow(
      "maxSpeed must be positive",
    );
  });

  it("fails closed on inconsistent terminal result ownership", () => {
    const mismatchedRun = structuredClone(observationFixture) as {
      result: { metadata: { runId: string } };
    };
    mismatchedRun.result.metadata.runId = "run-other";
    expect(() => parseObservationSnapshot(mismatchedRun)).toThrow(
      "Run result identity does not match its observation snapshot.",
    );

    const nonterminal = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    nonterminal.status = "running";
    expect(() => parseObservationSnapshot(nonterminal)).toThrow(
      "Non-terminal observation snapshots cannot contain a result.",
    );

    const missingResult = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    missingResult.result = null;
    expect(() => parseObservationSnapshot(missingResult)).toThrow(
      "Terminal observation snapshots require a result after one generation.",
    );
  });

  it("rejects result comparisons that contradict the champion", () => {
    const mismatchedComparison = structuredClone(observationFixture) as {
      result: {
        baselineComparisons: { fitness: number }[];
      };
    };
    const championComparison =
      mismatchedComparison.result.baselineComparisons[0];
    if (championComparison === undefined) {
      throw new Error("Fixture requires a champion comparison.");
    }
    championComparison.fitness += 1;

    expect(() => parseObservationSnapshot(mismatchedComparison)).toThrow(
      "comparisons do not match",
    );
  });

  it("rejects contradictory generation reports and fitness histories", () => {
    const missingHistory = structuredClone(observationFixture) as {
      fitnessHistory: unknown[];
    };
    missingHistory.fitnessHistory.pop();
    expect(() => parseObservationSnapshot(missingHistory)).toThrow(
      "generation history is inconsistent",
    );

    const wrongReport = structuredClone(observationFixture) as {
      generationReport: { generation: number };
    };
    wrongReport.generationReport.generation = 0;
    expect(() => parseObservationSnapshot(wrongReport)).toThrow(
      "generation history is inconsistent",
    );

    const mismatchedResultHistory = structuredClone(observationFixture) as {
      result: { fitnessHistory: { bestFitness: number }[] };
    };
    const firstResultPoint = mismatchedResultHistory.result.fitnessHistory[0];
    if (firstResultPoint === undefined) {
      throw new Error("Fixture requires result fitness history.");
    }
    firstResultPoint.bestFitness += 1;
    expect(() => parseObservationSnapshot(mismatchedResultHistory)).toThrow(
      "fitness history does not match",
    );
  });

  it("rejects previous-run comparisons from a different evaluation budget", () => {
    const mismatchedPreviousRun = structuredClone(observationFixture) as {
      previousRuns: { trackId: string }[];
    };
    const previous = mismatchedPreviousRun.previousRuns[0];
    if (previous === undefined) {
      throw new Error("Fixture requires a previous run comparison.");
    }
    previous.trackId = "different-track";

    expect(() => parseObservationSnapshot(mismatchedPreviousRun)).toThrow(
      "does not match the current evaluation budget",
    );
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
      x: 18.25,
      y: 7.5,
      heading: 0.75,
    });
    expect(parsed.generationReplay?.candidateId).toBe("g0000-c0003");
  });

  it("rejects live-only state on a terminal observation", () => {
    const impossibleLiveState = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    impossibleLiveState.generationInProgress = true;
    impossibleLiveState.activeCandidate = {
      candidateId: "candidate-after-completion",
      index: 1,
      total: 10,
    };

    expect(() => parseObservationSnapshot(impossibleLiveState)).toThrow(
      "live state contradicts its run status",
    );
  });

  it("parses bounded persisted generation trails", () => {
    const value = structuredClone(observationFixture) as Record<
      string,
      unknown
    >;
    value.generationTrails = [
      {
        runId: "run-phase7-fixture",
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
