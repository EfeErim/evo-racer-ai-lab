import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  canStartSession,
  createInitialState,
  maximumCandidateEpisodes,
  transition,
  type SetupValidationResponse,
} from "../src/onboarding";

interface ValidationFixture {
  request: ReturnType<typeof createInitialState>["draft"];
  response: SetupValidationResponse;
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../contracts/setup-validation-valid.json", import.meta.url),
    ),
    "utf8",
  ),
) as ValidationFixture;

type State = ReturnType<typeof createInitialState>;

/** Set up with the recommended draft after Python accepted it. */
function validated(): State {
  let state = transition(createInitialState(), { type: "begin-setup" });
  const draft = state.draft;
  state = transition(state, { type: "validation-started", draft });
  expect(canStartSession(state)).toBe(false);
  return transition(state, {
    type: "validation-received",
    draft,
    response: fixture.response,
  });
}

describe("Onboarding", () => {
  it("opens on Welcome with the recommended setup and no session", () => {
    const state = createInitialState();

    expect(state.route).toBe("welcome");
    expect(state.sessionStarted).toBe(false);
    expect(canStartSession(state)).toBe(false);
    expect(state.draft.trackPreset).toBe("easy-oval");
    expect(state.draft.settings).toEqual({
      algorithm: "neat",
      populationSize: 16,
      generations: 10,
      episodeSeconds: 30,
      seed: 42,
    });
    expect(maximumCandidateEpisodes(state.draft.settings)).toBe(160);
    expect(transition(state, { type: "navigate", route: "training" })).toBe(
      state,
    );
  });

  it("enters Training only on Start after validation, then freezes the setup", () => {
    let state = validated();
    expect(canStartSession(state)).toBe(true);
    expect(state.route).toBe("setup");
    expect(state.sessionStarted).toBe(false);

    state = transition(state, { type: "start-session" });
    expect(state.route).toBe("training");
    expect(state.sessionStarted).toBe(true);

    const started = state;
    expect(
      transition(state, {
        type: "set-number",
        field: "populationSize",
        value: 96,
      }),
    ).toBe(started);
    expect(transition(state, { type: "navigate", route: "setup" })).toBe(
      started,
    );
  });

  it("returns a rejected Start to Set up and requires a new check", () => {
    let state = transition(validated(), { type: "start-session" });
    state = transition(state, {
      type: "start-session-rejected",
      response: {
        contractVersion: 1,
        valid: false,
        errors: [
          { code: "START_REJECTED", field: "settings", message: "Rejected." },
        ],
      },
    });

    expect(state.route).toBe("setup");
    expect(state.sessionStarted).toBe(false);
    expect(state.startFailure).toEqual({
      kind: "rejected",
      message: "Rejected.",
    });
    expect(canStartSession(state)).toBe(false);
  });

  it("keeps a valid setup after an unconfirmed Start", () => {
    let state = transition(validated(), { type: "start-session" });
    state = transition(state, {
      type: "start-session-unconfirmed",
      message: "No response.",
    });

    expect(state.route).toBe("setup");
    expect(state.startFailure).toEqual({
      kind: "unconfirmed",
      message: "No response.",
    });
    expect(canStartSession(state)).toBe(true);
  });

  it("ignores a validation answer for a setup that changed or was left", () => {
    const initial = transition(createInitialState(), { type: "begin-setup" });
    const draft = initial.draft;
    const checking = transition(initial, { type: "validation-started", draft });
    const answer = {
      type: "validation-received" as const,
      draft,
      response: fixture.response,
    };

    const changed = transition(checking, {
      type: "set-number",
      field: "populationSize",
      value: 24,
    });
    expect(transition(changed, answer)).toBe(changed);
    expect(canStartSession(changed)).toBe(false);

    const left = transition(checking, { type: "navigate", route: "track" });
    expect(left.validation.status).toBe("not-checked");
    expect(transition(left, answer)).toBe(left);
  });

  it("restores a saved run only on an explicit action", () => {
    const initial = createInitialState();
    const running = transition(initial, {
      type: "restore-session",
      draft: fixture.request,
    });
    const finished = transition(initial, {
      type: "restore-results",
      draft: fixture.request,
    });

    expect(initial.sessionStarted).toBe(false);
    expect(running.route).toBe("training");
    expect(finished.route).toBe("results");
    expect(finished.draft).toEqual(fixture.request);
  });
});
