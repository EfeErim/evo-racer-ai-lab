import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { observeRun } from "../src/ipc";
import {
  HIDDEN_OBSERVATION_POLL_MS,
  VISIBLE_OBSERVATION_POLL_MS,
  mergeObservationSnapshot,
  observationPollDelay,
} from "../src/observer-refresh";
import type {
  GenerationReplayV1,
  ObservationSnapshotV1,
} from "../src/simulation";

const observationFixturePath = fileURLToPath(
  new URL("../contracts/phase7-observation.json", import.meta.url),
);
const observationFixture: unknown = JSON.parse(
  readFileSync(observationFixturePath, "utf8"),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function snapshot(
  overrides: Partial<ObservationSnapshotV1> = {},
): ObservationSnapshotV1 {
  return {
    contractVersion: 1,
    runId: "run-observer-refresh",
    status: "running",
    generation: 1,
    totalGenerations: 8,
    generationReport: null,
    fitnessHistory: [],
    selectedCar: null,
    previousRuns: [],
    result: null,
    ...overrides,
  };
}

const replay: GenerationReplayV1 = {
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

describe("observer replay deltas", () => {
  it("retains an acknowledged replay when the delta omits it", () => {
    const previous = snapshot({ generationReplay: replay });
    const incoming = snapshot({
      activeCandidate: {
        candidateId: "g0001-c0004",
        index: 5,
        total: 10,
      },
    });

    expect(mergeObservationSnapshot(previous, incoming)).toEqual({
      ...incoming,
      generationReplay: replay,
    });
  });

  it("accepts a newly delivered replay and never crosses run identity", () => {
    const replacement = { ...replay, candidateId: "g0001-c0002" };
    expect(
      mergeObservationSnapshot(
        snapshot({ generationReplay: replay }),
        snapshot({ generationReplay: replacement }),
      ).generationReplay,
    ).toBe(replacement);
    expect(
      mergeObservationSnapshot(
        snapshot({ generationReplay: replay }),
        snapshot({ runId: "run-other" }),
      ).generationReplay,
    ).toBeUndefined();
  });

  it("acknowledges the cached replay in the versioned observe request", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            contractVersion: 1,
            valid: true,
            errors: [],
            snapshot: observationFixture,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await observeRun("run-observer-refresh", replay.candidateId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") {
      throw new Error("Observe request body was not JSON text.");
    }
    expect(JSON.parse(body)).toEqual({
      contractVersion: 1,
      runId: "run-observer-refresh",
      knownGenerationReplayCandidateId: replay.candidateId,
    });
  });

  it("identifies an observation HTTP failure as a run error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    );

    await expect(observeRun("run-observer-refresh")).rejects.toThrow(
      "Run observation failed with status 503.",
    );
  });
});

describe("adaptive observer cadence", () => {
  it("reduces hidden-tab polling and restores the live cadence when visible", () => {
    expect(observationPollDelay("visible")).toBe(VISIBLE_OBSERVATION_POLL_MS);
    expect(observationPollDelay("hidden")).toBe(HIDDEN_OBSERVATION_POLL_MS);
    expect(HIDDEN_OBSERVATION_POLL_MS).toBe(VISIBLE_OBSERVATION_POLL_MS * 4);
  });
});
