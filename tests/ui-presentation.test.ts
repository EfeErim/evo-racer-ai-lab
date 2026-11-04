import { describe, expect, it } from "vitest";
import { loopingReplayFrameIndex } from "../src/live-motion";
import {
  createInitialState,
  startFailurePresentation,
  transition,
} from "../src/onboarding";
import type { RunResultV1 } from "../src/simulation";
import { type CompiledTrackV1, trackLengthMeters } from "../src/track-renderer";
import { fitnessVerdict } from "../src/views/results";
import { trackIdentity } from "../src/views/shared";
import { renderFitnessChart } from "../src/views/training";

const square: CompiledTrackV1 = {
  contractVersion: 1,
  track: {
    schemaVersion: 1,
    id: "square",
    name: "Square",
    roadWidth: 10,
    pieces: [{ kind: "start-finish" }],
  },
  geometry: {
    centerline: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    leftBoundary: [
      [0, 0],
      [1, 1],
    ],
    rightBoundary: [
      [0, 0],
      [1, 1],
    ],
    checkpoints: [{ index: 0, left: [0, 0], right: [1, 1] }],
    spawnPose: { x: 0, y: 0, heading: 0 },
  },
};

function resultWith(
  history: { generation: number; bestFitness: number; medianFitness: number }[],
  championFitness: number,
): RunResultV1 {
  return {
    fitnessHistory: history,
    champion: { fitness: championFitness },
  } as unknown as RunResultV1;
}

describe("recommended experiment", () => {
  it("restores the recommended draft after other choices were made", () => {
    let state = transition(createInitialState(), {
      type: "select-track",
      trackPreset: "chicane-challenge",
    });
    state = transition(state, {
      type: "apply-training-preset",
      preset: "thorough",
    });

    const next = transition(state, { type: "use-recommended" });

    expect(next.draft).toEqual(createInitialState().draft);
    expect(next.route).toBe("welcome");
    expect(next.sessionStarted).toBe(false);
  });

  it("cannot replace the setup of a started session", () => {
    const started = { ...createInitialState(), sessionStarted: true };

    expect(transition(started, { type: "use-recommended" })).toBe(started);
  });
});

describe("returning to Review from Results", () => {
  it("keeps the setup, requires a new check, and does not start training", () => {
    const started = {
      ...createInitialState(),
      route: "results" as const,
      sessionStarted: true,
    };

    const next = transition(started, { type: "revise-setup" });

    expect(next.route).toBe("review");
    expect(next.draft).toBe(started.draft);
    expect(next.sessionStarted).toBe(false);
    expect(next.validation).toEqual({ status: "not-checked" });
  });
});

describe("start failure wording", () => {
  it("never calls an unconfirmed start failed", () => {
    const presentation = startFailurePresentation({
      kind: "unconfirmed",
      message: "No response.",
    });

    expect(presentation.title).toBe("No response yet. Try again.");
    expect(`${presentation.title} ${presentation.guidance}`).not.toMatch(
      /fail/i,
    );
  });
});

describe("track identity", () => {
  it("measures a closed centerline, including its closing segment", () => {
    expect(trackLengthMeters(square)).toBe(40);
  });

  it("reports a preset as having no seed", () => {
    const identity = trackIdentity(createInitialState(), square, undefined);

    expect(identity.name).toBe("Easy Oval");
    expect(identity.seed).toBe("None, preset layout");
    expect(identity.summary).toBe("1 piece · 40 m long");
    expect(identity.custom).toBe(false);
  });

  it("reports the seed of an applied generated track", () => {
    const state = transition(createInitialState(), {
      type: "select-custom-track",
      track: square.track,
    });

    expect(trackIdentity(state, square, 731)).toMatchObject({
      name: "Square",
      seed: "731",
      custom: true,
    });
    expect(trackIdentity(state, square, undefined).seed).toBe(
      "None, built or imported",
    );
  });
});

describe("Results verdict", () => {
  it("answers yes when best fitness rose over the run", () => {
    const verdict = fitnessVerdict(
      resultWith(
        [
          { generation: 0, bestFitness: 10, medianFitness: 1 },
          { generation: 1, bestFitness: 30, medianFitness: 2 },
        ],
        30,
      ),
    );

    expect(verdict.headline).toBe("Yes, best fitness improved over the run");
    expect(verdict.evidence).toContain("rose by 20.0");
    expect(verdict.tone).toBe("success");
  });

  it("answers no when best fitness did not rise", () => {
    const verdict = fitnessVerdict(
      resultWith(
        [
          { generation: 0, bestFitness: 10, medianFitness: 1 },
          { generation: 1, bestFitness: 10, medianFitness: 2 },
        ],
        10,
      ),
    );

    expect(verdict.headline).toBe(
      "No, best fitness did not improve over the run",
    );
    expect(verdict.tone).toBe("warning");
  });

  it("does not claim a trend from one generation", () => {
    const verdict = fitnessVerdict(
      resultWith([{ generation: 0, bestFitness: 10, medianFitness: 1 }], 10),
    );

    expect(verdict.headline).toContain("only one generation finished");
    expect(verdict.tone).toBe("info");
  });
});

describe("fitness chart", () => {
  const history = [
    { generation: 0, bestFitness: 10, medianFitness: 1 },
    { generation: 1, bestFitness: 20, medianFitness: 5 },
    { generation: 2, bestFitness: 35, medianFitness: 8 },
  ];

  it("labels both axes with units and names both lines", () => {
    const chart = renderFitnessChart(history);

    expect(chart).toContain("Fitness (score)");
    expect(chart).toContain("Generation (count)");
    expect(chart).toContain("Best car");
    expect(chart).toContain("Median car");
  });

  it("shows generations from 1, matching the rest of the app", () => {
    const chart = renderFitnessChart(history);

    expect(chart).toContain("at generation 1 to 35.0 at generation 3");
    expect(chart).toMatch(/<text x="100\.00%"[^>]*>3<\/text>/);
  });

  it("uses no inline styles, which the local service's CSP would block", () => {
    expect(renderFitnessChart(history)).not.toContain("style=");
  });
});

describe("replay position", () => {
  const frames = [
    { x: 0, y: 0, heading: 0, simulatedSeconds: 0 },
    { x: 1, y: 0, heading: 0, simulatedSeconds: 1 },
    { x: 2, y: 0, heading: 0, simulatedSeconds: 2 },
  ];

  it("finds the recorded frame at an elapsed time", () => {
    expect(loopingReplayFrameIndex(frames, 0)).toBe(0);
    expect(loopingReplayFrameIndex(frames, 1.5)).toBe(1);
  });

  it("wraps with the loop and clamps bad input", () => {
    expect(loopingReplayFrameIndex(frames, 2.5)).toBe(0);
    expect(loopingReplayFrameIndex(frames, Number.NaN)).toBe(0);
    expect(loopingReplayFrameIndex([], 1)).toBe(0);
  });
});
