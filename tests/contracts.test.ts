import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseObservationSnapshot,
  parseRunDocument,
  parseRunLibraryResponse,
  parseRunResponse,
  parseSelectedCarTelemetry,
} from "../src/contracts";

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
        leaderNetwork: parsed.generationRace.leaderNetwork && {
          ...parsed.generationRace.leaderNetwork,
          activations: Array.from(
            parsed.generationRace.leaderNetwork.activations,
          ),
        },
      },
    }).toEqual(observationFixture);
  });
});

describe("local service boundary", () => {
  it("rejects unsupported versions and missing envelope collections", () => {
    expect(() =>
      parseRunResponse({ contractVersion: 2, valid: false, errors: [] }),
    ).toThrow("unsupported version");
    expect(() =>
      parseRunLibraryResponse({
        contractVersion: 1,
        runSchemaVersion: 1,
        trackSchemaVersion: 1,
      }),
    ).toThrow("invalid envelope");
    expect(() => parseRunDocument(null)).toThrow("must be an object");
  });
});
