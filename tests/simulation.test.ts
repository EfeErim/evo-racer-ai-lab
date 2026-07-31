import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseObservationSnapshot,
  parseRunDocument,
  parseSelectedCarTelemetry,
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

  it("accepts versioned live candidate progress and position", () => {
    const live = structuredClone(observationFixture) as Record<string, unknown>;
    live.status = "running";
    live.generation = 0;
    live.generationInProgress = true;
    live.activeCandidate = {
      candidateId: "g0000-c0004",
      index: 5,
      total: 10,
    };
    live.pendingCommand = null;
    live.result = null;
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
