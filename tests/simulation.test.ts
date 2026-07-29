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
});
