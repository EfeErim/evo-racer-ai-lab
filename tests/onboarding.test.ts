import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  canRequestReview,
  canStartSession,
  createInitialState,
  getPresentationIssues,
  maximumCandidateEpisodes,
  transition,
  type SetupValidationResponse,
} from "../src/onboarding";
import { serviceUnavailableResponse } from "../src/ipc";

interface ValidationFixture {
  request: ReturnType<typeof createInitialState>["draft"];
  response: SetupValidationResponse;
}

const fixturePath = fileURLToPath(
  new URL("../contracts/phase1-setup-validation-valid.json", import.meta.url),
);
const fixture = JSON.parse(
  readFileSync(fixturePath, "utf8"),
) as ValidationFixture;

describe("Phase 1 onboarding contract", () => {
  it("opens on Welcome and never starts a session automatically", () => {
    const state = createInitialState();

    expect(state.route).toBe("welcome");
    expect(state.sessionStarted).toBe(false);
    expect(canStartSession(state)).toBe(false);
    expect(state.draft.trackPreset).toBe("easy-oval");
    expect(canRequestReview(state)).toBe(true);
    expect(state.draft.settings).toEqual({
      algorithm: "fixed-ga",
      populationSize: 10,
      generations: 8,
      episodeSeconds: 15,
      seed: 42,
    });
    expect(maximumCandidateEpisodes(state.draft.settings)).toBe(80);
  });

  it("keeps Start locked until a complete setup passes authoritative validation", () => {
    let state = createInitialState();
    state = transition(state, {
      type: "select-track",
      trackPreset: fixture.request.trackPreset ?? "easy-oval",
    });

    expect(canRequestReview(state)).toBe(true);
    expect(canStartSession(state)).toBe(false);

    state = transition(state, { type: "validation-started" });
    expect(canStartSession(state)).toBe(false);

    state = transition(state, {
      type: "validation-received",
      response: fixture.response,
    });
    expect(canStartSession(state)).toBe(true);
  });

  it("requires an explicit Start action to enter Training", () => {
    let state = createInitialState();
    state = transition(state, {
      type: "select-track",
      trackPreset: "easy-oval",
    });
    state = transition(state, {
      type: "validation-received",
      response: fixture.response,
    });

    expect(state.route).toBe("review");
    expect(state.sessionStarted).toBe(false);

    state = transition(state, { type: "start-session" });
    expect(state.route).toBe("training");
    expect(state.sessionStarted).toBe(true);
  });

  it("freezes setup fields after the explicit Start action", () => {
    let state = createInitialState();
    state = transition(state, {
      type: "select-track",
      trackPreset: "easy-oval",
    });
    state = transition(state, {
      type: "validation-received",
      response: fixture.response,
    });
    state = transition(state, { type: "start-session" });

    const started = state;
    state = transition(state, {
      type: "set-number",
      field: "populationSize",
      value: 96,
    });
    expect(state).toBe(started);
    expect(transition(state, { type: "navigate", route: "settings" })).toBe(
      started,
    );
  });

  it("rejects invalid numeric settings before authoritative validation", () => {
    let state = createInitialState();
    state = transition(state, {
      type: "set-number",
      field: "populationSize",
      value: 9,
    });

    expect(getPresentationIssues(state.draft)).toContainEqual({
      code: "VALUE_OUT_OF_RANGE",
      field: "populationSize",
      message: "populationSize must be a whole number from 10 to 500.",
    });
    expect(canRequestReview(state)).toBe(false);
  });

  it("does not expose Training or Results before a session starts", () => {
    const initial = createInitialState();

    expect(transition(initial, { type: "navigate", route: "training" })).toBe(
      initial,
    );
    expect(transition(initial, { type: "navigate", route: "results" })).toBe(
      initial,
    );
  });

  it("enters Training only after an explicit saved-run restore action", () => {
    const initial = createInitialState();
    const restored = transition(initial, {
      type: "restore-session",
      draft: fixture.request,
    });

    expect(initial.sessionStarted).toBe(false);
    expect(restored.route).toBe("training");
    expect(restored.sessionStarted).toBe(true);
    expect(restored.draft).toEqual(fixture.request);
  });
});

describe("setup validation transport errors", () => {
  it("distinguishes an HTTP rejection from an unavailable local core", () => {
    expect(
      serviceUnavailableResponse(
        new Error("Local validation failed with status 403."),
      ),
    ).toEqual({
      contractVersion: 1,
      valid: false,
      errors: [
        {
          code: "LOCAL_VALIDATION_REQUEST_FAILED",
          field: "service",
          message:
            "Local validation failed with status 403. Confirm that the app is open on a supported loopback address.",
        },
      ],
    });

    expect(serviceUnavailableResponse().errors[0]?.code).toBe(
      "SERVICE_UNAVAILABLE",
    );
  });
});
